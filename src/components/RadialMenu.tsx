import React, { useCallback, useEffect, useLayoutEffect, useState, useRef } from 'react';
import { Coordinates, AppItem, UIConfig, Workspace } from '../types';
import { getIcon } from '../iconMap';
import { CornerUpLeft } from 'lucide-react';
import { SmartIcon } from './SmartIcon';
import { RovylLogo } from './RovylLogo';
import { getTranslation } from '../translations';
import { RadialHud } from './RadialHud';
import {
  getRootRadialApps,
  isWorkspacePickItem,
  parseWorkspacePickIndex,
} from '../utils/workspaceRadial';

// PERF FIX #3: Module-level weather cache — persists across menu open/close cycles
// Prevents a new HTTP fetch on every menu open; refreshes only after 10 minutes or location change
const weatherCache: { data: { temp: number; condition: string } | null; lastFetch: number; location: string } = {
  data: null, lastFetch: 0, location: ''
};
const WEATHER_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Subconjunto da API Battery — evita `BatteryManager` quando o TS/DOM local não o expõe. */
type ZenithBattery = {
  level: number;
  addEventListener(type: 'levelchange', listener: () => void): void;
  removeEventListener(type: 'levelchange', listener: () => void): void;
};

// Helper to extract a normalized path from a command string for deduplication
const normalizePathForDedup = (item: any): string => {
  if (!item) return '';
  // NEVER use item.description as it might be "Quick Access Folder" or "Application"
  let pathStr = item.command || '';
  
  // 1. Handle commands with multiple arguments (e.g. "exe" "path" or code "path")
  // We want the LAST argument which is usually the file/folder path
  const allQuotes = [...pathStr.matchAll(/"([^"]+)"/g)];
  if (allQuotes.length > 0) {
    // If multiple quotes, take the last one (the folder path)
    // If one quote and it's an IDE command, take that quote
    pathStr = allQuotes[allQuotes.length - 1][1];
  } else {
    // No quotes, handle unquoted IDE prefixes (e.g., code C:\Path)
    const lower = pathStr.toLowerCase();
    const ideCommands = ['antigravity', 'cursor', 'code', 'vs code', 'vscode', 'code.exe', 'cursor.exe', 'antigravity.exe'];
    for (const cmd of ideCommands) {
      if (lower.startsWith(cmd + ' ')) {
        pathStr = pathStr.substring(cmd.length + 1).trim();
        break;
      }
    }
  }
  
  // 3. Absolute Normalization
  // - Lowercase for case-insensitivity
  // - Replace all backslashes with forward slashes
  // - Trim any trailing slashes or spaces
  // - Ensure drive letter is consistent (c: vs C:)
  let normalized = pathStr
    .toLowerCase()
    .trim()
    .replace(/[\\/]+/g, '/')     // Multiple slashes to single forward slash
    .replace(/\/+$/, '')         // Remove trailing slashes
    .replace(/^(['"]+)|(['"]+)$/g, ''); // Remove wrapping quotes if they managed to survive
    
  // Handle Windows Drive Letter consistency (e.g., c:/path -> c:/path)
  // We keep it lowercase as we already called .toLowerCase()
  if (/^[a-z]:/.test(normalized)) {
    // Already lowercased, just return
    return normalized;
  }
  
  return normalized;
};

/**
 * O nível raiz é reconstruído (array novo) sempre que o efeito de sincronização corre — em modo
 * `picker` os itens são sintéticos. Trocar a lista por uma equivalente re-renderiza a roda inteira
 * e, agora que a abertura é uma transição CSS presa à identidade do nível, faria a roda "renascer".
 */
function sameRadialLevel(a: AppItem[], b: AppItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, i) => item.id === b[i].id && item.label === b[i].label);
}

/** When "recent folders" is enabled but MRU fetch is empty or fails, show one explicit slice — never auto-launch the parent IDE. */
function buildRecentsEmptyFallback(parent: AppItem, config: UIConfig): AppItem[] {
  return [
    {
      id: `${parent.id}__recents-empty-fallback`,
      label: getTranslation(config, 'menu.recents_fallback'),
      command: parent.command,
      commandType: parent.commandType || 'app',
      iconName: parent.iconName || 'AppWindow',
      iconSource: parent.iconSource || 'lucide',
      customIconUrl: parent.customIconUrl,
      description: parent.label,
    },
  ];
}

/** Parent IDE setting: MRU slices open a terminal cwd'd to the project path (see executeCommand + IDE branch). */
function applyOpenTerminalForRecents(recents: AppItem[], parent: AppItem): AppItem[] {
  const commands = (parent.terminalCommands || []).filter((command) => command.trim().length > 0);
  if (!parent.openTerminalForRecents && commands.length === 0) return recents;
  return recents.map((recent) => ({
    ...recent,
    openTerminal: parent.openTerminalForRecents || commands.length > 0,
    terminalCommands: commands.length > 0 ? commands : recent.terminalCommands,
    launchMode: parent.launchMode,
  }));
}

/**
 * Calibração da roda. Extraída para módulo porque o gate da licença desenha a MESMA roda
 * (bloqueada): raio, tamanho de tile e respiração têm de vir daqui, nunca de constantes paralelas.
 */
export function computeRadialLayout({
  numberOfApps,
  iconSizePx,
  minGap,
  menuRadius,
  activationThreshold,
  viewportSize,
}: {
  numberOfApps: number;
  iconSizePx: number;
  minGap: number;
  menuRadius: number;
  activationThreshold?: number;
  viewportSize: { width: number; height: number };
}): { actualMenuRadius: number; actualIconSize: number } {
  // Allow the menu to occupy up to 52% of the smallest screen dimension (Phase 3)
  const maxScreenRadius = Math.min(viewportSize.width, viewportSize.height) * 0.52;
  const sinHalfSlice = numberOfApps > 1 ? Math.sin(Math.PI / numberOfApps) : 0;

  // Icon size ramps continuously with the item count rather than stepping at
  // 4 and 6 items: a sparse wheel reads better slightly compact, a dense one
  // wants the configured size, and adding one app should not resize the rest.
  const density = Math.max(0, Math.min(1, (numberOfApps - 3) / 6));
  let currentIconSize = Math.round(iconSizePx * (0.82 + 0.18 * density));

  // The ring grows only as fast as the icons need to keep a constant edge gap
  // between neighbours.
  const neighbourGap = minGap + 14;
  const packedRadius = (size: number) =>
    numberOfApps > 1 ? (size + neighbourGap) / 2 / sinHalfSlice : 0;

  // Floor: clear of the central hub, clear of the centre dead zone that
  // cancels selection, and scaled by the saved radius.
  const radiusScale = (menuRadius + minGap) / 150;
  const floorRadius = (size: number) =>
    Math.max(
      size * 1.1 + minGap + 12,                // hub is size * 1.2 wide
      (activationThreshold ?? 60) + size / 2 + 8, // stay outside the dead zone
      92,
    ) * radiusScale;

  let targetRadius = Math.max(floorRadius(currentIconSize), packedRadius(currentIconSize));

  // If the ring outgrows the screen, shrink the icons instead of overlapping.
  if (targetRadius > maxScreenRadius && numberOfApps > 1) {
    const possibleScale = (2 * maxScreenRadius * sinHalfSlice - neighbourGap) / currentIconSize;
    const scaleFactor = Math.max(0.5, Math.min(1.0, possibleScale));
    currentIconSize = Math.round(currentIconSize * scaleFactor);
    targetRadius = Math.max(floorRadius(currentIconSize), packedRadius(currentIconSize));
  }

  return { actualMenuRadius: targetRadius, actualIconSize: currentIconSize };
}

/**
 * Escurecimento do radial: poça radial em smoothstep de 9 stops (2 stops tão largos fazem
 * banding a 8-bit, e banding lê-se como borrão). Partilhado com o gate da licença.
 */
export function radialScrimGradient(
  position: { x: number; y: number },
  backdropOpacity: number,
  backdropRadius: number,
): string {
  const scrimPeak = 0.22 + backdropOpacity * 0.3;
  const scrimRadius = Math.round(backdropRadius * 2);
  const stops = [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88, 1]
    .map((t) => {
      const falloff = 1 - (3 * t * t - 2 * t * t * t);
      return `rgba(4,5,7,${(scrimPeak * falloff).toFixed(3)}) ${Math.round(t * scrimRadius)}px`;
    })
    .join(', ');
  return `radial-gradient(circle at ${Math.round(position.x)}px ${Math.round(position.y)}px, ${stops})`;
}

interface RadialMenuProps {
  isOpen: boolean;
  position: Coordinates;
  viewportSize: { width: number; height: number };
  /** Pass `selectedApp` when launching an item that may not exist in saved config (e.g. MRU `recent-*` ids). */
  onClose: (selectedId: string | null, selectedApp?: AppItem | null) => void;
  apps: AppItem[];
  config: UIConfig;
  triggerSource?: 'mmb' | 'mmb-click' | 'shortcut';
  onWorkspaceSwitch?: (workspaceIndex: number) => void;
  currentWorkspace?: Workspace;
  /** False enquanto o HWND oculto recebe o primeiro paint transparente. */
  animationReady?: boolean;
  /** Atualização descarregada e à espera de reinício — selo no hub. */
  updateReady?: boolean;
}

interface RadialMenuItemProps {
  app: AppItem;
  index: number;
  isActive: boolean;
  /** Circular distance in slices from the aimed one; `null` while nothing is aimed. */
  angularDistance: number | null;
  actualMenuRadius: number;
  actualIconSize: number;
  totalApps: number;
  /** Narrow style props so parent config identity does not bust memo for every App re-render. */
  backdropOpacity: number;
  hoverColor: string;
  showLabels: boolean;
  alwaysShowAppLabels: boolean;
  folderStackLength: number;
  /** `false` keeps the slice collapsed at the hub — the frame before the bloom and the whole closed state. */
  bloom: boolean;
  /** Small chip inside the label pill (workspace number, "recentes"…). Omitted when the slice has no hint. */
  shortcutHint?: string;
  onClick: (app: AppItem) => void;
}

/**
 * Labels sit OUTSIDE the wheel, on the side the slice points to, so a dense wheel never
 * stacks a pill over the neighbouring icon (the old below-the-icon placement did).
 */
export function getLabelPlacement(angleDeg: number, iconSize: number) {
  const rad = angleDeg * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const edge = iconSize / 2 + 10;

  if (cos > 0.35) return { x: edge, y: 0, originX: '0%', originY: '-50%' };
  if (cos < -0.35) return { x: -edge, y: 0, originX: '-100%', originY: '-50%' };
  if (sin < 0) return { x: 0, y: -edge, originX: '-50%', originY: '-100%' };
  return { x: 0, y: edge, originX: '-50%', originY: '0%' };
}

/**
 * Destaque binário: a fatia apontada acende e todas as outras ficam iguais entre si. Variar a
 * presença pela distância angular fazia os vizinhos parecerem parcialmente selecionados.
 *
 * A opacidade do contentor NÃO é o canal de "não selecionado". Cada fatia traz o seu próprio fundo,
 * e o alfa multiplica esse fundo também: a 0.5 o tile deixava de ser um objeto e passava a ser uma
 * mancha sobre o desktop — pior ainda com ícone monocromático (workspaces) e wallpaper claro, onde
 * o glifo branco a meio alfa desaparecia. Aqui a opacidade só dá o afastamento mínimo; a seleção
 * lê-se por cor, anel e escala, que são sinais que não destroem o contraste do que está por baixo.
 */
function getSlicePresence(distance: number | null) {
  if (distance === null) return { opacity: 0.96, scale: 1 };
  if (distance === 0) return { opacity: 1, scale: 1.06 };
  return { opacity: 0.9, scale: 1 };
}

/**
 * Alinha um valor à grelha de pixels FÍSICOS do monitor. A roda posiciona cada fatia por
 * trigonometria, o que produz coordenadas fracionárias (`84.0, 48.5`). Um tile tem três contornos
 * a 1px — borda clara, anel escuro exterior e luz interior — e em meio-pixel cada um deles é
 * espalhado por dois pixels físicos com alfas diferentes: é isso que se lê como aresta "à mão",
 * com rebarba e pontos irregulares. Com escala do Windows a 125/150% o erro nem sequer é de meio
 * pixel CSS, por isso não basta arredondar — tem de se dividir pelo `devicePixelRatio`.
 */
export function snapToDevicePixel(value: number): number {
  const ratio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.round(value * ratio) / ratio;
}

/** Mantém ícones e rótulos legíveis quando o utilizador escolhe um hover claro ou escuro. */
function getReadableForeground(background: string): '#000000' | '#FFFFFF' {
  const hex = background.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return '#000000';
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.56 ? '#000000' : '#FFFFFF';
}

function normalizeHoverColor(value?: string): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? '') ? value!.toUpperCase() : '#FFFFFF';
}

