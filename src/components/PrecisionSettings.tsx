import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronRight,
  FilePlus2,
  FolderOpen,
  Globe2,
  GripVertical,
  Loader2,
  AlertTriangle,
  Monitor,
  Mouse,
  Pencil,
  Plus,
  Search,
  Palette,
  Settings,
  Shield,
  SquareStack,
  Trash2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppItem, UIConfig, Workspace } from '../types';
import { getIcon } from '../iconMap';
import { resolveWebsiteIconFields } from '../siteFavicon';
import { SmartIcon } from './SmartIcon';
import { IconPicker } from './IconPicker';
import { NativeAppIcon, useInstalledApps, type InstalledApp } from './installedApps';

interface PrecisionSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  apps: AppItem[];
  setApps: (value: AppItem[] | ((prev: AppItem[]) => AppItem[])) => void;
  config: UIConfig;
  setConfig: (value: UIConfig | ((prev: UIConfig) => UIConfig)) => void;
  onReset: () => void;
  onOpenDashboard: () => void;
  /** Estado da licença ativa nesta máquina — a linha das definições espelha-o. */
  /** Verdadeiro enquanto houver um pedido pendente para abrir o cartão da licença. */
  /** Chamado assim que o pedido é atendido, para o App o limpar. */
  isPage?: boolean;
}

type SectionId = 'general' | 'trigger' | 'appearance' | 'spaces' | 'advanced';

/** O modal fica reservado ao que não cabe numa linha: listas longas, gravação e edição. */
type Editor =
  | { kind: 'shortcut' }
  | { kind: 'blocked' }
  | { kind: 'workspace'; index: number }
  | null;

interface SettingItem {
  key: string;
  /** Título do grupo em que a linha entra. Linhas seguidas com o mesmo grupo ficam juntas. */
  group: string;
  title: string;
  description?: string;
  kind: 'bool' | 'range' | 'segmented' | 'open' | 'action' | 'color';
  enabled?: boolean;
  value?: string;
  min?: number;
  max?: number;
  step?: number;
  raw?: number;
  format?: (value: number) => string;
  choices?: Array<{ value: string; label: string }>;
  current?: string;
  onToggle?: () => void;
  onChange?: (value: number | string) => void;
  onOpen?: () => void;
  onRun?: () => void;
  actionLabel?: string;
  actionIcon?: LucideIcon;
  /** Optional destructive shortcut shown beside the regular row control. */
  onDelete?: () => void;
  deleteLabel?: string;
  /** Posicao na lista reordenavel. So as linhas que a definem aceitam arrasto. */
  reorderIndex?: number;
  /** `insertBefore` e o indice na lista ORIGINAL antes do qual o item deve ficar. */
  onReorder?: (from: number, insertBefore: number) => void;
}

/**
 * Glifos no vocabulário do System Settings do macOS: objeto reconhecível e simples (engrenagem,
 * rato, paleta, pilha de janelas, escudo) em vez do ícone abstrato de painel Windows/web.
 * Monocromáticos — a cor fica reservada ao que é ação ou estado, nunca à navegação.
 */
const SECTIONS: Array<{ id: SectionId; label: string; caption: string; icon: LucideIcon }> = [
  { id: 'general', label: 'General', caption: 'Core Rovyl behavior.', icon: Settings },
  { id: 'trigger', label: 'Activation', caption: 'How and where the wheel appears.', icon: Mouse },
  { id: 'appearance', label: 'Appearance', caption: 'Shape, presence, and theme.', icon: Palette },
  { id: 'spaces', label: 'Workspaces', caption: 'Contexts and their shortcuts.', icon: SquareStack },
  { id: 'advanced', label: 'Advanced', caption: 'Performance, protection, and data.', icon: Shield },
];

