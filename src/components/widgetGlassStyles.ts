/** Dark frosted glass — aligned with Notes chrome (subtle, no bright liquid-glass tints). */

export const WIDGET_GLASS_CARD =
  'relative isolate overflow-hidden rounded-[28px] border border-white/[0.08] shadow-[0_12px_48px_rgba(0,0,0,0.52)] [transform:translateZ(0)] [backface-visibility:hidden]';

export const WIDGET_GLASS_CARD_BG =
  'pointer-events-none absolute inset-0 bg-[rgba(18,18,22,0.78)] backdrop-blur-xl';

export const WIDGET_GLASS_CARD_SHINE =
  'pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.08] via-transparent to-transparent';

export const WIDGET_GLASS_CAPSULE =
  'relative isolate overflow-hidden rounded-full border border-white/[0.08] shadow-[0_8px_36px_rgba(0,0,0,0.48)] [transform:translateZ(0)] [backface-visibility:hidden]';

export const WIDGET_GLASS_CAPSULE_BG =
  'pointer-events-none absolute inset-0 bg-[rgba(18,18,22,0.72)] backdrop-blur-xl';

export const WIDGET_GLASS_CAPSULE_SHINE =
  'pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.07] via-transparent to-transparent';

export const WIDGET_GLASS_SEG_TRACK =
  'rounded-full border border-white/[0.06] bg-black/20';

export const widgetGlassSegActive =
  'bg-white/[0.14] text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]';

export const widgetGlassIconBtn = (active: boolean) =>
  `relative flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ${
    active
      ? widgetGlassSegActive
      : 'text-white/38 hover:text-white/65 hover:bg-white/[0.06]'
  }`;

export const widgetGlassViewSeg = (active: boolean) =>
  `flex-1 flex items-center justify-center gap-2 py-2 px-2.5 rounded-full text-[11px] font-medium tracking-[-0.02em] transition-all duration-200 ${
    active ? widgetGlassSegActive : 'text-white/38 hover:text-white/62'
  }`;
