import React from 'react';
import { Droplets } from 'lucide-react';

type Props = {
  /** 0–1 */
  value: number;
  onChange: (next: number) => void;
  /** Accessible name / tooltip */
  label: string;
};

/** Compact opacity control — pinned to the top-right of the widget viewport. */
export const WidgetBackdropOpacitySlider: React.FC<Props> = ({ value, onChange, label }) => {
  const v = Math.min(1, Math.max(0, value));
  return (
    <label
      className="pointer-events-auto fixed right-3 top-3 z-[75] flex w-max cursor-pointer items-center gap-1 rounded-full border border-white/[0.08] bg-[rgba(18,18,22,0.78)] px-2 py-1 shadow-[0_4px_16px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:right-4 sm:top-4"
      title={label}
      onClick={(e) => e.stopPropagation()}
    >
      <Droplets size={10} className="shrink-0 text-white/38" strokeWidth={2} aria-hidden />
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(v * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={label}
        className="h-0.5 w-11 cursor-pointer appearance-none rounded-full bg-white/12 accent-white/75 [&::-webkit-slider-thumb]:h-1.5 [&::-webkit-slider-thumb]:w-1.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/80"
      />
    </label>
  );
};
