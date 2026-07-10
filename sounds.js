// Generates short tones directly (no audio files to host/load) using the
// Web Audio API. Must be called from a real user gesture (a click/tap) —
// browsers block audio that starts on its own.

function getContext() {
  if (typeof window === "undefined") return null;
  if (!window.__qcAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    window.__qcAudioCtx = new AudioCtx();
  }
  return window.__qcAudioCtx;
}

function tone(ctx, freq, startTime, duration, volume = 0.15) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// A warm little ascending chime — plays once after a successful login.
export function playWelcomeChime() {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 523.25, now, 0.35, 0.12);       // C5
  tone(ctx, 659.25, now + 0.12, 0.35, 0.12); // E5
  tone(ctx, 783.99, now + 0.24, 0.5, 0.14);  // G5
}

// A short, clear alert — for critical events (red QC result, panic value).
export function playAlertSound() {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 880, now, 0.15, 0.16);
  tone(ctx, 880, now + 0.2, 0.15, 0.16);
}
