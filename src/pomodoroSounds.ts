/** Web Audio micro-sounds for Pomodoro (premium UI feedback). */

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedCtx || sharedCtx.state === "closed") sharedCtx = new Ctx();
    return sharedCtx;
  } catch {
    return null;
  }
}

export function resumePomodoroAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx?.state === "suspended") return ctx.resume();
  return Promise.resolve();
}

function beep(
  frequency: number,
  durationSec: number,
  gain: number,
  type: OscillatorType = "sine",
) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), ctx.currentTime + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + durationSec + 0.02);
}

/** Short tactile click — play / pause / skip / reset. */
export function playPomodoroUiTap(): void {
  try {
    beep(1650, 0.038, 0.045, "sine");
  } catch {
    /* ignore */
  }
}

/** Softer tick when switching deep focus, etc. */
export function playPomodoroUiSoftTap(): void {
  try {
    beep(880, 0.04, 0.035, "sine");
  } catch {
    /* ignore */
  }
}

/** End of a focus or break segment (replaces inline hook chime). */
export function playPomodoroSegmentEnd(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.45);
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.48);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    /* ignore */
  }
}

export const POMODORO_UI_PREFS_KEY = "zenith_pomodoro_ui_v1";

export type AmbientPresetId = "off" | "beep" | "siren" | "pulse" | "custom";

const VALID_AMBIENT: AmbientPresetId[] = ["off", "beep", "siren", "pulse", "custom"];

function migrateAmbientPreset(raw: unknown): AmbientPresetId {
  if (typeof raw === "string" && VALID_AMBIENT.includes(raw as AmbientPresetId)) {
    return raw as AmbientPresetId;
  }
  if (raw === "rain" || raw === "drone" || raw === "soft") return "beep";
  return "off";
}

export type PomodoroUiPrefs = {
  deepFocus: boolean;
  soundsEnabled: boolean;
  ambientPreset: AmbientPresetId;
  /** 0–1 */
  ambientVolume: number;
  /** Electron: path under userData from select; web: not persisted */
  customAmbientPath: string | null;
};

const defaultPrefs: PomodoroUiPrefs = {
  deepFocus: false,
  soundsEnabled: true,
  ambientPreset: "off",
  ambientVolume: 0.35,
  customAmbientPath: null,
};

export function loadPomodoroUiPrefs(): PomodoroUiPrefs {
  try {
    const s = localStorage.getItem(POMODORO_UI_PREFS_KEY);
    if (s) {
      const parsed = JSON.parse(s) as Partial<PomodoroUiPrefs>;
      return {
        ...defaultPrefs,
        ...parsed,
        ambientPreset: migrateAmbientPreset(parsed.ambientPreset),
      };
    }
  } catch {
    /* ignore */
  }
  return { ...defaultPrefs };
}

export function savePomodoroUiPrefs(p: Partial<PomodoroUiPrefs>): void {
  try {
    const cur = loadPomodoroUiPrefs();
    localStorage.setItem(
      POMODORO_UI_PREFS_KEY,
      JSON.stringify({ ...cur, ...p }),
    );
  } catch {
    /* ignore */
  }
}

export function shouldPlayPomodoroSounds(): boolean {
  return loadPomodoroUiPrefs().soundsEnabled;
}
