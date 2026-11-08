import { unlock, play, isMuted, setMuted } from './sfx.js';
import { embers, pointerFx, replay, holdReveals, slash } from './fx.js';
import { $, wait, toast } from './ui.js';
import * as home from './home.js';
import * as anime from './anime.js';
import * as schedule from './schedule.js';
import * as gakuran from './gakuran.js';

document.documentElement.classList.add('booted');

const pages = { home, anime, schedule, gakuran };
const TITLES = {
  home: 'shemxz',
  anime: 'Anime list | shemxz',
  schedule: 'Airing schedule | shemxz',
  gakuran: 'Gakuran | shemxz',
};

const tabs = $('#tabs');
const ink = $('.tab-ink', tabs);
const started = new Set();
let current = null;
let seq = 0;

function routeName() {
  const name = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return pages[name] ? name : 'home';
}

function moveInk(instant) {
  const tab = $(`.tab[data-route="${current}"]`, tabs);
  if (!tab) return;
  if (instant) tabs.classList.add('no-anim');
  ink.style.setProperty('--x', `${tab.offsetLeft}px`);
  ink.style.setProperty('--w', `${tab.offsetWidth}px`);
  if (instant) requestAnimationFrame(() => requestAnimationFrame(() => tabs.classList.remove('no-anim')));
}

async function show(name, animate) {
  const my = ++seq;
  const prev = current && $(`#page-${current}`);

  for (const t of tabs.querySelectorAll('.tab')) {
    if (t.dataset.route === name) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  }
  document.body.dataset.page = name;
  document.title = TITLES[name];

  if (name === current) {
    prev.classList.remove('leaving');
    moveInk();
    return;
  }

  const tab = $(`.tab[data-route="${name}"]`, tabs);
  ink.style.setProperty('--x', `${tab.offsetLeft}px`);
  ink.style.setProperty('--w', `${tab.offsetWidth}px`);

  if (prev && animate) {
    play('whoosh');
    slash();
    prev.classList.add('leaving');
    await wait(170);
    if (my !== seq) return;
  }

  if (prev) {
    prev.classList.remove('leaving');
    prev.hidden = true;
    try {
      pages[current].leave?.();
    } catch (e) {
      console.error(e);
    }
  }

  const next = $(`#page-${name}`);
  current = name;
  // Home is visible in the HTML by default, so a deep link (#/anime) has to hide it here.
  for (const p of document.querySelectorAll('.page')) p.hidden = p !== next;
  scrollTo({ top: 0 });

  try {
    if (!started.has(name)) {
      started.add(name);
      pages[name].init(next);
    }
    pages[name].enter?.();
  } catch (e) {
    console.error(e);
  }
  replay(next);
}

function intro() {
  const el = $('#intro');
  if (document.documentElement.classList.contains('no-intro')) {
    el.remove();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.add('out');
      try {
        sessionStorage.setItem('intro-seen', '1');
      } catch {}
      setTimeout(resolve, 120);
      setTimeout(() => el.remove(), 1000);
    };
    setTimeout(finish, 1400);
    el.addEventListener('pointerdown', finish);
    addEventListener('keydown', finish, { once: true });
  });
}

function sounds() {
  for (const type of ['pointerdown', 'keydown', 'touchend']) addEventListener(type, unlock, { capture: true, passive: true });

  let hovered = null;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest('a, button, [role="option"]');
    if (el === hovered) return;
    hovered = el;
    if (el && !el.disabled) play('hover');
  });

  document.addEventListener(
    'click',
    (e) => {
      const el = e.target.closest('a, button');
      if (!el || el.disabled) return;
      const name = el.dataset.sfx || 'click';
      if (name !== 'none') play(name);
    },
    true,
  );

  const mute = $('#mute');
  const paint = () => {
    mute.setAttribute('aria-pressed', String(isMuted()));
    mute.setAttribute('aria-label', isMuted() ? 'Unmute sounds' : 'Mute sounds');
  };
  paint();
  mute.addEventListener('click', () => {
    setMuted(!isMuted());
    paint();
    play('pop');
    toast(isMuted() ? 'Sounds off' : 'Sounds on');
  });
}

function topbar() {
  const bar = $('#topbar');
  const update = () => bar.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', update, { passive: true });
  update();
}

holdReveals(intro());
embers($('#embers'));
pointerFx();
sounds();
topbar();

show(routeName(), false).then(() => moveInk(true));
addEventListener('hashchange', () => show(routeName(), true));
addEventListener('resize', () => moveInk(true));
document.fonts?.ready.then(() => moveInk(true));
