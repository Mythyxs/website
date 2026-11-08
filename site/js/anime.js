import { loadAnime, getVotes, sendVote, CATS, catOf, anilistUrl } from './data.js';
import { $, esc, select, toast, loader, pick, LOADING_LINES } from './ui.js';
import { reveal, burst, LIKE_BURST, DISLIKE_BURST } from './fx.js';
import { play } from './sfx.js';

const UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 10a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.5-1.1L14.2 1 7.6 7.6c-.4.4-.6.9-.6 1.4v10a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1.2-.7zM1 21h4V9H1z"/></svg>';
const DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 15h4V3h-4m-4 0H6c-.8 0-1.5.5-1.8 1.2l-3 7.1L1 12v2a2 2 0 0 0 2 2h6.3l-1 4.6v.3c0 .4.2.8.5 1.1L9.8 23l6.6-6.6c.4-.4.6-.9.6-1.4V5a2 2 0 0 0-2-2"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 17.3 6.2 3.7-1.6-7 5.4-4.7-7.2-.6L12 2 9.2 8.7 2 9.3l5.4 4.7-1.6 7z"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

const SORTS = {
  rating_desc: (a, b) => b.rating - a.rating || a.title.localeCompare(b.title),
  rating_asc: (a, b) => a.rating - b.rating || a.title.localeCompare(b.title),
  az: (a, b) => a.title.localeCompare(b.title),
  za: (a, b) => b.title.localeCompare(a.title),
  liked: (a, b) => count(b, 'likes') - count(a, 'likes') || b.rating - a.rating,
  disliked: (a, b) => count(b, 'dislikes') - count(a, 'dislikes') || a.rating - b.rating,
};

let root;
let grid;
let list = [];
let votes = { counts: {}, mine: {} };
let votesOk = false;
let votesAt = 0;
let filter = 'All';
let sort = 'rating_desc';
let query = '';
const medals = new Map();

const count = (a, key) => votes.counts[a.title]?.[key] || 0;
const fmt = (n) => n.toLocaleString('en-US');

function scoreColor(r) {
  if (r >= 8) return 'var(--score-5)';
  if (r >= 7) return 'var(--score-4)';
  if (r >= 6) return 'var(--score-3)';
  if (r >= 5) return 'var(--score-2)';
  return 'var(--score-1)';
}

