/**
 * Alarm-style loops for Pomodoro end screen: Web Audio presets + optional audio file.
 */

/** sessionStorage: blob URL when user picks a file in the browser (not persisted to disk). */
export const POMODORO_WEB_AMBIENT_BLOB_SESSION_KEY = "zenith_pomodoro_ambient_blob_url";

/** Built-in alarm character (not relaxing ambient). */
export type BuiltInAmbientPreset = "beep" | "siren" | "pulse";

export function pathToAudioUrl(localPath: string): string {
  if (!localPath) return "";
  if (
    localPath.startsWith("blob:") ||
    localPath.startsWith("http:") ||
    localPath.startsWith("https:")
  ) {
    return localPath;
  }
  const n = localPath.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(n)) return "file:///" + n;
  return "file://" + (n.startsWith("/") ? n : "/" + n);
}

let activeBuiltInStop: (() => void) | null = null;
let activeCtx: AudioContext | null = null;
let customAudio: HTMLAudioElement | null = null;

export function stopPomodoroAmbientPlayback(): void {
  try {
    activeBuiltInStop?.();
  } catch {
    /* ignore */
  }
  activeBuiltInStop = null;
  if (activeCtx && activeCtx.state !== "closed") {
    try {
      void activeCtx.close();
    } catch {
      /* ignore */
    }
  }
  activeCtx = null;
  if (customAudio) {
    customAudio.pause();
    customAudio.removeAttribute("src");
    customAudio.load();
    customAudio = null;
  }
}

function getCtx(): AudioContext | null {
  const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AC ? new AC() : null;
}

/** Classic two-tone repeating beeps (clock-radio style). */
function startAlarmBeep(volume: number): () => void {
  const ctx = getCtx();
  if (!ctx) return () => {};
  activeCtx = ctx;
  void ctx.resume();
  const master = ctx.createGain();
  master.gain.value = Math.min(0.55, 0.25 + volume * 0.35);
  master.connect(ctx.destination);

  const playCycle = () => {
    if (ctx.state === "closed") return;
    let t = ctx.currentTime + 0.02;
    const seq = [
      { f: 880, len: 0.1 },
      { f: 660, len: 0.1 },
      { f: 880, len: 0.1 },
      { f: 660, len: 0.1 },
    ];
    const gap = 0.08;
    for (let i = 0; i < seq.length; i++) {
      const { f, len } = seq[i];
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + len + 0.02);
      t += len + (i < seq.length - 1 ? gap : 0);
    }
  };

  playCycle();
  const id = window.setInterval(playCycle, 1250);

  return () => {
    window.clearInterval(id);
    try {
      master.disconnect();
      void ctx.close();
    } catch {
      /* ignore */
    }
    if (activeCtx === ctx) activeCtx = null;
  };
}

/** Sweeping pitch (siren). */
function startAlarmSiren(volume: number): () => void {
  const ctx = getCtx();
  if (!ctx) return () => {};
  activeCtx = ctx;
  void ctx.resume();
  const g = ctx.createGain();
  g.gain.value = Math.min(0.5, 0.2 + volume * 0.35);
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.connect(g);
  g.connect(ctx.destination);

  const sweep = () => {
    const now = ctx.currentTime + 0.02;
    osc.frequency.cancelScheduledValues(now);
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(1350, now + 0.55);
    osc.frequency.exponentialRampToValueAtTime(380, now + 1.1);
  };
  sweep();
  osc.start();
  const id = window.setInterval(() => {
    if (ctx.state === "closed") {
      window.clearInterval(id);
      return;
    }
    sweep();
  }, 1100);

  return () => {
    window.clearInterval(id);
    try {
      osc.stop();
      osc.disconnect();
      g.disconnect();
      void ctx.close();
    } catch {
      /* ignore */
    }
    if (activeCtx === ctx) activeCtx = null;
  };
}

/** Fast urgent pulses (digital alarm). */
function startAlarmPulse(volume: number): () => void {
  const ctx = getCtx();
  if (!ctx) return () => {};
  activeCtx = ctx;
  void ctx.resume();
  const master = ctx.createGain();
  master.gain.value = Math.min(0.55, 0.22 + volume * 0.38);
  master.connect(ctx.destination);

  const on = 0.055;
  const step = 0.125;
  const freq = 1050;
  let nextT = ctx.currentTime + 0.02;

  const scheduleAhead = () => {
    if (ctx.state === "closed") return;
    const horizon = ctx.currentTime + 30;
    while (nextT < horizon) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = freq;
      const gg = ctx.createGain();
      gg.gain.setValueAtTime(0.0001, nextT);
      gg.gain.exponentialRampToValueAtTime(1, nextT + 0.008);
      gg.gain.exponentialRampToValueAtTime(0.0001, nextT + on);
      o.connect(gg);
      gg.connect(master);
      o.start(nextT);
      o.stop(nextT + on + 0.02);
      nextT += step;
    }
  };

  scheduleAhead();
  const id = window.setInterval(() => {
    if (ctx.state === "closed") {
      window.clearInterval(id);
      return;
    }
    scheduleAhead();
  }, 10000);

  return () => {
    window.clearInterval(id);
    try {
      master.disconnect();
      void ctx.close();
    } catch {
      /* ignore */
    }
    if (activeCtx === ctx) activeCtx = null;
  };
}

function startBuiltIn(preset: BuiltInAmbientPreset, volume: number): () => void {
  if (preset === "beep") return startAlarmBeep(volume);
  if (preset === "siren") return startAlarmSiren(volume);
  return startAlarmPulse(volume);
}

export type PomodoroAmbientStartOpts = {
  preset: "off" | "custom" | BuiltInAmbientPreset;
  volume: number;
  customPath: string | null;
};

export function startPomodoroAmbientPlayback(opts: PomodoroAmbientStartOpts): void {
  stopPomodoroAmbientPlayback();
  const v = Math.max(0, Math.min(1, opts.volume));
  if (opts.preset === "off") return;
  if (opts.preset === "custom") {
    if (!opts.customPath?.trim()) return;
    const el = new Audio(pathToAudioUrl(opts.customPath));
    el.loop = true;
    el.volume = v;
    void el.play().catch(() => {});
    customAudio = el;
    return;
  }
  const stop = startBuiltIn(opts.preset, v);
  activeBuiltInStop = stop;
}
