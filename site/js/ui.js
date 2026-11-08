import { play } from './sfx.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export const LOADING_LINES = [
  'Fetching data. This can take a moment on first load.',
  'i love tokyo ghoul i love frieren i love gachiakuta i love anime',
  'you see i want to add more shit here but im just not creative enough',
];

export function loader(text = pick(LOADING_LINES)) {
  return `<div class="state"><div class="loader"><span class="loader-bars"><i></i><i></i><i></i><i></i></span>${esc(text)}</div></div>`;
}

export function timeAgo(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [name, size] of units) {
    if (s >= size) {
      const n = Math.floor(s / size);
      return `${n} ${name}${n === 1 ? '' : 's'} ago`;
    }
  }
}

export function compact(n) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/* rolling digits */

const STRIP = `<span aria-hidden="true">${[...'0123456789'].map((d) => `<i>${d}</i>`).join('')}</span>`;

export function odometer(el, value) {
  const text = typeof value === 'number' ? value.toLocaleString('en-US') : String(value);
  if (el.dataset.shown === text) return;
  const shape = text.replace(/\d/g, '0');

  if (el.dataset.shape !== shape) {
    el.innerHTML = [...text].map((ch) => (/\d/.test(ch) ? `<span class="odo-d">${STRIP}</span>` : `<span class="odo-sep" aria-hidden="true">${esc(ch)}</span>`)).join('');
    el.dataset.shape = shape;
    void el.offsetWidth;
  }

  const strips = el.querySelectorAll('.odo-d > span');
  let k = 0;
  for (const ch of text) {
    if (!/\d/.test(ch)) continue;
    strips[k].style.setProperty('--n', ch);
    strips[k].style.setProperty('--dd', `${k * 45}ms`);
    k++;
  }
  el.dataset.shown = text;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', text);
}

/* dropdown */

export function select(root, onChange) {
  const btn = $('.select-btn', root);
  const list = $('.select-list', root);
  const valueEl = $('.select-value', root);
  const opts = [...list.children];
  let hot = 0;

  const mark = () => opts.forEach((o, i) => o.classList.toggle('hot', i === hot));

  const open = (on, quiet) => {
    if (root.classList.contains('open') === on) return;
    root.classList.toggle('open', on);
    btn.setAttribute('aria-expanded', String(on));
    if (on) {
      hot = Math.max(0, opts.findIndex((o) => o.getAttribute('aria-selected') === 'true'));
      mark();
      list.focus({ preventScroll: true });
      play('open');
    } else if (!quiet) {
      play('close');
    }
  };

  const choose = (li) => {
    opts.forEach((o) => o.setAttribute('aria-selected', String(o === li)));
    valueEl.textContent = li.textContent;
    open(false, true);
    btn.focus({ preventScroll: true });
    onChange(li.dataset.value);
  };

  btn.addEventListener('click', () => open(!root.classList.contains('open')));
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) choose(li);
  });
  list.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      hot = (hot + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      mark();
      play('hover');
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      play('click');
      choose(opts[hot]);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      open(false);
      if (e.key === 'Escape') btn.focus();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!root.contains(e.target)) open(false);
  });
}

/* image viewer */

const lb = { el: null, list: [], i: 0, opener: null, x0: null };

function lbShow(i) {
  const img = $('img', lb.el);
  lb.i = (i + lb.list.length) % lb.list.length;
  img.classList.remove('ready');
  img.src = lb.list[lb.i];
  img.decode?.().catch(() => {}).finally(() => img.classList.add('ready'));
  $('figcaption', lb.el).textContent = `${lb.i + 1} / ${lb.list.length}`;
}

function lbClose() {
  if (!lb.el || lb.el.hidden) return;
  lb.el.classList.remove('open');
  document.documentElement.style.overflow = '';
  setTimeout(() => (lb.el.hidden = true), 250);
  lb.opener?.focus({ preventScroll: true });
}

function lbInit() {
  lb.el = document.getElementById('lightbox');
  $('.lb-close', lb.el).addEventListener('click', lbClose);
  $('.prev', lb.el).addEventListener('click', () => lbShow(lb.i - 1));
  $('.next', lb.el).addEventListener('click', () => lbShow(lb.i + 1));
  lb.el.addEventListener('click', (e) => {
    if (e.target === lb.el || e.target.classList.contains('lb-figure')) {
      play('close');
      lbClose();
    }
  });
  lb.el.addEventListener('pointerdown', (e) => (lb.x0 = e.clientX));
  lb.el.addEventListener('pointerup', (e) => {
    if (lb.x0 === null) return;
    const dx = e.clientX - lb.x0;
    lb.x0 = null;
    if (Math.abs(dx) > 50 && e.pointerType !== 'mouse') {
      play('click');
      lbShow(lb.i + (dx < 0 ? 1 : -1));
    }
  });
  addEventListener('keydown', (e) => {
    if (lb.el.hidden) return;
    if (e.key === 'Escape') {
      play('close');
      lbClose();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      play('click');
      lbShow(lb.i + (e.key === 'ArrowRight' ? 1 : -1));
    }
  });
}

export function lightbox(list, i, opener) {
  if (!lb.el) lbInit();
  lb.list = list;
  lb.opener = opener;
  lb.el.hidden = false;
  document.documentElement.style.overflow = 'hidden';
  lbShow(i);
  requestAnimationFrame(() => lb.el.classList.add('open'));
  $('.lb-close', lb.el).focus({ preventScroll: true });
}

/* toast */

let toastTimer;

export function toast(message, bad = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.toggle('bad', bad);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
