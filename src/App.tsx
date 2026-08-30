import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { RadialMenu } from './components/RadialMenu';
import { Toast } from './components/Toast';
import { Coordinates, AppItem, UIConfig, UserProfile, Workspace } from './types';
import {
  DEFAULT_UI_CONFIG,
  MINIMAL_MAIN_WORKSPACE_APPS,
  stripInternalWidgetApps,
  stripInternalWidgetsFromConfig,
  workspaceContainsBundledDemoApp,
} from './defaults';
import { Minus, X, Maximize, Square, AlertTriangle, ArrowLeft, ArrowRight, PanelLeftClose } from 'lucide-react';
import type { Language } from './translations';
import { motion, AnimatePresence } from 'framer-motion';
import { isLikelyWebUrl, resolveWebsiteIconFields } from './siteFavicon';

/** Settings is the largest UI surface; radial-only sessions never need to parse or retain it. */
const PrecisionSettings = React.lazy(() =>
  import('./components/PrecisionSettings').then((module) => ({
    default: module.PrecisionSettings,
  })),
);

const LS_MAIN_DISCOVERY_DONE = 'zenith_main_discovery_done';

/** Favicons remotos não devem ser apagados pelo cache-bust de ícones de .exe nem healing via getFileIcon. */
function isRemoteIconUrl(u: string | undefined): boolean {
  return /^https?:\/\//i.test(String(u ?? '').trim());
}

function isWebShortcutItem(item: AppItem): boolean {
  return item.commandType === 'url' || isLikelyWebUrl(item.command);
}

/** Legacy first-run flag — used only to avoid double-running in odd edge cases; repair no longer skips on this alone. */
const LS_ZENITH_INITIALIZED_LEGACY = 'zenith_initialized';

/**
 * Adiamento da varredura do Menu Iniciar.
 *
 * Arrancar com o Windows: 20 s. Competir com o login satura disco e CPU, e uma sondagem em
 * PowerShell nesse momento deixa o sistema todo lento.
 *
 * Abertura manual: quase imediato. O mesmo adiamento aplicava-se aos dois casos, e o resultado
 * era o utilizador a instalar, abrir, e encontrar a roda vazia durante vinte segundos — sem nada
 * a acontecer nem nada a explicá-lo. Aberta à mão, a máquina está ociosa e não há o que evitar.
 */
const START_MENU_DISCOVERY_DEFER_LOGIN_MS = 20_000;
const START_MENU_DISCOVERY_DEFER_MANUAL_MS = 600;

type StartMenuDiscoveryRow = { Name?: string; Path?: string; Command?: string };

/** Caixa em coordenadas de ecrã (ou de cliente, depois de remapeada) — usada pelo painel sob o radial. */
type ScreenRect = { x: number; y: number; width: number; height: number };

/** Builds Main workspace apps from `get-startup-apps` and appends internal Zenith shortcuts from defaults. */
async function buildMainAppsFromStartMenuDiscovery(
  raw: StartMenuDiscoveryRow[],
): Promise<AppItem[]> {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
  const built: AppItem[] = [];
  const DISCOVERY_ICON_BATCH = 4;
  for (let offset = 0; offset < raw.length; offset += DISCOVERY_ICON_BATCH) {
    const chunk = raw.slice(offset, offset + DISCOVERY_ICON_BATCH);
    const chunkBuilt = await Promise.all(
      chunk.map(async (app, chunkIndex) => {
        const idx = offset + chunkIndex;
        const cmd = String(app.Command || app.Path || '').trim();
        let iconUrl = '';
        try {
          if (window.electron?.getFileIcon && cmd) {
            iconUrl = (await window.electron.getFileIcon(cmd)) || '';
          }
        } catch {
          /* ignore */
        }
        return {
          id: crypto.randomUUID(),
          type: 'app' as const,
          label: app.Name?.trim() || 'App',
          iconName: '',
          iconSource: 'native' as const,
          customIconUrl: iconUrl,
          command: cmd,
          commandType: 'app' as const,
          description: cmd ? `Menu Iniciar: ${cmd}` : '',
          direction: directions[idx % 8],
        };
      }),
    );
    built.push(...chunkBuilt);
  }
  return [...built, ...MINIMAL_MAIN_WORKSPACE_APPS];
}

/** Main já tem atalhos reais ou apps fora do conjunto mínimo de widgets — não reimportar Menu Iniciar após reboot. */
function mainWorkspaceAlreadyCustomized(mainWs: Workspace | undefined): boolean {
  if (!mainWs?.apps?.length) return false;
  const minimalIds = new Set(
    MINIMAL_MAIN_WORKSPACE_APPS.map((a) => a.id).filter((id): id is string => !!id),
  );
  if (mainWs.apps.length > MINIMAL_MAIN_WORKSPACE_APPS.length) return true;
  for (const a of mainWs.apps) {
    if (a.id && !minimalIds.has(a.id)) return true;
    if (typeof a.command === 'string' && !a.command.startsWith('internal:')) return true;
  }
  return false;
}

// Helper function to find an app by ID anywhere in the nested structure
const findAppRecursive = (items: AppItem[], id: string): AppItem | undefined => {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children && item.children.length > 0) {
      const found = findAppRecursive(item.children, id);
      if (found) return found;
    }
  }
  return undefined;
};

/**
 * Preferir ao cursor como âncora em `setWindowSize('fullscreen'|'small')`: o processo principal usa
 * `getDisplayNearestPoint` — com vários monitores o cursor pode estar noutro ecrã enquanto o HWND
 * (radial / ilha) já cobre o monitor certo.
 */
function windowCenterScreenPoint(): { x: number; y: number } {
  const w = window.outerWidth || window.innerWidth || 1;
  const h = window.outerHeight || window.innerHeight || 1;
  return {
    x: window.screenX + Math.round(w / 2),
    y: window.screenY + Math.round(h / 2),
  };
}

