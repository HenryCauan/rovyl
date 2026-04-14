import React from 'react';
import { Droplets } from 'lucide-react';

type Props = {
  /** 0–1 */
  value: number;
  onChange: (next: number) => void;
  /** Accessible name / tooltip */
  label: string;
};

/**
 * Fixed to the top-right of the viewport (not inside the glass card) so it sits on the dimmed backdrop.
 */
export const WidgetBackdropOpacitySlider: React.FC<Props> = ({ value, onChange, label }) => {
  const v = Math.min(1, Math.max(0, value));
  return (
    <label
      className="pointer-events-auto fixed right-4 top-4 z-[75] flex cursor-pointer items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/45 px-3 py-2 shadow-lg backdrop-blur-md sm:right-6 sm:top-6"
      title={label}
      onClick={(e) => e.stopPropagation()}
    >
      <Droplets size={14} className="shrink-0 text-white/45" strokeWidth={1.5} />
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(v * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-1 w-[72px] cursor-pointer appearance-none rounded-full bg-white/15 accent-white [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/85"
      />
    </label>
  );
};