export const PrecisionSettings: React.FC<PrecisionSettingsProps> = ({
  isOpen,
  onClose,
  apps,
  config,
  setConfig,
  onReset,
}) => {
  const [sectionId, setSectionId] = useState<SectionId>('general');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  /** Versão do executável (não existe fora do Electron — o rodapé fica só com o nome). */
  const [appVersion, setAppVersion] = useState<string | null>(null);
  /** Ativou a licença: o conteúdo sai em fade antes de a janela fechar. */
  const [isDismissing, setIsDismissing] = useState(false);
  /**
   * Atualização: o painel é agora o único sítio com a AÇÃO — a caixa nativa do Windows foi
   * removida. O selo no hub do radial avisa; aqui decide-se o quê e o quando.
   */
  const [updateInfo, setUpdateInfo] = useState<{ state: string; version?: string | null }>({ state: 'idle' });
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  /**
   * Build da Store: quem atualiza e a loja. Um botao "Check now" que devolve sempre erro e pior
   * do que botao nenhum -- as duas linhas de atualizacao saem da lista.
   */
  const [isStoreBuild, setIsStoreBuild] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.electron?.getBuildChannel?.().then((channel) => {
      if (!cancelled) setIsStoreBuild(channel === 'store');
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.electron?.getUpdateState?.().then((state) => {
      if (!cancelled && state) setUpdateInfo(state);
    }).catch(() => undefined);
    const off = window.electron?.onUpdateState?.((payload) => {
      if (payload) setUpdateInfo(payload);
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  const runUpdateCheck = useCallback(async () => {
    if (!window.electron?.checkForUpdates) return;
    setUpdateBusy(true);
    setUpdateNote(null);
    try {
      const result = await window.electron.checkForUpdates();
      if (!result?.ok) {
        setUpdateNote(
          result?.code === 'UNSUPPORTED'
            ? 'Updates run in the installed app only.'
            : 'Could not reach the update server.',
        );
      } else if (result.state === 'current') {
        setUpdateNote(`You're on the latest version (${result.version}).`);
      } else {
        setUpdateNote(`Version ${result.version} is downloading.`);
        setUpdateInfo({ state: 'downloading', version: result.version });
      }
    } catch (e) {
      setUpdateNote('Could not reach the update server.');
    } finally {
      setUpdateBusy(false);
    }
  }, []);
  const reduceMotion = useReducedMotion();

  /**
   * Fecho com saída visível. Ativar a licença fechava o painel a seco no mesmo frame; aqui o
   * conteúdo desvanece primeiro e a janela só desaparece depois. Ver `.zs-shell.is-dismissing`.
   */
  const dismissWithFade = useCallback(() => {
    setIsDismissing(true);
    window.setTimeout(() => {
      setIsDismissing(false);
      onClose();
    }, 240);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void window.electron?.getAppVersion?.().then((version) => {
      if (!cancelled && typeof version === 'string') setAppVersion(version);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const theme = config.appearanceTheme === 'white' ? 'white' : 'black';

  const update = useCallback(
    <K extends keyof UIConfig>(key: K, value: UIConfig[K]) => {
      setConfig((current) => ({ ...current, [key]: value }));
    },
    [setConfig],
  );

  const gameMode = config.gameMode ?? {
    enabled: false,
    mode: 'list' as const,
    blockedApps: '',
    autoDetectGames: false,
  };
  const updateGameMode = (patch: Partial<typeof gameMode>) => {
    const next = { ...gameMode, ...patch };
    update('gameMode', next);
    window.electron?.setGameMode?.(next);
  };

  const updateWorkspace = (index: number, patch: Partial<Workspace>) => {
    setConfig((current) => ({
      ...current,
      workspaces: current.workspaces.map((workspace, i) => (i === index ? { ...workspace, ...patch } : workspace)),
    }));
  };

  const showToast = (message: string) => setToast(message);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (editor) setEditor(null);
        else onClose();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        document.getElementById('zs-search-input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, editor, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const toggleSidebar = () => setIsSidebarCollapsed((collapsed) => !collapsed);
    const navigate = (event: Event) => {
      const direction = (event as CustomEvent<'back' | 'forward'>).detail;
      setQuery('');
      setSectionId((current) => {
        const currentIndex = SECTIONS.findIndex((section) => section.id === current);
        const delta = direction === 'back' ? -1 : 1;
        return SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, currentIndex + delta))].id;
      });
    };

    window.addEventListener('zenith-settings-toggle-sidebar', toggleSidebar);
    window.addEventListener('zenith-settings-navigation', navigate);
    return () => {
      window.removeEventListener('zenith-settings-toggle-sidebar', toggleSidebar);
      window.removeEventListener('zenith-settings-navigation', navigate);
    };
  }, [isOpen]);

  /**
   * A tecla pertence a POSICAO, nao ao workspace.
   *
   * Antes cada workspace guardava a sua tecla para sempre: reordenar deixava o segundo cartao com
   * a tecla 2 em primeiro lugar, e apagar um do meio abria buracos permanentes — o "1, 2, 4". A
   * ordem visivel e a ordem das teclas passam a ser a mesma coisa, calculada num sitio so.
   *
   * Alem da nona posicao nao ha tecla: `hotkey: 0` significa acessivel apenas pelo seletor e pela
   * roda do rato, que ja era o contrato do tipo.
   */
  const withPositionalHotkeys = (list: Workspace[]): Workspace[] =>
    list.map((workspace, index) => {
      const hotkey = index < 9 ? index + 1 : 0;
      return workspace.hotkey === hotkey ? workspace : { ...workspace, hotkey };
    });

  const addWorkspace = () => {
    setConfig((current) => {
      const usedNames = new Set(current.workspaces.map((workspace) => workspace.name));
      let workspaceNumber = current.workspaces.length + 1;
      while (usedNames.has(`Workspace ${workspaceNumber}`)) workspaceNumber += 1;

      return {
        ...current,
        workspaces: withPositionalHotkeys([
          ...current.workspaces,
          {
            id: crypto.randomUUID(),
            name: `Workspace ${workspaceNumber}`,
            enabled: true,
            hotkey: 0,
            apps: [],
            color: '#FFFFFF',
          },
        ]),
      };
    });
    showToast('Workspace created');
  };

  const deleteWorkspace = useCallback((index: number) => {
    const workspace = config.workspaces[index];
    if (!workspace) return;
    if (config.workspaces.length <= 1) {
      showToast('Keep at least one workspace');
      return;
    }
    if (!window.confirm(`Delete “${workspace.name}”? Its shortcuts will also be removed.`)) return;

    setConfig((current) => {
      if (current.workspaces.length <= 1 || !current.workspaces[index]) return current;
      const workspaces = withPositionalHotkeys(
        current.workspaces.filter((_, workspaceIndex) => workspaceIndex !== index),
      );
      let activeWorkspaceIndex = current.activeWorkspaceIndex;
      if (activeWorkspaceIndex === index) activeWorkspaceIndex = Math.min(index, workspaces.length - 1);
      else if (activeWorkspaceIndex > index) activeWorkspaceIndex -= 1;

      return { ...current, workspaces, activeWorkspaceIndex };
    });
    setEditor((current) => current?.kind === 'workspace' && current.index === index ? null : current);
    showToast('Workspace deleted');
  }, [config.workspaces, setConfig]);

  /**
   * Reordenar workspaces por arrasto.
   *
   * `insertBefore` refere-se a lista ORIGINAL: depois de remover a origem, tudo o que estava
   * a frente dela desloca-se um lugar, por isso o alvo desce um quando se arrasta para baixo.
   */
  const reorderWorkspaces = useCallback((from: number, insertBefore: number) => {
    setConfig((current) => {
      if (!current.workspaces[from]) return current;
      const workspaces = [...current.workspaces];
      const [moved] = workspaces.splice(from, 1);
      const target = Math.max(
        0,
        Math.min(from < insertBefore ? insertBefore - 1 : insertBefore, workspaces.length),
      );
      if (target === from) return current;
      workspaces.splice(target, 0, moved);
      const renumbered = withPositionalHotkeys(workspaces);
      /**
       * `activeWorkspaceIndex` e uma POSICAO, nao um id. Reordenar sem o remapear trocava
       * silenciosamente o workspace atual por outro — o mesmo cuidado que deleteWorkspace tem.
       */
      const activeId = current.workspaces[current.activeWorkspaceIndex]?.id;
      const remapped = renumbered.findIndex((workspace) => workspace.id === activeId);
      return {
        ...current,
        workspaces: renumbered,
        activeWorkspaceIndex: remapped >= 0 ? remapped : current.activeWorkspaceIndex,
      };
    });
  }, [setConfig]);

  const exportConfig = async () => {
    const result = await window.electron?.exportConfig?.();
    showToast(result?.success ? 'Backup exported' : result?.error || 'Could not export settings');
  };

  const importConfig = async () => {
    const result = await window.electron?.importConfig?.();
    showToast(result?.success ? 'Settings imported' : result?.error || 'Could not import settings');
  };

  const sections = useMemo<Record<SectionId, SettingItem[]>>(() => {
    const range = (
      key: string,
      group: string,
      title: string,
      description: string,
      raw: number,
      min: number,
      max: number,
      onChange: (value: number) => void,
      format: (value: number) => string,
      step = 1,
    ): SettingItem => ({ key, group, title, description, kind: 'range', raw, min, max, step, onChange, format, value: format(raw) });

    return {
      general: [
        {
          key: 'openAtLogin', group: 'Startup', title: 'Start with Windows',
          description: 'Rovyl is ready as soon as you sign in to Windows.',
          kind: 'bool', enabled: Boolean(config.openAtLogin),
          onToggle: () => {
            const next = !config.openAtLogin;
            update('openAtLogin', next);
            window.electron?.setLoginItemSettings?.({ openAtLogin: next });
          },
        },
        {
          key: 'workspaceSwitchMode', group: 'Workspaces', title: 'Workspace switching',
          description: 'Use the visual wheel picker or number keys.',
          kind: 'segmented', current: config.workspaceSwitchMode ?? 'picker',
          choices: [{ value: 'picker', label: 'Picker' }, { value: 'hotkeys', label: 'Keys' }],
          onChange: (value) => update('workspaceSwitchMode', value as UIConfig['workspaceSwitchMode']),
        },
      ],
      trigger: [
        {
          key: 'shortcut', group: 'Keyboard', title: 'Global shortcut',
          description: 'Open the wheel over any application.',
          kind: 'open', value: config.globalShortcut, onOpen: () => setEditor({ kind: 'shortcut' }),
        },
        {
          key: 'mouse', group: 'Mouse', title: 'Mouse trigger',
          description: 'Open Rovyl with a mouse button instead of the keyboard.',
          kind: 'bool', enabled: config.enableMouseTrigger,
          onToggle: () => update('enableMouseTrigger', !config.enableMouseTrigger),
        },
        {
          key: 'mouseButton', group: 'Mouse', title: 'Trigger button',
          description: 'Side buttons are usually free; left and right stay with Windows.',
          kind: 'segmented', current: config.mouseTriggerButton ?? 'middle',
          choices: [
            { value: 'middle', label: 'Wheel' },
            { value: 'x1', label: 'Back' },
            { value: 'x2', label: 'Forward' },
          ],
          onChange: (value) => update('mouseTriggerButton', value as UIConfig['mouseTriggerButton']),
        },
        {
          key: 'mouseMode', group: 'Mouse', title: 'Gesture behavior',
          description: 'Click keeps the wheel open; hold runs the selection on release.',
          kind: 'segmented', current: config.mouseTriggerMode ?? 'click',
          choices: [{ value: 'click', label: 'Click' }, { value: 'hold', label: 'Hold' }],
          onChange: (value) => update('mouseTriggerMode', value as UIConfig['mouseTriggerMode']),
        },
        range('threshold', 'Position', 'Activation zone', 'Cursor distance required to confirm a target.',
          config.activationThreshold, 20, 120, (value) => update('activationThreshold', value), (value) => `${Math.round(value)} px`),
      ],
      appearance: [
        {
          key: 'theme', group: 'Theme', title: 'Rovyl surfaces',
          description: 'Applies to the window and title bar. The wheel remains dark.',
          kind: 'segmented', current: theme,
          choices: [{ value: 'black', label: 'Black' }, { value: 'white', label: 'White' }],
          onChange: (value) => update('appearanceTheme', value as UIConfig['appearanceTheme']),
        },
        range('radius', 'Wheel', 'Orbital radius', 'Perceived wheel diameter.',
          config.menuRadius, 90, 220, (value) => update('menuRadius', value), (value) => `${Math.round(value)} px`),
        range('iconSize', 'Wheel', 'Icon size', 'Visual weight of each target.',
          config.iconSize, 36, 92, (value) => update('iconSize', value), (value) => `${Math.round(value)} px`),
        range('spacing', 'Wheel', 'Target spacing', 'Free space between items.',
          config.appSpacing ?? 10, 0, 40, (value) => update('appSpacing', value), (value) => `${Math.round(value)} px`),
        {
          key: 'radialHoverColor', group: 'Wheel', title: 'Hover color',
          description: 'Color used by the target under the pointer.',
          kind: 'color', value: config.radialHoverColor ?? '#FFFFFF',
          onChange: (value) => update('radialHoverColor', String(value)),
        },
        {
          key: 'aim', group: 'Wheel', title: 'Targeting',
          description:
            config.radialSelectionMode === 'cursor'
              ? 'Only the icon under the pointer highlights. Release away from every icon to cancel.'
              : 'Aim by direction: the slice you point toward highlights from anywhere on screen.',
          kind: 'segmented',
          choices: [
            { value: 'angle', label: 'Direction' },
            { value: 'cursor', label: 'Pointer' },
          ],
          current: config.radialSelectionMode === 'cursor' ? 'cursor' : 'angle',
          onChange: (value) => update('radialSelectionMode', value as UIConfig['radialSelectionMode']),
        },
        {
          key: 'labels', group: 'Wheel', title: 'Persistent labels',
          description: 'Keep every target name visible.',
          kind: 'bool', enabled: config.alwaysShowAppLabels,
          onToggle: () => update('alwaysShowAppLabels', !config.alwaysShowAppLabels),
        },
        range('opacity', 'Presence', 'Wheel opacity', 'Make the interface more solid or subtle.',
          config.menuOpacity, 0.35, 1, (value) => update('menuOpacity', value), (value) => `${Math.round(value * 100)}%`, 0.01),
        range('backdrop', 'Presence', 'Background dimming', 'How much the rest of the screen recedes.',
          config.backdropOpacity ?? 1, 0, 1, (value) => update('backdropOpacity', value), (value) => `${Math.round(value * 100)}%`, 0.01),
      ],
      spaces: [
        ...config.workspaces.map((workspace, index) => ({
          key: workspace.id,
          group: 'Your workspaces',
          title: workspace.name,
          description: `${workspace.apps.length} ${workspace.apps.length === 1 ? 'shortcut' : 'shortcuts'} · ${workspace.hotkey ? `key ${workspace.hotkey}` : 'picker / mouse wheel'}`,
          kind: 'open' as const,
          /** Mesmo vocabulário do editor: atual / disponível / pausado. */
          value: config.activeWorkspaceIndex === index ? 'Current' : workspace.enabled ? 'Available' : 'Paused',
          onOpen: () => setEditor({ kind: 'workspace' as const, index }),
          onDelete: config.workspaces.length > 1 ? () => deleteWorkspace(index) : undefined,
          deleteLabel: `Delete ${workspace.name}`,
          reorderIndex: index,
          onReorder: reorderWorkspaces,
        })),
        {
          key: 'new-space', group: 'Your workspaces', title: 'New workspace',
          description: 'Create another context for your shortcuts.',
          kind: 'action', actionLabel: 'Create', actionIcon: Plus, onRun: addWorkspace,
        },
      ],
      advanced: [
        ...(!isStoreBuild && updateInfo.state === 'ready'
          ? [{
              key: 'update-ready',
              group: 'Updates',
              title: `Version ${updateInfo.version ?? ''} is ready`.replace(/\s+/g, ' ').trim(),
              description: 'Downloaded and verified. Rovyl restarts to finish.',
              kind: 'action' as const,
              actionLabel: 'Restart now',
              actionIcon: ArrowUpFromLine,
              onRun: () => window.electron?.installUpdateNow?.(),
            }]
          : []),
        ...(isStoreBuild
          ? []
          : [{
              key: 'update-check',
              group: 'Updates',
              title: 'Check for updates',
              description:
                updateNote ??
                (updateInfo.state === 'downloading'
                  ? `Downloading version ${updateInfo.version ?? ''}…`.replace(/\s+/g, ' ')
                  : 'Rovyl checks automatically a few seconds after launch.'),
              kind: 'action' as const,
              actionLabel: updateBusy ? 'Checking…' : 'Check now',
              actionIcon: ArrowDownToLine,
              onRun: () => void runUpdateCheck(),
            }]),
        {
          key: 'performance', group: 'Performance', title: 'Precision mode',
          description: 'Prioritize immediate response and reduce visual effects.',
          kind: 'bool', enabled: config.performanceMode,
          onToggle: () => update('performanceMode', !config.performanceMode),
        },
        {
          key: 'game', group: 'Protection', title: 'Fullscreen protection',
          description: 'Prevent accidental openings during games and videos.',
          kind: 'bool', enabled: gameMode.enabled,
          onToggle: () => updateGameMode({ enabled: !gameMode.enabled }),
        },
        ...(gameMode.enabled ? [{
          key: 'scope', group: 'Protection', title: 'Scope', description: 'All fullscreen apps or only a selected list.',
          kind: 'segmented' as const, current: gameMode.mode,
          choices: [{ value: 'all', label: 'All' }, { value: 'list', label: 'List' }],
          onChange: (value: number | string) => updateGameMode({ mode: value as 'all' | 'list' }),
        }] : []),
        ...(gameMode.enabled && gameMode.mode === 'list' ? [
          {
            key: 'auto-games', group: 'Protection', title: 'Detect games automatically',
            description: 'Uses game-store folders and engine files; protection still applies only in fullscreen.',
            kind: 'bool' as const, enabled: gameMode.autoDetectGames,
            onToggle: () => updateGameMode({ autoDetectGames: !gameMode.autoDetectGames }),
          },
          {
            key: 'blocked', group: 'Protection', title: 'Protected applications',
            description: 'Choose installed applications visually. No executable names required.',
            kind: 'open' as const,
            value: gameMode.blockedApps ? 'Edit list' : 'Choose apps',
            onOpen: () => setEditor({ kind: 'blocked' as const }),
          },
        ] : []),
        {
          key: 'export', group: 'Data', title: 'Export settings',
          description: 'Save a portable copy of your configuration.',
          kind: 'action', actionLabel: 'Export', actionIcon: ArrowUpFromLine, onRun: exportConfig,
        },
        {
          key: 'import', group: 'Data', title: 'Import settings',
          kind: 'action', actionLabel: 'Import', actionIcon: ArrowDownToLine, onRun: importConfig,
        },
        {
          key: 'reset', group: 'Data', title: 'Restore defaults',
          description: 'Erase local settings and start over.',
          kind: 'action', actionLabel: 'Restore', onRun: onReset,
        },
      ],
    };
  }, [config, gameMode, theme, apps, update, updateInfo, updateBusy, updateNote, isStoreBuild, runUpdateCheck, onReset, deleteWorkspace, reorderWorkspaces]);

  const trimmedQuery = query.trim().toLowerCase();
  const activeMeta = SECTIONS.find((section) => section.id === sectionId)!;

  /** Buscar percorre todas as categorias — procurar só na categoria aberta obrigava a adivinhar onde a opção vive. */
  const results = useMemo(() => {
    const matches = (item: SettingItem) =>
      !trimmedQuery || `${item.title} ${item.description ?? ''} ${item.group}`.toLowerCase().includes(trimmedQuery);

    const source = trimmedQuery
      ? SECTIONS.flatMap((section) => sections[section.id].filter(matches))
      : sections[sectionId];

    /** Agrupa mantendo a ordem de declaração: o grupo é um rótulo, não um card. */
    const groups: Array<{ name: string; items: SettingItem[] }> = [];
    for (const item of source) {
      const last = groups[groups.length - 1];
      if (last && last.name === item.group) last.items.push(item);
      else groups.push({ name: item.group, items: [item] });
    }
    return groups;
  }, [sections, sectionId, trimmedQuery]);

  const isEmpty = results.length === 0;

  if (!isOpen) return null;

  return (
    <div
      id="settings-container"
      className={`zs-shell${isDismissing ? ' is-dismissing' : ''}`}
      data-zn-theme={theme}
    >
      <motion.section
        className={`zs-window${isSidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        aria-label="Rovyl Settings"
      >
        <aside className="zs-sidebar">
          <div className="zs-sidebar-head">
            <h2>Settings</h2>
          </div>

          <div className="zs-search">
            <Search size={14} strokeWidth={1.9} />
            <input
              id="zs-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search settings"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={13} strokeWidth={2} />
              </button>
            )}
          </div>

          <nav className="zs-nav" aria-label="Settings sections">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  className={!trimmedQuery && sectionId === section.id ? 'is-active' : ''}
                  aria-current={!trimmedQuery && sectionId === section.id ? 'page' : undefined}
                  onClick={() => { setSectionId(section.id); setQuery(''); }}
                >
                  <Icon size={15} strokeWidth={1.8} />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="zs-sidebar-foot">
            <b>Rovyl</b>
            {appVersion && <span>{appVersion}</span>}
          </div>
        </aside>

        <main className="zs-main">
          <div className="zs-scroll">
            <div className="zs-canvas">
              <motion.header
                className="zs-page-head"
                key={`head-${trimmedQuery ? 'search' : sectionId}`}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <h1>{trimmedQuery ? 'Results' : activeMeta.label}</h1>
                <p>{trimmedQuery ? `Settings matching “${query.trim()}”.` : activeMeta.caption}</p>
              </motion.header>

              {isEmpty ? (
                <p className="zs-empty">No settings found.</p>
              ) : (
                <motion.div
                  key={`body-${trimmedQuery ? `q-${trimmedQuery}` : sectionId}`}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  {results.map((group) => (
                    <section className="zs-group" key={group.name}>
                      <h2 className="zs-group-title">{group.name}</h2>
                      {group.name === 'Your workspaces' && !trimmedQuery ? (
                        /** Fora da pesquisa a grelha manda; a procurar, as linhas continuam a dar resultados. */
                        <WorkspaceCards
                          workspaces={config.workspaces}
                          activeIndex={config.activeWorkspaceIndex ?? 0}
                          onOpen={(index) => setEditor({ kind: 'workspace', index })}
                          onCreate={addWorkspace}
                          onReorder={reorderWorkspaces}
                          onDelete={deleteWorkspace}
                        />
                      ) : (
                        <div className="zs-rows">
                          {group.items.map((item) => (
                            <SettingRow key={item.key} item={item} />
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </motion.div>
              )}
            </div>
          </div>
        </main>

        <AnimatePresence>
          {editor && (
            <SettingsEditor
              editor={editor}
              close={() => setEditor(null)}
              config={config}
              update={update}
              updateWorkspace={updateWorkspace}
              setConfig={setConfig}
              apps={apps}
              gameMode={gameMode}
              updateGameMode={updateGameMode}
              onCloseSettings={dismissWithFade}
              reduceMotion={Boolean(reduceMotion)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {toast && (
            <motion.div
              className="zs-toast"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <Check size={13} strokeWidth={2.2} />
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </div>
  );
};

/** Uma linha, uma estrutura: cópia à esquerda, controlo alinhado à direita. */
function SettingRow({ item }: { item: SettingItem }) {
  const ActionIcon = item.actionIcon;
  const describedBy = item.description ? `${item.key}-desc` : undefined;
  const reorderable = typeof item.reorderIndex === 'number' && Boolean(item.onReorder);
  /** Aresta sob o cursor: decide se o item largado fica antes ou depois desta linha. */
  const [dropEdge, setDropEdge] = useState<'above' | 'below' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  /** So arrasta quem pega no manipulo: a linha inteira arrastavel roubava o clique de abrir. */
  const [armed, setArmed] = useState(false);

  const dragProps = reorderable
    ? {
        draggable: armed,
        onDragStart: (event: React.DragEvent<HTMLDivElement>) => {
          event.dataTransfer.setData('text/plain', String(item.reorderIndex));
          event.dataTransfer.effectAllowed = 'move';
          setIsDragging(true);
        },
        onDragEnd: () => {
          setIsDragging(false);
          setDropEdge(null);
          setArmed(false);
        },
        onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          const rect = event.currentTarget.getBoundingClientRect();
          setDropEdge(event.clientY < rect.top + rect.height / 2 ? 'above' : 'below');
        },
        onDragLeave: () => setDropEdge(null),
        onDrop: (event: React.DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          const from = Number(event.dataTransfer.getData('text/plain'));
          const edge = dropEdge;
          setDropEdge(null);
          setIsDragging(false);
          if (!Number.isInteger(from)) return;
          const target = item.reorderIndex as number;
          item.onReorder?.(from, edge === 'below' ? target + 1 : target);
        },
      }
    : {};

  return (
    <div
      className={`zs-row${item.kind === 'range' ? ' is-slider' : ''}${item.kind === 'open' ? ' is-openable' : ''}`
        + `${reorderable ? ' is-reorderable' : ''}${isDragging ? ' is-dragging' : ''}`
        + `${dropEdge === 'above' ? ' is-drop-above' : ''}${dropEdge === 'below' ? ' is-drop-below' : ''}`}
      onClick={item.kind === 'open' ? item.onOpen : undefined}
      {...dragProps}
    >
      {reorderable && (
        <span
          className="zs-row-grip"
          aria-hidden="true"
          onPointerDown={() => setArmed(true)}
          onPointerUp={() => setArmed(false)}
        >
          <GripVertical size={14} strokeWidth={1.9} />
        </span>
      )}
      <div className="zs-row-copy">
        <b id={`${item.key}-label`}>{item.title}</b>
        {item.description && <small id={describedBy}>{item.description}</small>}
      </div>

      <div className="zs-row-control" onClick={(event) => event.stopPropagation()}>
        {item.kind === 'bool' && (
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(item.enabled)}
            aria-labelledby={`${item.key}-label`}
            aria-describedby={describedBy}
            className="zs-switch"
            onClick={item.onToggle}
          >
            <i />
          </button>
        )}

        {item.kind === 'segmented' && (
          <div className="zs-segmented" role="radiogroup" aria-labelledby={`${item.key}-label`}>
            {item.choices?.map((choice) => (
              <button
                key={choice.value}
                type="button"
                role="radio"
                aria-checked={item.current === choice.value}
                className={item.current === choice.value ? 'is-selected' : ''}
                onClick={() => item.onChange?.(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        )}

        {item.kind === 'range' && <span className="zs-readout">{item.value}</span>}

        {item.kind === 'color' && <ColorSettingControl item={item} describedBy={describedBy} />}

        {item.kind === 'open' && (
          <>
            <button type="button" className="zs-btn is-value" onClick={item.onOpen} aria-labelledby={`${item.key}-label`}>
              <b>{item.value}</b>
              <ChevronRight size={14} strokeWidth={1.9} />
            </button>
            {item.onDelete && (
              <button
                type="button"
                className="zs-btn is-delete-icon"
                onClick={item.onDelete}
                aria-label={item.deleteLabel || `Delete ${item.title}`}
                title={item.deleteLabel || `Delete ${item.title}`}
              >
                <Trash2 size={14} strokeWidth={1.9} />
              </button>
            )}
          </>
        )}

        {item.kind === 'action' && (
          <button type="button" className="zs-btn" onClick={item.onRun} aria-labelledby={`${item.key}-label`}>
            {ActionIcon && <ActionIcon size={14} strokeWidth={1.9} />}
            {item.actionLabel}
          </button>
        )}
      </div>

      {item.kind === 'range' && (
        <div className="zs-slider">
          <span className="zs-slider-bounds">{item.format?.(item.min ?? 0)}</span>
          <input
            type="range"
            min={item.min}
            max={item.max}
            step={item.step}
            value={item.raw}
            aria-labelledby={`${item.key}-label`}
            aria-describedby={describedBy}
            onChange={(event) => item.onChange?.(Number(event.target.value))}
          />
          <span className="zs-slider-bounds">{item.format?.(item.max ?? 0)}</span>
        </div>
      )}
    </div>
  );
}

function normalizeHexInput(value: string): string | null {
  const hex = value.trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : null;
}

function ColorSettingControl({ item, describedBy }: { item: SettingItem; describedBy?: string }) {
  const normalizedValue = normalizeHexInput(item.value ?? '') ?? '#FFFFFF';
  const [draft, setDraft] = useState(normalizedValue.slice(1));

  useEffect(() => setDraft(normalizedValue.slice(1)), [normalizedValue]);

  const commit = (value: string) => {
    const normalized = normalizeHexInput(value);
    if (normalized) item.onChange?.(normalized);
  };

  return (
    <div className="zs-color-control">
      <label className="zs-color-swatch" title="Open color palette">
        <span style={{ backgroundColor: normalizedValue }} />
        <input
          type="color"
          value={normalizedValue}
          aria-labelledby={`${item.key}-label`}
          aria-describedby={describedBy}
          onInput={(event) => commit((event.currentTarget as HTMLInputElement).value)}
          onChange={(event) => commit(event.target.value)}
        />
      </label>
      <span className="zs-color-prefix">#</span>
      <input
        className="zs-color-hex"
        value={draft}
        maxLength={6}
        inputMode="text"
        spellCheck={false}
        aria-label="Hex color"
        onChange={(event) => {
          const next = event.target.value
            .replace(/^#/, '')
            .replace(/[^0-9a-f]/gi, '')
            .slice(0, 6);
          setDraft(next);
          commit(next);
        }}
        onBlur={() => setDraft(normalizedValue.slice(1))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit(draft);
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

type ProtectedAppRow = { raw: string; label: string; tokens: string[] };

function parseProtectedApps(value: string): ProtectedAppRow[] {
  return String(value || '').split(',').map((part) => part.trim()).filter(Boolean).map((raw) => {
    const separator = raw.indexOf('::');
    const matchPart = separator >= 0 ? raw.slice(0, separator).trim() : raw;
    const label = separator >= 0 ? raw.slice(separator + 2).trim() || matchPart : matchPart;
    return { raw, label, tokens: matchPart.split('|').map((token) => token.trim().toLowerCase()).filter(Boolean) };
  });
}

function protectedAppSegment(app: InstalledApp): ProtectedAppRow | null {
  const source = String(app.Path || '').trim();
  const label = String(app.DisplayName || app.Name || '').replace(/[,:|]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!source || !label) return null;

  const base = source.replace(/\\/g, '/').split('/').pop()?.trim().toLowerCase() || source.toLowerCase();
  let primary = base;
  if (!primary.endsWith('.exe')) {
    const head = primary.split(/\s+/)[0];
    const dotted = head.split('.').filter((part) => /^[a-z0-9]+$/i.test(part));
    primary = dotted.length > 1 ? `${dotted[dotted.length - 1]}.exe` : primary;
  }

  const tokens = new Set<string>([primary]);
  const words = label.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
  for (const word of words) tokens.add(word);
  const joined = words.join('');
  if (joined.length >= 5) tokens.add(joined);
  const matchPart = [...tokens].join('|');
  return { raw: `${matchPart}::${label}`, label, tokens: [...tokens] };
}

function ProtectedAppsManager({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { apps, loading, error, reload } = useInstalledApps(true);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(40);
  const rows = useMemo(() => parseProtectedApps(value), [value]);
  const selectedTokens = useMemo(() => new Set(rows.flatMap((row) => row.tokens)), [rows]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return apps.filter((item) => !term || `${item.DisplayName || ''} ${item.Name || ''}`.toLowerCase().includes(term));
  }, [apps, search]);
  useEffect(() => setVisibleCount(40), [search, apps]);

  const commit = (next: ProtectedAppRow[]) => onChange(next.map((row) => row.raw).join(', '));
  const add = (app: InstalledApp) => {
    const next = protectedAppSegment(app);
    if (!next || next.tokens.some((token) => selectedTokens.has(token))) return;
    commit([...rows, next]);
  };

  return (
    <div className="zs-workspace-manager">
      <section className="zs-workspace-shortcuts">
        <div className="zs-workspace-section-head">
          <div><h3>Selected applications</h3><p>{rows.length} {rows.length === 1 ? 'application' : 'applications'}</p></div>
        </div>
        <div className="zs-workspace-items">
          {rows.map((row) => (
            <div className="zs-workspace-item" key={row.raw}>
              <div className="zs-workspace-item-main">
                <span className="zs-workspace-app-icon"><Monitor size={16} /></span>
                <div className="zs-workspace-item-copy"><b>{row.label}</b><small><em>Protected in fullscreen</em></small></div>
                <div className="zs-item-actions">
                  <button type="button" onClick={() => commit(rows.filter((item) => item.raw !== row.raw))} aria-label={`Remove ${row.label}`}><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
          {!rows.length && <div className="zs-manager-empty"><Monitor size={18} /> No applications selected yet.</div>}
        </div>
      </section>

      <section className="zs-workspace-shortcuts">
        <div className="zs-add-panel-head">
          <label className="zs-search is-manager-search">
            <Search size={14} />
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search installed applications" />
          </label>
          <button type="button" className="zs-btn" onClick={() => reload(true)}>Reload</button>
        </div>
        <div
          className="zs-installed-apps"
          onScroll={(event) => {
            const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
            if (scrollHeight - scrollTop - clientHeight < 180) setVisibleCount((count) => Math.min(count + 40, filtered.length));
          }}
        >
          {loading ? (
            <div className="zs-manager-empty"><Loader2 className="zs-spin" size={18} /> Loading applications…</div>
          ) : filtered.length ? (
            filtered.slice(0, visibleCount).map((item, index) => {
              const segment = protectedAppSegment(item);
              const selected = !!segment?.tokens.some((token) => selectedTokens.has(token));
              return (
                <button type="button" key={`${item.Path}-${index}`} disabled={selected} onClick={() => add(item)}>
                  <NativeAppIcon path={item.Path} size={28} className="zs-installed-app-icon" fallback={<Monitor size={15} />} />
                  <div><b>{item.DisplayName || item.Name}</b><small>{selected ? 'Already selected' : 'Installed application'}</small></div>
                  {selected ? <Check size={14} /> : <Plus size={14} />}
                </button>
              );
            })
          ) : error ? (
            <div className="zs-manager-empty">Could not list applications.<button type="button" className="zs-btn" onClick={() => reload(true)}>Try again</button></div>
          ) : (
            <div className="zs-manager-empty">No applications found.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function SettingsEditor({
  editor,
  close,
  config,
  update,
  updateWorkspace,
  setConfig,
  apps,
  gameMode,
  updateGameMode,
  onCloseSettings,
  reduceMotion,
}: {
  editor: Exclude<Editor, null>;
  close: () => void;
  config: UIConfig;
  update: <K extends keyof UIConfig>(key: K, value: UIConfig[K]) => void;
  updateWorkspace: (index: number, patch: Partial<Workspace>) => void;
  setConfig: PrecisionSettingsProps['setConfig'];
  apps: AppItem[];
  gameMode: UIConfig['gameMode'];
  updateGameMode: (patch: Partial<UIConfig['gameMode']>) => void;
  /** Ativar a licença fecha o painel: o utilizador veio destrancar a roda, não configurar. */
  onCloseSettings?: () => void;
  reduceMotion: boolean;
}) {
  let title = 'Edit setting';
  let description = 'Changes are applied immediately.';
  let content: React.ReactNode = null;

  if (editor.kind === 'shortcut') {
    title = 'Global shortcut';
    description = 'Record a combination that does not conflict with your applications.';
    content = <ShortcutRecorder value={config.globalShortcut} onChange={(value) => update('globalShortcut', value)} />;
  }

  if (editor.kind === 'blocked') {
    title = 'Protected applications';
    description = 'Choose installed applications; Rovyl handles process matching automatically.';
    content = (
      <ProtectedAppsManager
        value={gameMode.blockedApps}
        onChange={(blockedApps) => updateGameMode({ blockedApps })}
      />
    );
  }


  if (editor.kind === 'workspace') {
    const index = editor.index;
    const workspace = config.workspaces[index];
    if (!workspace) return null;
    title = workspace.name;
    description = 'Organize shortcuts and control how this workspace behaves.';
    content = (
      <WorkspaceManager
        workspace={workspace}
        workspaceIndex={index}
        config={config}
        isActive={config.activeWorkspaceIndex === index}
        canDelete={config.workspaces.length > 1}
        updateWorkspace={updateWorkspace}
        makeActive={() => update('activeWorkspaceIndex', index)}
        deleteWorkspace={() => {
          setConfig((current) => ({
            ...current,
            activeWorkspaceIndex: Math.max(0, Math.min(current.activeWorkspaceIndex, current.workspaces.length - 2)),
            workspaces: current.workspaces.filter((_, i) => i !== index),
          }));
          close();
        }}
      />
    );
  }

  return (
    <div className="zs-editor-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <motion.div
        className={`zs-editor${editor.kind === 'workspace' || editor.kind === 'blocked' ? ' is-workspace' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.98, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: 4 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        <header>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button type="button" onClick={close} aria-label="Close">
            <X size={15} strokeWidth={1.9} />
          </button>
        </header>
        <div className="zs-editor-body">{content}</div>
        <footer>
          <button type="button" className="zs-btn is-primary" onClick={close}>Done</button>
        </footer>
      </motion.div>
    </div>
  );
}


type WorkspaceAddMode = 'app' | 'url' | 'folder' | null;

const APPS_PAGE_SIZE = 40;

function itemTypeLabel(item: AppItem) {
  if (item.type === 'folder') return 'Group';
  if (item.commandType === 'url') return 'URL';
  if (item.commandType === 'folder') return 'Folder';
  return 'Application';
}

/**
 * Palpite barato, usado só enquanto o main não responde e fora do Electron. Não decide sozinho:
 * `electron.app.Antigravity` (o agente, sem projetos recentes) contém "antigravity" e passaria
 * por IDE. Quem decide é `useIdeRecentsSupport`, que pergunta ao main se existe mesmo um perfil.
 */
function isIdeApp(item: Pick<AppItem, 'label' | 'command' | 'commandType'>): boolean {
  if (item.commandType !== 'app') return false;
  const label = (item.label || '').trim().toLowerCase();
  const value = `${label} ${item.command || ''}`.toLowerCase();
  const keywords = [
    'visual studio code', 'visualstudiocode', 'visual studio', 'vscode', 'code.exe', 'cursor', 'antigravity', 'windsurf',
    'intellij', 'webstorm', 'pycharm', 'phpstorm', 'rider', 'clion', 'goland',
    'android studio', 'sublime text', 'atom.exe', 'zed.exe',
  ];
  return label === 'code' || keywords.some((keyword) => value.includes(keyword));
}


/** Chave estável por item: o perfil depende do par rótulo + comando. */
function ideProbeKey(item: Pick<AppItem, 'label' | 'command'>): string {
  return `${item.label || ''}||${item.command || ''}`;
}

/**
 * Pergunta ao main, para cada item candidato, se existe mesmo um perfil de IDE com MRU. O
 * resultado é `undefined` enquanto a resposta não chega — nessa janela vale o palpite local, para
 * a secção não piscar ao abrir as definições.
 */
function useIdeRecentsSupport(items: AppItem[]): Map<string, boolean> {
  const [support, setSupport] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    const probe = window.electron?.appSupportsRecents;
    if (!probe) return;
    let cancelled = false;

    const pending = items.filter((item) => item.commandType === 'app' && !support.has(ideProbeKey(item)));
    if (pending.length === 0) return;

    void Promise.all(
      pending.map(async (item) => {
        try {
          return [ideProbeKey(item), await probe(item.label || '', item.command || '')] as const;
        } catch (e) {
          return [ideProbeKey(item), false] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setSupport((current) => {
        const next = new Map(current);
        entries.forEach(([key, value]) => next.set(key, value));
        return next;
      });
    });

    return () => { cancelled = true; };
  }, [items, support]);

  return support;
}


/**
 * Riscos reais de cada modo de arranque. `Normal` não tem nota: um aviso em todos os estados
 * deixa de ser aviso. Os outros dois mudam o comportamento do Windows e podem surpreender —
 * dizer isto antes vale mais do que explicar depois.
 */
function launchModeRisk(commandType: AppItem['commandType'], mode: 'normal' | 'reuse' | 'prewarm'): string | null {
  if (mode === 'normal') return null;
  if (mode === 'reuse') {
    return commandType === 'url'
      ? 'Reuses the browser already running: the page can land in an existing window or tab group instead of a new one, and profile or private windows may be ignored.'
      : 'Reuses the process already running: an IDE can switch the project open in the current window instead of opening another. Apps without support fall back to a normal launch.';
  }
  return 'Keeps executable data in memory, so RAM stays in use in the background even after you close the app. Some apps show a splash or a second instance when reused, and unsupported ones fall back to a normal launch.';
}

function itemFallbackIcon(item: AppItem) {
  if (item.type === 'folder' || item.commandType === 'folder') return 'Folder';
  if (item.commandType === 'url') return 'Globe';
  return item.iconName || 'AppWindow';
}

function WorkspaceItemIcon({ item }: { item: AppItem }) {
  const Icon = getIcon(itemFallbackIcon(item));
  return (
    <span className="zs-workspace-app-icon" aria-hidden>
      {item.customIconUrl ? (
        <SmartIcon src={item.customIconUrl} className="zs-workspace-native-icon" displayScale={0.78} />
      ) : (
        <Icon size={17} strokeWidth={1.8} />
      )}
    </span>
  );
}


/**
 * Antevisao de um workspace: a roda em miniatura, com os icones reais nas posicoes reais.
 *
 * A lista era um inventario — "Main · 5 shortcuts · key 1" — a descrever uma coisa espacial.
 * Nao dizia o que o workspace e, nem como vai aparecer, e tornava invisivel a ordem dos atalhos,
 * que era precisamente o que dava sentido a poder reordena-los.
 */
function WorkspaceWheelPreview({ workspace, accent }: { workspace: Workspace; accent: string }) {
  const items = workspace.apps.slice(0, 8);
  const radius = 34;
  return (
    <div className="zs-ws-preview" aria-hidden>
      <span className="zs-ws-preview-ring" style={{ borderColor: `${accent}44` }} />
      <span className="zs-ws-preview-hub" style={{ background: accent }} />
      {items.map((item, index) => {
        const angle = ((index * (360 / items.length)) - 90) * (Math.PI / 180);
        const Icon = getIcon(itemFallbackIcon(item));
        return (
          <span
            key={item.id}
            className="zs-ws-preview-slot"
            style={{
              transform: `translate(${(radius * Math.cos(angle)).toFixed(1)}px, ${(radius * Math.sin(angle)).toFixed(1)}px)`,
            }}
          >
            {item.customIconUrl ? (
              <SmartIcon src={item.customIconUrl} className="zs-ws-preview-img" displayScale={0.82} />
            ) : (
              <Icon size={12} strokeWidth={1.9} />
            )}
          </span>
        );
      })}
      {workspace.apps.length === 0 && <span className="zs-ws-preview-empty">empty</span>}
    </div>
  );
}

function WorkspaceCards({
  workspaces,
  activeIndex,
  onOpen,
  onCreate,
  onReorder,
  onDelete,
}: {
  workspaces: Workspace[];
  activeIndex: number;
  onOpen: (index: number) => void;
  onCreate: () => void;
  onReorder: (from: number, insertBefore: number) => void;
  onDelete: (index: number) => void;
}) {
  /**
   * Numa grelha o cartao INTEIRO e o objeto que se pega — nao ha manipulo.
   *
   * Na lista o manipulo era necessario porque a linha tem outros alvos ao longo da largura e
   * arrastar sobre eles roubava-lhes o clique. Um cartao e um objeto so, como um icone num ecra
   * inicial: pega-se onde quer que se toque nele.
   */
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropEdge, setDropEdge] = useState<{ index: number; edge: 'before' | 'after' } | null>(null);

  const endDrag = () => {
    setDragIndex(null);
    setDropEdge(null);
  };

  return (
    <div className="zs-ws-grid">
      {workspaces.map((workspace, index) => {
        const accent = workspace.color || 'currentColor';
        const isCurrent = index === activeIndex;
        const count = workspace.apps.length;
        return (
          <div
            key={workspace.id}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onOpen(index);
            }}
            className={`zs-ws-card${isCurrent ? ' is-current' : ''}${workspace.enabled ? '' : ' is-paused'}`
              + `${dragIndex === index ? ' is-dragging' : ''}`
              + `${dropEdge?.index === index && dropEdge.edge === 'before' ? ' is-drop-before' : ''}`
              + `${dropEdge?.index === index && dropEdge.edge === 'after' ? ' is-drop-after' : ''}`}
            onClick={() => onOpen(index)}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', String(index));
              event.dataTransfer.effectAllowed = 'move';
              setDragIndex(index);
            }}
            onDragEnd={endDrag}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              /** Grelha: os cartoes fluem na horizontal, logo a aresta decide-se pelo eixo X. */
              const rect = event.currentTarget.getBoundingClientRect();
              setDropEdge({
                index,
                edge: event.clientX < rect.left + rect.width / 2 ? 'before' : 'after',
              });
            }}
            onDragLeave={() => setDropEdge((current) => (current?.index === index ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              const from = Number(event.dataTransfer.getData('text/plain'));
              const edge = dropEdge?.index === index ? dropEdge.edge : 'before';
              endDrag();
              if (!Number.isInteger(from)) return;
              onReorder(from, edge === 'after' ? index + 1 : index);
            }}
          >
            <WorkspaceWheelPreview workspace={workspace} accent={accent} />
            <span className="zs-ws-card-head">
              <b>{workspace.name}</b>
              {workspace.hotkey ? <em>{workspace.hotkey}</em> : null}
            </span>
            <small>
              {isCurrent ? 'Current · ' : workspace.enabled ? '' : 'Paused · '}
              {count} {count === 1 ? 'shortcut' : 'shortcuts'}
            </small>
            {workspaces.length > 1 && (
              <button
                type="button"
                className="zs-ws-card-delete"
                aria-label={`Delete ${workspace.name}`}
                title={`Delete ${workspace.name}`}
                onClick={(event) => {
                  /** O cartao inteiro abre o editor; este botao nao pode disparar isso tambem. */
                  event.stopPropagation();
                  onDelete(index);
                }}
              >
                <Trash2 size={13} strokeWidth={1.9} />
              </button>
            )}
          </div>
        );
      })}
      <button type="button" className="zs-ws-card is-new" onClick={onCreate}>
        <Plus size={18} strokeWidth={1.9} />
        <small>New workspace</small>
      </button>
    </div>
  );
}

