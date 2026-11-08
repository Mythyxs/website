import { loadGakuran } from './data.js';
import { $, esc, odometer, lightbox, timeAgo, compact } from './ui.js';
import { onceVisible, reveal } from './fx.js';

const LOCAL = Array.from({ length: 9 }, (_, i) => `img/gakuran/thumb-${i + 1}.webp`);
const SLIDE_MS = 6000;

let root;
let shots = LOCAL;
let current = 0;
let layer = 0;
let slideTimer;
let pollTimer;
let lastPlaying = null;
let built = false;

function buildMedia(list) {
  shots = list;
  const slides = $('#gkSlides', root);
  if (!slides.children.length) {
    slides.innerHTML = '<img alt="" decoding="async"><img alt="" decoding="async">';
    const first = slides.children[0];
    first.src = shots[0];
    first.classList.add('on');
  }

  $('#gkDots', root).innerHTML = shots
    .map((_, i) => `<button type="button" aria-label="Show image ${i + 1}" data-i="${i}" class="${i === current ? 'on' : ''}"></button>`)
    .join('');
  $('#gkDots', root).style.setProperty('--slide-ms', `${SLIDE_MS}ms`);

  $('#gkGallery', root).innerHTML = shots
    .map((src, i) => `<button class="shot" type="button" data-i="${i}" data-reveal data-sfx="shutter" aria-label="Open screenshot ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy" decoding="async"></button>`)
    .join('');
}

function show(i) {
  const imgs = $('#gkSlides', root).children;
  const next = imgs[1 - layer];
  const target = (i + shots.length) % shots.length;
  next.src = shots[target];
  const swap = () => {
    next.classList.add('on');
    imgs[layer].classList.remove('on');
    layer = 1 - layer;
    current = target;
    for (const d of $('#gkDots', root).children) {
      d.classList.remove('on');
      if (Number(d.dataset.i) === current) {
        void d.offsetWidth;
        d.classList.add('on');
      }
    }
  };
  (next.decode ? next.decode() : Promise.resolve()).then(swap, swap);
}

function startSlides() {
  clearInterval(slideTimer);
  slideTimer = setInterval(() => show(current + 1), SLIDE_MS);
}

function apply(d) {
  const p = $('#gkPlaying', root);
  onceVisible(p, () => {
    odometer(p, d.playing);
    odometer($('#gkVisits', root), d.visits);
    odometer($('#gkFavs', root), d.favorites);
    if (d.upVotes != null) {
      $('#gkRating', root).nextElementSibling.hidden = false;
      const pct = (d.upVotes / Math.max(1, d.upVotes + d.downVotes)) * 100;
      odometer($('#gkRating', root), pct.toFixed(1));
      $('#gkRatio', root).style.width = `${pct}%`;
      $('#gkVotes', root).textContent = `${d.upVotes.toLocaleString('en-US')} likes, ${d.downVotes.toLocaleString('en-US')} dislikes`;
    } else {
      $('#gkRating', root).textContent = 'N/A';
      $('#gkRating', root).nextElementSibling.hidden = true;
    }
  });

  if (lastPlaying != null && d.playing !== lastPlaying) {
    const diff = d.playing - lastPlaying;
    const sub = $('#gkPlayingSub', root);
    sub.innerHTML = `across every server<span class="delta${diff < 0 ? ' down' : ''}">${diff > 0 ? '+' : ''}${diff.toLocaleString('en-US')}</span>`;
  }
  lastPlaying = d.playing;

  $('#gkVisitsSub', root).textContent = `${compact(d.visits)} plays and counting`;
  $('#gkCreated', root).textContent = new Date(d.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  $('#gkUpdated', root).textContent = timeAgo(new Date(d.updated).getTime());
  $('#gkMax', root).textContent = `${d.maxPlayers} players`;
  const status = $('#gkStatus', root);
  status.textContent = d.playing > 0 ? 'Online' : 'Quiet right now';
  status.className = 'ok';
  if (d.genre) $('#gkGenre', root).textContent = d.genre;
  if (d.playUrl) $('#gkPlay', root).href = d.playUrl;
  if (d.groupUrl) $('#gkGroup', root).href = d.groupUrl;

  const [setting, ...rest] = d.description.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (setting) $('#gkSetting', root).textContent = setting;
  if (rest.length) $('#gkDesc', root).textContent = rest.join(' ');

  if (!built) {
    built = true;
    if (d.thumbs?.length) {
      buildMedia(d.thumbs);
      reveal($('#gkGallery', root));
    }
  }
}

function refresh() {
  loadGakuran()
    .then(apply)
    .catch(() => {
      const status = $('#gkStatus', root);
      status.textContent = 'Stats offline';
      status.className = 'bad';
      if (lastPlaying == null) {
        for (const id of ['gkPlaying', 'gkVisits', 'gkFavs', 'gkRating']) $(`#${id}`, root).textContent = 'N/A';
        $('#gkRating', root).nextElementSibling.hidden = true;
      }
    });
}

export function init(el) {
  root = el;
  buildMedia(LOCAL);

  $('#gkDots', root).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    show(Number(b.dataset.i));
    startSlides();
  });

  $('#gkGallery', root).addEventListener('click', (e) => {
    const b = e.target.closest('.shot');
    if (b) lightbox(shots, Number(b.dataset.i), b);
  });

  // Fall back to the bundled screenshots if Roblox is slow to answer.
  const fallback = setTimeout(() => (built = true), 2500);
  loadGakuran()
    .catch(() => {})
    .finally(() => clearTimeout(fallback));
  refresh();
}

export function enter() {
  startSlides();
  refresh();
  clearInterval(pollTimer);
  pollTimer = setInterval(() => !document.hidden && refresh(), 60e3);
}

export function leave() {
  clearInterval(slideTimer);
  clearInterval(pollTimer);
}
