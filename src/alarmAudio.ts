/**
 * Alarm ringtone: looping melodic pattern via Web Audio (no external assets).
 * Call stop() to release the AudioContext and timers.
 */
export function startAlarmRingtone(): () => void {
    const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return () => {};

    const ctx = new AC();
    let closed = false;

    const master = ctx.createGain();
    master.gain.value = 0.14;
    master.connect(ctx.destination);

    const playTone = (freq: number, start: number, dur: number, vol: number) => {
        if (closed) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(vol, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.connect(g);
        g.connect(master);
        osc.start(start);
        osc.stop(start + dur + 0.02);
    };

    const chord = (base: number, t0: number) => {
        playTone(base, t0, 0.22, 0.35);
        playTone(base * 1.25, t0 + 0.08, 0.2, 0.22);
        playTone(base * 1.5, t0 + 0.16, 0.18, 0.18);
    };

    let step = 0;
    const bases = [523.25, 659.25, 783.99, 659.25];

    const scheduleNext = () => {
        if (closed || ctx.state === 'closed') return;
        const t = ctx.currentTime + 0.02;
        chord(bases[step % bases.length], t);
        step++;
    };

    const resume = ctx.resume().catch(() => {});
    void resume;

    scheduleNext();
    const interval = window.setInterval(() => {
        try {
            scheduleNext();
        } catch {
            /* ignore */
        }
    }, 520);

    return () => {
        closed = true;
        window.clearInterval(interval);
        try {
            master.disconnect();
            ctx.close();
        } catch {
            /* ignore */
        }
    };
}