function WorkspaceManager({
  workspace,
  workspaceIndex,
  config,
  isActive,
  canDelete,
  updateWorkspace,
  makeActive,
  deleteWorkspace,
}: {
  workspace: Workspace;
  workspaceIndex: number;
  config: UIConfig;
  isActive: boolean;
  canDelete: boolean;
  updateWorkspace: (index: number, patch: Partial<Workspace>) => void;
  makeActive: () => void;
  deleteWorkspace: () => void;
}) {
  const [addMode, setAddMode] = useState<WorkspaceAddMode>(null);
  const { apps: installedApps, loading: loadingApps, error: appsError, reload: loadInstalledApps } =
    useInstalledApps(addMode === 'app');
  const [appSearch, setAppSearch] = useState('');
  const [url, setUrl] = useState('');
  const [urlLabel, setUrlLabel] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [folderLabel, setFolderLabel] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);

  /** Um modal que só fecha com o rato é um modal que prende quem usa o teclado. */
  useEffect(() => {
    if (!isIconPickerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      /** Não deixar o Escape subir e fechar o editor do workspace por baixo. */
      event.stopPropagation();
      setIsIconPickerOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isIconPickerOpen]);
  const WorkspaceIcon = getIcon(workspace.pickerIconName?.trim() || 'Layers');

  const addItem = (item: AppItem, openEditor = false) => {
    const newIndex = workspace.apps.length;
    updateWorkspace(workspaceIndex, { apps: [...workspace.apps, item] });
    setAddMode(null);
    setAppSearch('');
    setUrl('');
    setUrlLabel('');
    setFolderPath('');
    setFolderLabel('');
    setEditingIndex(openEditor ? newIndex : null);
  };

  const addAppPath = async (path: string, label?: string) => {
    const cleanPath = path.trim();
    if (!cleanPath) return;
    const displayName = label?.trim() || cleanPath.split(/[/\\]/).filter(Boolean).pop()?.replace(/\.(exe|lnk|bat|cmd)$/i, '') || 'Application';
    let customIconUrl: string | undefined;
    try { customIconUrl = (await window.electron?.getFileIcon?.(cleanPath)) || undefined; } catch { /* use fallback */ }
    const nextItem: AppItem = {
      id: crypto.randomUUID(), type: 'app', label: displayName,
      iconName: 'AppWindow', iconSource: customIconUrl ? 'native' : 'lucide', customIconUrl,
      command: cleanPath, commandType: 'app', description: 'Application',
    };
    /** O main confirma antes de a bandeira ser gravada; o palpite local só serve fora do Electron. */
    let isIde = isIdeApp(nextItem);
    if (window.electron?.appSupportsRecents) {
      try {
        isIde = await window.electron.appSupportsRecents(nextItem.label, nextItem.command);
      } catch (e) {
        /* mantém o palpite local */
      }
    }
    addItem(isIde ? { ...nextItem, hasRecents: true, terminalCommands: [] } : nextItem, isIde);
  };

  const chooseAppFile = async () => {
    const path = await window.electron?.selectFile?.();
    if (path) await addAppPath(path);
  };

  const addUrl = async () => {
    let normalized = url.trim();
    if (!normalized) return;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    let fallbackLabel = normalized;
    try { fallbackLabel = new URL(normalized).hostname.replace(/^www\./, ''); } catch { /* keep URL */ }
    const icon = await resolveWebsiteIconFields(normalized);
    addItem({
      id: crypto.randomUUID(), type: 'app', label: urlLabel.trim() || fallbackLabel,
      iconName: 'Globe', iconSource: icon?.iconSource || 'lucide', customIconUrl: icon?.customIconUrl,
      command: normalized, commandType: 'url', description: 'Link da web',
    });
  };

  const chooseFolder = async () => {
    const path = await window.electron?.selectFolder?.();
    if (!path) return;
    setFolderPath(path);
    if (!folderLabel) setFolderLabel(path.split(/[/\\]/).filter(Boolean).pop() || 'Folder');
  };

  const addFolder = () => {
    if (!folderPath) return;
    addItem({
      id: crypto.randomUUID(), type: 'app', label: folderLabel.trim() || 'Folder',
      iconName: 'Folder', iconSource: 'lucide', command: folderPath,
      commandType: 'folder', description: 'Folder shortcut',
    });
  };

  /**
   * Arrasto na lista de atalhos.
   *
   * As setas para cima/baixo obrigavam a mover item a item; com uma roda de dez atalhos, pôr o
   * último em primeiro eram nove cliques. `insertBefore` refere-se a lista ORIGINAL: depois de
   * remover a origem, tudo o que estava a frente dela desloca-se um lugar.
   */
  /**
   * O arrasto so arma quando o gesto comeca NO MANIPULO.
   *
   * Com `draggable` fixo na linha inteira, qualquer arrasto sobre o nome ou os botoes virava
   * reordenacao, e o fantasma que o Windows desenha levava junto o formulario de edicao aberto.
   */
  const [itemDragArmed, setItemDragArmed] = useState<number | null>(null);
  const [itemDragIndex, setItemDragIndex] = useState<number | null>(null);
  const [itemDropEdge, setItemDropEdge] = useState<{ index: number; edge: 'above' | 'below' } | null>(null);

  const reorderItems = (from: number, insertBefore: number) => {
    const apps = [...workspace.apps];
    if (!apps[from]) return;
    const [moved] = apps.splice(from, 1);
    const target = Math.max(0, Math.min(from < insertBefore ? insertBefore - 1 : insertBefore, apps.length));
    if (target === from) return;
    apps.splice(target, 0, moved);
    updateWorkspace(workspaceIndex, { apps });
    /** O editor aberto segue o item, senao passava a editar o vizinho. */
    if (editingIndex === from) setEditingIndex(target);
    else if (editingIndex !== null) {
      const shifted = editingIndex > from ? editingIndex - 1 : editingIndex;
      setEditingIndex(shifted >= target ? shifted + 1 : shifted);
    }
  };

  const moveItem = (from: number, delta: number) => {
    const to = from + delta;
    if (to < 0 || to >= workspace.apps.length) return;
    const next = [...workspace.apps];
    [next[from], next[to]] = [next[to], next[from]];
    updateWorkspace(workspaceIndex, { apps: next });
    if (editingIndex === from) setEditingIndex(to);
  };

  /** Confirmação vinda do main: só um perfil real de IDE habilita a secção de recentes. */
  const ideSupport = useIdeRecentsSupport(workspace.apps);

  const updateItem = (index: number, patch: Partial<AppItem>) => {
    updateWorkspace(workspaceIndex, {
      apps: workspace.apps.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    });
  };

  /**
   * Auto-correção: itens gravados como IDE antes desta verificação (o agente do Antigravity, por
   * exemplo) ficariam para sempre a pedir recentes que não existem. Assim que o main confirma que
   * não há perfil, a bandeira sai da config.
   */
  useEffect(() => {
    const stale = workspace.apps
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.hasRecents && ideSupport.get(ideProbeKey(item)) === false);
    if (stale.length === 0) return;
    updateWorkspace(workspaceIndex, {
      apps: workspace.apps.map((item) =>
        item.hasRecents && ideSupport.get(ideProbeKey(item)) === false
          ? { ...item, hasRecents: false }
          : item,
      ),
    });
  }, [ideSupport, workspace.apps, workspaceIndex, updateWorkspace]);

  const filteredApps = useMemo(() => {
    const term = appSearch.trim().toLowerCase();
    return installedApps.filter((item) =>
      !term || `${item.DisplayName || ''} ${item.Name || ''}`.toLowerCase().includes(term),
    );
  }, [installedApps, appSearch]);

  // Incremental reveal — the list is 300+ entries on a normal machine and each
  // visible row lazily pulls a native icon.
  const [visibleCount, setVisibleCount] = useState(APPS_PAGE_SIZE);
  useEffect(() => { setVisibleCount(APPS_PAGE_SIZE); }, [appSearch, installedApps]);
  const visibleApps = filteredApps.slice(0, visibleCount);
  const handleAppsScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 180) {
      setVisibleCount((previous) => Math.min(previous + APPS_PAGE_SIZE, filteredApps.length));
    }
  };

  return (
    <div className="zs-workspace-manager">
      <section className="zs-workspace-overview">
        {/**
         * O ícone é a âncora da coluna, não um botão perdido ao lado do campo: quadrado, do
         * tamanho do bloco de nome, alinhado pela base com o input. A linha de meta em baixo
         * fecha a coluna à mesma altura do bloco de estado, para nenhuma das duas ficar a
         * flutuar com vazio por baixo.
         */}
        <div className="zs-workspace-identity">
          <button
            type="button"
            className={`zs-workspace-icon-button${isIconPickerOpen ? ' is-active' : ''}`}
            onClick={() => setIsIconPickerOpen((open) => !open)}
            aria-expanded={isIconPickerOpen}
            aria-label="Change workspace icon"
            title="Change icon"
          >
            <WorkspaceIcon size={24} strokeWidth={1.6} />
            <Pencil size={10} strokeWidth={2} />
          </button>
          <label className="zs-workspace-name-field">
            <span>Workspace name</span>
            <input
              value={workspace.name}
              onChange={(event) => updateWorkspace(workspaceIndex, { name: event.target.value })}
            />
          </label>
          {/**
           * Os dois estados vivem na MESMA linha da identidade.
           *
           * Estavam num bloco proprio, e como `.zs-workspace-overview` e uma coluna flex, dois
           * icones de 32px reservavam uma faixa inteira da largura do painel para si.
           *
           * E nao levam `disabled`: o Chromium nao entrega eventos de rato a elementos
           * desativados, portanto a dica nunca aparecia justamente nos casos em que era precisa —
           * quando o botao esta inerte e o utilizador quer saber porque. Ficam ativos, com
           * `aria-disabled`, e o clique nao faz nada.
           */}
          <div className="zs-workspace-flags">
            <button
              type="button"
              role="switch"
              aria-checked={workspace.enabled}
              aria-label="Available on the wheel"
              aria-disabled={isActive}
              className={`zs-flag-btn${workspace.enabled ? ' is-on' : ''}${isActive ? ' is-inert' : ''}`}
              data-tip={
                isActive
                  ? 'Always shown while current'
                  : workspace.enabled
                    ? 'Shown on the wheel — click to hide'
                    : 'Hidden from the wheel — click to show'
              }
              onClick={() => {
                if (isActive) return;
                updateWorkspace(workspaceIndex, { enabled: !workspace.enabled });
              }}
            >
              {workspace.enabled ? <Eye size={15} strokeWidth={1.8} /> : <EyeOff size={15} strokeWidth={1.8} />}
            </button>
            <button
              type="button"
              aria-label="Make current workspace"
              aria-pressed={isActive}
              aria-disabled={isActive}
              className={`zs-flag-btn${isActive ? ' is-on is-inert' : ''}`}
              data-tip={isActive ? 'This is the current workspace' : 'Make this the current workspace'}
              onClick={() => {
                if (isActive) return;
                /** Tornar atual implica estar disponivel — senao o resultado seria um estado impossivel. */
                if (!workspace.enabled) updateWorkspace(workspaceIndex, { enabled: true });
                makeActive();
              }}
            >
              <Check size={15} strokeWidth={2.2} />
            </button>
          </div>
          <p className="zs-workspace-meta">
            <span>Key {workspace.hotkey}</span>
            <i aria-hidden>·</i>
            <span>{workspace.apps.length} {workspace.apps.length === 1 ? 'shortcut' : 'shortcuts'}</span>
          </p>
        </div>
{/**
         * Dois estados, dois icones, dois tooltips.
         *
         * Eram duas linhas com titulo e paragrafo cada — quatro linhas de texto a explicar dois
         * interruptores, no topo de um ecra cujo assunto sao os atalhos. O texto passa para o
         * `title`, que so aparece a quem hesita; quem ja sabe ve dois icones e seguem.
         *
         * Continuam a ser controlos distintos: um estado (disponivel) e uma acao (tornar atual).
         * O espaco atual nao pode ser escondido, senao a roda abria num espaco que o seletor
         * nao mostra — dai o `disabled`.
         */}

      </section>

      {/**
       * O seletor deixou de crescer no meio da página.
       *
       * Expandido em linha, empurrava a lista de atalhos para baixo e disputava o mesmo espaço
       * com ela — escolher um ícone parecia estar a editar os atalhos. Como modal, ocupa o ecrã
       * enquanto dura, tem título próprio, e devolve a página intacta ao fechar.
       */}
      <AnimatePresence>
        {isIconPickerOpen && (
          <motion.div
            className="zs-icon-modal-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={() => setIsIconPickerOpen(false)}
            role="presentation"
          >
            <motion.div
              className="zs-icon-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ws-icon-modal-title"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              /** O clique dentro não pode fechar o que o clique fora fecha. */
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <b id="ws-icon-modal-title">Workspace icon</b>
                  <small>Shown in the wheel picker, and on the workspace card.</small>
                </div>
                <button type="button" onClick={() => setIsIconPickerOpen(false)} aria-label="Close icon picker">
                  <X size={14} />
                </button>
              </header>
              <div className="zs-icon-modal-body">
                <IconPicker
                  selectedIcon={workspace.pickerIconName?.trim() || 'Layers'}
                  onSelect={(iconName) => updateWorkspace(workspaceIndex, { pickerIconName: iconName })}
                  config={config}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="zs-workspace-shortcuts">
        <div className="zs-workspace-section-head">
          <div>
            <h3>Shortcuts</h3>
            <p>{workspace.apps.length} {workspace.apps.length === 1 ? 'configured item' : 'configured items'}</p>
          </div>
          <div className="zs-add-actions" aria-label="Add shortcut">
            <button type="button" className={addMode === 'app' ? 'is-active' : ''} onClick={() => setAddMode(addMode === 'app' ? null : 'app')}><Monitor size={14} /> Application</button>
            <button type="button" className={addMode === 'url' ? 'is-active' : ''} onClick={() => setAddMode(addMode === 'url' ? null : 'url')}><Globe2 size={14} /> URL</button>
            <button type="button" className={addMode === 'folder' ? 'is-active' : ''} onClick={() => setAddMode(addMode === 'folder' ? null : 'folder')}><FolderOpen size={14} /> Folder</button>
          </div>
        </div>

        <div className={`zs-workspace-workbench${addMode ? ' is-split' : ''}`}>
        <AnimatePresence mode="wait">
          {addMode && (
            <motion.div className="zs-add-panel" key={addMode} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {addMode === 'app' && (
                <>
                  <div className="zs-add-panel-head">
                    <label className="zs-search is-manager-search">
                      <Search size={14} />
                      <input value={appSearch} onChange={(event) => setAppSearch(event.target.value)} placeholder="Search installed applications" />
                    </label>
                    <button type="button" className="zs-btn" onClick={chooseAppFile}><FilePlus2 size={14} /> Choose file</button>
                  </div>
                  <div className="zs-installed-apps" onScroll={handleAppsScroll}>
                    {loadingApps ? (
                      <div className="zs-manager-empty"><Loader2 className="zs-spin" size={18} /> Loading applications…</div>
                    ) : visibleApps.length ? (
                      visibleApps.map((item, index) => (
                        <button type="button" key={`${item.Path}-${index}`} onClick={() => addAppPath(item.Path!, item.DisplayName || item.Name)}>
                          <NativeAppIcon path={item.Path} size={28} className="zs-installed-app-icon" fallback={<Monitor size={15} />} />
                          <div><b>{item.DisplayName || item.Name}</b><small>{item.Path}</small></div>
                          <Plus size={14} />
                        </button>
                      ))
                    ) : appsError ? (
                      <div className="zs-manager-empty">
                        Could not list applications.
                        <button type="button" className="zs-btn" onClick={() => loadInstalledApps(true)}>Try again</button>
                      </div>
                    ) : (
                      <div className="zs-manager-empty">No applications found. Use “Choose file”.</div>
                    )}
                  </div>
                  {!loadingApps && installedApps.length > 0 && (
                    <div className="zs-add-panel-foot">
                      <span>{visibleApps.length} of {filteredApps.length} applications</span>
                      <button type="button" onClick={() => loadInstalledApps(true)}>Reload list</button>
                    </div>
                  )}
                </>
              )}
              {addMode === 'url' && (
                <div className="zs-add-form">
                  <label className="zs-field"><span>Address</span><input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" onKeyDown={(event) => { if (event.key === 'Enter') void addUrl(); }} /></label>
                  <label className="zs-field"><span>Name</span><input value={urlLabel} onChange={(event) => setUrlLabel(event.target.value)} placeholder="Filled automatically" onKeyDown={(event) => { if (event.key === 'Enter') void addUrl(); }} /></label>
                  <button type="button" className="zs-btn is-primary" disabled={!url.trim()} onClick={() => void addUrl()}><Plus size={14} /> Add URL</button>
                </div>
              )}
              {addMode === 'folder' && (
                <div className="zs-add-form">
                  <button type="button" className="zs-folder-picker" onClick={chooseFolder}>
                    <FolderOpen size={20} />
                    <div><b>{folderPath ? folderPath.split(/[/\\]/).filter(Boolean).pop() : 'Select a folder'}</b><small>{folderPath || 'Opens File Explorer'}</small></div>
                    <ChevronRight size={15} />
                  </button>
                  <label className="zs-field"><span>Name</span><input value={folderLabel} onChange={(event) => setFolderLabel(event.target.value)} placeholder="Name shown on the wheel" /></label>
                  <button type="button" className="zs-btn is-primary" disabled={!folderPath} onClick={addFolder}><Plus size={14} /> Add folder</button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="zs-workspace-items">
          {workspace.apps.map((item, index) => {
            /** Resposta do main manda; o palpite local só cobre a espera e o modo web. */
            const confirmed = ideSupport.get(ideProbeKey(item));
            const isIde = confirmed ?? isIdeApp(item);
            return (
            <div
              className={`zs-workspace-item${editingIndex === index ? ' is-editing' : ''}`
                + `${itemDragIndex === index ? ' is-dragging' : ''}`
                + `${itemDropEdge?.index === index && itemDropEdge.edge === 'above' ? ' is-drop-above' : ''}`
                + `${itemDropEdge?.index === index && itemDropEdge.edge === 'below' ? ' is-drop-below' : ''}`}
              key={`${item.id}-${index}`}
              draggable={itemDragArmed === index && editingIndex !== index}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', String(index));
                event.dataTransfer.effectAllowed = 'move';
                /** O fantasma e so o cabecalho da linha, nunca o editor expandido por baixo. */
                const header = event.currentTarget.querySelector('.zs-workspace-item-main');
                if (header instanceof HTMLElement) {
                  const rect = header.getBoundingClientRect();
                  event.dataTransfer.setDragImage(header, event.clientX - rect.left, event.clientY - rect.top);
                }
                setItemDragIndex(index);
              }}
              onDragEnd={() => { setItemDragIndex(null); setItemDropEdge(null); setItemDragArmed(null); }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const rect = event.currentTarget.getBoundingClientRect();
                setItemDropEdge({
                  index,
                  edge: event.clientY < rect.top + rect.height / 2 ? 'above' : 'below',
                });
              }}
              onDragLeave={() => setItemDropEdge((current) => (current?.index === index ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                const from = Number(event.dataTransfer.getData('text/plain'));
                const edge = itemDropEdge?.index === index ? itemDropEdge.edge : 'above';
                setItemDragIndex(null);
                setItemDropEdge(null);
                if (!Number.isInteger(from)) return;
                reorderItems(from, edge === 'below' ? index + 1 : index);
              }}
            >
              <div className="zs-workspace-item-main">
                <span
                  className="zs-item-grip"
                  aria-hidden="true"
                  onPointerDown={() => { if (editingIndex !== index) setItemDragArmed(index); }}
                  onPointerUp={() => setItemDragArmed(null)}
                >
                  <GripVertical size={14} strokeWidth={1.9} />
                </span>
                <WorkspaceItemIcon item={item} />
                <div className="zs-workspace-item-copy">
                  <b>{item.label}</b>
                  <small><em>{itemTypeLabel(item)}</em>{item.children ? ` · ${item.children.length} items` : ''}</small>
                </div>
                <div className="zs-item-actions">
                  <button type="button" disabled={index === 0} onClick={() => moveItem(index, -1)} aria-label={`Move ${item.label} up`}><ChevronUp size={14} /></button>
                  <button type="button" disabled={index === workspace.apps.length - 1} onClick={() => moveItem(index, 1)} aria-label={`Move ${item.label} down`}><ChevronDown size={14} /></button>
                  <button type="button" className={editingIndex === index ? 'is-active' : ''} onClick={() => setEditingIndex(editingIndex === index ? null : index)} aria-label={`Edit ${item.label}`}><Pencil size={13} /></button>
                  <button type="button" onClick={() => updateWorkspace(workspaceIndex, { apps: workspace.apps.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove ${item.label}`}><Trash2 size={13} /></button>
                </div>
              </div>
              {editingIndex === index && (
                <div className="zs-workspace-item-editor">
                  <label className="zs-field"><span>Name</span><input value={item.label} onChange={(event) => updateItem(index, { label: event.target.value })} /></label>
                  {/*
                    Aplicações não mostram o comando: quem adicionou o atalho já escolheu a app, e
                    o valor é um AUMID (`Microsoft.WindowsTerminal_…!App`) que não diz nada a
                    ninguém e só serve para ocupar meia linha. URL e pasta continuam editáveis —
                    aí o valor é legível e é a única forma de corrigir o destino.
                  */}
                  {item.type !== 'folder' && item.commandType !== 'app' && (
                    <label className="zs-field">
                      <span>{item.commandType === 'url' ? 'URL' : 'Folder path'}</span>
                      <input value={item.command} onChange={(event) => updateItem(index, { command: event.target.value })} />
                    </label>
                  )}
                  {item.type !== 'folder' && item.commandType !== 'folder' && (
                    <div className="zs-launch-options">
                      <div>
                        <b>Launch mode</b>
                        <small>
                          {item.commandType === 'url' && (item.launchMode ?? 'normal') === 'reuse'
                            ? 'Uses the existing default browser process when available.'
                            : (item.launchMode ?? 'normal') === 'prewarm'
                            ? 'Caches executable data in Windows memory and reuses an existing process when supported.'
                            : (item.launchMode ?? 'normal') === 'reuse'
                              ? 'Prefers the existing IDE, app, or browser process.'
                              : 'Uses the standard Windows launch behavior.'}
                        </small>
                      </div>
                      <div className="zs-segmented" role="radiogroup" aria-label="Launch mode">
                        {(item.commandType === 'url'
                          ? ([['normal', 'Normal'], ['reuse', 'Reuse']] as const)
                          : ([['normal', 'Normal'], ['reuse', 'Reuse'], ['prewarm', 'Warm']] as const)
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={(item.launchMode ?? 'normal') === value}
                            className={(item.launchMode ?? 'normal') === value ? 'is-selected' : ''}
                            onClick={() => updateItem(index, { launchMode: value })}
                          >{label}</button>
                        ))}
                      </div>
                      {(() => {
                        const risk = launchModeRisk(item.commandType, item.launchMode ?? 'normal');
                        if (!risk) return null;
                        return (
                          <p className="zs-launch-risk" role="note">
                            <AlertTriangle size={13} strokeWidth={1.9} aria-hidden />
                            <span>{risk}</span>
                          </p>
                        );
                      })()}
                    </div>
                  )}
                  {isIde && (
                    <div className="zs-ide-options">
                      <div className="zs-ide-options-head">
                        <div><b>IDE integration</b><small>Recent projects and automated terminal commands.</small></div>
                      </div>
                      <div className="zs-ide-toggle-row">
                        <div><b id={`ide-recents-${item.id}`}>Show recent folders</b><small>Open the IDE as a submenu containing its recent projects.</small></div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={Boolean(item.hasRecents)}
                          aria-labelledby={`ide-recents-${item.id}`}
                          className="zs-switch"
                          onClick={() => updateItem(index, { hasRecents: !item.hasRecents })}
                        ><i /></button>
                      </div>
                      <div className="zs-ide-toggle-row">
                        <div><b id={`ide-terminal-${item.id}`}>Open terminal for recent folders</b><small>Starts a terminal in the selected project directory.</small></div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={Boolean(item.openTerminalForRecents)}
                          aria-labelledby={`ide-terminal-${item.id}`}
                          className="zs-switch"
                          disabled={!item.hasRecents}
                          onClick={() => updateItem(index, { openTerminalForRecents: !item.openTerminalForRecents })}
                        ><i /></button>
                      </div>
                      <div className="zs-ide-commands">
                        <div className="zs-ide-commands-head">
                          <div><b>Automated commands</b><small>Executed in the selected recent project folder.</small></div>
                          <button type="button" className="zs-btn" onClick={() => updateItem(index, { terminalCommands: [...(item.terminalCommands || []), ''] })}><Plus size={13} /> Add command</button>
                        </div>
                        {(item.terminalCommands || []).map((command, commandIndex) => (
                          <div className="zs-command-row" key={`${item.id}-command-${commandIndex}`}>
                            <input
                              value={command}
                              placeholder={commandIndex === 0 ? 'npm install' : 'npm run dev'}
                              aria-label={`Automated command ${commandIndex + 1}`}
                              onChange={(event) => updateItem(index, {
                                terminalCommands: (item.terminalCommands || []).map((current, i) => i === commandIndex ? event.target.value : current),
                              })}
                            />
                            <button type="button" aria-label={`Remove command ${commandIndex + 1}`} onClick={() => updateItem(index, {
                              terminalCommands: (item.terminalCommands || []).filter((_, i) => i !== commandIndex),
                            })}><X size={13} /></button>
                          </div>
                        ))}
                        {!item.terminalCommands?.length && <p className="zs-ide-empty">No automated commands configured.</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );})}
          {!workspace.apps.length && (
            <div className="zs-manager-empty is-large"><SquareStack size={22} /><b>This workspace is empty</b><span>Add an application, URL, or folder above.</span></div>
          )}
        </div>
        </div>
      </section>

      <button type="button" className="zs-delete-workspace" disabled={!canDelete} onClick={deleteWorkspace}>
        <Trash2 size={14} /> Delete workspace
      </button>
    </div>
  );
}

function ShortcutRecorder({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const cleanup = window.electron?.onShortcutRecorded?.((shortcut) => {
      if (shortcut) onChange(shortcut);
      window.electron?.stopShortcutRecording?.();
      window.electron?.resumeGlobalShortcut?.();
      setRecording(false);
    });
    return () => cleanup?.();
  }, [recording, onChange]);

  useEffect(() => () => {
    window.electron?.stopShortcutRecording?.();
    window.electron?.resumeGlobalShortcut?.();
  }, []);

  const keys = value.split('+').filter(Boolean);

  return (
    <div className="zs-shortcut">
      <div className="zs-shortcut-keys">
        {keys.map((key) => <kbd key={key}>{key}</kbd>)}
      </div>
      <button
        type="button"
        className={`zs-btn${recording ? '' : ' is-primary'}`}
        onClick={() => {
          if (recording) {
            window.electron?.stopShortcutRecording?.();
            window.electron?.resumeGlobalShortcut?.();
            setRecording(false);
          } else {
            window.electron?.pauseGlobalShortcut?.();
            window.electron?.startShortcutRecording?.();
            setRecording(true);
          }
        }}
      >
        {recording ? 'Press the key combination…' : 'Record new shortcut'}
      </button>
    </div>
  );
}
