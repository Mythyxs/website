const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const TAU = Math.PI * 2;

/* reveals: [data-reveal] elements fade up as they scroll into view */

let gate = Promise.resolve();

// Hold every reveal until the intro has opened, so nothing animates behind it.
export function holdReveals(promise) {
  gate = promise;
}

const byDocOrder = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

function glitch(el, delay) {
  const targets = el.matches('[data-glitch]') ? [el] : [...el.querySelectorAll('[data-glitch]')];
  for (const t of targets) {
    setTimeout(() => {
      t.classList.add('glitch');
      setTimeout(() => t.classList.remove('glitch'), 650);
    }, delay + 120);
  }
}

const io = new IntersectionObserver(
  (entries) => {
    const hits = entries.filter((e) => e.isIntersecting).map((e) => e.target);
    if (!hits.length) return;
    for (const el of hits) io.unobserve(el);
    gate.then(() =>
      requestAnimationFrame(() => {
        hits.sort(byDocOrder).forEach((el, i) => {
          const step = Math.min(i, 14);
          el.style.setProperty('--i', step);
          el.classList.add('in');
          glitch(el, step * 55);
          setTimeout(() => el.style.setProperty('--i', 0), step * 55 + 900);
        });
      }),
    );
  },
  { threshold: 0.01, rootMargin: '0px 0px -30px 0px' },
);

export function reveal(root) {
  for (const el of root.querySelectorAll('[data-reveal]:not(.in)')) io.observe(el);
}

// Re-run the entrance every time a page is shown.
export function replay(root) {
  const els = root.querySelectorAll('[data-reveal]');
  for (const el of els) {
    io.unobserve(el);
    el.classList.remove('in');
    el.style.removeProperty('--i');
  }
  void root.offsetWidth;
  for (const el of els) io.observe(el);
}

export function onceVisible(el, fn) {
  const o = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    o.disconnect();
    gate.then(fn);
  });
  o.observe(el);
}

/* tab change blade */

export function slash() {
  if (reduced) return;
  const el = document.getElementById('slash');
  el.classList.remove('go');
  void el.offsetWidth;
  el.classList.add('go');
}

/* pointer: spotlight and card tilt */