/** JSON-clone + garante `config.workspaces` não vazio — ficheiro tem de passar `normalizeFullPersistenceBlob` no próximo arranque. */
function sanitizeFullPersistenceForDisk(d: {
  user: UserProfile | null;
  apps: AppItem[];
  config: UIConfig;
}): {
  user: UserProfile | null;
  apps: AppItem[];
  config: UIConfig;
  /** Espelho na raiz do JSON — `normalizeFullPersistenceBlob` funde isto se `config.workspaces` vier vazio no disco. */
  workspaces: Workspace[];
} | null {
  try {
    const raw = JSON.parse(JSON.stringify(d)) as typeof d;
    if (!raw.config || typeof raw.config !== 'object') {
      return null;
    }
    if (!Array.isArray(raw.config.workspaces) || raw.config.workspaces.length === 0) {
      return null;
    }
    const mainWs = raw.config.workspaces.find(
      (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
    );
    if (mainWs && Array.isArray(mainWs.apps) && mainWs.apps.length > 0) {
      raw.apps = JSON.parse(JSON.stringify(mainWs.apps)) as AppItem[];
    }
    const workspacesMirror = JSON.parse(
      JSON.stringify(raw.config.workspaces),
    ) as Workspace[];
    return {
      ...raw,
      workspaces: workspacesMirror,
    };
  } catch {
    return null;
  }
}

export default function App() {
  /* zenith-verify:radial-handshake-renderer — overlays/handshake radial; ver scripts/verify-radial-windowing.mjs */
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  /** Atualização descarregada e à espera de reinício — assinalada com um selo no hub do radial. */
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const off = window.electron?.onUpdateState?.((payload) => {
      setUpdateReady(payload?.state === 'ready');
    });
    return () => { off?.(); };
  }, []);

  /** Esconde dashboard/definições antes do `await applyWindowSize('fullscreen')` — sem isto, ao restaurar da bandeja aparece um frame da última UI. */
  const [radialOpenAwaitingFullscreen, setRadialOpenAwaitingFullscreen] = useState(false);
  /**
   * A cobertura da espera só pode ser opaca se havia painel opaco no ecrã para mascarar.
   * Vinda da bandeja/ilha não há textura antiga, e o preto pintava os bounds antigos da
   * janela — um retângulo preto a piscar no sítio do radial.
   */
  const [radialAwaitCoverOpaque, setRadialAwaitCoverOpaque] = useState(false);
  /**
   * Painel (Settings/Welcome) que continua no ecrã por baixo do radial.
   * `…ScreenRect` é a verdade (coordenadas de ecrã, imunes ao resize da janela);
   * `…ClientRect` é a mesma caixa nas coordenadas da janela já alargada, recalculada
   * sempre que a geometria muda — tal como a âncora do radial.
   */
  const [panelOverlayScreenRect, setPanelOverlayScreenRect] = useState<ScreenRect | null>(null);
  /** O painel fica no ecrã por baixo do radial (com ou sem reposicionamento). */
  const [panelKeptUnderRadial, setPanelKeptUnderRadial] = useState(false);
  const [panelOverlayClientRect, setPanelOverlayClientRect] = useState<ScreenRect | null>(null);
  const panelOverlayScreenRectRef = useRef<ScreenRect | null>(null);
  panelOverlayScreenRectRef.current = panelOverlayScreenRect;
  /** Um frame sólido antes de minimizar — evita o Windows guardar bitmap do dashboard e flash ao reabrir o radial. */
  const [minimizeNeutralCoverActive, setMinimizeNeutralCoverActive] = useState(false);
  /** Main: `prepare-radial-show` — pintar antes de `show()` para não expor textura antiga (minimizado/dashboard). */
  const [radialPreShowSolidCover, setRadialPreShowSolidCover] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  /** Two-paint transparent close phase so DWM never caches Settings as the idle HWND texture. */
  const [panelNeutralizingClose, setPanelNeutralizingClose] = useState(false);
  const isDashboardOpenRef = useRef(false);
  const isSettingsOpenRef = useRef(false);

  // Standalone Settings Window Mode - REMOVED
  // const isSettingsWindow = window.location.hash === '#settings' || window.location.search.includes('window=settings');

  // Dashboard/Welcome Screen State
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  /**
   * Após minimizar com Welcome/definições, o SO repõe o HWND ao aplicar `small` e o evento `restore` faria o painel
   * voltar a parecer “aberto” em loop. Este flag mantém o chrome do painel recolhido até reabrir / fechar painel.
   */
  const [panelChromeDismissedForIsland, setPanelChromeDismissedForIsland] = useState(false);
  const panelSurfaceOpen = useMemo(
    () => (isDashboardOpen || isSettingsOpen || panelNeutralizingClose) && !panelChromeDismissedForIsland,
    [isDashboardOpen, isSettingsOpen, panelNeutralizingClose, panelChromeDismissedForIsland],
  );

  useEffect(() => {
    isDashboardOpenRef.current = isDashboardOpen;
    isSettingsOpenRef.current = isSettingsOpen;
  }, [isDashboardOpen, isSettingsOpen]);

  useEffect(() => {
    if (!isDashboardOpen && !isSettingsOpen) {
      setPanelChromeDismissedForIsland(false);
    }
  }, [isDashboardOpen, isSettingsOpen]);

  const [windowState, setWindowState] = useState<'maximized' | 'windowed'>('windowed');
  const [isLoaded, setIsLoaded] = useState(false);
  /** True quando hidratámos a partir de config-v2.json / migração — localStorage pode estar vazio após reboot. */
  const hydratedFromPersistenceRef = useRef(false);
  /** Desktop welcome / primeira sessão: corre só depois `isLoaded` (IPC não pode correr antes da hidratação). */
  const welcomeBootstrapDoneRef = useRef(false);
  /**
   * A varredura do Menu Iniciar corre em silêncio.
   *
   * Havia aqui um ecrã de espera a ocupar a janela inteira na primeira abertura. Uma app que
   * vive na bandeja e se invoca por gesto não deve começar por prender o utilizador num aviso
   * de progresso — sobretudo um que ele não pediu e do qual não pode sair. Os atalhos aparecem
   * quando aparecerem; a roda já mostra o seu próprio indicador por ícone.
   */
  /**
   * Após a descoberta do Menu Iniciar numa sessão sem dados anteriores (reset / primeiro arranque),
   * abrir o dashboard automaticamente para que o utilizador veja os seus apps.
   */
  const openDashboardAfterDiscoveryRef = useRef(false);

  // User / Auth State (Defaults to null)
  const [user, setUser] = useState<UserProfile | null>(null);
  const userRef = useRef<UserProfile | null>(null);
  userRef.current = user;

  /**
   * Canal da Store. A Microsoft cobra antes de deixar instalar o pacote e so entrega o MSIX a
   * quem comprou, portanto pedir chave de licenca a seguir seria cobrar duas vezes.
   *
   * Isto e deliberadamente um sinalizador DERIVADO e nao um `user` sintetico: o `user` vai para
   * disco em `sanitizeFullPersistenceForDisk`, e gravar `isPremium: true` la dentro faria com que
   * copiar o ficheiro de persistencia para uma instalacao do canal direto a desbloqueasse.
   */
  const [isStoreChannel, setIsStoreChannel] = useState(false);
  const isStoreChannelRef = useRef(false);
  isStoreChannelRef.current = isStoreChannel;

  useEffect(() => {
    let cancelled = false;
    void window.electron?.getBuildChannel?.().then((channel) => {
      if (!cancelled) setIsStoreChannel(channel === 'store');
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const [menuPosition, setMenuPosition] = useState<Coordinates>({ x: 0, y: 0 });
  /** Remonta a árvore visual a cada abertura; nenhuma geometria/transition da sessão anterior sobrevive. */
  const [radialMountKey, setRadialMountKey] = useState(0);
  /** Token preparado ainda oculto e token cuja janela nativa já foi revelada. */
  const [radialPendingPaintToken, setRadialPendingPaintToken] = useState<number | null>(null);
  const [radialNativeRevealToken, setRadialNativeRevealToken] = useState<number | null>(null);
  const [radialClientSize, setRadialClientSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  /** Centro absoluto escolhido pelo main; é centro do monitor, nunca posição do cursor. */
  const radialCenterScreenRef = useRef<Coordinates | null>(null);
  /** Bounds enviados pelo main são autoritativos enquanto window.screenX/Y ainda refletem Settings. */
  const radialClientPositionHintRef = useRef<Coordinates | null>(null);
  const radialWindowOriginHintRef = useRef<Coordinates | null>(null);
  const [triggerSource, setTriggerSource] = useState<'mmb' | 'mmb-click' | 'shortcut'>('shortcut');
  const radialTransitionWarmedRef = useRef(false);
  const [lastLaunched, setLastLaunched] = useState<AppItem | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isDesktopMode, setIsDesktopMode] = useState(false);
  /** Só montar a ilha depois de `setWindowSize('small')` com bounds do monitor — senão o hit-shape usa coords com a janela ainda em 1280×800 (dev). */
  const [electronSmallOverlayReady, setElectronSmallOverlayReady] = useState(false);
  const isDesktopModeRef = useRef(false);
  isDesktopModeRef.current = isDesktopMode;

  /** Após minimizar o painel, o primeiro `setWindowHitShape` pode usar `screenX/screenY` ainda do modo janela — o HWND encolhe ao sítio errado. Reforça overlay `small` no tick seguinte. (Deve ficar abaixo de `isDesktopMode` — senão ReferenceError quebra o render.) */
  const prevPanelChromeDismissedRef = useRef(false);
  useEffect(() => {
    const edge =
      panelChromeDismissedForIsland && !prevPanelChromeDismissedRef.current;
    prevPanelChromeDismissedRef.current = panelChromeDismissedForIsland;
    if (!edge || !isDesktopMode) return;
    const t = window.setTimeout(() => {
      void window.electron?.reapplySmallOverlay?.();
      void window.electron?.invalidatePaint?.();
    }, 100);
    return () => clearTimeout(t);
  }, [isDesktopMode, panelChromeDismissedForIsland]);

  /** Declared before handlers that resize the window — keeps IPC + React in sync. */
  const lastWindowState = useRef<'fullscreen' | 'windowed' | 'small' | null>(null);
  /**
   * Cobertura opaca durante small→windowed: mascara artefactos do DWM se o main pintar antes de `applyWindowSize`.
   * Liga no mesmo commit que o painel fica visível; desliga no microtask após resize + invalidate.
   */
  const [panelResizeSolidCover, setPanelResizeSolidCover] = useState(false);

  /** No edge `panelSurfaceOpen` false→true, cobrir antes de `setWindowSize('windowed')` (frame errado do DWM). */
  const prevPanelSurfaceOpenRef = useRef(panelSurfaceOpen);
  useLayoutEffect(() => {
    const prev = prevPanelSurfaceOpenRef.current;
    prevPanelSurfaceOpenRef.current = panelSurfaceOpen;
    if (!prev && panelSurfaceOpen && isDesktopMode) {
      setPanelResizeSolidCover(true);
    }
  }, [panelSurfaceOpen, isDesktopMode]);

  /** Garante HWND em `windowed` quando o painel/definições estão visíveis (não minimizados). */
  useLayoutEffect(() => {
    if (!isDesktopMode) return;
    if (!window.electron?.setWindowSize && !window.electron?.applyWindowSize) return;
    if (!panelSurfaceOpen) return;
    if (radialOpenAwaitingFullscreen) return;
    /** Radial aberto por cima do painel: a janela é o overlay — repor `windowed` agora colapsava-o. */
    if (isMenuOpen) return;

    let cancelled = false;

    /** Microtask corre após o commit React e antes do paint — `invoke` expande o HWND depois da ilha já ir ao DOM. */
    queueMicrotask(async () => {
      if (cancelled) return;
      try {
        if (window.electron?.applyWindowSize) {
          await window.electron.applyWindowSize('windowed');
        } else {
          window.electron?.setWindowSize?.('windowed');
        }
        if (cancelled) return;
        window.electron?.showWindow();
        lastWindowState.current = 'windowed';
        void window.electron?.invalidatePaint?.();
      } catch {
        /* ignore */
      } finally {
        if (cancelled) return;
        /** Dois rAF — DWM costuma completar o resize antes de voltar a mostrar a ilha ao fechar painel. */
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!cancelled) {
              setPanelResizeSolidCover(false);
            }
          });
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isDesktopMode, panelSurfaceOpen, radialOpenAwaitingFullscreen, isSettingsOpen, isMenuOpen]);

  useEffect(() => {
    if (!panelSurfaceOpen) {
      setPanelResizeSolidCover(false);
    }
  }, [panelSurfaceOpen]);

  useLayoutEffect(() => {
    if (!isDesktopMode || !window.electron?.setWindowSize) {
      setElectronSmallOverlayReady(false);
      return;
    }
    /**
     * Com o radial aberto, `panelSurfaceOpen` fica falso (dashboard fechado no mesmo commit).
     * Sem este guard, aplicávamos `small` aqui e anulávamos o `fullscreen` do `openMenu` — o menu ficava no rect windowed.
     */
    if (isMenuOpen || radialOpenAwaitingFullscreen) {
      setElectronSmallOverlayReady(true);
      return;
    }
    /** Painel / definições visíveis em `windowed` — não forçar `small` aqui (evita sobrescrever o primeiro arranque). */
    if (panelSurfaceOpen) {
      setElectronSmallOverlayReady(true);
      return;
    }

    let cancelled = false;
    setElectronSmallOverlayReady(false);
    const { x: ax, y: ay } = windowCenterScreenPoint();

    void (async () => {
      try {
        if (window.electron?.applyWindowSize) {
          await window.electron.applyWindowSize('small', { x: ax, y: ay });
        } else {
          window.electron!.setWindowSize!('small', { x: ax, y: ay });
          await new Promise<void>((r) => window.setTimeout(r, 48));
        }
        if (cancelled) return;
        lastWindowState.current = 'small';
        await window.electron?.reapplySmallOverlay?.();
        if (cancelled) return;
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        if (!cancelled) setElectronSmallOverlayReady(true);
      } catch {
        if (!cancelled) setElectronSmallOverlayReady(true);
      }
    })();

    return () => {
      cancelled = true;
      setElectronSmallOverlayReady(false);
    };
  }, [isDesktopMode, panelSurfaceOpen, isMenuOpen, radialOpenAwaitingFullscreen]);

  const [isAppReady, setIsAppReady] = useState(true); // Defaults to true so initial loading works normally

  // State for Apps and Config (Defaults to initial constants)
  const [apps, setApps] = useState<AppItem[]>(MINIMAL_MAIN_WORKSPACE_APPS);

  const [config, setConfig] = useState<UIConfig>(DEFAULT_UI_CONFIG);
  const configRef = useRef(config);
  configRef.current = config;
  const targetWorkspaceIndexRef = useRef(config.activeWorkspaceIndex);
  targetWorkspaceIndexRef.current = config.activeWorkspaceIndex;
  const switchDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  /**
   * Sem radial nem painel não há nada para desenhar: o HWND é encolhido ao canto. Deixá-lo em `small`
   * a ecrã inteiro mantinha uma janela layered topmost composta pelo DWM a receber todo o hit-testing
   * do rato — cursor e sistema ficavam lentos. O `updateWindowSize` reexpande ao abrir o radial / painel.
   */
  const overlayIdle =
    isDesktopMode &&
    !panelSurfaceOpen &&
    !isMenuOpen &&
    !radialOpenAwaitingFullscreen;

  /**
   * Dimensão da janela do radial. Rótulos ficam para fora dos ícones; a margem de gesto é o que garante
   * que arrastar para escolher a direção (e o clique que confirma) continua dentro da janela — os eventos
   * de rato vêm da janela, fora dela o ângulo congela e a seleção não confirma. Aumentar se ficar curto.
   */
  useEffect(() => {
    if (!window.electron?.setRadialViewport) return;
    const RADIAL_LABEL_ALLOWANCE = 90;
    const RADIAL_GESTURE_MARGIN = 200;
    const radius = Number(config.menuRadius) || 140;
    const icon = Number(config.iconSize) || 64;
    const size = Math.round(
      2 * (radius + icon + RADIAL_LABEL_ALLOWANCE + RADIAL_GESTURE_MARGIN),
    );
    window.electron.setRadialViewport({
      size,
      fixed: true,
    });
  }, [config.menuRadius, config.iconSize]);

  /**
   * O main não consegue inferir isto: `hide-window` esconde a janela sem mudar de modo, por isso
   * `windowed` sobrevive a ela e o radial seguinte abria "por cima de um painel" que não estava
   * no ecrã — trazendo as definições atrás. Quem sabe é o renderer, e diz.
   */
  useLayoutEffect(() => {
    window.electron?.setPanelSurfaceVisible?.(
      isDesktopMode && panelSurfaceOpen && !panelNeutralizingClose,
    );
  }, [isDesktopMode, panelSurfaceOpen, panelNeutralizingClose]);

  useLayoutEffect(() => {
    if (!overlayIdle || !window.electron?.collapseIdleOverlay) return;
    /** Um tick depois: o main pode estar a aplicar `small`/`windowed` no mesmo ciclo (evita corrida de bounds). */
    const t = window.setTimeout(() => {
      void window.electron?.collapseIdleOverlay?.();
    }, 60);
    return () => window.clearTimeout(t);
  }, [overlayIdle]);

  /**
   * Pré-aquece small↔fullscreen enquanto a janela está em repouso — a 1.ª abertura do radial
   * (HWND encolhido) deixa de pagar o custo frio do DWM.
   */
  useEffect(() => {
    if (!isDesktopMode || !electronSmallOverlayReady || !window.electron?.warmRadialTransition) {
      return;
    }
    if (radialTransitionWarmedRef.current || isMenuOpen || radialOpenAwaitingFullscreen) return;
    if (panelSurfaceOpen) return;

    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await window.electron!.warmRadialTransition!();
          if (cancelled) return;
          radialTransitionWarmedRef.current = true;
          await window.electron?.reapplySmallOverlay?.();
        } catch {
          /* ignore */
        }
      })();
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [
    isDesktopMode,
    electronSmallOverlayReady,
    panelSurfaceOpen,
    isMenuOpen,
    radialOpenAwaitingFullscreen,
  ]);

  /** Latest snapshot for flush on pagehide / sync disk write (survives reboot). */
  const persistenceRef = useRef({
    user: null as UserProfile | null,
    apps: MINIMAL_MAIN_WORKSPACE_APPS,
    config: DEFAULT_UI_CONFIG,
  });
  /** When load failed but disk still has a non-trivial config file — never overwrite with empty defaults. */
  const persistenceSaveBlockedRef = useRef(false);
  /**
   * Scan do Menu Iniciar foi agendado (defer longo) após strip do Main — bloqueia o auto-save aos 150ms que
   * gravava um Main vazio no disco antes do scan terminar (reinício mostrava Main vazio).
   */
  const startMenuScanPersistenceHoldRef = useRef(false);
  /**
   * `hide-window` no main só baixa a opacidade — o documento pode continuar "visible", logo `visibilitychange`/`pagehide`
   * não gravam. Guardamos o flush síncrono aqui e chamamo-lo sempre antes de `hideWindow()`.
   */
  const flushPersistenceToDiskRef = useRef<(() => void) | null>(null);
  /** Prevents broken/missing shell targets from spawning PowerShell after every settings edit. */
  const iconHealingAttemptedRef = useRef(new Set<string>());
  /** Houve ícones que não resolveram nesta passagem — vale a pena repescar daqui a instantes. */
  const healingHadFailuresRef = useRef(false);
  /** Teto de repescagens: duas. Sem isto, um alvo permanentemente inválido girava para sempre. */
  const healingRetriesRef = useRef(0);
  const [iconHealingPass, setIconHealingPass] = useState(0);
  /** Layout: garantir ref alinhada ao state antes dos `useEffect` que gravam disco (evita flush com snapshot velho). */
  useLayoutEffect(() => {
    persistenceRef.current = { user, apps, config };
  });

  /** Used by post-launch setTimeout — must never read stale React state or opening the dashboard after launching an app wrongly calls setWindowSize('small') (ignoreMouseEvents → "frozen" UI). */
  const electronShrinkGateRef = useRef({ panelSurfaceOpen: false });
  useEffect(() => {
    electronShrinkGateRef.current = { panelSurfaceOpen };
  }, [panelSurfaceOpen]);

  // ICON NORMALIZATION CACHE-BUST:
  // When the extract-icon.ps1 normalization algorithm changes, bump this version
  // so all stored base64 icons get cleared and re-fetched with the new format.
  const ICON_NORMALIZATION_VERSION = 'v4-shell-dib-orientation';
  useEffect(() => {
    if (!isLoaded) return;
    if (!window.electron?.getFileIcon) return;
    const storedVersion = localStorage.getItem('zenith_icon_normalization_version');
    if (storedVersion === ICON_NORMALIZATION_VERSION) return; // Already using new format

    // Version mismatch: clear stored exe icons so healing re-fetches them (skip URL favicons).
    setConfig(prev => {
      const clearIcons = (items: AppItem[]): AppItem[] =>
        items.map(item => ({
          ...item,
          customIconUrl:
            item.iconSource === 'native' &&
            !isWebShortcutItem(item) &&
            !isRemoteIconUrl(item.customIconUrl)
              ? undefined
              : item.customIconUrl,
          children: item.children ? clearIcons(item.children) : undefined,
        }));
      return {
        ...prev,
        workspaces: prev.workspaces.map(ws => ({
          ...ws,
          apps: clearIcons(ws.apps),
        })),
      };
    });

    localStorage.setItem('zenith_icon_normalization_version', ICON_NORMALIZATION_VERSION);
    // console.log('[Icons] Cache-busted: re-fetching icons with new normalization.');
  }, [isLoaded]);

  // Listen for execution errors from backend
  useEffect(() => {
    let clearErrorTimer: number | undefined;
    if (window.electron?.onExecutionError) {
      const unsubscribe = window.electron.onExecutionError((errorMsg: string) => {
        setExecutionError(errorMsg);
        if (clearErrorTimer !== undefined) window.clearTimeout(clearErrorTimer);
        clearErrorTimer = window.setTimeout(() => setExecutionError(null), 5000);
      });
      return () => {
        unsubscribe?.();
        if (clearErrorTimer !== undefined) window.clearTimeout(clearErrorTimer);
      };
    }
  }, []);

  // ICON HEALING: Automatically re-fetch missing native icons
  useEffect(() => {
    if (!isLoaded) return;
    if (!window.electron?.getFileIcon && !window.electron?.getWebsiteFaviconDataUrl) return;

    let cancelled = false;
    const healingKey = (item: AppItem) =>
      `${isWebShortcutItem(item) ? 'web' : 'native'}:${item.id ?? ''}:${item.command?.trim().toLowerCase() ?? ''}`;
    const canAttempt = (item: AppItem) => !iconHealingAttemptedRef.current.has(healingKey(item));
    const rememberAttempt = (item: AppItem) => {
      const attempted = iconHealingAttemptedRef.current;
      attempted.add(healingKey(item));
      // Config imports can contain thousands of stale entries. Bound this session-only guard too.
      while (attempted.size > 512) {
        const oldest = attempted.values().next().value as string | undefined;
        if (!oldest) break;
        attempted.delete(oldest);
      }
    };

    const findMissingIcons = (items: AppItem[]): AppItem[] => {
      let missing: AppItem[] = [];
      const traverse = (list: AppItem[]) => {
        list.forEach(item => {
          const web = isWebShortcutItem(item);
          const iconStr = String(item.customIconUrl ?? '').trim();
          if (web && item.command?.trim()) {
            // Falta ícone ou só URL remota (renderer não mostra → migrar para data URL)
            if ((!iconStr || isRemoteIconUrl(item.customIconUrl)) && canAttempt(item)) {
              missing.push(item);
            }
          } else if (
            item.iconSource === 'native' &&
            !item.customIconUrl &&
            item.command &&
            !web &&
            canAttempt(item)
          ) {
            missing.push(item);
          }
          if (item.children) traverse(item.children);
        });
      };
      traverse(items);
      return missing;
    };

    const sourceWorkspaces = config.workspaces;
    const appsToHeal = findMissingIcons(sourceWorkspaces.flatMap(ws => ws.apps));
    if (appsToHeal.length === 0) return;

    // console.log(`[Icon Healing] Attempting to fix ${appsToHeal.length} icons...`);

    const hasUpdatesLog = { value: false };
    const heal = async () => {
      let hasUpdates = false;
      /** Limits concurrent getFileIcon IPC (large configs used to spawn dozens at once and stall the UI). */
      const ICON_HEAL_BATCH = 5;
      const healRecursive = async (items: AppItem[]): Promise<AppItem[]> => {
        if (cancelled) return items;
        const out: AppItem[] = [];
        for (let i = 0; i < items.length; i += ICON_HEAL_BATCH) {
          if (cancelled) return items;
          const chunk = items.slice(i, i + ICON_HEAL_BATCH);
          const done = await Promise.all(
            chunk.map(async (item) => {
              let newItem = { ...item };
              const web = isWebShortcutItem(item);
              const iconStr = String(item.customIconUrl ?? '').trim();
              const webNeedsIcon =
                web &&
                item.command?.trim() &&
                (!iconStr || isRemoteIconUrl(item.customIconUrl)) &&
                canAttempt(item);
              if (webNeedsIcon) {
                rememberAttempt(item);
                let iconFields: Partial<AppItem> | null = null;
                try {
                  iconFields = await resolveWebsiteIconFields(item.command!.trim());
                } catch (e) {
                  iconFields = null;
                }
                const url = iconFields?.customIconUrl;
                if (url?.startsWith('data:')) {
                  newItem = { ...newItem, ...iconFields };
                  hasUpdates = true;
                } else if (!iconStr && url) {
                  newItem = { ...newItem, ...iconFields };
                  hasUpdates = true;
                } else {
                  /**
                   * Favicon é rede: no arranque a ligação pode ainda não estar de pé, e uma falha
                   * assim ficava marcada como tentativa gasta — o atalho só ganhava ícone na
                   * sessão seguinte. Mesma regra do caminho nativo: falhar devolve a vez.
                   */
                  iconHealingAttemptedRef.current.delete(healingKey(item));
                  healingHadFailuresRef.current = true;
                }
              } else if (
                item.iconSource === 'native' &&
                !item.customIconUrl &&
                item.command &&
                !web &&
                canAttempt(item) &&
                window.electron?.getFileIcon
              ) {
                rememberAttempt(item);
                try {
                  const iconUrl = await window.electron.getFileIcon(
                    item.command,
                  );
                  if (iconUrl) {
                    newItem.customIconUrl = iconUrl;
                    hasUpdates = true;
                  } else {
                    /**
                     * A marca de "já tentado" existe para não repetir extrações em cadeia, mas
                     * estava a ser posta ANTES da tentativa e nunca retirada: um falhanço isolado
                     * — a fila do PowerShell ocupada, por exemplo — condenava o ícone até se
                     * reiniciar a app. Retirar a marca em caso de falha devolve-lhe uma segunda
                     * oportunidade na passagem seguinte.
                     */
                    iconHealingAttemptedRef.current.delete(healingKey(item));
                    healingHadFailuresRef.current = true;
                  }
                } catch (e) {
                  iconHealingAttemptedRef.current.delete(healingKey(item));
                  healingHadFailuresRef.current = true;
                  console.warn(`[Icon Healing] Failed for ${item.label}`);
                }
              }
              if (newItem.children) {
                newItem.children = await healRecursive(newItem.children);
              }
              return newItem;
            })
          );
          out.push(...done);
        }
        return out;
      };

      const updatedWorkspaces: Workspace[] = [];
      for (const ws of sourceWorkspaces) {
        const newApps = await healRecursive(ws.apps);
        updatedWorkspaces.push({ ...ws, apps: newApps });
      }

      hasUpdatesLog.value = hasUpdates;
      /**
       * O `cancelled` NÃO pode travar a escrita.
       *
       * O efeito é cancelado sempre que `config.workspaces` muda — e no arranque isso acontece
       * várias vezes (hidratação, descoberta do Menu Iniciar, normalização) enquanto os ícones
       * estão a ser resolvidos. O trabalho terminava com sucesso e era deitado fora à porta:
       * o log dizia `alterou=true falhas=false` e o ficheiro continuava vazio, com a passagem
       * seguinte a encontrar os mesmos itens. Um ciclo perfeito de trabalho desperdiçado.
       *
       * `cancelled` serve para PARAR trabalho a meio, não para descartar resultados já obtidos.
       * A fusão é por ID e só preenche quem continua sem ícone, portanto aplicar tarde é seguro.
       */
      if (hasUpdates) {
        /**
         * Aplicar por ID, não por identidade do array.
         *
         * A versão anterior só escrevia se `prev.workspaces` fosse EXATAMENTE o mesmo array com que
         * a cura começou. Numa restauração isso nunca acontece: a config muda várias vezes
         * (importação, descoberta do Menu Iniciar, normalização) enquanto o PowerShell resolve os
         * ícones, que demora segundos. O lote inteiro era descartado — e só na sessão seguinte,
         * com a config já estável, é que os ícones apareciam. Era isto que obrigava a fechar e
         * abrir a app para os ver.
         *
         * Agora recolhemos apenas os ícones resolvidos e aplicamo-los ao estado atual, seja ele
         * qual for. Só se preenche quem continua sem ícone, portanto nada do que o utilizador (ou
         * outra etapa) tenha entretanto definido é sobreposto.
         */
        const resolved = new Map<string, { customIconUrl?: string; iconSource?: AppItem['iconSource']; iconName?: string }>();
        const collect = (items: AppItem[]) => {
          items.forEach((item) => {
            if (item.id && item.customIconUrl) {
              resolved.set(item.id, {
                customIconUrl: item.customIconUrl,
                iconSource: item.iconSource,
                iconName: item.iconName,
              });
            }
            if (item.children) collect(item.children);
          });
        };
        updatedWorkspaces.forEach((ws) => collect(ws.apps));
        if (resolved.size === 0) return;

        setConfig((prev) => {
          let touched = 0;
          const apply = (items: AppItem[]): AppItem[] =>
            items.map((item) => {
              /** Sem ícone, ou com um URL remoto que o renderer não mostra: nos dois casos entra. */
              const stale = !item.customIconUrl || isRemoteIconUrl(item.customIconUrl);
              const patch = item.id ? resolved.get(item.id) : undefined;
              const next: AppItem = patch && stale ? { ...item, ...patch } : { ...item };
              if (patch && stale) touched += 1;
              if (item.children) next.children = apply(item.children);
              return next;
            });
          const workspaces = prev.workspaces.map((ws) => ({ ...ws, apps: apply(ws.apps) }));
          if (touched === 0) return prev;
          window.electron?.savePersistenceLog?.(`iconHealing applied ${touched} icons`);
          return { ...prev, workspaces };
        });
      }
    };

    window.electron?.savePersistenceLog?.(
      `[IconHealing] passagem ${iconHealingPass} | por resolver=${appsToHeal.length} ` +
        `(${appsToHeal.map((a) => a.label).slice(0, 8).join(', ')}${appsToHeal.length > 8 ? '…' : ''})`,
    );

    let retryTimer: number | undefined;
    void heal().then(() => {
      window.electron?.savePersistenceLog?.(
        `[IconHealing] passagem ${iconHealingPass} terminada | alterou=${hasUpdatesLog.value} falhas=${healingHadFailuresRef.current}`,
      );
      /** Houve falhas e nada mais vai mexer na config: agendar uma repescagem. */
      if (cancelled || !healingHadFailuresRef.current) return;
      healingHadFailuresRef.current = false;
      if (healingRetriesRef.current >= 2) return;
      healingRetriesRef.current += 1;
      retryTimer = window.setTimeout(() => setIconHealingPass((pass) => pass + 1), 4000);
    });
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [isLoaded, config.workspaces, iconHealingPass]); // Re-run after hydration, on workspace changes, and on retry.


  // 1. PRIMARY PERSISTENCE: Load from Electron Main or Migrate from LocalStorage
  useEffect(() => {
    let discoveryDeferTimer: number | undefined;
    let cancelled = false;

    const loadPersistence = async () => {
      let finalData: any = null;
      let loadedFromLocalStorageMigration = false;

      if (window.electron?.getFullConfig) {
        try {
          finalData = await window.electron.getFullConfig();
        } catch (e) {
          console.warn('[Zenith] getFullConfig failed:', e);
          window.electron?.savePersistenceLog?.(
            `getFullConfig: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      if (cancelled) return;

      let persistenceMeta = { primaryBytes: 0, backupBytes: 0, quarantineBytes: 0 };
      if (window.electron?.getConfigPersistenceMeta) {
        try {
          const m = await window.electron.getConfigPersistenceMeta();
          persistenceMeta = {
            primaryBytes: m.primaryBytes,
            backupBytes: m.backupBytes,
            quarantineBytes: m.quarantineBytes ?? 0,
          };
        } catch (e) {
          console.warn('[Zenith] getConfigPersistenceMeta failed:', e);
        }
      }
      if (cancelled) return;

      // Migration Fallback
      if (!finalData) {
        const userStr = localStorage.getItem('zenith_user');
        const appsStr = localStorage.getItem('zenith_apps');
        const configStr = localStorage.getItem('zenith_config');

        if (userStr || appsStr || configStr) {
          finalData = {
            user: userStr ? JSON.parse(userStr) : null,
            apps: appsStr ? JSON.parse(appsStr) : MINIMAL_MAIN_WORKSPACE_APPS,
            config: configStr ? JSON.parse(configStr) : DEFAULT_UI_CONFIG,
          };
          loadedFromLocalStorageMigration = true;
          // Save to main process immediately
          void window.electron?.saveFullConfig?.(finalData);
        }
      }
      if (cancelled) return;

      const quarantineBytes = persistenceMeta.quarantineBytes ?? 0;
      const diskLooksSubstantial =
        persistenceMeta.primaryBytes > 50 ||
        persistenceMeta.backupBytes > 50 ||
        quarantineBytes > 0;
      if (!finalData && diskLooksSubstantial && !loadedFromLocalStorageMigration) {
        persistenceSaveBlockedRef.current = true;
        window.electron?.savePersistenceLog?.(
          `Hydration: no payload but disk has data (primary=${persistenceMeta.primaryBytes} bak=${persistenceMeta.backupBytes} quarantine=${quarantineBytes}) — blocking saves`,
        );
        setExecutionError(
          'Rovyl could not read the configuration stored in AppData. Saving is blocked to protect your data. Check rovyl-persistence.log in the app data folder, look for config-v2.json.broken-* files, or restore config-v2.json / .bak.',
        );
      } else {
        persistenceSaveBlockedRef.current = false;
      }

      let nextApps: AppItem[] = MINIMAL_MAIN_WORKSPACE_APPS;
      let nextConfig: UIConfig = DEFAULT_UI_CONFIG;

      if (finalData) {
        if (finalData.config) {
          /** Configs antigos trazem atalhos `internal:*` dos widgets removidos — descartar na leitura. */
          nextConfig = stripInternalWidgetsFromConfig({
            /**
             * Base nos defaults ANTES do que veio do disco.
             *
             * Sem esta base, toda a definição acrescentada numa versão posterior à do ficheiro
             * gravado chegava ao renderer como `undefined` em vez do seu valor por omissão. O
             * sintoma engana: parece que o backup não guardou as definições, quando na verdade
             * elas nunca chegaram a estar no ficheiro e ninguém as repunha na leitura.
             */
            ...DEFAULT_UI_CONFIG,
            ...finalData.config,
            /**
             * O ponto de abertura deixou de ser configurável: a roda nasce sempre no centro.
             * Configs antigos podem trazer `false` — normalizar na leitura, senão sobrevivia
             * um estado que a interface já não sabe mostrar nem desfazer.
             */
            fixedPosition: true,
            gameMode: {
              ...DEFAULT_UI_CONFIG.gameMode,
              ...(finalData.config.gameMode || {}),
              /** Remove a lista demonstrativa antiga: agora a seleção é visual, por aplicativo. */
              blockedApps:
                (finalData.config.gameMode?.blockedApps || '').trim().toLowerCase() ===
                'csgo.exe, valorant.exe, dota2.exe, overwatch.exe'
                  ? ''
                  : (finalData.config.gameMode?.blockedApps || ''),
            },
          });
          /**
           * Teclas contiguas por posicao, tambem na leitura.
           *
           * Renumerar so nas mutacoes deixaria de fora os ficheiros ja gravados com buracos
           * — o "1, 2, 4" que sobra de um workspace apagado a meio numa versao anterior.
           * A operacao e idempotente: quem ja esta certo nao e tocado.
           */
          nextConfig = {
            ...nextConfig,
            workspaces: nextConfig.workspaces?.map((workspace, index) => {
              const hotkey = index < 9 ? index + 1 : 0;
              return workspace.hotkey === hotkey ? workspace : { ...workspace, hotkey };
            }) ?? nextConfig.workspaces,
          };

          const mainWs = nextConfig.workspaces?.find(
            (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
          );
          if (mainWs?.apps && mainWs.apps.length > 0) {
            nextApps = mainWs.apps;
          } else if (finalData.apps) {
            nextApps = finalData.apps;
          }
        } else if (finalData.apps) {
          nextApps = finalData.apps;
        }
      }

      if (finalData && window.electron) {
        nextConfig = {
          ...nextConfig,
          persistenceMeta: {
            ...nextConfig.persistenceMeta,
            version: Math.max(2, Number(nextConfig.persistenceMeta?.version) || 0),
            lastSuccessfulLoad: new Date().toISOString(),
          },
        };
      }

      /** Perfil do disco / migração LS — não forçar `mainStartMenuDiscoveryDone=true` só por haver blob (quebrava scan do Menu Iniciar e misturava LS obsoleto com o disco). */
      const loadedPersistedBlob = !!(finalData || loadedFromLocalStorageMigration);

      window.electron?.savePersistenceLog?.(
        `load | source=${finalData ? 'disk' : loadedFromLocalStorageMigration ? 'localStorage' : 'none'} ws=${nextConfig.workspaces?.length ?? 0} discoveryDone=${nextConfig.mainStartMenuDiscoveryDone}`,
      );

      const mainWs = nextConfig.workspaces?.find(
        (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
      );
      const lsDiscoveryDone = localStorage.getItem(LS_MAIN_DISCOVERY_DONE) === 'true';
      const legacyOnboardingDone = localStorage.getItem(LS_ZENITH_INITIALIZED_LEGACY);
      const hasDemoFingerprint = mainWs ? workspaceContainsBundledDemoApp(mainWs) : false;
      const mainIsEmpty = !!(mainWs && mainWs.apps.length === 0);
      const canDiscover = !!window.electron?.getStartupApps;
      const mainCustom = mainWorkspaceAlreadyCustomized(mainWs);

      if (loadedPersistedBlob) {
        if (mainCustom && nextConfig.mainStartMenuDiscoveryDone !== true) {
          nextConfig = { ...nextConfig, mainStartMenuDiscoveryDone: true };
        }
        /**
         * Estado inconsistente: `mainStartMenuDiscoveryDone: true` foi salvo mas o workspace Main
         * ficou vazio. Isso ocorre quando a descoberta do Menu
         * Iniciar marca-se como concluída antes de gravar os apps no disco (race condition ou
         * restart durante a janela de 20 s), ou quando a migração de dados legados restaura um
         * arquivo de configuração obsoleto.
         * Solução: resetar a flag para que a descoberta rode novamente.
         *
         * Condição adicional de segurança: só resetar se o config NÃO tem workspaces customizados
         * (nenhum workspace além dos padrões Main+Streaming). Se o utilizador tem um workspace
         * personalizado mas deixou o Main vazio, a descoberta NÃO deve sobrescrever.
         */
        const hasCustomWorkspaces =
          nextConfig.workspaces.length > DEFAULT_UI_CONFIG.workspaces.length;
        if (!mainCustom && !hasCustomWorkspaces && nextConfig.mainStartMenuDiscoveryDone === true) {
          nextConfig = { ...nextConfig, mainStartMenuDiscoveryDone: false };
          try {
            localStorage.removeItem(LS_MAIN_DISCOVERY_DONE);
          } catch {
            /* ignore */
          }
        } else if (nextConfig.mainStartMenuDiscoveryDone === true) {
          try {
            localStorage.setItem(LS_MAIN_DISCOVERY_DONE, 'true');
          } catch {
            /* ignore */
          }
        }
      }

      /** Com disco hidratado, o LS `zenith_main_discovery_done` já não manda sozinho — evita bloquear scan quando o ficheiro diz que ainda falta. */
      let discoveryDoneEffective =
        mainCustom || nextConfig.mainStartMenuDiscoveryDone === true;
      if (!loadedPersistedBlob) {
        discoveryDoneEffective = discoveryDoneEffective || lsDiscoveryDone;
      }

      /** Main ainda não passou pelo scan do Menu Iniciar — não usa IDs do demo embutido. */
      const mainAwaitingStartMenuBootstrap =
        !mainCustom &&
        nextConfig.mainStartMenuDiscoveryDone !== true;

      const shouldTryStartMenuIpc =
        canDiscover &&
        !discoveryDoneEffective &&
        !legacyOnboardingDone &&
        (!loadedPersistedBlob ||
          (!mainCustom && nextConfig.mainStartMenuDiscoveryDone !== true)) &&
        (hasDemoFingerprint || mainIsEmpty || mainAwaitingStartMenuBootstrap);

      const stripMainToZenithOnly = () => {
        const mi = nextConfig.workspaces.findIndex(
          (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
        );
        if (mi === -1) return;
        const workspaces = [...nextConfig.workspaces];
        workspaces[mi] = { ...workspaces[mi], apps: MINIMAL_MAIN_WORKSPACE_APPS };
        nextConfig = { ...nextConfig, workspaces };
      };

      if (shouldTryStartMenuIpc) {
        startMenuScanPersistenceHoldRef.current = true;
        if (hasDemoFingerprint) {
          stripMainToZenithOnly();
        } else if (mainIsEmpty) {
          const miEmpty = nextConfig.workspaces.findIndex(
            (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
          );
          if (miEmpty !== -1) {
            const workspaces = [...nextConfig.workspaces];
            workspaces[miEmpty] = { ...workspaces[miEmpty], apps: MINIMAL_MAIN_WORKSPACE_APPS };
            nextConfig = { ...nextConfig, workspaces };
          }
        }

        const discoverHasDemoFingerprint = hasDemoFingerprint;
        nextConfig = { ...nextConfig, language: 'en' };
        const uiLangDeferred = 'en' as Language;

        /**
         * Arranque sem dados anteriores (reset / primeira instalação): mostrar overlay imediatamente
         * — o temporizador de 20 s ainda aguarda antes do IPC PowerShell, mas visualmente
         * o utilizador vê a ecrã de espera desde o início.
         */
        /**
         * Primeira instalacao a serio, e nao uma leitura falhada.
         *
         * Sem a terceira condicao, um `getFullConfig` que devolvesse nulo por um instante fazia a
         * app concluir que era arranque limpo: corria a descoberta do Menu Iniciar outra vez e
         * abria as Definicoes sozinha. Era o "as vezes abre nas definicoes". O disco ja tinha sido
         * inspecionado acima para bloquear gravacoes nesse mesmo caso — faltava usar o resultado.
         */
        const isFreshStart =
          !finalData && !loadedFromLocalStorageMigration && !diskLooksSubstantial;
        if (isFreshStart) {
          openDashboardAfterDiscoveryRef.current = true;
        }

        /** Só quem arranca com o Windows espera; quem abriu a app quer os atalhos agora. */
        let openedAtLogin = false;
        try {
          openedAtLogin = (await window.electron?.wasOpenedAtLogin?.()) === true;
        } catch (e) {
          openedAtLogin = false;
        }
        const discoveryDeferMs = openedAtLogin
          ? START_MENU_DISCOVERY_DEFER_LOGIN_MS
          : START_MENU_DISCOVERY_DEFER_MANUAL_MS;
        window.electron?.savePersistenceLog?.(
          `[StartMenu] varredura agendada em ${discoveryDeferMs}ms (arranque com o Windows: ${openedAtLogin})`,
        );

        discoveryDeferTimer = window.setTimeout(() => {
          void (async () => {
            if (cancelled) {
              startMenuScanPersistenceHoldRef.current = false;
              return;
            }
            const mainIdx = configRef.current.workspaces.findIndex(
              (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
            );
            /** Rastreia se a descoberta realmente adicionou apps — só marca como concluída quando sim. */
            let discoveryAddedApps = false;
            try {
              const discovered = (await window.electron!.getStartupApps()) as StartMenuDiscoveryRow[];
              if (discovered?.length > 0 && mainIdx !== -1) {
                const mergedApps = await buildMainAppsFromStartMenuDiscovery(discovered);
                setConfig((prev) => {
                  const workspaces = [...prev.workspaces];
                  workspaces[mainIdx] = { ...workspaces[mainIdx], apps: mergedApps };
                  return { ...prev, workspaces, mainStartMenuDiscoveryDone: true };
                });
                discoveryAddedApps = true;
              } else if (discoverHasDemoFingerprint) {
                setConfig((prev) => {
                  const mi = prev.workspaces.findIndex(
                    (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
                  );
                  if (mi === -1) return prev;
                  const workspaces = [...prev.workspaces];
                  workspaces[mi] = { ...workspaces[mi], apps: MINIMAL_MAIN_WORKSPACE_APPS };
                  return { ...prev, workspaces, mainStartMenuDiscoveryDone: true };
                });
                discoveryAddedApps = true;
              }
            } catch (e) {
              console.warn('[Zenith] Start Menu discovery failed:', e);
              if (discoverHasDemoFingerprint) {
                setConfig((prev) => {
                  const mi = prev.workspaces.findIndex(
                    (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
                  );
                  if (mi === -1) return prev;
                  const workspaces = [...prev.workspaces];
                  workspaces[mi] = { ...workspaces[mi], apps: MINIMAL_MAIN_WORKSPACE_APPS };
                  return { ...prev, workspaces, mainStartMenuDiscoveryDone: true };
                });
                discoveryAddedApps = true;
              }
            } finally {
              /**
               * Só marcar como concluída e gravar no LS quando apps foram realmente adicionados.
               * Se a descoberta falhou ou retornou 0 apps, manter `mainStartMenuDiscoveryDone: false`
               * para que o próximo arranque tente novamente.
               */
              if (discoveryAddedApps) {
                localStorage.setItem(LS_MAIN_DISCOVERY_DONE, 'true');
                setConfig((prev) =>
                  prev.mainStartMenuDiscoveryDone === true
                    ? prev
                    : { ...prev, mainStartMenuDiscoveryDone: true },
                );
              }
              startMenuScanPersistenceHoldRef.current = false;
              queueMicrotask(() => {
                flushPersistenceToDiskRef.current?.();
              });
              /**
               * Primeiro arranque / reset: abrir o dashboard automaticamente após a descoberta
               * para que o utilizador veja os apps importados sem precisar de abri-lo manualmente.
               */
              if (discoveryAddedApps && openDashboardAfterDiscoveryRef.current) {
                openDashboardAfterDiscoveryRef.current = false;
                window.setTimeout(() => {
                  flushSync(() => {
                    setPanelChromeDismissedForIsland(false);
                    setIsDashboardOpen(false);
                    setIsSettingsOpen(true);
                  });
                }, 350);
              } else {
                openDashboardAfterDiscoveryRef.current = false;
              }
            }
          })();
        }, discoveryDeferMs);
      } else if (!lsDiscoveryDone && discoveryDoneEffective) {
        localStorage.setItem(LS_MAIN_DISCOVERY_DONE, 'true');
      }

      if (cancelled) return;

      /** Apply English to every profile, including previously persisted configurations. */
      nextConfig = { ...nextConfig, language: 'en' };

      hydratedFromPersistenceRef.current =
        !!(finalData || loadedFromLocalStorageMigration);

      if (finalData) {
        if (finalData.user) setUser(finalData.user);
        if (finalData.apps) setApps(stripInternalWidgetApps(finalData.apps));
        setConfig(nextConfig);
      } else {
        setApps(nextApps);
        setConfig(nextConfig);
      }
      if (!cancelled) {
        setIsLoaded(true);
      }
    };

    void loadPersistence();
    return () => {
      cancelled = true;
      if (discoveryDeferTimer !== undefined) {
        window.clearTimeout(discoveryDeferTimer);
        startMenuScanPersistenceHoldRef.current = false;
      }
    };
  }, []);

  /** Desktop + welcome: só após hidratar — evita depender só do localStorage (cleared em algumas sessões Electron). */
  useEffect(() => {
    if (!isLoaded || welcomeBootstrapDoneRef.current) return;
    welcomeBootstrapDoneRef.current = true;

    const fromLs = localStorage.getItem('zenith_first_run_complete') === 'true';
    const fromDisk = config.persistenceMeta?.isFirstRunCompleted === true;
    const discoveryDone = config.mainStartMenuDiscoveryDone === true;
    const hadDiskPayload = hydratedFromPersistenceRef.current;

    const hasRunBefore =
      fromLs || fromDisk || discoveryDone || hadDiskPayload;

    if (window.electron) {
      flushSync(() => setIsDesktopMode(true));
    }

    if (!hasRunBefore) {
      /**
       * Primeira execução: abrir as Definições já.
       *
       * Isto esperava pela descoberta do Menu Iniciar, porque nessa altura existia um ecrã de
       * espera a cobrir tudo. Com o ecrã de espera removido, esperar deixou de fazer sentido:
       * a janela ficava visível sem superfície nenhuma por baixo, ou seja, um retângulo preto
       * vazio até a varredura terminar. As Definições abrem de imediato e os atalhos aparecem
       * lá dentro quando a varredura os trouxer.
       */
      flushSync(() => {
        setPanelResizeSolidCover(true);
        setIsDashboardOpen(false);
        setIsSettingsOpen(true);
      });
      localStorage.setItem('zenith_first_run_complete', 'true');
      if (window.electron) {
        setConfig((prev) => ({
          ...prev,
          persistenceMeta: {
            ...prev.persistenceMeta,
            isFirstRunCompleted: true,
          },
        }));
      }
    } else {
      if (!fromLs) {
        localStorage.setItem('zenith_first_run_complete', 'true');
      }
      if (window.electron && !fromDisk && hadDiskPayload) {
        setConfig((prev) => ({
          ...prev,
          persistenceMeta: {
            ...prev.persistenceMeta,
            isFirstRunCompleted: true,
          },
        }));
      }
    }
  }, [isLoaded]);

  /** Modo jogo vive no main (`shouldOpenMenu`); antes só mandávamos IPC na montagem — antes do config carregar do disco. */
  useEffect(() => {
    if (!window.electron?.setGameMode || !isLoaded) return;
    window.electron.setGameMode(config.gameMode ?? DEFAULT_UI_CONFIG.gameMode);
  }, [
    isLoaded,
    config.gameMode?.enabled,
    config.gameMode?.mode,
    config.gameMode?.blockedApps,
    config.gameMode?.autoDetectGames,
  ]);

  /** Pré-carrega apenas os executáveis marcados; não inicia apps nem abre janelas escondidas. */
  useEffect(() => {
    if (!isLoaded || !window.electron?.prewarmApps) return;
    const commands: string[] = [];
    const visit = (items: AppItem[]) => {
      for (const item of items) {
        if (item.launchMode === 'prewarm' && item.commandType === 'app' && item.command) {
          commands.push(item.command);
        }
        if (item.children?.length) visit(item.children);
      }
    };
    for (const workspace of config.workspaces) visit(workspace.apps);
    window.electron.prewarmApps(commands);
  }, [isLoaded, config.workspaces]);

  // 2. UNIFIED SAVE EFFECT: Sync to Main Process and LocalStorage (disk + LS mirror survives reboot)
  useEffect(() => {
    if (!isLoaded) return;

    const timer = setTimeout(() => {
      if (startMenuScanPersistenceHoldRef.current) {
        /**
         * Hold ativo (aguardando descoberta do Menu Iniciar).
         * Permitir save se o utilizador já tem conteúdo customizado além do estado padrão:
         * - workspaces extra além do Main e Streaming padrões
         * - Main workspace com apps reais (não só widgets internos)
         * Desta forma, alterações feitas pelo utilizador durante os 20 s de hold não se perdem.
         */
        const mainWs = config.workspaces?.find(
          (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
        );
        const hasCustomContent =
          mainWorkspaceAlreadyCustomized(mainWs) ||
          config.workspaces.length > DEFAULT_UI_CONFIG.workspaces.length;
        if (!hasCustomContent) {
          return; // Ainda em estado padrão — aguardar a descoberta
        }
        // conteúdo customizado: salvar mesmo com hold ativo
      }
      const fullData = sanitizeFullPersistenceForDisk({ user, apps, config });
      if (!fullData) return;

      localStorage.setItem('zenith_user', JSON.stringify(user));
      localStorage.setItem('zenith_apps', JSON.stringify(apps));
      localStorage.setItem('zenith_config', JSON.stringify(config));

      if (!persistenceSaveBlockedRef.current && window.electron?.saveFullConfig) {
        const wsCount = fullData.config?.workspaces?.length ?? 0;
        const mainApps = (fullData.config?.workspaces?.[0]?.apps?.length ?? 0);
        void window.electron.saveFullConfig(fullData).then((r) => {
          if (r && !r.ok) {
            window.electron?.savePersistenceLog?.(
              `saveFullConfig failed: ${r.error || 'unknown'} | ws=${wsCount} mainApps=${mainApps}`,
            );
          }
        });
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [user, apps, config, isLoaded]);

  /** Flush before exit / background so the last edit is not lost (debounce skipped). */
  useEffect(() => {
    if (!isLoaded) return;

    const flushToDisk = () => {
      const d = persistenceRef.current;
      const fullData = sanitizeFullPersistenceForDisk({
        user: d.user,
        apps: d.apps,
        config: d.config,
      });
      if (!fullData) return;
      try {
        localStorage.setItem('zenith_user', JSON.stringify(d.user));
        localStorage.setItem('zenith_apps', JSON.stringify(d.apps));
        localStorage.setItem('zenith_config', JSON.stringify(d.config));
      } catch (e) {
        console.warn('localStorage flush failed', e);
      }
      if (persistenceSaveBlockedRef.current) {
        return;
      }
      if (window.electron?.saveFullConfigSync) {
        const ok = window.electron.saveFullConfigSync(fullData);
        if (!ok) {
          window.electron?.savePersistenceLog?.(
            'saveFullConfigSync: false or IPC error — scheduling invoke fallback',
          );
          void window.electron.saveFullConfig?.(fullData);
        }
      } else if (window.electron?.saveFullConfig) {
        void window.electron.saveFullConfig(fullData);
      }
    };

    flushPersistenceToDiskRef.current = flushToDisk;

    const onPageHide = () => flushToDisk();
    const onBeforeUnload = () => flushToDisk();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushToDisk();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    const quitUnsub = window.electron?.onBeforeQuitFlush?.(async () => {
      const d = persistenceRef.current;
      const fullData = sanitizeFullPersistenceForDisk({
        user: d.user,
        apps: d.apps,
        config: d.config,
      });
      try {
        if (!fullData) return;
        try {
          localStorage.setItem('zenith_user', JSON.stringify(d.user));
          localStorage.setItem('zenith_apps', JSON.stringify(d.apps));
          localStorage.setItem('zenith_config', JSON.stringify(d.config));
        } catch (e) {
          console.warn('localStorage flush failed', e);
        }
        if (persistenceSaveBlockedRef.current) return;
        if (window.electron?.saveFullConfig) {
          const r = await window.electron.saveFullConfig(fullData);
          if (!r?.ok) {
            window.electron?.savePersistenceLog?.(
              `quit flush saveFullConfig: ${r?.error || 'unknown'}`,
            );
            const syncOk = window.electron.saveFullConfigSync?.(fullData);
            if (syncOk === false) {
              window.electron?.savePersistenceLog?.('quit flush saveFullConfigSync also failed');
            }
          }
        } else if (window.electron?.saveFullConfigSync) {
          const ok = window.electron.saveFullConfigSync(fullData);
          if (!ok) {
            window.electron?.savePersistenceLog?.('quit flush saveFullConfigSync failed');
          }
        }
      } finally {
        window.electron?.ackQuitFlush?.();
      }
    });
    return () => {
      try {
        flushToDisk();
      } catch {
        /* ignore */
      }
      flushPersistenceToDiskRef.current = null;
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      quitUnsub?.();
    };
  }, [isLoaded]);

  const lastMiddleClickTime = useRef<number>(0);
  const isHolding = useRef(false);

  // Listen for Google Auth Success
  useEffect(() => {
    if (window.electron?.onGoogleAuthSuccess) {
      return window.electron.onGoogleAuthSuccess((authData: any) => {
        const newUser: UserProfile = {
          id: authData.isAdmin ? 'admin-001' : crypto.randomUUID(),
          name: authData.name,
          email: authData.email,
          isPremium: authData.isPremium,
          isAdmin: authData.isAdmin,
          planTier: authData.planTier ?? (authData.isPremium ? 'pro' : 'free'),
          trialEndsAt: undefined,
          avatarUrl: authData.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(authData.name)}&background=0D8ABC&color=fff`,
        };
        flushSync(() => {
          setUser(newUser);
          setPanelChromeDismissedForIsland(false);
          setIsDashboardOpen(false);
          setIsSettingsOpen(true);
        });
      });
    }
  }, []);



  // Window State Management (Interactable vs Passive)
  // TRACK WINDOW STATE TO PREVENT REDUNDANT IPC CALLS (Reduces Lag/Flicker)
  const lastVisibility = useRef<boolean | null>(null);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);
  /** Used to ignore double-clicks right after the radial closes (otherwise dblclick sees isMenuOpen false and opens Settings). */
  const menuJustClosedAtRef = useRef(0);
  const prevIsMenuOpenForCloseRef = useRef(false);
  /** OS hid the window (Alt+F4 / close) while React still had dashboard "open" — sync refs before state so we don't schedule hideWindow twice. */
  const syncAfterMainWindowHidRef = useRef<() => void>(() => {});
  useEffect(() => {
    syncAfterMainWindowHidRef.current = () => {
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
        hideTimeout.current = null;
      }
      lastVisibility.current = false;
      lastWindowState.current = 'small';
      setIsMenuOpen(false);
      setIsSettingsOpen(false);
      setIsDashboardOpen(false);
      setPanelChromeDismissedForIsland(false);
      setRadialOpenAwaitingFullscreen(false);
      setMinimizeNeutralCoverActive(false);
      setRadialPreShowSolidCover(false);
    };
  });

  useEffect(() => {
    if (prevIsMenuOpenForCloseRef.current && !isMenuOpen) {
      menuJustClosedAtRef.current = Date.now();
    }
    prevIsMenuOpenForCloseRef.current = isMenuOpen;
  }, [isMenuOpen]);

  useEffect(() => {
    if (window.electron && isDesktopMode) {
      /** Inclui dashboard/definições “lógicos” mesmo minimizados — evita `hideWindow` a achar que não há UI ativa. */
      const isAnyInteractive =
        isMenuOpen ||
        radialOpenAwaitingFullscreen ||
        isDashboardOpen ||
        isSettingsOpen ||
        panelNeutralizingClose;

      const visibilityChanged = lastVisibility.current !== isAnyInteractive;

      /**
       * Com o radial aberto, não aplicar `windowed`/`small` aqui (ordem com fecho do dashboard deixava
       * `lastWindowState` ou o HWND desalinhados — o menu aparecia no tamanho do painel).
       */
      if (isMenuOpen || radialOpenAwaitingFullscreen) {
        if (lastWindowState.current !== 'fullscreen') {
          window.electron.setWindowSize('fullscreen', windowCenterScreenPoint());
          lastWindowState.current = 'fullscreen';
        }
        if (visibilityChanged) {
          if (isAnyInteractive) {
            if (hideTimeout.current) {
              clearTimeout(hideTimeout.current);
              hideTimeout.current = null;
            }
            window.electron.showWindow();
          } else {
            hideTimeout.current = setTimeout(() => {
              flushPersistenceToDiskRef.current?.();
              window.electron.hideWindow();
            }, 300);
          }
          lastVisibility.current = isAnyInteractive;
        }
        return;
      }

      /** Overlay passivo `small` (HWND encolhido); painel/definições usam `windowed`. */
      const targetMode: 'fullscreen' | 'windowed' | 'small' = panelSurfaceOpen
        ? 'windowed'
        : 'small';

      const modeChanged = lastWindowState.current !== targetMode;

      let modeResizeHandled = false;

      // 1. Mode changes while visible (not switching to passive "small" overlay).
      //    Always resize directly — never use hideWindow() here. The old "dip" path hit transitions
      //    like small → windowed (after closing the radial menu) and null → windowed, caused
      //    intermittent fullscreen / no-click bugs on the next open-settings.
      const modeAnchor =
        targetMode === 'windowed' ? undefined : windowCenterScreenPoint();

      if (modeChanged && lastVisibility.current && isAnyInteractive && targetMode !== 'small') {
        window.electron.setWindowSize(targetMode, modeAnchor);
        lastWindowState.current = targetMode;
        modeResizeHandled = true;
      }

      // 2. Standard mode update (non-flicker-prone or hidden)
      if (modeChanged && !modeResizeHandled) {
        window.electron.setWindowSize(targetMode, modeAnchor);
        lastWindowState.current = targetMode;
      }

      // 3. Standard visibility update
      if (visibilityChanged) {
        if (isAnyInteractive) {
          if (hideTimeout.current) {
            clearTimeout(hideTimeout.current);
            hideTimeout.current = null;
          }
          window.electron.showWindow();
        } else {
          hideTimeout.current = setTimeout(() => {
            flushPersistenceToDiskRef.current?.();
            window.electron.hideWindow();
          }, 300); // allow exit animations to complete
        }
        lastVisibility.current = isAnyInteractive;
      }
    }
  }, [
    isMenuOpen,
    radialOpenAwaitingFullscreen,
    isDashboardOpen,
    isSettingsOpen,
    panelNeutralizingClose,
    isDesktopMode,
    panelSurfaceOpen,
  ]);

  const openMenu = async (
    x: number,
    y: number,
    source: 'mmb' | 'mmb-click' | 'shortcut' = 'shortcut',
    /** IPC sends screen coords from the main process; MMB uses client coords relative to the current window. */
    coordSpace: 'client' | 'screen' = 'client',
    opts?: {
      preSizedByMain?: boolean;
      keepPanel?: boolean;
      panelRect?: ScreenRect | null;
      clientPosition?: Coordinates | null;
      windowOrigin?: Coordinates | null;
      clientSize?: { width: number; height: number } | null;
      paintToken?: number;
    },
  ) => {
    const triggerGeneration = ++radialTriggerGenerationRef.current;
    /**
     * Radial por cima do painel: a janela é uma só, por isso abrir o radial encolhia-a à caixa da
     * roda e as definições desapareciam num flash. Guardamos o rect de ECRÃ do painel — o main já
     * alargou a janela para o cobrir — e continuamos a desenhá-lo exatamente no mesmo sítio.
     * Quando é o renderer que redimensiona, o rect tem de ser lido ANTES do resize.
     */
    const keepPanel =
      opts?.keepPanel ?? (panelSurfaceOpen && isDesktopModeRef.current);
    /**
     * Com posição fixa o main não toca nos bounds: o painel continua a ser a janela inteira e
     * não há nada para reposicionar — é esse o caminho sem flash. Só quando a janela é alargada
     * (posição livre) é que o painel precisa de ser fixado no rect de ecrã que ocupava.
     */
    const panelWindowStays = keepPanel && !opts?.panelRect;
    const panelRect: ScreenRect | null =
      opts?.panelRect ??
      (keepPanel && !panelWindowStays
        ? {
            x: window.screenX,
            y: window.screenY,
            width: window.innerWidth,
            height: window.innerHeight,
          }
        : null);

    /** Posição livre foi removida: o resize usa sempre uma âncora central. */
    const anchorForFullscreen: { x: number; y: number } =
      coordSpace === 'screen'
        ? { x, y }
        : {
            x: window.screenX + window.innerWidth / 2,
            y: window.screenY + window.innerHeight / 2,
          };

    const needsRendererFullscreenResize =
      isDesktopModeRef.current &&
      window.electron &&
      !opts?.preSizedByMain;

    if (needsRendererFullscreenResize) {
      flushSync(() => {
        /** Antes do resize: a partir daqui o painel nunca é escondido. */
        setPanelKeptUnderRadial(keepPanel);
        setPanelOverlayScreenRect(panelRect);
        /** Com o painel a permanecer visível não há textura antiga para mascarar — a cobertura opaca só piscaria por cima dele. */
        setRadialAwaitCoverOpaque(
          !panelRect && electronShrinkGateRef.current.panelSurfaceOpen,
        );
        setRadialOpenAwaitingFullscreen(true);
        setMinimizeNeutralCoverActive(false);
      });
    } else {
      flushSync(() => {
        setMinimizeNeutralCoverActive(false);
      });
    }

    try {
    /**
     * Atalho/MMB via main já chamou `updateWindowSize('fullscreen')` — repetir `applyWindowSize` aqui
     * duplicava round-trip IPC + setBounds e atrasava o primeiro paint do radial.
     */
    if (needsRendererFullscreenResize) {
      try {
        if (window.electron.applyWindowSize) {
          await window.electron.applyWindowSize('fullscreen', anchorForFullscreen);
        } else {
          window.electron.setWindowSize('fullscreen', anchorForFullscreen);
        }
      } catch {
        try {
          window.electron.setWindowSize('fullscreen', anchorForFullscreen);
        } catch {
          /* ignore */
        }
      }
      lastWindowState.current = 'fullscreen';
    } else if (opts?.preSizedByMain && isDesktopModeRef.current) {
      lastWindowState.current = 'fullscreen';
    }

    /**
     * Um segundo MMB/atalho pode fechar o radial enquanto o resize assíncrono acima ainda termina.
     * Nesse caso, não deixar esta abertura antiga voltar a montar o menu depois do fechamento.
     */
    if (triggerGeneration !== radialTriggerGenerationRef.current) return;

    radialCenterScreenRef.current =
      coordSpace === 'screen'
        ? { x, y }
        : {
            x: window.screenX + window.innerWidth / 2,
            y: window.screenY + window.innerHeight / 2,
          };
    radialClientPositionHintRef.current = opts?.clientPosition ?? null;
    radialWindowOriginHintRef.current = opts?.windowOrigin ?? null;

    /**
     * Nunca consultar `window.screenX/Y` para o primeiro frame. Logo após fechar Settings essas
     * métricas ainda descrevem o rect windowed (880×600), cujo centro é exatamente o ponto errado
     * visto no vídeo: (440,300) cliente → aproximadamente (906,345) no ecrã. Toda a informação
     * necessária já veio no mesmo IPC do main e pertence à geração atual.
     */
    const authoritativeClientPosition =
      opts?.clientPosition ??
      (opts?.windowOrigin
        ? { x: x - opts.windowOrigin.x, y: y - opts.windowOrigin.y }
        : opts?.clientSize
          ? { x: opts.clientSize.width / 2, y: opts.clientSize.height / 2 }
          : { x: window.innerWidth / 2, y: window.innerHeight / 2 });

    flushSync(() => {
      setRadialOpenAwaitingFullscreen(false);
      setRadialAwaitCoverOpaque(false);
      setRadialPreShowSolidCover(false);
      setPanelKeptUnderRadial(keepPanel);
      setPanelOverlayScreenRect(panelRect);
      /** Só fechamos o painel quando ele não vai sobreviver por baixo do radial. */
      if (!keepPanel) {
        setIsSettingsOpen(false);
        setIsDashboardOpen(false);
      }
      setIsMenuOpen(true);
      setRadialMountKey((key) => key + 1);
      setRadialPendingPaintToken(
        typeof opts?.paintToken === 'number' ? opts.paintToken : null,
      );
      setTriggerSource(source);
      setMenuPosition(authoritativeClientPosition);
      setRadialClientSize(
        opts?.clientSize ?? { width: window.innerWidth, height: window.innerHeight },
      );
    });

    /**
     * A janela nativa ainda está escondida. Um rAF seguido de uma tarefa confirma o paint do
     * frame alfa zero; dois rAF completos tornavam a abertura perceptivelmente lenta.
     */
    if (typeof opts?.paintToken === 'number') {
      const paintToken = opts.paintToken;
      requestAnimationFrame(() => {
        window.setTimeout(() => {
          window.electron?.notifyRadialOpenPaintDone?.(paintToken);
        }, 0);
      });
    }

    // Always call show-window when running under Electron — do not gate on isDesktopMode (it is still false for
    // one frame after load; main already set native opacity 0 in showMenuAtCursor).
    if (window.electron) {
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
        hideTimeout.current = null;
      }
      /**
       * Com o painel no ecrã e sem resize a janela já está visível e no sítio: um `show()` extra
       * só recompõe o HWND. Pela mesma razão não há `invalidatePaint` ao abrir — no Windows
       * costuma causar um flash (textura antiga) logo a seguir ao radial aparecer.
       */
      if (!panelWindowStays && typeof opts?.paintToken !== 'number') {
        window.electron.showWindow();
      }
      lastVisibility.current = true;
    }

    isHolding.current = true;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Do not dip window opacity to 0 here — show-window already sets opacity 1 in main. A 0 → rAF → 1
    // sequence left the BrowserWindow stuck invisible on some systems (clicks still hit; radial UI gone).
    } catch (e) {
      radialClientPositionHintRef.current = null;
      radialWindowOriginHintRef.current = null;
      flushSync(() => {
        setRadialOpenAwaitingFullscreen(false);
        setMinimizeNeutralCoverActive(false);
        setRadialPreShowSolidCover(false);
      });
      throw e;
    }
  };

  /** Pinta um frame neutro antes de `minimize()` para o snapshot do Windows não ser o dashboard (flash ao abrir radial depois). */
  const flushNeutralFrameThenMinimize = useCallback(() => {
    if (!window.electron?.minimizeWindow) return;
    flushSync(() => setMinimizeNeutralCoverActive(true));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.electron!.minimizeWindow();
      });
    });
  }, []);

  const openMenuRef = useRef(openMenu);
  openMenuRef.current = openMenu;

  /**
   * Alternância do gatilho (MMB / atalho global): o main não sabe se o radial está aberto,
   * por isso a decisão vive aqui — segundo gatilho com o radial no ecrã fecha em vez de reabrir.
   */
  const isMenuOpenRef = useRef(isMenuOpen);
  isMenuOpenRef.current = isMenuOpen;
  const radialOpenAwaitingFullscreenRef = useRef(radialOpenAwaitingFullscreen);
  radialOpenAwaitingFullscreenRef.current = radialOpenAwaitingFullscreen;
  /** Impede o `click` gerado depois do `mouseup` que fechou o radial de atingir o painel. */
  const radialClickShieldUntilRef = useRef(0);
  /** Invalida uma abertura assíncrona quando o mesmo gatilho é usado para fechar. */
  const radialTriggerGenerationRef = useRef(0);
  const handleMenuCloseRef = useRef<
    ((selectedId: string | null, selectedApp?: AppItem | null) => void) | null
  >(null);
  /** Verdadeiro quando um novo gatilho deve fechar o radial em vez de o abrir. */
  const closeMenuFromTrigger = useCallback(() => {
    if (!isMenuOpenRef.current && !radialOpenAwaitingFullscreenRef.current) return false;
    radialTriggerGenerationRef.current += 1;
    /** RadialMenu consome qualquer mouseup pendente deste gesto sem confirmar a fatia ativa. */
    window.dispatchEvent(new CustomEvent('zenith-radial-toggle-close'));
    handleMenuCloseRef.current?.(null);
    return true;
  }, []);

  useEffect(() => {
    const blockClickThrough = (event: MouseEvent) => {
      const radialActive =
        isMenuOpenRef.current || radialOpenAwaitingFullscreenRef.current;
      const target = event.target instanceof Element ? event.target : null;
      const belongsToRadial = !!target?.closest('[data-zenith-radial-modal="true"]');

      /** Ícones e hub continuam a receber o clique que executa a ação escolhida. */
      if (radialActive && belongsToRadial) return;
      if (!radialActive && Date.now() > radialClickShieldUntilRef.current) return;

      event.preventDefault();
      event.stopImmediatePropagation();
    };

    document.addEventListener('click', blockClickThrough, true);
    document.addEventListener('auxclick', blockClickThrough, true);
    return () => {
      document.removeEventListener('click', blockClickThrough, true);
      document.removeEventListener('auxclick', blockClickThrough, true);
    };
  }, []);

  // After setBounds(fullscreen), inner/outer window metrics update a frame late — re-map screen anchor → client so the radial is not clipped (multi-monitor / half-screen).
  const syncMenuPositionFromAnchor = useCallback(() => {
    const hintedOrigin = radialWindowOriginHintRef.current;
    const clientOriginX = hintedOrigin?.x ?? window.screenX;
    const clientOriginY = hintedOrigin?.y ?? window.screenY;
    /** Mesmo remapeamento da âncora, aplicado ao painel que ficou por baixo do radial. */
    const panelScreen = panelOverlayScreenRectRef.current;
    if (panelScreen) {
      const next = {
        x: Math.round(panelScreen.x - clientOriginX),
        y: Math.round(panelScreen.y - clientOriginY),
        width: panelScreen.width,
        height: panelScreen.height,
      };
      setPanelOverlayClientRect((prev) =>
        prev && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      );
    } else {
      setPanelOverlayClientRect(null);
    }

    /**
     * A posição da roda é congelada no `clientPosition` recebido no open-menu. Recalculá-la aqui
     * com métricas tardias de `window.screenX/Y` fazia a árvore já visível saltar para outra origem.
     * Este sincronizador continua responsável apenas pelo painel preservado sob o radial.
     */
  }, []);

  useLayoutEffect(() => {
    if ((!isMenuOpen && !radialOpenAwaitingFullscreen) || !isDesktopMode) return;
    syncMenuPositionFromAnchor();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        syncMenuPositionFromAnchor();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [isMenuOpen, radialOpenAwaitingFullscreen, isDesktopMode, syncMenuPositionFromAnchor]);

  useEffect(() => {
    if ((!isMenuOpen && !radialOpenAwaitingFullscreen) || !isDesktopMode) return;

    const sync = () => {
      syncMenuPositionFromAnchor();
    };

    sync();
    let rafB = 0;
    const rafA = requestAnimationFrame(() => {
      rafB = requestAnimationFrame(sync);
    });
    window.addEventListener('resize', sync);
    return () => {
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
      window.removeEventListener('resize', sync);
    };
  }, [isMenuOpen, radialOpenAwaitingFullscreen, isDesktopMode, syncMenuPositionFromAnchor]);

  /**
   * O radial fecha por muitos caminhos (Escape, botão direito, duplo-MMB → definições, seleção).
   * Em vez de limpar o rect do painel em cada um, limpamos aqui: enquanto não houver radial
   * nem espera de resize, o painel volta a ser a própria janela.
   *
   * Não limpar os hints de geometria aqui. Este é um efeito passivo da sessão FECHADA e pode ser
   * drenado pelo `flushSync` da abertura seguinte depois de `openMenu` já ter gravado os novos
   * hints. Isso apagava a origem autoritativa e o primeiro frame voltava a `window.screenX/Y`
   * ainda pertencente ao Settings; o rAF seguinte corrigia e a roda parecia saltar até ao centro.
   * Cada abertura sobrescreve ambos os refs antes do seu próprio commit, portanto mantê-los entre
   * sessões é seguro e elimina a escrita atrasada entre gerações.
   */
  useEffect(() => {
    if (isMenuOpen || radialOpenAwaitingFullscreen) return;
    setPanelKeptUnderRadial((prev) => (prev ? false : prev));
    setPanelOverlayScreenRect((prev) => (prev === null ? prev : null));
    setPanelOverlayClientRect((prev) => (prev === null ? prev : null));
  }, [isMenuOpen, radialOpenAwaitingFullscreen]);

  /** Repaint só ao fechar o radial — invalidate ao abrir piscava o frame (dashboard→fullscreen) no Windows. */
  const prevIsMenuOpenForPaintRef = useRef(isMenuOpen);
  useEffect(() => {
    if (!window.electron?.invalidatePaint) return;
    const was = prevIsMenuOpenForPaintRef.current;
    prevIsMenuOpenForPaintRef.current = isMenuOpen;
    const closing = was && !isMenuOpen;
    if (!closing) return;
    const t = window.setTimeout(() => {
      void window.electron?.invalidatePaint?.();
    }, 220);
    return () => clearTimeout(t);
  }, [isMenuOpen]);

  // IPC: menu / dashboard / settings — must run after openMenu exists; use openMenuRef so handler always calls latest openMenu.
  useEffect(() => {
    const cleanupMenu = window.electron?.onOpenMenu((data: {
      x: number;
      y: number;
      source?: 'mmb' | 'mmb-click' | 'shortcut';
      /** O main já sabe que o radial está aberto: este evento nunca deve abrir nem confirmar uma seleção. */
      closeOnly?: boolean;
      preSizedByMain?: boolean;
      keepPanel?: boolean;
      panelRect?: ScreenRect | null;
      clientPosition?: Coordinates | null;
      windowOrigin?: Coordinates | null;
      clientSize?: { width: number; height: number } | null;
      paintToken?: number;
    }) => {
      if (data.closeOnly) {
        closeMenuFromTrigger();
        return;
      }
      /** Segundo MMB / atalho com o radial já aberto: alternar (fechar) em vez de reabrir. */
      if (closeMenuFromTrigger()) return;
      void openMenuRef.current(data.x, data.y, data.source ?? 'shortcut', 'screen', {
        preSizedByMain: data.preSizedByMain === true,
        keepPanel: data.keepPanel === true,
        panelRect: data.panelRect ?? null,
        clientPosition: data.clientPosition ?? null,
        windowOrigin: data.windowOrigin ?? null,
        clientSize: data.clientSize ?? null,
        paintToken: data.paintToken,
      });
    });

    const cleanupPrepareRadial = window.electron?.onPrepareRadialShow?.(() => {
      flushSync(() => setRadialPreShowSolidCover(true));
      requestAnimationFrame(() => {
        window.electron?.notifyRadialPrepPaintDone?.();
      });
    });

    const cleanupRadialNativeRevealed = window.electron?.onRadialNativeRevealed?.((paintToken) => {
      setRadialNativeRevealToken(paintToken);
    });

    const cleanupDashboard = window.electron?.onOpenDashboard(() => {
      flushSync(() => {
        // Não ligar panelResizeSolidCover aqui se o painel já estiver aberto (ex.: Settings→Dashboard):
        // z-[96] ficava preso porque o layout que o desliga só corre em false→true de panelSurfaceOpen.
        setPanelChromeDismissedForIsland(false);
        setMinimizeNeutralCoverActive(false);
        setRadialPreShowSolidCover(false);
        setIsDashboardOpen(false);
        setIsSettingsOpen(true);
      });
      /** Não chamar `showWindow()` aqui: corre antes dos `useLayoutEffect` + microtask com `applyWindowSize('windowed')`
       * e o DWM pinta o HWND grande com a textura da ilha (relógio “puxado”). O show fica no microtask após resize. */
    });

    const cleanupSettings = window.electron?.onOpenSettings(() => {
      flushSync(() => {
        setPanelChromeDismissedForIsland(false);
        setIsMenuOpen(false);
        setIsSettingsOpen(true);
        setIsDashboardOpen(false);
      });
      requestAnimationFrame(() => {
        void window.electron?.invalidatePaint?.();
        requestAnimationFrame(() => {
          void window.electron?.invalidatePaint?.();
        });
      });
    });

    const cleanupWindowState = window.electron?.onWindowState((state) => {
      setWindowState(state);
    });

    const cleanupMouseUp = window.electron?.onMouseUp(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { button: 1 }));
    });

    const cleanupExecutionError = window.electron?.onExecutionError((errorMsg: string) => {
      console.error('Execution error received:', errorMsg);
      const normalized = errorMsg.toLowerCase();
      const isGlobalShortcutRegistrationError =
        normalized.includes('atalho global') ||
        normalized.includes('global shortcut') ||
        normalized.includes('registar o atalho');
      if (isGlobalShortcutRegistrationError) {
        window.electron?.savePersistenceLog?.(`suppressed global shortcut toast: ${errorMsg}`);
        return;
      }
      const isShortcutError = errorMsg.toLowerCase().includes('shortcut');

      setLastLaunched({
        id: 'error',
        label: isShortcutError ? 'Shortcut Error' : 'Execution Error',
        command: '',
        iconName: 'AlertTriangle',
        description: errorMsg
      });
      setTimeout(() => setLastLaunched(null), 6000);
    });

    const cleanupWindowHidToTray = window.electron?.onWindowHidToTray(() => {
      // Persist before resetting UI state so we never flush a stale ref or miss the write if the window hides quickly.
      flushPersistenceToDiskRef.current?.();
      syncAfterMainWindowHidRef.current();
    });

    const cleanupMainWindowMinimized = window.electron?.onMainWindowMinimized?.(({ minimized }) => {
      if (minimized) {
        setMinimizeNeutralCoverActive(false);
        setRadialPreShowSolidCover(false);
      }
      if (
        minimized &&
        (isDashboardOpenRef.current || isSettingsOpenRef.current)
      ) {
        setPanelChromeDismissedForIsland(true);
      }
    });

    const cleanupNativeDisplayRestored =
      window.electron?.onWindowNativeDisplayRestored?.((payload: {
        mode: 'small' | 'fullscreen' | 'windowed';
      }) => {
        const m = payload?.mode;
        if (m !== 'fullscreen' && m !== 'windowed' && m !== 'small') return;
        const anchor = m === 'windowed' ? undefined : windowCenterScreenPoint();
        window.electron?.setWindowSize(m, anchor);
        window.electron?.showWindow();
        lastWindowState.current = m;
      });

    return () => {
      cleanupMenu?.();
      cleanupPrepareRadial?.();
      cleanupRadialNativeRevealed?.();
      cleanupDashboard?.();
      cleanupSettings?.();
      cleanupWindowState?.();
      cleanupMouseUp?.();
      cleanupExecutionError?.();
      cleanupWindowHidToTray?.();
      cleanupMainWindowMinimized?.();
      cleanupNativeDisplayRestored?.();
    };
  }, []);

  // Workspace Switching Handler (Debounced)
  // Uses a debounce so that rapid presses collapse into a single switch
  // to the LAST pressed workspace after 80ms of inactivity — no flickering.
  const handleWorkspaceSwitch = React.useCallback((workspaceIndex: number) => {
    const configData = configRef.current;
    
    if (workspaceIndex < 0 || workspaceIndex >= configData.workspaces.length) {
      console.warn(`[App.tsx] Invalid workspace index requested: ${workspaceIndex}. Total workspaces: ${configData.workspaces.length}`);
      return;
    }

    const workspace = configData.workspaces[workspaceIndex];
    if (!workspace || !workspace.enabled) {
      console.warn(`[App.tsx] Cannot switch to disabled or non-existent workspace: ${workspaceIndex}`);
      return;
    }

    // Update the target ref synchronously so repeated presses to same workspace are a no-op
    if (workspaceIndex === targetWorkspaceIndexRef.current) return;
    
    console.warn(`[App.tsx] Proceeding with workspace switch to: ${workspace.name} (Index: ${workspaceIndex})`);
    targetWorkspaceIndexRef.current = workspaceIndex;

    // Cancel any pending switch and restart the debounce window
    if (switchDebounceTimer.current) {
      clearTimeout(switchDebounceTimer.current);
    }

    switchDebounceTimer.current = setTimeout(() => {
      setConfig(prev => ({
        ...prev,
        activeWorkspaceIndex: targetWorkspaceIndexRef.current
      }));
      switchDebounceTimer.current = null;
    }, 80); // 80ms: imperceptible for single presses, collapses rapid sequences into one switch
  }, []);

  // Workspace switch IPC listener — ISOLATED in its own stable effect
  // CRITICAL: NOT inside [isSettingsOpen, isDashboardOpen] effect — that effect re-runs on settings/dashboard
  // changes and would accumulate multiple IPC listeners, causing 2-3x fires per keypress (the flicker root cause).
  useEffect(() => {
    const cleanup = window.electron?.onSwitchWorkspace((index: number) => {
      console.warn(`[App.tsx] switch-workspace IPC received for index: ${index}`);
      handleWorkspaceSwitch(index);
    });
    return () => cleanup?.();
  }, [handleWorkspaceSwitch]);

  // STABLE KEYBOARD LISTENER - PARENT LEVEL (Robust Fallback for Production)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only handle numeric keys if menu is open
      if (!isMenuOpen) return;

      if (configRef.current.workspaceSwitchMode === 'picker') return;

      // Log the event as warn so it shows in diagnostic.log in production
      console.warn(`[App.tsx] Local keyboard event: key=${e.key}, code=${e.code}`);

      let num = parseInt(e.key);
      
      // Fallback to e.code for different keyboard layouts (Digit1, Digit2, etc.)
      if (isNaN(num) && e.code && e.code.startsWith('Digit')) {
        num = parseInt(e.code.replace('Digit', ''));
      }

      if (!isNaN(num) && num >= 1 && num <= 9) {
        console.warn(`[App.tsx] Valid numeric key detected: ${num}. Switching...`);
        e.preventDefault();
        e.stopPropagation();
        handleWorkspaceSwitch(num - 1);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
  }, [isMenuOpen, handleWorkspaceSwitch]);

  // Centralized function to open settings and handle dashboard logic
  const handleOpenSettings = () => {
    flushSync(() => {
      if (isMenuOpen) setIsMenuOpen(false);
      // Cobertura z-[96]: só o useLayoutEffect (panelSurfaceOpen false→true) deve ligar ao sair da ilha.
      // Se já estamos no dashboard, ligar aqui deixa a cobertura para sempre — o efeito de resize não re-corre.
      setPanelChromeDismissedForIsland(false);
      setIsSettingsOpen(true);
      setIsDashboardOpen(false);
    });
    requestAnimationFrame(() => {
      void window.electron?.invalidatePaint?.();
      requestAnimationFrame(() => {
        void window.electron?.invalidatePaint?.();
      });
    });
  };

  /** Fecha apenas a superfície de Settings; o processo, tray e atalhos continuam ativos. */
  const handleClosePanelToBackground = useCallback(() => {
    /**
     * O main precisa saber no mesmo gesto que já não há painel. Esperar pelo effect
     * deixava uma janela entre este clique e o próximo atalho em que o radial
     * preservava/renderizava a textura antiga das definições.
     */
    window.electron?.setPanelSurfaceVisible?.(false);
    flushSync(() => {
      /** Mantém o HWND windowed por dois paints, mas sem desenhar o painel. */
      setPanelNeutralizingClose(true);
      setIsSettingsOpen(false);
      setIsDashboardOpen(false);
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        flushSync(() => setPanelNeutralizingClose(false));
      });
    });
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) { // Botão do meio
      e.preventDefault();
      /**
       * No Electron, o mesmo MMB também chega pelo monitor global no main process. Se ambos os
       * caminhos alternarem o estado, o React fecha primeiro e o hook global pode interpretar o
       * mesmo gesto como uma nova abertura alguns ms depois. O main é o único dono do MMB no app.
       */
      if (isDesktopModeRef.current && window.electron) return;
      if (closeMenuFromTrigger()) return;
      void openMenu(e.clientX, e.clientY, 'mmb', 'client');
    }
  };

  // Double Click (Left) to Open Settings — não dispara com o radial aberto
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (Date.now() - menuJustClosedAtRef.current < 650) {
      return;
    }
    if (!isMenuOpen && !radialOpenAwaitingFullscreen && !isSettingsOpen) {
      handleOpenSettings();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    /* Removed hardcoded Alt+Z */
    if (e.key === 'Escape' && isMenuOpen) {
      setIsMenuOpen(false);
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    // Removed Space key logic as it's no longer used for opening/closing the menu
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    }
  }, []);

  const executeAction = (
    command: string,
    commandType: "app" | "url" | "folder",
    _itemForToast?: AppItem,
    options?: { openTerminal?: boolean; terminalCommands?: string[]; workingDirectory?: string; launchMode?: 'normal' | 'reuse' | 'prewarm' }
  ) => {
    // console.log("🚀 Zenith executing:", command, "Type:", commandType);
    if (!command) {
      console.warn("Attempted to execute an empty command");
      return;
    }

    /** Widgets internos (Notas / Alarme / Cronómetro / Pomodoro) foram removidos — ignorar restos de configs antigos. */
    if (command.startsWith('internal:')) {
      return;
    }

    if (isDesktopMode && window.electron) {
      // console.log("Calling electron.executeCommand...");
      window.electron.executeCommand(command, commandType, options);
      setTimeout(() => {
        const g = electronShrinkGateRef.current;
        if (!g.panelSurfaceOpen) {
          window.electron?.setWindowSize('small', windowCenterScreenPoint());
          // Unified visibility effect will handle hiding automatically based on state
        }
      }, 1000);
    }
  };

  const executeActionRef = useRef(executeAction);
  executeActionRef.current = executeAction;

  const handleMenuClose = useCallback((selectedId: string | null, selectedApp?: AppItem | null) => {
    const cfg = configRef.current;
    const currentWorkspaceApps = cfg.workspaces[cfg.activeWorkspaceIndex]?.apps || apps;

    radialClickShieldUntilRef.current = Date.now() + 400;
    setIsMenuOpen(false);
    setRadialOpenAwaitingFullscreen(false);
    setRadialPreShowSolidCover(false);
    setRadialPendingPaintToken(null);
    /** O painel volta a ser a própria janela: o efeito de modo repõe `windowed` com o rect guardado. */
    setPanelKeptUnderRadial(false);
    setPanelOverlayScreenRect(null);
    setPanelOverlayClientRect(null);
    isHolding.current = false;

    if (!selectedId && isDesktopMode && !panelSurfaceOpen) {
      window.electron?.setWindowSize('small', windowCenterScreenPoint());
      return;
    }

    if (selectedId) {
      setIsDashboardOpen(false);
    }

    if (selectedId === '__CENTER__') {
      const centerConfig = cfg.centerButton;

      if (centerConfig.type === 'cancel') {
        if (isDesktopMode && !panelSurfaceOpen) {
          window.electron?.setWindowSize('small', windowCenterScreenPoint());
        }
        return;
      }

      if (centerConfig.type === 'app' || centerConfig.type === 'widget') {
        const targetApp = findAppRecursive(currentWorkspaceApps, centerConfig.target);
        const command = targetApp ? targetApp.command : centerConfig.target;
        console.log("Center action, target command:", command);
        executeActionRef.current(command, targetApp?.commandType || 'app', targetApp, {
          openTerminal: targetApp?.openTerminal,
          terminalCommands: targetApp?.terminalCommands,
          workingDirectory: targetApp?.workingDirectory,
          launchMode: targetApp?.launchMode,
        });
        return;
      } else if (centerConfig.type === 'command') {
        executeActionRef.current(centerConfig.target, centerConfig.commandType || 'app');
        return;
      }
      return;
    }

    if (selectedId) {
      const app =
        selectedApp ?? findAppRecursive(currentWorkspaceApps, selectedId);
      console.log("Selected app found in active workspace:", app);
      if (app) {
        console.log("Attempting to execute app command:", app.command);
        executeActionRef.current(app.command, app.commandType || 'app', app, {
          openTerminal: app.openTerminal,
          terminalCommands: app.terminalCommands,
          workingDirectory: app.workingDirectory,
          launchMode: app.launchMode,
        });
      } else {
        console.warn("Could not find app with ID in active workspace:", selectedId);
      }
    }
  }, [apps, isDesktopMode, panelSurfaceOpen]);

  handleMenuCloseRef.current = handleMenuClose;




  {/* Auth Functions */ }
  const handleLogin = (provider: 'google' | 'email') => {
    /** Google: Electron opens zenithos.online/auth?client=desktop and bridges id_token from localhost:3892. */
    if (provider === 'google' && window.electron?.startGoogleAuth) {
      window.electron.startGoogleAuth();
      return;
    }

    window.electron?.openExternalUrl?.('https://zenithos.online/#download');
  };


  /**
   * nesta máquina volta a ocupar o mesmo lugar em vez de gastar um dispositivo novo.
   */
  /**
   * A roda trancada não pede a chave: encaminha para o cartão da licença nas definições, que é
   * onde o teclado já funciona sem depender do roubo de foreground para a janela do radial.
   */


  /** Objeto estável: o memo das secções das definições depende dele. */


  const handleLogout = () => {
    flushSync(() => {
      setUser(null);
      setPanelChromeDismissedForIsland(false);
      setIsDashboardOpen(false);
      setIsSettingsOpen(true);
    });
  };

  const handleUserProfileUpdate = useCallback((patch: Partial<UserProfile>) => {
    setUser((u) => (u ? { ...u, ...patch } : null));
  }, []);

  /** Menu-only slice of config: stable when unrelated settings (e.g. widget opacities) change — keeps RadialMenu from re-rendering the full wheel. */
  /**
   * A roda recebe o config inteiro; a memo existe so para estabilizar a referencia.
   *
   * As dependencias eram uma LISTA DE CAMPOS escrita a mao. Como o callback devolve `config`
   * tal e qual, qualquer definicao fora dessa lista mudava no estado e a roda continuava a
   * receber o objeto ANTERIOR — a alteracao so passava quando, por acaso, um dos campos
   * listados tambem mudasse. Foi o que aconteceu a mira por cursor: alternar a opcao nao
   * produzia efeito nenhum. Cada campo novo era uma armadilha silenciosa.
   *
   * Depender do objeto resolve a classe inteira de problemas: `config` so troca de identidade
   * quando o `setConfig` corre, ou seja quando algo mudou mesmo.
   */
  const radialMenuConfig = React.useMemo(() => config, [config]);

  const radialApps = React.useMemo(() => {
    const w = config.workspaces[config.activeWorkspaceIndex];
    return w?.apps?.length ? w.apps : apps;
  }, [config.workspaces, config.activeWorkspaceIndex, apps]);

  const radialCurrentWorkspace = React.useMemo(
    () => config.workspaces[config.activeWorkspaceIndex],
    [config.workspaces, config.activeWorkspaceIndex]
  );

  // Check if any modal is open
  const isAnyModalOpen =
    panelSurfaceOpen || isMenuOpen || radialOpenAwaitingFullscreen;

  /**
   * O painel sobrevive ao radial (ver `panelOverlayScreenRect`). São duas fases:
   * `…Staying` cobre já a espera do resize — é o que impede o `hidden` de piscar o painel;
   * `…UnderRadial` é a fase em que ele já é posicionado pelo rect dentro da janela alargada.
   */
  const panelStaysUnderRadial =
    (isMenuOpen || radialOpenAwaitingFullscreen) &&
    panelSurfaceOpen &&
    panelKeptUnderRadial;
  const panelUnderRadial = panelStaysUnderRadial && !!panelOverlayClientRect;
  const radialBlocksPanelInteraction = isMenuOpen || radialOpenAwaitingFullscreen;
  /**
   * O conteúdo do painel desenha-se: fora do radial como sempre, ou por baixo dele neste modo.
   *
   * Com uma exceção. Quando o main ALARGA a janela para o radial, manda o rect do painel para ele
   * ser reposicionado lá dentro — e esse rect só existe em coordenadas do cliente depois de um
   * `useLayoutEffect` o converter. Nesse intervalo o painel era desenhado sem posição nenhuma, ou
   * seja `inset-0` de uma janela agora do tamanho do ecrã: as Definições saltavam para gigantes.
   *
   * Havendo rect de ecrã, o painel só aparece depois de estar posicionado. Sem rect (o caminho em
   * que a janela não é alargada), `inset-0` é a posição correta e não há nada a esperar.
   */
  const panelAwaitingOverlayPlacement =
    panelStaysUnderRadial && !!panelOverlayScreenRect && !panelOverlayClientRect;
  const panelContentVisible =
    (panelStaysUnderRadial && !panelAwaitingOverlayPlacement) ||
    (!isMenuOpen && !radialOpenAwaitingFullscreen);

  /** Tema das superfícies opacas (titlebar + painéis). O radial nunca é temado: é overlay do ambiente de trabalho. */
  const panelTheme = config.appearanceTheme === 'white' ? 'white' : 'black';

  return (
    <div
      className={`
        fixed inset-0 w-full h-full overflow-hidden cursor-default select-none group
        ${isDesktopMode ? 'bg-transparent' : 'bg-[#0D0D0D]'}
        ${isDesktopMode && !isAnyModalOpen ? 'pointer-events-none' : ''}
      `}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        if (isMenuOpen) setIsMenuOpen(false);
      }}
    >
      {/* Antes de minimizar: frame opaco de propósito, para o Windows guardar um bitmap neutro. */}
      {isDesktopMode && minimizeNeutralCoverActive && (
        <div
          className="fixed inset-0 z-[99999] bg-[#0A0A0A] pointer-events-none"
          aria-hidden
        />
      )}

      {/**
       * `prepare-radial-show`: main já fez `showInactive()` nos bounds antigos, por isso um frame
       * preto aqui é visível como um retângulo a piscar. Só é preciso forçar um paint novo para
       * não expor textura obsoleta — limpar para (quase) transparente serve, e não se vê.
       */}
      {isDesktopMode && radialPreShowSolidCover && (
        <div
          className="fixed inset-0 z-[99999] pointer-events-none"
          style={{ background: 'rgba(10,10,10,0.01)' }}
          aria-hidden
        />
      )}

      {/* Visibility Wrapper — ONLY for opaque content (Dashboard, Settings, Widgets) */}
      {/* RadialMenu renders OUTSIDE this wrapper to stay truly transparent */}
      {/* When radial opens: hide this layer instantly (no opacity transition) — otherwise the 300ms fade shows a flash of the last settings/dashboard frame */}
      {/*
        A janela é UMA superfície. Antes havia `border` + `rounded-xl` + `shadow-[0_0_50px]`
        neste mesmo elemento `absolute inset-0`: como o pai é `fixed inset-0 overflow-hidden`,
        a sombra externa era recortada e só sobravam os borrões nos entalhes dos cantos —
        lia-se como uma segunda camada por trás de uma borda desenhada por cima.
        `zenith-panel-surface` (index.css) substitui os três por um hairline interior
        tokenizado + raio. `hasShadow:false` no main mantém-se: a separação do ambiente
        de trabalho vem do raio e do contraste de superfície, não de um halo interno.
      */}
      {/**
       * Radial por cima do painel: a janela foi alargada para cobrir os dois, por isso o painel
       * deixa de poder ser `inset-0` — ficaria esticado ao tamanho do overlay. Passa a ser
       * desenhado na caixa exata que ocupava no ecrã, e só o radial recebe rato: um clique
       * perdido nas definições durante o gesto seria uma ação que o utilizador não pediu.
       */}
      <div
        data-zn-theme={panelTheme}
        data-radial-background-inert={radialBlocksPanelInteraction ? 'true' : undefined}
        {...({ inert: radialBlocksPanelInteraction ? '' : undefined } as any)}
        aria-hidden={radialBlocksPanelInteraction ? true : undefined}
        style={panelStaysUnderRadial ? {
          /**
           * `z-index` explícito por duas razões: fica por baixo do radial (z-70) e, sobretudo,
           * cria um contexto de empilhamento — sem ele o `z-index: 100` do `.zs-shell` competia
           * no contexto da raiz e as definições desenhavam-se POR CIMA da roda.
           */
          zIndex: 5,
          /** Posicionamento só existe no caminho com resize; sem ele o painel continua a ser a janela. */
          ...(panelUnderRadial
            ? {
                position: 'absolute' as const,
                left: panelOverlayClientRect!.x,
                top: panelOverlayClientRect!.y,
                width: panelOverlayClientRect!.width,
                height: panelOverlayClientRect!.height,
              }
            : null),
        } : undefined}
        className={`
        overflow-hidden [--zenith-title-bar-h:38px]
        ${panelUnderRadial ? '' : 'absolute inset-0'}
        ${panelNeutralizingClose
          ? 'opacity-0 invisible !transition-none pointer-events-none'
          : panelStaysUnderRadial
          ? 'zenith-panel-surface pointer-events-none !transition-none'
          : (isMenuOpen || radialOpenAwaitingFullscreen)
            ? 'hidden !transition-none pointer-events-none'
            : panelSurfaceOpen
              ? 'zenith-panel-surface !transition-none opacity-100 visible'
              : 'hidden !transition-none pointer-events-none'
        }
      `}>
        {/* CUSTOM TITLE BAR OVERLAY (for drag region + app name) */}
        {panelSurfaceOpen && panelContentVisible && (
          <div
            /* `zenith-titlebar` — estilo em index.css, a par do painel radial. */
            className="zenith-titlebar absolute top-0 left-0 right-0 h-[var(--zenith-title-bar-h)] z-[999] flex items-center justify-between pl-3 rounded-t-[12px] overflow-hidden"
            /* Sob o radial a região de arrasto moveria a janela do overlay inteira, não o painel. */
            style={{ WebkitAppRegion: panelStaysUnderRadial ? 'no-drag' : 'drag' } as any}
          >
            {isSettingsOpen ? (
              <div
                className="flex items-center gap-1 pointer-events-auto"
                style={{ WebkitAppRegion: 'no-drag' } as any}
                aria-label="Settings navigation"
              >
                <button
                  className="zenith-titlebar-btn w-8 h-6 flex items-center justify-center rounded-md"
                  onClick={() => window.dispatchEvent(new CustomEvent('zenith-settings-toggle-sidebar'))}
                  aria-label="Hide or show sidebar"
                >
                  <PanelLeftClose size={14} strokeWidth={1.9} />
                </button>
                <button
                  className="zenith-titlebar-btn w-8 h-6 flex items-center justify-center rounded-md"
                  onClick={() => window.dispatchEvent(new CustomEvent('zenith-settings-navigation', { detail: 'back' }))}
                  aria-label="Back in settings"
                >
                  <ArrowLeft size={14} strokeWidth={1.9} />
                </button>
                <button
                  className="zenith-titlebar-btn w-8 h-6 flex items-center justify-center rounded-md"
                  onClick={() => window.dispatchEvent(new CustomEvent('zenith-settings-navigation', { detail: 'forward' }))}
                  aria-label="Forward in settings"
                >
                  <ArrowRight size={14} strokeWidth={1.9} />
                </button>
              </div>
            ) : (
              <div />
            )}

            {/* Custom Window Controls */}
            <div className="flex items-stretch h-full pointer-events-auto" style={{ WebkitAppRegion: 'no-drag' } as any}>
              {/*
                Controlos de janela como os do Windows: sem `title` (o tooltip nativo aparecia
                sobre a barra e não existe em janela nenhuma do sistema) e sem transições — o
                realce de fundo é instantâneo, como no Explorador. O `aria-label` fica, porque é
                para leitores de ecrã e não desenha nada.
              */}
              <button
                className="zenith-titlebar-btn h-full w-[46px] flex items-center justify-center"
                onClick={() => flushNeutralFrameThenMinimize()}
                aria-label="Minimize"
              >
                <Minus size={13} strokeWidth={2} />
              </button>
              <button
                className="zenith-titlebar-btn h-full w-[46px] flex items-center justify-center"
                onClick={() => window.electron?.toggleMaximize()}
                aria-label={windowState === 'maximized' ? 'Restore' : 'Maximize'}
              >
                {windowState === 'maximized' ? <Square size={11} strokeWidth={2.5} /> : <Maximize size={11} strokeWidth={2.5} />}
              </button>
              <button
                className="zenith-titlebar-btn is-close h-full w-[46px] flex items-center justify-center"
                onClick={handleClosePanelToBackground}
                aria-label="Close"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}

        {/* GLOBAL TITLE BAR (Native Software Controls) */}


        {/* BACKGROUND (Simulator Only OR First Run Dashboard) */}
        {/* DELETED: Removed redundant background to allow RadialMenu to handle it exclusively */}

        {/* WELCOME SCREEN / DASHBOARD — AnimatePresence sync evita buraco só com fundo entre dashboard e definições (DWM). */}
        {panelContentVisible && (
          <AnimatePresence mode="sync">
            {isSettingsOpen && panelSurfaceOpen && (
              <motion.div
                key="settings-page"
                initial={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-x-0 bottom-0 top-[var(--zenith-title-bar-h)] z-20"
              >
                <React.Suspense
                  fallback={<div className="absolute inset-0 bg-[#08090b]" aria-hidden />}
                >
                <PrecisionSettings
                  isOpen={isSettingsOpen}
                  isPage={true}
                  onClose={handleClosePanelToBackground}
                  apps={apps} setApps={setApps} config={config} setConfig={setConfig} onReset={async () => { 
                    try {
                      setIsDashboardOpen(false);
                      setIsSettingsOpen(false);
                      setIsAppReady(false);
                      setIsLoaded(false);
                    } catch(e) {}
                    setApps(MINIMAL_MAIN_WORKSPACE_APPS); 
                    setConfig(DEFAULT_UI_CONFIG); 
                    if (window.electron?.resetConfig) {
                        try {
                           await window.electron.resetConfig();
                        } catch(e) {}
                    } else {
                        localStorage.clear();
                        window.location.reload();
                    }
                  }}
                  onOpenDashboard={handleOpenSettings}
                />
                </React.Suspense>
              </motion.div>
            )}
          </AnimatePresence>
        )}

      </div>

      {/* Último frame do painel: quase transparente, mas não vazio, para Chromium submetê-lo ao DWM. */}
      {isDesktopMode && panelNeutralizingClose && (
        <div
          className="fixed inset-0 z-[99999] pointer-events-none"
          style={{ background: 'rgba(10,10,10,0.01)' }}
          aria-hidden
        />
      )}

      {/* Durante `applyWindowSize` o painel já está oculto no React — fundo sólido evita flash da última textura do compositor.
          Sem painel opaco antes (bandeja/ilha) fica transparente: aí o preto era ele próprio o flash. */}
      {isDesktopMode && radialOpenAwaitingFullscreen && (
        <div
          className={`fixed inset-0 z-[65] pointer-events-auto ${radialAwaitCoverOpaque ? 'bg-[#0A0A0A]' : ''}`}
          aria-hidden
        />
      )}

      {/* Ilha small→windowed: cobre um frame errado do DWM antes do invalidate após `applyWindowSize`. */}
      {isDesktopMode && panelResizeSolidCover && (
        <div
          className="fixed inset-0 z-[96] bg-[#0A0A0A] pointer-events-none"
          aria-hidden
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* TRANSPARENT LAYER — no background, RadialMenu + toasts live here    */}
      {/* ------------------------------------------------------------------ */}

        {/* Durante `radialOpenAwaitingFullscreen` o menu não pode ficar montado com `isOpen={false}` — o Framer animava “fechar” e depois “abrir”, causando flash de saída/entrada. */}
        {(!radialOpenAwaitingFullscreen || isMenuOpen) && (
          <RadialMenu
            key={radialMountKey}
            isOpen={isMenuOpen}
            position={menuPosition}
            viewportSize={radialClientSize}
            onClose={handleMenuClose}
            apps={radialApps}
            config={radialMenuConfig}
            triggerSource={triggerSource}
            updateReady={updateReady}
            onWorkspaceSwitch={handleWorkspaceSwitch}
            currentWorkspace={radialCurrentWorkspace}
            animationReady={
              radialPendingPaintToken === null ||
              radialNativeRevealToken === radialPendingPaintToken
            }
          />
        )}

        <Toast app={lastLaunched} />
        
        <AnimatePresence>
          {executionError && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000]">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="px-6 py-4 bg-red-500/90 backdrop-blur-xl border border-red-400/50 rounded-2xl shadow-2xl flex items-center gap-4 min-w-[320px]"
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Execution Error</div>
                  <div className="text-sm font-bold text-white leading-tight">{executionError}</div>
                </div>
                <button onClick={() => setExecutionError(null)} className="text-white/40 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>


        {/* FLASH PREVENTION BLANKER */}
        {!isAppReady && (
          <div 
            className="fixed inset-0 z-[99999] bg-black flex items-center justify-center" 
            style={{ opacity: 1, pointerEvents: 'none' }}
          />
        )}

        <style>{`
          .group:active { cursor: ${isAnyModalOpen ? 'default' : 'crosshair'}; }
        `}</style>

    </div>
  );
}
