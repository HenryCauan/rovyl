import React from 'react';
import { motion } from 'framer-motion';
import { Cloud } from 'lucide-react';
import { CLOCK_HUD_POSITIONS, ClockHudPosition, UIConfig } from '../types';

export type ClockHudRegion = ClockHudPosition;

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

  return { region, isBottom, align, shellClass, innerClass };
}

/** Ghost pill — sem backdrop-blur (HWND transparente no Windows). */
const hudPillClass =
  'inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-[rgba(8,8,10,0.72)] px-3 py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.35)]';

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

/**
 * Sobreposição do radial: só bateria/clima (desligados por defeito). Relógio, data e chip do workspace
 * foram removidos — a janela do radial mostra apenas a roda, e nada é desenhado fora dela.
 */
export interface RadialHudProps {
  isOpen: boolean;
  config: UIConfig;
  batteryLevel: number | null;
  weather: { temp: number; condition: string } | null;
}

export const RadialHud: React.FC<RadialHudProps> = ({
  isOpen,
  config,
  batteryLevel,
  weather,
}) => {
  const region = resolveHudRegion(config.clockPosition);
  const { isBottom, align, shellClass, innerClass } = getHudLayout(region);

  const showStatus =
    (config.showBattery && batteryLevel !== null) ||
    (config.showWeather && !config.performanceMode && !!weather);
  if (!showStatus) return null;

  const enterY = isBottom ? 10 : -10;

  return (
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
        <HudStatusStrip
          align={align}
          showBattery={config.showBattery}
          showWeather={config.showWeather}
          performanceMode={config.performanceMode}
          batteryLevel={batteryLevel}
          weather={weather}
        />
      </motion.div>
    </div>
  );
};