export function pointerFx() {
  if (!finePointer || reduced) return;
  const spot = document.querySelector('.spot');
  let ev = null;
  let raf = 0;
  let cur = null;

  const reset = (el) => {
    el.classList.remove('tilting');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  const frame = () => {
    raf = 0;
    spot.style.setProperty('--px', `${ev.clientX}px`);
    spot.style.setProperty('--py', `${ev.clientY}px`);

    const el = ev.target.closest?.('[data-tilt]') || null;
    if (cur && cur !== el) reset(cur);
    cur = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width;
    const y = (ev.clientY - r.top) / r.height;
    const max = Number(el.dataset.tilt) || 6;
    el.classList.add('tilting');
    el.style.setProperty('--rx', `${((0.5 - y) * max).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((x - 0.5) * max).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  };

  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      ev = e;
      if (!raf) raf = requestAnimationFrame(frame);
    },
    { passive: true },
  );
  document.addEventListener('mouseleave', () => cur && reset(cur));
}

/* background embers */

export function embers(canvas) {
  if (reduced) return;
  const c = canvas.getContext('2d');
  const count = innerWidth < 720 ? 24 : 52;
  const parts = [];
  let w = 0;
  let h = 0;
  let last = 0;
  let px = 0;
  let py = 0;

  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    w = innerWidth;
    h = innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const spawn = (p, anywhere) => {
    p.z = 0.3 + Math.random() * 0.7;
    p.x = Math.random() * w;
    p.y = anywhere ? Math.random() * h : h + 12;
    p.r = (0.5 + Math.random() * 1.5) * p.z;
    p.vy = -(10 + Math.random() * 26) * p.z;
    p.vx = (Math.random() - 0.5) * 8;
    p.ph = Math.random() * TAU;
    p.red = Math.random() < 0.3;
    p.a = 0.12 + Math.random() * 0.5 * p.z;
    return p;
  };

  const loop = (t) => {
    const dt = Math.max(0, Math.min(0.05, (t - last) / 1000 || 0));
    last = t;
    c.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.ph += dt * 1.3;
      p.x += (p.vx + Math.sin(p.ph) * 9) * dt;
      p.y += p.vy * dt;
      if (p.y < -12 || p.x < -20 || p.x > w + 20) spawn(p);
      const x = p.x + px * 18 * p.z;
      const y = p.y + py * 12 * p.z;
      const flicker = 0.75 + Math.sin(p.ph * 3.1) * 0.25;
      if (p.red) {
        c.globalAlpha = p.a * 0.18 * flicker;
        c.fillStyle = '#ff2d3f';
        c.beginPath();
        c.arc(x, y, p.r * 5, 0, TAU);
        c.fill();
      }
      c.globalAlpha = p.a * flicker;
      c.fillStyle = p.red ? '#ff5260' : '#ffffff';
      c.beginPath();
      c.arc(x, y, p.r, 0, TAU);
      c.fill();
    }
    raf = requestAnimationFrame(loop);
  };

  size();
  for (let i = 0; i < count; i++) parts.push(spawn({}, true));
  let raf = requestAnimationFrame(loop);

  addEventListener('resize', size);
  addEventListener(
    'pointermove',
    (e) => {
      px = e.clientX / w - 0.5;
      py = e.clientY / h - 0.5;
    },
    { passive: true },
  );
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  });
}

/* particle bursts (votes, buttons) */

const sparks = [];
const rings = [];
let fxCanvas;
let fxc;
let running = false;

function fxSize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  fxCanvas.width = innerWidth * dpr;
  fxCanvas.height = innerHeight * dpr;
  fxc.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function burst(x, y, { colors = ['#ffffff'], count = 18, speed = 280, gravity = 600, life = 0.7, ring = true, rise = 0 } = {}) {
  if (reduced) return;
  if (!fxCanvas) {
    fxCanvas = document.getElementById('fx');
    fxc = fxCanvas.getContext('2d');
    fxSize();
    addEventListener('resize', fxSize);
  }
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU;
    const v = speed * (0.35 + Math.random() * 0.65);
    sparks.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - rise,
      life: life * (0.6 + Math.random() * 0.4),
      age: 0,
      size: 1.5 + Math.random() * 2.5,
      color: colors[(Math.random() * colors.length) | 0],
      streak: Math.random() < 0.6,
      gravity,
    });
  }
  if (ring) rings.push({ x, y, age: 0, life: 0.45, color: colors[0] });
  if (!running) {
    running = true;
    let prev = performance.now();
    const tick = (t) => {
      // a frame timestamp can predate the click that started the loop
      const dt = Math.max(0, Math.min(0.04, (t - prev) / 1000));
      prev = t;
      fxc.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.age += dt;
        const k = r.age / r.life;
        if (k >= 1) {
          rings.splice(i, 1);
          continue;
        }
        fxc.globalAlpha = (1 - k) * 0.8;
        fxc.strokeStyle = r.color;
        fxc.lineWidth = 2.5 * (1 - k) + 0.5;
        fxc.beginPath();
        fxc.arc(r.x, r.y, 6 + 46 * (1 - (1 - k) ** 3), 0, TAU);
        fxc.stroke();
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.age += dt;
        if (s.age >= s.life) {
          sparks.splice(i, 1);
          continue;
        }
        s.vx *= 0.985;
        s.vy = s.vy * 0.985 + s.gravity * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const k = 1 - s.age / s.life;
        fxc.globalAlpha = k;
        fxc.fillStyle = s.color;
        fxc.strokeStyle = s.color;
        if (s.streak) {
          fxc.lineWidth = s.size * 0.7;
          fxc.lineCap = 'round';
          fxc.beginPath();
          fxc.moveTo(s.x, s.y);
          fxc.lineTo(s.x - s.vx * 0.035, s.y - s.vy * 0.035);
          fxc.stroke();
        } else {
          fxc.save();
          fxc.translate(s.x, s.y);
          fxc.rotate(s.age * 9);
          fxc.fillRect(-s.size / 2, -s.size / 2, s.size, s.size);
          fxc.restore();
        }
      }
      if (sparks.length || rings.length) requestAnimationFrame(tick);
      else {
        fxc.clearRect(0, 0, innerWidth, innerHeight);
        running = false;
      }
    };
    requestAnimationFrame(tick);
  }
}

export const LIKE_BURST = { colors: ['#3ddc84', '#ffffff', '#a7f3c9'], count: 22, speed: 300, gravity: 520, rise: 120 };
export const DISLIKE_BURST = { colors: ['#ff4d5e', '#ff2d3f', '#2a2a2e'], count: 16, speed: 210, gravity: 1100, life: 0.65 };
