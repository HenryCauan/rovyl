import React from 'react';
import { motion } from 'framer-motion';
import { Cloud } from 'lucide-react';
import { CLOCK_HUD_POSITIONS, ClockHudPosition, UIConfig, Workspace } from '../types';

export type ClockHudRegion = ClockHudPosition;

const hudTextShadow = 'drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]';

type HudAlign = 'start' | 'center' | 'end';

function resolveHudRegion(clockPosition: UIConfig['clockPosition']): ClockHudRegion {
  return CLOCK_HUD_POSITIONS.includes(clockPosition)
    ? clockPosition
    : 'top-center';
}

function isCenterRegion(region: ClockHudRegion): boolean {
  return region === 'top-center' || region === 'bottom-center';
}

function alignToFlex(align: HudAlign): string {
  if (align === 'center') return 'items-center text-center';
  if (align === 'end') return 'items-end text-right';
  return 'items-start text-left';
}

function alignToJustify(align: HudAlign): string {
  if (align === 'center') return 'justify-center';
  if (align === 'end') return 'justify-end';
  return 'justify-start';
}

function getHudLayout(region: ClockHudRegion) {
  const isBottom = region.startsWith('bottom');
  const align: HudAlign = isCenterRegion(region)
    ? 'center'
    : region === 'top-right' || region === 'bottom-right'
      ? 'end'
      : 'start';

  const shellClass = (() => {
    const z = 'fixed z-[10] pointer-events-none text-white';
    switch (region) {
      case 'bottom-left':
        return `${z} bottom-0 left-0`;
      case 'bottom-center':
        return `${z} bottom-0 inset-x-0 flex justify-center`;
      case 'bottom-right':
        return `${z} bottom-0 right-0`;
      case 'top-left':
        return `${z} top-0 left-0`;
      case 'top-center':
        return `${z} top-0 inset-x-0 flex justify-center`;
      case 'top-right':
        return `${z} top-0 right-0`;
      default:
        return `${z} top-0 inset-x-0 flex justify-center`;
    }
  })();

  const innerClass = (() => {
    const pad = 'p-5 sm:p-6 md:pt-7 md:px-8 md:pb-8';
    const cluster = `flex flex-col ${alignToFlex(align)} gap-3 sm:gap-3.5`;
    const width = isCenterRegion(region)
      ? 'w-max max-w-[min(92vw,560px)]'
      : 'max-w-[min(92vw,420px)]';
    return `${cluster} ${pad} ${width}`;
  })();

  const workspaceShellClass =
    region === 'top-left' || region === 'bottom-left'
      ? 'fixed top-6 right-6 sm:top-8 sm:right-8 z-[10] pointer-events-none'
      : region === 'top-right' || region === 'bottom-right'
        ? 'fixed top-6 left-6 sm:top-8 sm:left-8 z-[10] pointer-events-none'
        : 'fixed top-6 left-6 sm:top-8 sm:left-8 z-[10] pointer-events-none';

  return { region, isBottom, align, shellClass, innerClass, workspaceShellClass };
}

/** Ghost pill — sem backdrop-blur (HWND transparente no Windows). */
const hudPillClass =
  'inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-[rgba(8,8,10,0.72)] px-3 py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.35)]';

interface HudDividerProps {
  align: HudAlign;
}

const HudDivider: React.FC<HudDividerProps> = ({ align }) => (
  <div
    className={`h-px w-full max-w-[140px] bg-gradient-to-r from-transparent via-white/14 to-transparent ${
      align === 'center' ? 'mx-auto' : align === 'end' ? 'ml-auto' : 'mr-auto'
    }`}
    aria-hidden
  />
);

interface HudTemporalBlockProps {
  align: HudAlign;
  showClock: boolean;
  showDate: boolean;
  currentTime: Date;
}

