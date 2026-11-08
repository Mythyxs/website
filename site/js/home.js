import { loadAnime, loadGakuran, countVisit, catOf } from './data.js';
import { $, esc, odometer } from './ui.js';
import { onceVisible } from './fx.js';

const PHRASES = [
  '"life is like a box of chocolates" - me',
  'watch frieren its peak',
  'idk what to put here',
  'bleach clears one piece',
  'there is not a single bad music/band anime in existence',
  'table expected, got nil 😢',
];

function typer(el) {
  const order = [...PHRASES].sort(() => Math.random() - 0.5);
  let n = 0;
  let chars = [];
  let i = 0;

  const type = () => {
    if (i <= chars.length) {
      el.textContent = chars.slice(0, i++).join('');
      setTimeout(type, 45 + Math.random() * 55);
    } else {
      setTimeout(erase, 2300);
    }
  };
  const erase = () => {
    if (i > 0) {
      el.textContent = chars.slice(0, --i).join('');
      setTimeout(erase, 22);
    } else {
      n = (n + 1) % order.length;
      chars = [...order[n]];
      setTimeout(type, 380);
    }
  };

  chars = [...order[0]];
  setTimeout(type, 600);
}

function visits(root) {
  const num = $('#visits', root);
  const msg = $('#visitsMsg', root);
  countVisit()
    .then(({ count }) =>
      onceVisible(num, () => {
        odometer(num, count);
        setTimeout(() => {
          msg.textContent = `thank you for ${Math.floor(count / 1000)}k guys`;
          msg.classList.add('show');
        }, 1500);
      }),
    )
    .catch(() => {
      num.textContent = 'N/A';
      msg.textContent = 'the counter is taking a nap';
      msg.classList.add('show');
    });
}

function podium(root) {
  const el = $('#podium', root);
  loadAnime()
    .then((list) => {
      const top = [...list].sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title)).slice(0, 3);
      el.innerHTML = top
        .map(
          (a, i) => `
          <li><a class="podium-item" href="#/anime" style="--cat:${catOf(a.category).color}">
            <img src="${esc(a.cover)}" alt="" loading="lazy" decoding="async">
            <span class="podium-rank">${i + 1}</span>
            <span class="podium-meta"><b>${esc(a.title)}</b><span>${a.rating.toFixed(1)} / 10</span></span>
          </a></li>`,
        )
        .join('');
    })
    .catch(() => {
      el.innerHTML = '<li class="dim">Couldn\'t load the list right now.</li>';
    });
}

function teaser(root) {
  const num = $('#gkTeaserPlaying', root);
  loadGakuran()
    .then((d) => onceVisible(num, () => odometer(num, d.playing)))
    .catch(() => {
      num.closest('.live').hidden = true;
    });
}

export function init(root) {
  typer($('#typed', root));
  visits(root);
  podium(root);
  teaser(root);
}

export function enter() {
  const root = document.getElementById('page-home');
  teaser(root);
}
