const KEY = 'sfx-muted';
const VOLUME = 0.6;

let ctx;
let out;
let noise;
let muted = false;
const last = {};

try {
  muted = localStorage.getItem(KEY) === '1';
} catch {}

function boot() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  out = ctx.createGain();
  out.gain.value = muted ? 0 : VOLUME;
  out.connect(comp).connect(ctx.destination);

  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

// Browsers only allow audio after the visitor interacts, so the first tap or key press starts it.
export function unlock() {
  boot();
  if (ctx && ctx.state !== 'running') ctx.resume();
}

function envelope(g, t, attack, peak, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone({ type = 'sine', f0, f1 = f0, at = 0, attack = 0.004, decay = 0.1, gain = 0.2, lowpass }) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
  const g = ctx.createGain();
  envelope(g, t, attack, gain, decay);
  let node = o;
  if (lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    node = node.connect(f);
  }
  node.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

function hiss({ type = 'bandpass', f0 = 2000, f1 = f0, q = 1, at = 0, attack = 0.004, decay = 0.1, gain = 0.2 }) {
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
  const g = ctx.createGain();
  envelope(g, t, attack, gain, decay);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 0.4);
  s.stop(t + attack + decay + 0.05);
}

const jitter = (n, amount = 0.06) => n * (1 + (Math.random() * 2 - 1) * amount);

const SOUNDS = {
  hover() {
    tone({ f0: jitter(1900), f1: jitter(2500), decay: 0.035, gain: 0.03 });
  },
  click() {
    hiss({ f0: 3400, q: 1.6, decay: 0.028, gain: 0.16 });
    tone({ f0: jitter(260), f1: 90, decay: 0.07, gain: 0.22 });
  },
  whoosh() {
    hiss({ f0: 320, f1: 4200, q: 0.8, attack: 0.1, decay: 0.24, gain: 0.3 });
    tone({ f0: 110, f1: 42, attack: 0.02, decay: 0.26, gain: 0.14 });
  },
  open() {
    tone({ type: 'triangle', f0: 540, f1: 900, decay: 0.08, gain: 0.08 });
    hiss({ f0: 5200, decay: 0.04, gain: 0.04 });
  },
  close() {
    tone({ type: 'triangle', f0: 880, f1: 520, decay: 0.08, gain: 0.07 });
  },
  like() {
    tone({ type: 'triangle', f0: 880, decay: 0.12, gain: 0.13 });
    tone({ type: 'triangle', f0: 1318.5, at: 0.07, decay: 0.24, gain: 0.13 });
    tone({ f0: 2637, at: 0.07, decay: 0.3, gain: 0.03 });
    hiss({ type: 'highpass', f0: 6500, at: 0.03, decay: 0.2, gain: 0.05 });
  },
  dislike() {
    tone({ type: 'sawtooth', f0: 230, f1: 105, decay: 0.2, gain: 0.11, lowpass: 900 });
    tone({ f0: 130, f1: 48, decay: 0.18, gain: 0.26 });
  },
  unvote() {
    tone({ type: 'triangle', f0: 700, f1: 430, decay: 0.09, gain: 0.08 });
  },
  error() {
    tone({ type: 'square', f0: 160, decay: 0.06, gain: 0.05, lowpass: 1400 });
    tone({ type: 'square', f0: 150, at: 0.1, decay: 0.09, gain: 0.05, lowpass: 1400 });
  },
  pop() {
    tone({ f0: 620, f1: 1250, decay: 0.06, gain: 0.1 });
  },
  play() {
    hiss({ f0: 380, f1: 6400, q: 0.7, attack: 0.015, decay: 0.38, gain: 0.24 });
    tone({ f0: 150, f1: 38, decay: 0.4, gain: 0.34 });
    tone({ type: 'triangle', f0: 660, at: 0.03, decay: 0.2, gain: 0.07 });
    tone({ type: 'triangle', f0: 990, at: 0.1, decay: 0.32, gain: 0.07 });
  },
  shutter() {
    hiss({ f0: 2600, q: 2, decay: 0.03, gain: 0.12 });
    hiss({ f0: 1800, q: 2, at: 0.05, decay: 0.05, gain: 0.1 });
  },
};

export function play(name) {
  if (muted || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
  const now = performance.now();
  if (now - (last[name] || 0) < (name === 'hover' ? 45 : 30)) return;
  last[name] = now;
  SOUNDS[name]();
}

export const isMuted = () => muted;

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {}
  if (out) out.gain.setTargetAtTime(value ? 0 : VOLUME, ctx.currentTime, 0.02);
}