const HudTemporalBlock: React.FC<HudTemporalBlockProps> = ({
  align,
  showClock,
  showDate,
  currentTime,
}) => {
  if (!showClock && !showDate) return null;

  return (
    <div className={`flex flex-col gap-1 ${alignToFlex(align)}`}>
      {showClock && (
        <div
          className={`text-[clamp(2.125rem,4.8vw,3rem)] font-light tabular-nums leading-none tracking-[-0.03em] text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)] ${hudTextShadow}`}
          style={{ fontFamily: 'Space Grotesk, ui-sans-serif, system-ui, sans-serif' }}
        >
          {currentTime.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}
        </div>
      )}
      {showDate && (
        <p
          className={`max-w-[48ch] text-[0.75rem] font-medium uppercase tracking-[0.14em] text-white/50 sm:text-[0.8125rem] ${hudTextShadow} ${
            align === 'center' ? 'text-center' : align === 'end' ? 'text-right' : 'text-left'
          }`}
        >
          {currentTime.toLocaleDateString([], {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </p>
      )}
    </div>
  );
};

interface HudStatusStripProps {
  align: HudAlign;
  showBattery: boolean;
  showWeather: boolean;
  performanceMode: boolean;
  batteryLevel: number | null;
  weather: { temp: number; condition: string } | null;
}

const HudStatusStrip: React.FC<HudStatusStripProps> = ({
  align,
  showBattery,
  showWeather,
  performanceMode,
  batteryLevel,
  weather,
}) => {
  const showBatteryChip = showBattery && batteryLevel !== null;
  const showWeatherChip = showWeather && !performanceMode && !!weather;
  if (!showBatteryChip && !showWeatherChip) return null;

  return (
    <div
      className={`flex flex-wrap gap-2 sm:gap-2.5 ${alignToJustify(align)} ${align === 'center' ? 'w-auto' : 'w-full'}`}
    >
      {showBatteryChip && (
        <div className={hudPillClass}>
          <div
            className="relative h-3 w-7 shrink-0 rounded-full border border-white/[0.2] bg-white/[0.06] p-[2px]"
            aria-hidden
          >
            <div
              className="h-full max-w-full rounded-full bg-white transition-[width] duration-500 ease-out"
              style={{
                width: `${batteryLevel}%`,
                backgroundColor: batteryLevel! < 20 ? '#f87171' : undefined,
              }}
            />
          </div>
          <span className="text-[11px] font-semibold tabular-nums tracking-wide text-white/80">
            {batteryLevel}%
          </span>
        </div>
      )}

      {showWeatherChip && (
        <div className={`${hudPillClass} max-w-[min(100%,14rem)]`}>
          <Cloud className="h-3.5 w-3.5 shrink-0 text-white/45" strokeWidth={1.75} aria-hidden />
          <span className="truncate text-[11px] font-semibold tabular-nums tracking-tight text-white/85">
            {weather!.temp}°
          </span>
          {weather!.condition && weather!.condition !== '---' && (
            <>
              <span className="text-white/25" aria-hidden>
                ·
              </span>
              <span className="truncate text-[10px] font-medium uppercase tracking-wider text-white/45">
                {weather!.condition}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

interface HudWorkspaceChipProps {
  workspace: Workspace;
  moduleCount: number;
  moduleLabel: string;
  alignRight: boolean;
}

const HudWorkspaceChip: React.FC<HudWorkspaceChipProps> = ({
  workspace,
  moduleCount,
  moduleLabel,
  alignRight,
}) => (
  <div
    className={`flex max-w-[min(88vw,260px)] items-center gap-2.5 rounded-full border border-white/[0.1] bg-[rgba(8,8,10,0.72)] px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.35)] sm:gap-3 sm:px-3.5 sm:py-2.5 ${
      alignRight ? 'flex-row-reverse' : ''
    }`}
  >
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.1] text-[11px] font-bold text-white ring-1 ring-white/[0.08] sm:h-7 sm:w-7">
      {workspace.hotkey}
    </div>
    <div className={`min-w-0 flex-1 ${alignRight ? 'text-right' : 'text-left'}`}>
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-white/88 sm:text-xs">
        {workspace.name}
      </div>
      <div className="mt-0.5 truncate text-[9px] font-medium uppercase tracking-[0.18em] text-white/38">
        {moduleCount} {moduleLabel}
      </div>
    </div>
  </div>
);

export interface RadialHudProps {
  isOpen: boolean;
  config: UIConfig;
  currentTime: Date;
  batteryLevel: number | null;
  weather: { temp: number; condition: string } | null;
  currentWorkspace?: Workspace;
  moduleCount: number;
  moduleLabel: string;
}

export const RadialHud: React.FC<RadialHudProps> = ({
  isOpen,
  config,
  currentTime,
  batteryLevel,
  weather,
  currentWorkspace,
  moduleCount,
  moduleLabel,
}) => {
  const region = resolveHudRegion(config.clockPosition);
  const { isBottom, align, shellClass, innerClass, workspaceShellClass } = getHudLayout(region);

  const showTemporal = config.showClock || config.showDate;
  const showStatus =
    (config.showBattery && batteryLevel !== null) ||
    (config.showWeather && !config.performanceMode && !!weather);
  const showHud = showTemporal || showStatus;

  const enterY = isBottom ? 10 : -10;

  return (
    <>
      {showHud && (
        <div className={shellClass}>
          <motion.div
            initial={false}
            animate={{
              opacity: isOpen ? 1 : 0,
              y: isOpen ? 0 : enterY,
            }}
            transition={{ duration: isOpen ? 0.26 : 0.14, ease: [0.22, 1, 0.36, 1] }}
            className={innerClass}
          >
            {showTemporal && (
              <HudTemporalBlock
                align={align}
                showClock={config.showClock}
                showDate={config.showDate}
                currentTime={currentTime}
              />
            )}

            {showTemporal && showStatus && <HudDivider align={align} />}

            {showStatus && (
              <HudStatusStrip
                align={align}
                showBattery={config.showBattery}
                showWeather={config.showWeather}
                performanceMode={config.performanceMode}
                batteryLevel={batteryLevel}
                weather={weather}
              />
            )}
          </motion.div>
        </div>
      )}

      {currentWorkspace && (
        <motion.div
          initial={false}
          animate={{ opacity: isOpen ? 1 : 0, y: isOpen ? 0 : -6 }}
          transition={{ duration: isOpen ? 0.24 : 0.12, delay: isOpen ? 0.04 : 0 }}
          className={workspaceShellClass}
        >
          <HudWorkspaceChip
            workspace={currentWorkspace}
            moduleCount={moduleCount}
            moduleLabel={moduleLabel}
            alignRight={region === 'top-left' || region === 'bottom-left'}
          />
        </motion.div>
      )}
    </>
  );
};