const RadialMenuItem = React.memo(({
  app,
  index,
  isActive,
  angularDistance,
  actualMenuRadius,
  actualIconSize,
  totalApps,
  backdropOpacity,
  hoverColor,
  showLabels,
  alwaysShowAppLabels,
  folderStackLength,
  bloom,
  shortcutHint,
  onClick,
}: RadialMenuItemProps) => {
  const Icon = getIcon(app.iconName);
  const [remoteIconFailed, setRemoteIconFailed] = React.useState(false);
  React.useEffect(() => {
    setRemoteIconFailed(false);
  }, [app.customIconUrl]);
  const sliceAngle = 360 / totalApps;
  const angleDeg = (index * sliceAngle) - 90;
  const angleRad = angleDeg * (Math.PI / 180);
  const pos = {
    x: actualMenuRadius * Math.cos(angleRad),
    y: actualMenuRadius * Math.sin(angleRad),
  };

  // PERF FIX #2: useMemo instead of IIFE so this only recomputes when app.command/label/iconSource change
  const shouldUseCustomIcon = React.useMemo(() => {
    const LUCIDE_ICON_EXCEPTIONS = [
      'Microsoft.WindowsTerminal',
      'WindowsTerminal',
      'Terminal',
      'cmd.exe',
      'powershell.exe'
    ];
    const isException = LUCIDE_ICON_EXCEPTIONS.some(exception =>
      app.command?.toLowerCase().includes(exception.toLowerCase()) ||
      app.label?.toLowerCase().includes(exception.toLowerCase())
    );
    if (isException) return false;
    return app.iconSource === 'native' && !!app.customIconUrl;
  }, [app.command, app.label, app.iconSource, app.customIconUrl]);

  const labelPlacement = React.useMemo(
    () => getLabelPlacement(angleDeg, actualIconSize),
    [angleDeg, actualIconSize],
  );

  const hasRasterIcon = Boolean(app.customIconUrl) && !remoteIconFailed;
  /**
   * Ícone por resolver: item nativo, com comando, mas ainda sem imagem. Acontece logo depois de
   * uma restauração ou da primeira descoberta, enquanto o PowerShell extrai os ícones — e um
   * glifo genérico nesse momento parece um ícone errado, não um ícone em falta.
   */
  const iconPending = app.iconSource === 'native' && !app.customIconUrl && Boolean(app.command);
  /**
   * O indicador tem prazo. Um ícone que nunca vai resolver — alvo inválido, app desinstalada —
   * deixava a fatia a girar indefinidamente, e uma espera sem fim lê-se pior do que um ícone
   * genérico. Passados 10 segundos, mostra-se o glifo e a fatia fica utilizável.
   */
  const [pendingExpired, setPendingExpired] = React.useState(false);
  React.useEffect(() => {
    if (!iconPending) {
      setPendingExpired(false);
      return;
    }
    const timer = window.setTimeout(() => setPendingExpired(true), 10000);
    return () => window.clearTimeout(timer);
  }, [iconPending, app.command]);
  const presence = getSlicePresence(angularDistance);
  const activeForeground = getReadableForeground(hoverColor);

  return (
    <div
      /**
       * O invólucro NUNCA recebe cliques. A sua caixa de layout fica na origem do ponto da fatia e
       * cresce para a direita e para baixo, enquanto o tile é PINTADO centrado nesse ponto (o
       * `-translate-*-1/2` é transform, não layout). A caixa fica meio tile fora do sítio, e a da
       * fatia de cima à esquerda chega a invadir o centro da roda — clicar no canto superior
       * esquerdo do hub caía nela, sempre na mesma, e executava-a. Quem recebe o clique passa a
       * ser o tile, cuja área de acerto acompanha o transform e portanto coincide com o desenho.
       */
      className="zn-radial-slice absolute top-0 left-0 pointer-events-none"
      style={{
        /* Um único transform por fatia: posição + presença. O hover só troca este valor. */
        ['--zn-tf' as string]: bloom
          ? `translate3d(${snapToDevicePixel(pos.x)}px, ${snapToDevicePixel(pos.y)}px, 0) scale(${presence.scale})`
          : 'translate3d(0px, 0px, 0) scale(0.2)',
        ['--zn-op' as string]: bloom ? presence.opacity : 0,
        zIndex: isActive ? 200 : 100,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick(app);
      }}
    >
      <div className="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
        {/* WRAPPER FOR BADGE & MASKED CONTENT */}
        <div
          className={`relative z-20 ${bloom ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none cursor-default'}`}
          style={{
            width: `${actualIconSize}px`,
            height: `${actualIconSize}px`,
          }}
        >
          {/* INNER MASKED CONTAINER (Overflow Hidden) */}
          <div
            /**
             * `overflow-hidden` liga uma máscara arredondada, e o Chromium suaviza máscaras pior
             * que bordas — os cantos ficam serrilhados sobre uma janela transparente. A máscara só
             * existe para cortar ícones rasterizados, portanto só se liga quando há um.
             */
            className={`w-full h-full rounded-[18px] flex items-center justify-center transition-[background-color,border-color,box-shadow] duration-150 relative ${hasRasterIcon ? 'overflow-hidden' : ''}`}
            style={{
              /**
               * O tile precisa de se sustentar sozinho sobre um desktop que não controlamos: o
               * fundo é quase opaco e a borda em repouso é forte o suficiente para o recortar sem
               * depender do escurecimento global nem do contraste do wallpaper.
               */
              /**
               * Fundo TOTALMENTE opaco. A janela é `transparent: true`: com alfa < 1 cada pixel é
               * pré-multiplicado e requantizado a 8 bits ao ser composto pelo Windows. Nos lados
               * retos a cobertura é 0% ou 100% e o erro não existe; na curva os pixels têm
               * cobertura parcial e o arredondamento cai ora para cima ora para baixo — a linha
               * fica irregular, com pontos mais claros e outros a desaparecer. A 0.985 a diferença
               * visual para opaco é nula, mas o custo na aresta não é.
               */
              backgroundColor: isActive
                ? hoverColor
                : `rgb(${12 + Math.round(backdropOpacity * 10)}, ${12 + Math.round(backdropOpacity * 10)}, ${12 + Math.round(backdropOpacity * 10)})`,
              border: isActive ? `1px solid ${hoverColor}` : `1px solid rgba(255,255,255,${0.28 + backdropOpacity * 0.08})`,
              color: isActive ? activeForeground : '#fff',
              /**
               * Contorno duplo: borda clara por dentro + anel escuro de 1px por fora.
               * O tile separa-se do desktop sozinho — em fundo claro lê-se o anel, em fundo
               * escuro lê-se a borda — sem depender do escurecimento global.
               */
              /* `inset` no topo = uma única fonte de luz para toda a roda: os tiles lêem-se como objetos. */
              boxShadow: isActive
                ? `0 0 0 1px rgba(0,0,0,0.45), 0 0 0 5px ${hoverColor}24, 0 12px 28px rgba(0,0,0,0.5)`
                : 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(0,0,0,0.5), 0 8px 22px rgba(0,0,0,0.42)',
            }}
          >
            {/* Icon Container: Show either native icon OR vector icon, not both */}
            <div className="w-full h-full flex items-center justify-center relative">
              {app.customIconUrl && !remoteIconFailed ? (
                /* Native / remote favicon */
                <SmartIcon
                  src={app.customIconUrl!}
                  alt={app.label}
                  className="object-contain relative z-10"
                  size={actualIconSize}
                  referenceScale={0.88}
                  onError={() => setRemoteIconFailed(true)}
                />
              ) : (
                /* Vector Icon (Only when no custom icon) */
                /**
                 * Glifo monocromático (workspaces, atalhos sem ícone nativo) não tem cor própria a
                 * segurá-lo: a legibilidade vem toda do traço, por isso é mais grosso que o de um
                 * ícone de app, que chega com a sua própria forma e cor.
                 */
                <Icon size={Math.round(actualIconSize * 0.55)} strokeWidth={1.75} />
              )}

              {/* A espera diz-se com um indicador, não com um ícone que não é o da app. */}
              {iconPending && !pendingExpired && !hasRasterIcon && (
                <span
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: 'rgba(6,7,9,0.72)' }}
                  aria-label="A obter ícone"
                >
                  <span
                    className="rounded-full border-2 border-white/15 border-t-white/70 animate-spin"
                    style={{
                      width: Math.round(actualIconSize * 0.3),
                      height: Math.round(actualIconSize * 0.3),
                    }}
                  />
                </span>
              )}
            </div>
          </div>

          {/* FOLDER BADGE (Outside Mask, Inside Wrapper) */}
          {app.type === 'folder' && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center border-2 border-[#1A1A1A] z-30 shadow-md">
              <div className="w-1 h-1 bg-black rounded-full" />
              <div className="w-1 h-1 bg-black rounded-full ml-0.5" />
            </div>
          )}
        </div>

        {showLabels && (
          <div
            className="zn-radial-label absolute pointer-events-none z-30"
            style={{
              left: '50%',
              top: '50%',
              /* Âncora (fica fora da roda) + deslocamento + escala num só transform. */
              ['--zn-tf' as string]:
                `translate(${labelPlacement.originX}, ${labelPlacement.originY})` +
                ` translate3d(${snapToDevicePixel(labelPlacement.x)}px, ${snapToDevicePixel(labelPlacement.y)}px, 0)` +
                ` scale(${alwaysShowAppLabels ? (isActive ? 1 : 0.94) : (isActive ? 1 : 0.9)})`,
              /** Rótulo também tem plate próprio: dimmá-lo a 0.72 apagava o texto, não o destaque. */
              ['--zn-op' as string]: alwaysShowAppLabels
                ? (isActive ? 1 : 0.9)
                : (isActive ? 1 : 0),
            }}
          >
            <div
              className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full whitespace-nowrap"
              style={{
                background: isActive ? hoverColor : 'rgba(6,7,9,0.95)',
                border: `1px solid ${isActive ? hoverColor : 'rgba(255,255,255,0.2)'}`,
                boxShadow: '0 0 0 1px rgba(0,0,0,0.45), 0 6px 18px rgba(0,0,0,0.45)',
                paddingRight: shortcutHint ? undefined : '0.75rem',
              }}
            >
              <span
                className="text-[12px] leading-none"
                style={{
                  color: isActive ? activeForeground : 'rgba(255,255,255,0.7)',
                  fontFamily: 'var(--font-radial)',
                  fontWeight: 500,
                  letterSpacing: '-0.005em',
                }}
              >
                {app.label}
              </span>
              {shortcutHint && (
                <span
                  className="text-[10px] leading-none px-1.5 py-1 rounded-[5px]"
                  style={{
                    color: isActive ? activeForeground : 'rgba(255,255,255,0.5)',
                    background: isActive
                      ? (activeForeground === '#000000' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.14)')
                      : 'rgba(255,255,255,0.10)',
                  }}
                >
                  {shortcutHint}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

const RadialMenuInner: React.FC<RadialMenuProps> = ({
  isOpen,
  position,
  viewportSize,
  onClose,
  apps,
  config,
  triggerSource = 'shortcut',
  onWorkspaceSwitch,
  currentWorkspace,
  animationReady = true,
  updateReady = false,
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isCenterActive, setIsCenterActive] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  /** Impede que o mouseup do MMB usado para fechar confirme o app/workspace sob o cursor. */
  const toggleClosePendingRef = useRef(false);
  const isCenterActiveRef = useRef(isCenterActive);
  const openingTimeRef = useRef<number>(0);
  /**
   * A abertura é uma transição CSS, não uma animação JS: as fatias montam colapsadas no hub e
   * um único `rAF` depois passam ao estado final — o compositor faz o resto. Uma re-renderização
   * por abertura (e por nível), em vez de uma mola por ícone a cada frame.
   */
  const [bloom, setBloom] = useState(false);

  useEffect(() => {
    isCenterActiveRef.current = isCenterActive;
  }, [isCenterActive]);

  // Folder Navigation State
  // Seeded with the root level, not the raw app list: in picker mode the two
  // differ, and mounting with the wrong one costs a frame of the wrong wheel.
  const [currentLevelApps, setCurrentLevelApps] = useState<AppItem[]>(() => getRootRadialApps(config, apps));
  const [folderStack, setFolderStack] = useState<{ label: string, apps: AppItem[] }[]>([]);
  const [isLoadingRecents, setIsLoadingRecents] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const radialHoverColor = normalizeHoverColor(config.radialHoverColor);
  const radialHoverForeground = getReadableForeground(radialHoverColor);
  const iconSizePx = config.iconSize || 64;
  const minGap = config.appSpacing || 0;
  const numberOfApps = currentLevelApps.length;

  // Intelligent Layout Calibration
  const { actualMenuRadius, actualIconSize } = React.useMemo(
    () =>
      computeRadialLayout({
        numberOfApps,
        iconSizePx,
        minGap,
        menuRadius: config.menuRadius,
        activationThreshold: config.activationThreshold,
        viewportSize,
      }),
    [config.menuRadius, config.activationThreshold, numberOfApps, iconSizePx, minGap, viewportSize.width, viewportSize.height],
  );

  // Sync root radial when workspace config / active workspace apps change while
  // menu stays open. Also pre-paint, for the same reason as the open reset:
  // in picker mode the root level is a synthetic workspace list, not `apps`, so
  // a passive effect showed one wheel and replaced it on the next frame.
  useLayoutEffect(() => {
    if (!isOpen || folderStack.length > 0) return;
    const next = getRootRadialApps(config, apps);
    setCurrentLevelApps((prev) => (sameRadialLevel(prev, next) ? prev : next));
  }, [isOpen, folderStack.length, apps, config.workspaceSwitchMode, config.workspaces, config]);

  /**
   * Dispara a saída das fatias: montam colapsadas no hub e o frame seguinte assume o estado final.
   * Corre também a cada troca de nível (pasta / workspace), por isso o mesmo movimento serve os dois.
   */
  useLayoutEffect(() => {
    if (!isOpen) {
      setBloom(false);
      return;
    }
    setBloom(false);
    if (!animationReady) return;
    const raf = requestAnimationFrame(() => setBloom(true));
    return () => cancelAnimationFrame(raf);
  }, [isOpen, currentLevelApps, animationReady]);

  /** Lista vazia: manter foco visual no centro (volta / centro) — antes o rato não atualizava o hub. */
  useEffect(() => {
    if (!isOpen || currentLevelApps.length > 0) return;
    setActiveIndex(null);
    setIsCenterActive(true);
  }, [isOpen, currentLevelApps.length]);

  const t = (key: string) => getTranslation(config, key);

  // The root hub carries the Rovyl identity; deeper levels keep the Back affordance.
  const isRoot = folderStack.length === 0;
  const centerLabel = !isRoot ? t('menu.back') : (config.centerButton?.label || t('menu.center'));


  // Reset state when menu opens.
  // This runs before paint: as a passive effect it landed one frame late, so
  // reopening after browsing into a folder painted the previous level first and
  // only then swapped to the root — read as the wheel rendering twice, the
  // first as a flash. The wheel it flashed had a different item count, hence a
  // different radius and icon size, which made the swap impossible to miss.
  useLayoutEffect(() => {
    if (isOpen) {
      openingTimeRef.current = Date.now();
      setHasMoved(false);
      setIsCenterActive(false);
      setFolderStack([]);
      setCurrentLevelApps(getRootRadialApps(configRef.current, apps));
      setActiveIndex(null);
      setBloom(false);

      // CRITICAL: Focus window and body to ensure keyboard events are captured
      // This is especially important when menu is opened via MMB or after dashboard interaction
      window.focus();
      document.body.focus();
      if (menuRef.current) {
        menuRef.current.focus();
      }
    }
  }, [isOpen]);

  // Stable Interaction Logic (Performance Optimization)
  // We use refs to access current state inside stable event listeners
  // to avoid destroying/recreating listeners on every hover (index change).
  /**
   * Tamanho do centro: constante, vindo do `iconSize` das definições e NÃO do tamanho calculado
   * das fatias. O tamanho das fatias sobe com a quantidade de itens, portanto o hub encolhia num
   * workspace com 3 apps e crescia noutro com 8 — o mesmo botão, dois tamanhos, e o alvo mudava
   * de sítio conforme o workspace. Só encolhe se o anel não tiver espaço para ele.
   *
   * Diâmetro par: o hub centra-se com `translate(-50%)`, e metade de um ímpar cai em meio-pixel.
   */
  const hubDiameter = Math.max(
    32,
    Math.min(
      /**
       * O tamanho compacto — o que a roda tinha com poucas apps, que é o que se lê melhor. A rampa
       * de densidade (0.82 → 1.0) fica reservada às fatias; o centro não engorda com o número de
       * itens, senão o mesmo botão tem um tamanho por workspace.
       */
      Math.round((config.iconSize || 64) * 0.82 * 1.2),
      Math.round((actualMenuRadius - actualIconSize / 2 - 10) * 2),
    ),
  ) & ~1;

  /** O alvo cobre a caixa do hub já com a escala do estado ativo, mais 4px de folga. */
  const hubHitSize = Math.round(hubDiameter * 1.06) + 4;
  /**
   * Zona de cancelamento — tem de cobrir a CAIXA do hub, não a circunferência.
   *
   * O hub é um `<div>` quadrado com `rounded-full`, e o `border-radius` também recorta o teste de
   * acerto: um clique no canto da caixa cai fora do círculo, atravessa para o overlay e vira
   * direção. Só que esse canto está a `r × √2` do centro (41% mais longe que a aresta do círculo)
   * e o utilizador lê-o como "dentro do botão" — daí clicar no canto superior esquerdo do botão de
   * voltar e executar uma fatia. O `× 1.06` acompanha a escala que o hub ganha quando está ativo,
   * que é exatamente o estado em que este clique acontece.
   */
  const deadZoneRadius = Math.max(
    config.activationThreshold ?? 60,
    Math.ceil((hubDiameter / 2) * 1.06 * Math.SQRT2) + 4,
  );

  /**
   * Diagnóstico da confirmação. Fica no log de persistência (`rovyl-persistence.log`) e diz, para
   * cada gesto que executa algo, de onde veio a decisão: ponto, centro assumido, distância, zona
   * morta e o item escolhido. Sem isto, um "abriu o que eu não cliquei" é impossível de atribuir.
   */
  const logRadialConfirm = useCallback(
    (
      origin: 'click' | 'mmb-release',
      point: { x: number; y: number } | null,
      aim: { isCenter: boolean; index: number | null },
    ) => {
      const { position, deadZoneRadius, currentLevelApps } = stateRef.current;
      const distance = point
        ? Math.round(Math.hypot(point.x - position.x, point.y - position.y))
        : -1;
      const label = aim.index !== null ? currentLevelApps[aim.index]?.label ?? '?' : '—';
      window.electron?.savePersistenceLog?.(
        `[RadialConfirm] ${origin} ponto=${point ? `${Math.round(point.x)},${Math.round(point.y)}` : 'null'} ` +
          `centro=${Math.round(position.x)},${Math.round(position.y)} dist=${distance} zonaMorta=${Math.round(deadZoneRadius)} ` +
          `→ ${aim.isCenter ? 'CENTRO' : `fatia ${aim.index} (${label})`}`,
      );
    },
    [],
  );

  /** Ação do centro: voltar um nível dentro de uma pasta, fechar na raiz. */
  const handleCenterActivate = useCallback(() => {
    const { folderStack, currentLevelApps: _ignored, apps, config, onClose } = stateRef.current;
    if (folderStack.length > 0) {
      const newStack = folderStack.slice(0, -1);
      setFolderStack(newStack);
      setCurrentLevelApps(
        newStack.length === 0 ? getRootRadialApps(config, apps) : newStack[newStack.length - 1].apps,
      );
      setHasMoved(false);
      setIsCenterActive(false);
      return;
    }
    onClose('__CENTER__');
  }, []);

  const stateRef = useRef({
    isOpen,
    position,
    activeIndex,
    onClose,
    currentLevelApps,
    config,
    isCenterActive,
    hasMoved,
    folderStack,
    apps,
    actualMenuRadius,
    actualIconSize,
    deadZoneRadius,
  });

  /** Layout: pointer math uses `position` — must match props before paint or first rAF sees stale center (fullscreen vs ilha small). */
  useLayoutEffect(() => {
    stateRef.current = {
      isOpen,
      position,
      activeIndex,
      onClose,
      currentLevelApps,
      config,
      isCenterActive,
      hasMoved,
      folderStack,
      apps,
      actualMenuRadius,
      actualIconSize,
      deadZoneRadius,
    };
  }, [isOpen, position, activeIndex, onClose, currentLevelApps, config, isCenterActive, hasMoved, folderStack, apps, actualMenuRadius, actualIconSize, deadZoneRadius]);

  /** Última posição REAL do ponteiro, escrita no próprio evento — sem passar por render. */
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  /**
   * Uma abertura confirma uma vez. Entre o `onClose` e o render que desmonta os listeners há uma
   * janela em que outro `mouseup` (ou o release do MMB a chegar logo a seguir ao clique) ainda é
   * entregue — e era isso que lançava uma app com o radial já a fechar.
   */
  const gestureConsumedRef = useRef(false);

  /**
   * Resolve o alvo a partir de um ponto concreto, com a mesma matemática do `mousemove`.
   *
   * A confirmação não pode ler `activeIndex`/`isCenterActive` do estado: esses valores percorrem
   * `mousemove` → rAF → `setState` → render → `stateRef`, e o botão pode ser largado antes de esse
   * ciclo fechar. Nesse caso o radial confirmava a fatia onde o cursor ESTEVE, não onde está — daí
   * abrir itens que não foram apontados, e a sensação de clique com atraso. Recalcular no momento
   * do release custa uma raiz quadrada e elimina a corrida por completo.
   */
  const resolveAimAtPoint = useCallback(
    (point: { x: number; y: number } | null): { isCenter: boolean; index: number | null } => {
      const { position, currentLevelApps, deadZoneRadius, config, actualMenuRadius, actualIconSize } =
        stateRef.current;
      if (!point) return { isCenter: true, index: null };

      const deltaX = point.x - position.x;
      const deltaY = point.y - position.y;
      if (Math.hypot(deltaX, deltaY) < deadZoneRadius) {
        return { isCenter: true, index: null };
      }
      if (currentLevelApps.length === 0) return { isCenter: false, index: null };

      const sliceAngle = 360 / currentLevelApps.length;

      /**
       * Modo por cursor: o alvo é o ícone SOB o ponteiro, não a direção em que ele está.
       *
       * Na mira por ângulo, estar do lado direito do ecrã acende o item da direita mesmo com o
       * cursor a centenas de píxeis dele — rápido para quem já sabe onde as coisas estão, e
       * desconcertante para quem não sabe. Aqui nada acende fora do raio do ícone, e largar sem
       * estar sobre nenhum não abre nada.
       */
      if (config.radialSelectionMode === 'cursor') {
        const hitRadius = Math.max(actualIconSize * 0.85, 22);
        let nearest: number | null = null;
        let nearestDistance = Infinity;
        for (let i = 0; i < currentLevelApps.length; i += 1) {
          const itemRad = ((i * sliceAngle) - 90) * (Math.PI / 180);
          const distance = Math.hypot(
            deltaX - actualMenuRadius * Math.cos(itemRad),
            deltaY - actualMenuRadius * Math.sin(itemRad),
          );
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = i;
          }
        }
        return { isCenter: false, index: nearestDistance <= hitRadius ? nearest : null };
      }

      /**
       * Sem limite de distância: apontar é dar uma direção, e a fatia continua a ser o alvo com o
       * cursor no outro extremo do ecrã. Quem quer desistir usa o centro ou o Escape.
       */
      let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 90;
      if (angle < 0) angle += 360;
      const index = Math.floor(((angle + sliceAngle / 2) % 360) / sliceAngle);
      return {
        isCenter: false,
        index: index >= 0 && index < currentLevelApps.length ? index : null,
      };
    },
    [],
  );

  /**
   * Entrar ou sair de um nível (workspace, pasta, recentes) troca as fatias debaixo de um cursor
   * que não se mexeu — e como o realce só é recalculado em `mousemove`, o novo nível aparecia
   * inteiro apagado até se dar um toque no rato. Aqui a mira é reavaliada na posição real assim
   * que o nível muda, portanto a fatia sob o cursor já chega acesa.
   */
  useLayoutEffect(() => {
    if (!isOpen) return;
    /** Mudar de nível é navegar, não confirmar: o gesto seguinte tem de voltar a valer. */
    gestureConsumedRef.current = false;
    const aim = resolveAimAtPoint(lastPointerRef.current);
    setIsCenterActive(aim.isCenter);
    setActiveIndex(aim.isCenter ? null : aim.index);
  }, [isOpen, currentLevelApps, folderStack.length, resolveAimAtPoint]);

  useEffect(() => {
    if (!isOpen) return;

    /**
     * Abertura nova, ponteiro por conhecer. Sem isto sobrava a posição da abertura ANTERIOR, que
     * está longe do novo centro: largar o botão sem mexer no rato confirmaria uma fatia. `null`
     * resolve para o centro, ou seja, cancelar — o único padrão seguro.
     */
    lastPointerRef.current = null;
    gestureConsumedRef.current = false;

    let rafId: number | null = null;
    let lastMouseEvent: MouseEvent | null = null;

    const processMouseMove = () => {
      if (!lastMouseEvent) return;
      const { position, config, currentLevelApps, hasMoved, activeIndex, deadZoneRadius } = stateRef.current;

      const e = lastMouseEvent;
      const deltaX = e.clientX - position.x;
      const deltaY = e.clientY - position.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const MOVEMENT_BUFFER = 15;

      if (currentLevelApps.length === 0) {
        if (!hasMoved && distance > MOVEMENT_BUFFER) {
          setHasMoved(true);
        }
        if (distance < deadZoneRadius) {
          if (activeIndex !== null) setActiveIndex(null);
          if (!stateRef.current.isCenterActive) setIsCenterActive(true);
        } else {
          if (stateRef.current.isCenterActive) setIsCenterActive(false);
          if (activeIndex !== null) setActiveIndex(null);
        }
        rafId = null;
        return;
      }

      if (!hasMoved && distance > MOVEMENT_BUFFER) {
        setHasMoved(true);
      }

      if (distance < deadZoneRadius) {
        if (activeIndex !== null) setActiveIndex(null);
        if (!stateRef.current.isCenterActive) setIsCenterActive(true);
        rafId = null;
        return;
      }

      if (stateRef.current.isCenterActive) setIsCenterActive(false);

      /**
       * Uma só matemática para o realce e para a confirmação.
       *
       * Estavam duplicadas, e qualquer divergência entre as duas significa acender um ícone e
       * abrir outro — o pior defeito possível num lançador. Agora ambas passam por aqui.
       */
      const aim = resolveAimAtPoint({ x: e.clientX, y: e.clientY });
      if (activeIndex !== aim.index) setActiveIndex(aim.index);

      rafId = null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastMouseEvent = e;
      /** Síncrono: o realce pode esperar pelo próximo frame, a confirmação não. */
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      if (rafId === null) {
        rafId = requestAnimationFrame(processMouseMove);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      /**
       * MMB é tratado exclusivamente pelo IPC `mmb-release` no modo segurar e pelo main no modo
       * clique. Aceitá-lo também aqui fazia o mesmo gesto confirmar a fatia e alternar o modal.
       */
      if (e.button === 1) {
        toggleClosePendingRef.current = false;
        return;
      }
      if (e.button !== 0) return;
      if (gestureConsumedRef.current || !stateRef.current.isOpen) return;
      gestureConsumedRef.current = true;
      const { folderStack, apps, currentLevelApps, onClose, config } = stateRef.current;

      /** O alvo é onde o cursor está AGORA, não o que o último render chegou a registar. */
      const aim = resolveAimAtPoint({ x: e.clientX, y: e.clientY });
      logRadialConfirm('click', { x: e.clientX, y: e.clientY }, aim);
      const selectedItemObj = aim.index !== null ? currentLevelApps[aim.index] : null;

      if (aim.isCenter) {
        if (folderStack.length > 0) {
          const newStack = [...folderStack];
          newStack.pop();
          setFolderStack(newStack);

          if (newStack.length === 0) {
            setCurrentLevelApps(getRootRadialApps(config, apps));
          } else {
            setCurrentLevelApps(newStack[newStack.length - 1].apps);
          }
          setHasMoved(false);
          setIsCenterActive(false);
        } else {
          onClose('__CENTER__');
        }
        return;
      }

      if (selectedItemObj && isWorkspacePickItem(selectedItemObj)) {
        const idx = parseWorkspacePickIndex(selectedItemObj.id);
        if (onWorkspaceSwitch) onWorkspaceSwitch(idx);
        const ws = config.workspaces[idx];
        if (ws?.enabled) {
          const list = ws.apps;
          setFolderStack([{ label: ws.name, apps: list }]);
          setCurrentLevelApps(list);
          setHasMoved(false);
          setActiveIndex(null);
        }
        return;
      }

      const selectedItem = selectedItemObj as any;
      if (!selectedItem) return;
        // Core Folder Integration Logic
        const isKnownIDE = (item: any) => {
          const l = item.label?.toLowerCase() || '';
          return l.includes('antigravity') || l.includes('cursor') || l.includes('vs code') || l.includes('vscode');
        };

        const hasRecentFetch = (selectedItem.hasRecents) && window.electron?.getAppRecents;
        const hasManualFolders = selectedItem.children && selectedItem.children.length > 0;

        if (selectedItem.type === 'folder' && selectedItem.children) {
          // Standard Folder Group
          setFolderStack([...folderStack, { label: selectedItem.label, apps: selectedItem.children }]);
          setCurrentLevelApps(selectedItem.children);
          setHasMoved(false);
          setActiveIndex(null);
        } else if (hasRecentFetch || hasManualFolders) {
          // App with Recents/QuickAccess
          setIsLoadingRecents(true);
          const manualFolders = selectedItem.children || [];

          if (hasRecentFetch) {
            window.electron!.getAppRecents(selectedItem.label, selectedItem.command).then(recents => {
              setIsLoadingRecents(false);
              const seenPathsMap = new Map();
              const seenLabels = new Set();
              manualFolders.forEach(c => {
                 const norm = normalizePathForDedup(c);
                 if (norm) seenPathsMap.set(norm, c.label || c.command);
                 if (c.label) seenLabels.add(c.label.toLowerCase());
              });
              
              const seenPaths = new Set(seenPathsMap.keys());
              
              const seenNormalized = new Set(seenPaths); // Start with manual folders
              const uniqueRecents = recents.filter(r => {
                const normalized = normalizePathForDedup(r);
                if (!normalized) return false;
                
                const isDuplicatePath = seenNormalized.has(normalized);
                const rLabelLower = (r.label || '').toLowerCase();
                const isDuplicateLabel = rLabelLower && seenLabels.has(rLabelLower);
                
                if (isDuplicatePath || isDuplicateLabel) {
                   return false;
                }
                
                seenNormalized.add(normalized);
                if (rLabelLower) seenLabels.add(rLabelLower);
                return true;
              });
              
              const combined = [...manualFolders, ...applyOpenTerminalForRecents(uniqueRecents, selectedItem)];

              if (combined.length > 0) {
                setFolderStack([...folderStack, { label: selectedItem.label, apps: combined }]);
                setCurrentLevelApps(combined);
                setHasMoved(false);
                setActiveIndex(null);
              } else if (selectedItem.hasRecents) {
                setIsLoadingRecents(false);
                const fallback = buildRecentsEmptyFallback(selectedItem, stateRef.current.config);
                setFolderStack([...folderStack, { label: selectedItem.label, apps: fallback }]);
                setCurrentLevelApps(fallback);
                setHasMoved(false);
                setActiveIndex(null);
              } else {
                onClose(selectedItem.id, selectedItem);
              }
            }).catch(() => {
              setIsLoadingRecents(false);
              if (selectedItem.hasRecents) {
                const fallback = buildRecentsEmptyFallback(selectedItem, stateRef.current.config);
                setFolderStack([...folderStack, { label: selectedItem.label, apps: fallback }]);
                setCurrentLevelApps(fallback);
                setHasMoved(false);
                setActiveIndex(null);
              } else {
                onClose(selectedItem.id, selectedItem);
              }
            });
          } else {
            // Only manual folders
            setIsLoadingRecents(false);
            setFolderStack([...folderStack, { label: selectedItem.label, apps: manualFolders }]);
            setCurrentLevelApps(manualFolders);
            setHasMoved(false);
            setActiveIndex(null);
          }
        } else {
          onClose(selectedItem.id, selectedItem);
        }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        stateRef.current.onClose(null);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      onClose(null);
    };

    const handleToggleClose = () => {
      toggleClosePendingRef.current = true;
    };

    const handleWheel = (e: WheelEvent) => {
      if (!onWorkspaceSwitch) return;
      const { config, folderStack } = stateRef.current;
      if (config.workspaceSwitchMode === 'picker' && folderStack.length === 0) return;
      const numWorkspaces = config.workspaces.length;
      if (numWorkspaces <= 1) return;

      const currentIndex = config.activeWorkspaceIndex;
      let nextIndex = currentIndex;

      if (e.deltaY < 0) {
        nextIndex = (currentIndex - 1 + numWorkspaces) % numWorkspaces;
      } else if (e.deltaY > 0) {
        nextIndex = (currentIndex + 1) % numWorkspaces;
      }

      if (nextIndex !== currentIndex) {
        const nextWs = config.workspaces[nextIndex];
        if (!nextWs) return;
        const list = nextWs.apps;
        setFolderStack([]);
        setActiveIndex(null);
        setHasMoved(false);
        setCurrentLevelApps(list);
        onWorkspaceSwitch(nextIndex);
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('zenith-radial-toggle-close', handleToggleClose);
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('zenith-radial-toggle-close', handleToggleClose);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen]);

  // Sync workspace shortcuts state with main process (Fix for initial focus issue)
  useEffect(() => {
    if (window.electron?.setWorkspaceShortcutsState) {
      window.electron.setWorkspaceShortcutsState(
        isOpen,
        config.workspaceSwitchMode === 'picker' ? 'picker' : 'hotkeys',
      );
    }
  }, [isOpen, config.workspaceSwitchMode]);

  // STABLE KEYBOARD LISTENER (Decoupled from interaction states to avoid missing events)
  // NOTE: Workspace switching (1-9) is handled exclusively by global shortcuts registered in
  // the backend (set-workspace-shortcuts IPC). Having a duplicate listener here caused double-firing.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // diagLog(`[RadialMenu.tsx] KeyDown detected: ${e.key}, Ctrl: ${e.ctrlKey}, Alt: ${e.altKey}, Shift: ${e.shiftKey}`);
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(null);
        return;
      }

      // Workspace Switching (1-9) — disabled in picker mode (user chooses workspace on the radial)
      if (
        onWorkspaceSwitch &&
        configRef.current.workspaceSwitchMode !== 'picker'
      ) {
        const num = parseInt(e.key);
        if (!isNaN(num) && num >= 1 && num <= 9) {
          e.preventDefault();
          onWorkspaceSwitch(num - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, onClose, onWorkspaceSwitch]);

  /**
   * Modo "segurar": a janela abre com o botão do meio ainda premido, e no Windows a captura do rato
   * fica na janela que recebeu o clique — esta não recebe `mousemove` nenhum até ao release, por isso
   * o ângulo nunca atualizava e nada era selecionável. O main sonda o cursor (`mmb-cursor`) e aqui
   * reproduzimo-lo como um `mousemove` real, para alimentar exatamente o mesmo pipeline de mira.
   */
  useEffect(() => {
    if (!isOpen || triggerSource !== 'mmb' || !window.electron?.onMmbCursor) return;

    const cleanup = window.electron.onMmbCursor(({ x, y }) => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: x - window.screenX,
          clientY: y - window.screenY,
        }),
      );
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [isOpen, triggerSource]);

  // MMB Release Logic (Hold to Open -> Release to Execute)
  // Uses stateRef so the native listener is not torn down on every hover (activeIndex) update.
  useEffect(() => {
    if (!isOpen || triggerSource !== 'mmb' || !window.electron?.onMmbRelease) return;
    let delayedReleaseTimer: number | undefined;

    const handleMmbRelease = () => {
      const elapsed = Date.now() - openingTimeRef.current;
      const GRACE_PERIOD_MS = 250; // Ensure menu stays open for at least 250ms to prevent flickers

      const executeClose = () => {
        if (gestureConsumedRef.current || !stateRef.current.isOpen) return;
        gestureConsumedRef.current = true;
        const { folderStack, currentLevelApps, apps, onClose, config } = stateRef.current;

        /** Mesma regra do clique: o alvo sai da posição real, incluindo a sondada pelo main no MMB. */
        const aim = resolveAimAtPoint(lastPointerRef.current);
        logRadialConfirm('mmb-release', lastPointerRef.current, aim);
        const activeIndex = aim.index;

        if (aim.isCenter) {
          if (folderStack.length > 0) {
            const newStack = folderStack.slice(0, -1);
            setFolderStack(newStack);
            if (newStack.length === 0) setCurrentLevelApps(getRootRadialApps(config, apps));
            else setCurrentLevelApps(newStack[newStack.length - 1].apps);
            setHasMoved(false);
            setIsCenterActive(false);
          } else {
            onClose('__CENTER__');
          }
          return;
        }

        const selectedItem = activeIndex !== null ? currentLevelApps[activeIndex] : null;

        if (selectedItem && isWorkspacePickItem(selectedItem)) {
          const idx = parseWorkspacePickIndex(selectedItem.id);
          if (onWorkspaceSwitch) onWorkspaceSwitch(idx);
          const ws = config.workspaces[idx];
          if (ws?.enabled) {
            const list = ws.apps;
            setFolderStack([{ label: ws.name, apps: list }]);
            setCurrentLevelApps(list);
            setHasMoved(false);
            setActiveIndex(null);
          }
          return;
        }

        if (selectedItem) {
          const hasRecentFetch = (selectedItem.hasRecents) && window.electron?.getAppRecents;
          const hasManualFolders = selectedItem.children && selectedItem.children.length > 0;

          if (selectedItem.type === 'folder' && selectedItem.children) {
            setFolderStack(prev => [...prev, { label: selectedItem.label, apps: selectedItem.children! }]);
            setCurrentLevelApps(selectedItem.children);
            setHasMoved(false);
            setActiveIndex(null);
          } else if (hasRecentFetch || hasManualFolders) {
            setIsLoadingRecents(true);
            const manualFolders = selectedItem.children || [];

            if (selectedItem.hasRecents && window.electron?.getAppRecents) {
              window.electron!.getAppRecents(selectedItem.label, selectedItem.command).then(recents => {
                setIsLoadingRecents(false);
                const seenPaths = new Set(manualFolders.map(c => normalizePathForDedup(c)));
                const uniqueRecents = recents.filter(r => {
                  const normalized = normalizePathForDedup(r);
                  return normalized && !seenPaths.has(normalized);
                });
                const combined = [...manualFolders, ...applyOpenTerminalForRecents(uniqueRecents, selectedItem)];

                if (combined.length > 0) {
                  setFolderStack(prev => [...prev, { label: selectedItem.label, apps: combined }]);
                  setCurrentLevelApps(combined);
                  setHasMoved(false);
                  setActiveIndex(null);
                } else if (selectedItem.hasRecents) {
                  setIsLoadingRecents(false);
                  const fallback = buildRecentsEmptyFallback(selectedItem, stateRef.current.config);
                  setFolderStack(prev => [...prev, { label: selectedItem.label, apps: fallback }]);
                  setCurrentLevelApps(fallback);
                  setHasMoved(false);
                  setActiveIndex(null);
                } else {
                  onClose(selectedItem.id, selectedItem);
                }
              }).catch(() => {
                setIsLoadingRecents(false);
                if (selectedItem.hasRecents) {
                  const fallback = buildRecentsEmptyFallback(selectedItem, stateRef.current.config);
                  setFolderStack(prev => [...prev, { label: selectedItem.label, apps: fallback }]);
                  setCurrentLevelApps(fallback);
                  setHasMoved(false);
                  setActiveIndex(null);
                } else {
                  onClose(selectedItem.id, selectedItem);
                }
              });
            } else {
              setIsLoadingRecents(false);
              setFolderStack(prev => [...prev, { label: selectedItem.label, apps: manualFolders }]);
              setCurrentLevelApps(manualFolders);
              setHasMoved(false);
              setActiveIndex(null);
            }
          } else {
            onClose(selectedItem.id, selectedItem);
          }
        } else {
          onClose(null);
        }
      };

      const { hasMoved } = stateRef.current;
      if (!hasMoved && elapsed < GRACE_PERIOD_MS) {
        delayedReleaseTimer = window.setTimeout(executeClose, GRACE_PERIOD_MS - elapsed);
      } else {
        executeClose();
      }
    };

    const cleanup = window.electron.onMmbRelease(handleMmbRelease);
    return () => {
      if (cleanup) cleanup();
      if (delayedReleaseTimer !== undefined) window.clearTimeout(delayedReleaseTimer);
    };
  }, [isOpen, triggerSource, onWorkspaceSwitch]);

  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [weather, setWeather] = useState<{ temp: number; condition: string } | null>(null);

  // Battery & Weather Logic
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const weatherAbort = new AbortController();
    let batteryObj: ZenithBattery | null = null;
    const onBatteryLevel = () => {
      if (cancelled || !batteryObj) return;
      setBatteryLevel(Math.round(batteryObj.level * 100));
    };

    const nav = navigator as Navigator & { getBattery?: () => Promise<ZenithBattery> };
    if (config.showBattery && typeof nav.getBattery === 'function') {
      void nav.getBattery().then((battery) => {
        if (cancelled) return;
        batteryObj = battery;
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', onBatteryLevel);
      });
    }

    // Real Weather Logic (wttr.in) with 10-minute cache
    if (config.showWeather) {
      const loc = config.weatherLocation || '';
      const now = Date.now();
      const cacheValid = weatherCache.data &&
        weatherCache.location === loc &&
        (now - weatherCache.lastFetch) < WEATHER_TTL_MS;

      if (cacheValid) {
        setWeather(weatherCache.data);
      } else {
        const fetchWeather = async () => {
          try {
            const response = await fetch(`https://wttr.in/${encodeURIComponent(loc)}?format=j1`, {
              signal: weatherAbort.signal,
            });
            if (!response.ok) throw new Error('Weather fetch failed');
            const data = await response.json();
            const current = data.current_condition[0];
            const result = { temp: parseInt(current.temp_C), condition: current.weatherDesc[0].value };
            weatherCache.data = result;
            weatherCache.lastFetch = Date.now();
            weatherCache.location = loc;
            if (!cancelled) setWeather(result);
          } catch (err) {
            if (weatherAbort.signal.aborted) return;
            console.error("Failed to fetch weather:", err);
            if (!cancelled && !weatherCache.data) setWeather({ temp: 0, condition: '---' });
          }
        };
        fetchWeather();
      }
    }

    return () => {
      cancelled = true;
      weatherAbort.abort();
      if (batteryObj) {
        try {
          batteryObj.removeEventListener('levelchange', onBatteryLevel);
        } catch {
          /* ignore */
        }
      }
    };
  }, [isOpen, config.showBattery, config.showWeather, config.weatherLocation]);

  const handleAppClick = React.useCallback((app: AppItem) => {
    const cfg = configRef.current;
    if (isWorkspacePickItem(app)) {
      const idx = parseWorkspacePickIndex(app.id);
      if (onWorkspaceSwitch) onWorkspaceSwitch(idx);
      const ws = cfg.workspaces[idx];
      if (ws?.enabled) {
        const list = ws.apps;
        setFolderStack([{ label: ws.name, apps: list }]);
        setCurrentLevelApps(list);
        setHasMoved(false);
        setActiveIndex(null);
      }
      return;
    }
    const hasRecentFetch = (app.hasRecents) && window.electron?.getAppRecents;
    const hasManualFolders = app.children && app.children.length > 0;

    if (app.type === 'folder' && app.children) {
      setFolderStack(prev => [...prev, { label: app.label, apps: app.children! }]);
      setCurrentLevelApps(app.children);
      setHasMoved(false);
      setActiveIndex(null);
    } else if (hasRecentFetch || hasManualFolders) {
      setIsLoadingRecents(true);
      const manualFolders = app.children || [];

      if (app.hasRecents && window.electron?.getAppRecents) {
        window.electron!.getAppRecents(app.label, app.command).then(recents => {
          setIsLoadingRecents(false);
          const seenPaths = new Set(manualFolders.map(c => c.command));
          const uniqueRecents = recents.filter(r => !seenPaths.has(r.command));
          const combined = [...manualFolders, ...applyOpenTerminalForRecents(uniqueRecents, app)];

          if (combined.length > 0) {
            setFolderStack(prev => [...prev, { label: app.label, apps: combined }]);
            setCurrentLevelApps(combined);
            setHasMoved(false);
            setActiveIndex(null);
          } else if (app.hasRecents) {
            setIsLoadingRecents(false);
            const fallback = buildRecentsEmptyFallback(app, cfg);
            setFolderStack(prev => [...prev, { label: app.label, apps: fallback }]);
            setCurrentLevelApps(fallback);
            setHasMoved(false);
            setActiveIndex(null);
          } else {
            onClose(app.id, app);
          }
        }).catch(() => {
          setIsLoadingRecents(false);
          if (app.hasRecents) {
            const fallback = buildRecentsEmptyFallback(app, cfg);
            setFolderStack(prev => [...prev, { label: app.label, apps: fallback }]);
            setCurrentLevelApps(fallback);
            setHasMoved(false);
            setActiveIndex(null);
          } else {
            onClose(app.id, app);
          }
        });
      } else {
        setIsLoadingRecents(false);
        setFolderStack(prev => [...prev, { label: app.label, apps: manualFolders }]);
        setCurrentLevelApps(manualFolders);
        setHasMoved(false);
        setActiveIndex(null);
      }
    } else {
      onClose(app.id, app);
    }
  }, [onClose, onWorkspaceSwitch]);

  /**
   * A janela Electron é maior que o menu para que gestos largos continuem a receber eventos do rato.
   * O fundo visual, porém, acompanha apenas a roda (ícones + uma pequena margem) e usa a posição real
   * do menu como centro — importante quando o radial abre perto da borda do monitor.
   */
  const bo = config.backdropOpacity;


  const backdropRadius = Math.ceil(
    actualMenuRadius + actualIconSize * 0.75 + Math.max(18, minGap),
  );

  /**
   * A janela é `transparent: true` sobre o desktop, por isso `backdrop-filter` não tem nada para
   * amostrar no Windows — só compomos alfa. Duas consequências de design:
   *
   * 1. A legibilidade NÃO depende do escurecimento: cada ícone e cada pílula já trazem o seu
   *    próprio fundo a 0.92 e borda. O escurecimento serve só para focar. Logo pode ser leve —
   *    e é o peso que produzia o borrão cinzento sobre desktops claros.
   * 2. Nada de alfa uniforme em `inset-0`: pinta o retângulo da janela e denuncia-o como um
   *    quadrado no ecrã. O escurecimento tem de ser só a poça radial, a chegar a zero real
   *    dentro dos limites da janela — sem aresta reta em lado nenhum.
   */
  /** Memoizado: reconstruir a string a cada hover obrigava o Chromium a repintar um gradiente de ecrã inteiro. */
  const overlayDim = React.useMemo(
    () => radialScrimGradient(position, bo, backdropRadius),
    [bo, backdropRadius, position.x, position.y],
  );

  return (
    <div
      data-zenith-radial-modal="true"
      className={`fixed inset-0 z-[70] ${config.performanceMode ? 'zn-radial--fast' : ''} ${isOpen ? '' : 'zn-radial--closing'}`}
      style={{
        /* Sem atraso ao fechar — senão o HUD do radial ficava visível por cima/atrás da ilha compacta. */
        visibility: isOpen ? 'visible' : 'hidden',
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
    >
        <>
          {/* Escurecimento único (sem máscara radial — evita halo / “luz” à volta do radial) */}
          <div
            className="zn-radial-scrim fixed inset-0 z-[2]"
            style={{
              pointerEvents: isOpen ? 'auto' : 'none',
              background: overlayDim,
              ['--zn-op' as string]: isOpen && bloom ? 1 : 0,
              ['--zn-dur-op' as string]: isOpen ? '150ms' : '100ms',
              willChange: 'opacity',
            }}
          />

          <RadialHud
            isOpen={isOpen && bloom}
            config={config}
            batteryLevel={batteryLevel}
            weather={weather}
          />

          {/* Menu Container */}
          <div
            ref={menuRef}
            style={{
              left: Math.round(position.x),
              top: Math.round(position.y),
              width: 0,
              height: 0,
            }}
            className="fixed z-[10] pointer-events-none"
            tabIndex={-1}
          >

            {/*
              Alvo do centro: um QUADRADO transparente por cima do hub, um pouco maior que ele.
              O hub é `rounded-full`, e o `border-radius` recorta também o teste de acerto — um
              clique no canto da caixa não lhe acerta, atravessa para o overlay e vira direção.
              Era isto que abria a fatia daquele lado com o cursor visivelmente dentro do botão.
              Aqui o alvo não depende de limiar nenhum: dentro do quadrado é sempre o centro.
            */}
            {isOpen && (
              <div
                className="absolute top-0 left-0 z-30 pointer-events-auto cursor-pointer"
                style={{
                  width: `${hubHitSize}px`,
                  height: `${hubHitSize}px`,
                  transform: 'translate(-50%, -50%)',
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCenterActivate();
                }}
                aria-hidden
              />
            )}

            {/* Central Hub */}
            <div
              className={`
                zn-radial-hub absolute top-0 left-0
                rounded-full flex items-center justify-center z-20
                ${isOpen ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none cursor-default'}
                ${isCenterActive ? '' : 'text-white/70'}
              `}
              style={{
                /** Lado par: `translate(-50%)` de um ímpar cai em meio-pixel e serrilha o círculo. */
                width: `${hubDiameter}px`,
                height: `${hubDiameter}px`,
                /**
                 * Sem borda e sem anel de 1px. Numa circunferência, uma linha fina de alto
                 * contraste é o que torna cada degrau do antialiasing visível: o olho segue a
                 * linha e vê-a engrossar e afinar. Aqui o disco define-se pelo próprio
                 * preenchimento — uma transição cheio→transparente, que é o caso que o
                 * rasterizador trata melhor — e a separação do desktop vem de sombras DIFUSAS,
                 * que não têm aresta para serrilhar. O fundo sobe de .78 para .90 porque deixou
                 * de haver anel a segurar o contorno sobre um wallpaper claro.
                 */
                backgroundColor: isCenterActive ? radialHoverColor : 'rgba(6,7,9,0.90)',
                /** A borda não é CSS — é um `<circle>` SVG lá dentro. Ver o comentário do anel. */
                border: 'none',
                color: isCenterActive ? radialHoverForeground : undefined,
                boxShadow: isCenterActive
                  ? `0 0 22px ${radialHoverColor}3d, 0 8px 22px rgba(0,0,0,0.55)`
                  : '0 1px 3px rgba(0,0,0,0.55), 0 8px 20px rgba(0,0,0,0.5)',
                ['--zn-tf' as string]: `translate(-50%, -50%) scale(${bloom ? (isCenterActive ? 1.06 : 1) : 0.82})`,
                ['--zn-op' as string]: bloom ? 1 : 0,
                ['--zn-dur' as string]: '130ms',
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
            >
              {/*
                Selo de atualização. Informativo, nunca clicável: o centro é o gesto de fechar, e
                um alvo colado a ele reintroduzia a classe de bugs de cliques trocados que custou
                uma sessão inteira a resolver. A ação vive nas Definições.

                A seta é desenhada, não é um glifo tipográfico: um glifo traz espaçamento lateral e
                linha de base próprios, e num círculo de 24px isso chega para o pôr torto. Os
                pontos abaixo saem dos limites da TINTA — traço de 1.7 com pontas redondas cresce
                0.85 além de cada extremo — e não da geometria nua.
              */}
              {updateReady && (
                <span
                  className="absolute pointer-events-none"
                  style={{
                    top: -Math.round(hubDiameter * 0.03),
                    right: -Math.round(hubDiameter * 0.03),
                    width: Math.round(hubDiameter * 0.32),
                    height: Math.round(hubDiameter * 0.32),
                    borderRadius: '50%',
                    background: '#0A84FF',
                    /** Anel na cor do fundo: separa do hub sem introduzir contorno novo. */
                    border: `${Math.max(2, Math.round(hubDiameter * 0.026))}px solid #0a0a0a`,
                    boxSizing: 'border-box',
                    zIndex: 40,
                  }}
                  aria-label="Update ready"
                >
                  <svg viewBox="0 0 24 24" fill="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path
                      d="M12 7.2V13.6M8.9 10.5L12 13.6l3.1-3.1M7.7 16.7h8.6"
                      stroke="#fff"
                      strokeWidth={1.7}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}

              {/*
                O anel é um `<circle>` SVG, não uma `border` CSS.
                São dois rasterizadores diferentes: a borda de uma caixa com `border-radius` é
                desenhada como quatro arcos de canto costurados à volta de um retângulo, e é nessas
                costuras — e na largura fracionária — que aparecem os degraus e a espessura a
                oscilar. Um `<circle>` é UM caminho vetorial, traçado de uma vez pelo Skia com
                `geometricPrecision`: a cobertura é calculada pela distância real ao arco, igual em
                todo o perímetro. `vectorEffect` mantém o traço com a mesma espessura quando o hub
                escala, em vez de o esticar com a textura.
              */}
              <svg
                className="absolute inset-0 pointer-events-none"
                width={hubDiameter}
                height={hubDiameter}
                viewBox={`0 0 ${hubDiameter} ${hubDiameter}`}
                shapeRendering="geometricPrecision"
                aria-hidden
              >
                <circle
                  cx={hubDiameter / 2}
                  cy={hubDiameter / 2}
                  /** Meio traço para dentro: assim o anel fica alinhado com o limite do disco. */
                  r={(hubDiameter - 1.5) / 2}
                  fill="none"
                  stroke={isCenterActive ? radialHoverColor : 'rgba(255,255,255,0.30)'}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {isLoadingRecents ? (
                <div className="flex flex-col items-center justify-center animate-in fade-in duration-300">
                  <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
                </div>
              ) : isRoot ? (
                <div
                  className={`flex items-center justify-center transition-opacity duration-150 ${isCenterActive ? 'opacity-100' : 'opacity-70'}`}
                >
                  <RovylLogo
                    size={Math.round(actualIconSize * 0.64)}
                    color={isCenterActive ? radialHoverForeground : '#F4F2ED'}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1">
                  {/* Inside a folder the center remains the explicit Back control. */}
                  <CornerUpLeft size={Math.round(actualIconSize * 0.45)} strokeWidth={1.5} />
                  {!isCenterActive && (
                      <div className="flex gap-0.5 mt-0.5">
                        {folderStack.map((_, i) => (
                          <div key={i} className="w-1 h-1 rounded-full bg-white/40" />
                        ))}
                      </div>
                  )}
                </div>
              )}
            </div>

            {/* Context pill: where you are in the wheel + the gesture that goes back. */}
            <div
              className="zn-radial-pill absolute left-0 top-0 pointer-events-none z-30"
              style={{
                ['--zn-tf' as string]: `translate(-50%, 0) translate3d(0, ${Math.round(
                  actualMenuRadius + actualIconSize * 0.75 + 34,
                )}px, 0)`,
                ['--zn-op' as string]: isOpen && bloom ? 1 : 0,
              }}
            >
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full whitespace-nowrap"
                style={{
                  /* Opaco por si: um wash branco translúcido desaparecia sobre desktops claros. */
                  background: 'rgba(4,5,7,0.92)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.45)',
                }}
              >
                {/* Inside a workspace its name is enough — "Rovyl" identifies the root. */}
                {(isRoot ? ['Rovyl'] : folderStack.map((level) => level.label)).map((label, i) => (
                  <React.Fragment key={`${label}-${i}`}>
                    {i > 0 && <span className="text-[11px] leading-none text-white/25">/</span>}
                    <span
                      className="text-[11px] leading-none text-white/60"
                      style={{ fontFamily: 'var(--font-radial)', fontWeight: 500 }}
                    >
                      {label}
                    </span>
                  </React.Fragment>
                ))}
                <span
                  className="text-[10px] leading-none text-white/45 px-1.5 py-1 rounded-[5px]"
                  style={{ background: 'rgba(255,255,255,0.09)' }}
                >
                  {isRoot ? centerLabel : t('menu.back')}
                </span>
              </div>
            </div>

            {/* App Icons — a troca entre níveis é o próprio bloom (ver efeito `bloom`). */}
            {currentLevelApps.map((app, index) => {
                const isActive = index === activeIndex;
                let angularDistance: number | null = null;
                if (activeIndex !== null) {
                  const raw = Math.abs(index - activeIndex);
                  angularDistance = Math.min(raw, currentLevelApps.length - raw);
                }
                /* Workspace slices carry the 1–9 global shortcut, which was previously invisible. */
                const shortcutHint = isWorkspacePickItem(app)
                  ? String(parseWorkspacePickIndex(app.id) + 1)
                  : undefined;
                return (
                  <RadialMenuItem
                    key={`${app.id}-${folderStack.length}-${index}`}
                    app={app}
                    index={index}
                    isActive={isActive}
                    angularDistance={angularDistance}
                    actualMenuRadius={actualMenuRadius}
                    actualIconSize={actualIconSize}
                    totalApps={currentLevelApps.length}
                    backdropOpacity={config.backdropOpacity}
                    hoverColor={radialHoverColor}
                    showLabels={config.showLabels}
                    alwaysShowAppLabels={config.alwaysShowAppLabels ?? false}
                    folderStackLength={folderStack.length}
                    bloom={isOpen && bloom}
                    shortcutHint={shortcutHint}
                    onClick={handleAppClick}
                  />
                );
              })}
          </div>
        </>
    </div>
  );
};

export const RadialMenu = React.memo(RadialMenuInner);