function card(a) {
  const v = votes.counts[a.title] || { likes: 0, dislikes: 0 };
  const mine = votes.mine[a.title];
  const medal = medals.get(a.title);
  const url = esc(anilistUrl(a));
  const eps = a.watched != null && a.total != null ? `${a.watched}/${a.total}` : a.watched != null ? `${a.watched} watched` : '';
  const off = votesOk ? '' : ' disabled title="Voting is offline right now"';

  return `
  <article class="acard card${medal ? ` rank-${medal}` : ''}" data-reveal data-tilt="5" data-title="${esc(a.title)}" style="--cat:${catOf(a.category).color}">
    ${medal ? `<span class="rank">#${medal}</span>` : ''}
    <a class="acard-cover" href="${url}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
      <img src="${esc(a.cover)}" alt="" loading="lazy" decoding="async" width="96" height="136">
    </a>
    <div class="acard-body">
      <h3 class="acard-title"><a href="${url}" target="_blank" rel="noopener">${esc(a.title)}</a></h3>
      <div class="acard-meta">
        ${a.rating ? `<span class="chip tinted" style="--c:${scoreColor(a.rating)}">${STAR}${a.rating.toFixed(1)}</span>` : ''}
        ${eps ? `<span class="chip">${PLAY}${eps}</span>` : ''}
      </div>
      <span class="cat-tag">${esc(a.category)}</span>
      ${a.note ? `<p class="acard-note">${esc(a.note)}</p>` : ''}
      <div class="votes">
        <button class="vote like" type="button" data-v="like" data-sfx="none" aria-pressed="${mine === 'like'}" aria-label="Like"${off}>${UP}<b>${fmt(v.likes)}</b></button>
        <button class="vote dislike" type="button" data-v="dislike" data-sfx="none" aria-pressed="${mine === 'dislike'}" aria-label="Dislike"${off}>${DOWN}<b>${fmt(v.dislikes)}</b></button>
      </div>
    </div>
  </article>`;
}

function skeleton() {
  const one = `
    <div class="acard card skeleton">
      <div class="acard-cover skel"></div>
      <div class="acard-body">
        <div class="skel skel-line" style="width:80%"></div>
        <div class="skel skel-line" style="width:45%"></div>
        <div class="skel skel-line" style="width:60%;margin-top:6px"></div>
      </div>
    </div>`;
  grid.innerHTML = `<div class="loader" style="grid-column:1/-1;margin-bottom:4px"><span class="loader-bars"><i></i><i></i><i></i><i></i></span>${esc(pick(LOADING_LINES))}</div>${one.repeat(8)}`;
}

function buildPills() {
  const counts = {};
  for (const a of list) counts[a.category] = (counts[a.category] || 0) + 1;
  const extra = Object.keys(counts).filter((name) => !CATS.some((c) => c.name === name)).map(catOf);
  const all = [{ name: 'All', short: 'All', color: '#ffffff' }, ...CATS, ...extra];

  $('#pills', root).innerHTML = all
    .map(
      (c) => `
      <button class="pill" type="button" role="radio" aria-checked="${filter === c.name}" data-cat="${esc(c.name)}" style="--c:${c.color}">
        ${c.name === 'All' ? '' : '<i></i>'}<span>${esc(c.short)}</span><b>${c.name === 'All' ? list.length : counts[c.name] || 0}</b>
      </button>`,
    )
    .join('');
}

function render() {
  const q = query.trim().toLowerCase();
  const rows = list.filter((a) => (filter === 'All' || a.category === filter) && (!q || a.title.toLowerCase().includes(q))).sort(SORTS[sort]);

  const results = $('#results', root);
  const parts = [`<span>Showing ${rows.length} of ${list.length}</span>`];
  if (filter !== 'All') parts.push(`<span class="dim">in ${esc(catOf(filter).short)}</span>`);
  if (q) parts.push(`<span class="dim">matching "${esc(query.trim())}"</span>`);
  if (filter !== 'All' || q) parts.push('<button type="button" data-clear>Clear</button>');
  results.innerHTML = parts.join(' ');

  if (!rows.length) {
    grid.innerHTML = `
      <div class="state" style="grid-column:1/-1">
        <p class="state-title">Nothing here</p>
        <p class="state-sub">I don't think I've watched that anime, sorry bro.</p>
      </div>`;
    return;
  }

  grid.innerHTML = rows.map(card).join('');
  for (const img of grid.querySelectorAll('img')) if (img.complete && img.naturalWidth) img.classList.add('ok');
  reveal(grid);
}

function setFilter(name) {
  filter = name;
  for (const p of root.querySelectorAll('.pill')) p.setAttribute('aria-checked', String(p.dataset.cat === name));
  render();
}

function paintVotes(el, counts, mine, bump) {
  for (const b of el.querySelectorAll('.vote')) {
    const n = fmt(counts[`${b.dataset.v}s`] || 0);
    const num = b.querySelector('b');
    if (num.textContent !== n) {
      num.textContent = n;
      if (bump) {
        num.classList.remove('bump');
        void num.offsetWidth;
        num.classList.add('bump');
      }
    }
    b.setAttribute('aria-pressed', String(mine === b.dataset.v));
    b.disabled = !votesOk;
    b.title = votesOk ? '' : 'Voting is offline right now';
  }
}

function syncVotes() {
  for (const el of grid.querySelectorAll('.acard[data-title]')) {
    const t = el.dataset.title;
    paintVotes(el, votes.counts[t] || {}, votes.mine[t], false);
  }
  if (sort === 'liked' || sort === 'disliked') render();
}

function refreshVotes() {
  votesAt = Date.now();
  return getVotes()
    .then((v) => {
      votes = { counts: v.counts || {}, mine: v.mine || {} };
      votesOk = true;
    })
    .catch(() => {
      votesOk = false;
    })
    .finally(syncVotes);
}

async function vote(btn) {
  const el = btn.closest('.acard');
  const title = el.dataset.title;
  if (el.dataset.busy) return;

  const kind = btn.dataset.v;
  const prev = votes.mine[title] || null;
  const next = prev === kind ? null : kind;
  const before = { likes: 0, dislikes: 0, ...votes.counts[title] };
  const after = { ...before };
  if (prev) after[`${prev}s`] = Math.max(0, after[`${prev}s`] - 1);
  if (next) after[`${next}s`] += 1;

  const commit = (counts, mine, bump) => {
    votes.counts[title] = counts;
    if (mine) votes.mine[title] = mine;
    else delete votes.mine[title];
    paintVotes(el, counts, mine, bump);
  };

  commit(after, next, true);
  if (next) {
    const r = btn.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, next === 'like' ? LIKE_BURST : DISLIKE_BURST);
    play(next);
  } else {
    play('unvote');
  }

  el.dataset.busy = '1';
  try {
    const res = await sendVote(title, next);
    commit({ likes: res.likes, dislikes: res.dislikes }, res.mine, false);
  } catch (err) {
    commit(before, prev, false);
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    play('error');
    toast(err.status === 429 ? 'Easy, too many votes. Try again in a few minutes.' : "Couldn't save your vote. Try again.", true);
  } finally {
    delete el.dataset.busy;
  }
}

function load() {
  skeleton();
  refreshVotes();
  loadAnime()
    .then((l) => {
      list = l;
      const scores = [...new Set(list.map((a) => a.rating).filter(Boolean))].sort((a, b) => b - a).slice(0, 3);
      for (const a of list) {
        const rank = scores.indexOf(a.rating) + 1;
        if (a.rating && rank) medals.set(a.title, rank);
      }
      $('#animeKicker', root).textContent = `${list.length} titles, rated and ranked`;
      $('#q', root).placeholder = `Search ${list.length} titles`;
      buildPills();
      render();
    })
    .catch(() => {
      grid.innerHTML = `
        <div class="state" style="grid-column:1/-1">
          <p class="state-title">Couldn't load the list</p>
          <p class="state-sub">GitHub didn't answer. Give it another go.</p>
          <button class="btn btn-ghost btn-sm" type="button" data-retry>Try again</button>
        </div>`;
    });
}

export function init(el) {
  root = el;
  grid = $('#agrid', root);

  select($('#sort', root), (v) => {
    sort = v;
    render();
  });

  const input = $('#q', root);
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      query = input.value;
      render();
    }, 140);
  });
  addEventListener('keydown', (e) => {
    if (e.key !== '/' || root.hidden || /input|textarea/i.test(document.activeElement?.tagName)) return;
    e.preventDefault();
    input.focus();
  });

  $('#pills', root).addEventListener('click', (e) => {
    const p = e.target.closest('.pill');
    if (p) setFilter(p.dataset.cat);
  });

  $('#results', root).addEventListener('click', (e) => {
    if (!e.target.closest('[data-clear]')) return;
    input.value = '';
    query = '';
    setFilter('All');
  });

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.vote');
    if (btn && !btn.disabled) vote(btn);
    if (e.target.closest('[data-retry]')) load();
  });
  grid.addEventListener('load', (e) => e.target.tagName === 'IMG' && e.target.classList.add('ok'), true);
  grid.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (img.tagName !== 'IMG') return;
      const title = img.closest('.acard')?.dataset.title || '?';
      img.replaceWith(Object.assign(document.createElement('span'), { className: 'fallback', textContent: title[0] }));
    },
    true,
  );

  load();
}

export function enter() {
  if (list.length && Date.now() - votesAt > 120e3) refreshVotes();
}
