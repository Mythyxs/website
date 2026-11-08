import { loadAnime, fetchJSON } from './data.js';
import { $, esc, loader } from './ui.js';
import { reveal } from './fx.js';

const CACHE_KEY = 'schedule-v1';
const FRESH_FOR = 2 * 3600e3;
const FORMATS = new Set(['TV', 'TV_SHORT', 'ONA', 'OVA', 'MOVIE']);
const FORMAT_LABEL = { TV: 'TV', TV_SHORT: 'SHORT', ONA: 'ONA', OVA: 'OVA', MOVIE: 'MOVIE' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MEDIA_Q = `query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids) {
  id status format episodes siteUrl season seasonYear
  title { english romaji } coverImage { large color }
  startDate { year month day } nextAiringEpisode { airingAt episode }
  relations { edges { relationType node { id type format } } }
} } }`;

const AIRED_Q = `query ($ids: [Int], $from: Int, $to: Int) { Page(perPage: 50) {
  airingSchedules(mediaId_in: $ids, airingAt_greater: $from, airingAt_lesser: $to, sort: TIME_DESC) { mediaId episode airingAt }
} }`;

let root;
let box;
let timer;
let loading = false;

async function gql(query, variables) {
  const res = await fetchJSON('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (res.errors?.length) throw new Error(res.errors[0].message);
  return res.data;
}

// Every list entry points at a finished season, so walk the SEQUEL links to find what's airing or announced.
async function crawl() {
  const anime = await loadAnime();
  const from = new Map();
  for (const a of anime) if (a.id) from.set(a.id, a.title);
  const seen = new Set(from.keys());
  const found = [];
  let frontier = [...from.keys()];

  for (let depth = 0; frontier.length && depth < 8; depth++) {
    const chunks = [];
    for (let i = 0; i < frontier.length; i += 50) chunks.push(frontier.slice(i, i + 50));
    const pages = await Promise.all(chunks.map((ids) => gql(MEDIA_Q, { ids })));
    const next = [];

    for (const m of pages.flatMap((p) => p.Page.media)) {
      if (m.status === 'RELEASING' || m.status === 'NOT_YET_RELEASED') {
        found.push({
          id: m.id,
          title: m.title.english || m.title.romaji,
          cover: m.coverImage.large,
          color: m.coverImage.color,
          status: m.status,
          format: m.format,
          episodes: m.episodes,
          next: m.nextAiringEpisode,
          start: m.startDate,
          season: m.season,
          seasonYear: m.seasonYear,
          url: m.siteUrl,
          from: from.get(m.id),
          direct: depth === 0,
        });
      }
      for (const e of m.relations.edges) {
        const n = e.node;
        if (e.relationType !== 'SEQUEL' || n.type !== 'ANIME' || seen.has(n.id)) continue;
        if (n.format && !FORMATS.has(n.format)) continue;
        seen.add(n.id);
        from.set(n.id, from.get(m.id));
        next.push(n.id);
      }
    }
    frontier = next;
  }

  const airing = found.filter((m) => m.status === 'RELEASING').map((m) => m.id);
  let aired = [];
  if (airing.length) {
    const now = Math.floor(Date.now() / 1000);
    aired = (await gql(AIRED_Q, { ids: airing, from: now - 3 * 86400, to: now })).Page.airingSchedules;
  }
  return { at: Date.now(), media: found, aired };
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {}
}

const pad = (n) => String(n).padStart(2, '0');

function countdown(at) {
  const s = Math.round(at - Date.now() / 1000);
  if (s > 86400) {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${d}D ${pad(h)}H ${pad(m)}M`;
  }
  if (s > 0) return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  const ago = -s;
  if (ago < 1800) return 'AIRING NOW';
  if (ago < 3600) return `${Math.floor(ago / 60)}M AGO`;
  if (ago < 86400) return `${Math.floor(ago / 3600)}H AGO`;
  return `${Math.floor(ago / 86400)}D AGO`;
}

function dayOf(sec) {
  const d = new Date(sec * 1000);
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(new Date())) / 86400e3);
  if (diff === 0) return { label: 'Today', today: true };
  if (diff === 1) return { label: 'Tomorrow' };
  return { label: d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) };
}

const clock = (sec) => new Date(sec * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function when(m) {
  const s = m.start || {};
  if (s.year && s.month && s.day) return `${MONTHS[s.month - 1]} ${s.day}, ${s.year}`;
  if (s.year && s.month) return `${MONTHS[s.month - 1]} ${s.year}`;
  if (m.season && m.seasonYear) return `${m.season[0]}${m.season.slice(1).toLowerCase()} ${m.seasonYear}`;
  if (s.year) return String(s.year);
  return null;
}

function epCard({ m, at, ep, aired }) {
  const soon = !aired && at - Date.now() / 1000 < 86400;
  const done = aired ? ep : ep - 1;
  const pct = m.episodes ? Math.min(100, (done / m.episodes) * 100) : 0;
  const local = new Date(at * 1000).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return `
  <article class="scard card${soon ? ' soon' : ''}${aired ? ' aired' : ''}" data-reveal data-tilt="4" style="--tint:${esc(m.color || '#ff2d3f')}">
    <a class="scard-cover" href="${esc(m.url)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">
      <img src="${esc(m.cover)}" alt="" loading="lazy" decoding="async">
    </a>
    <div class="scard-body">
      <h4 class="scard-title"><a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a></h4>
      <p class="scard-from">${m.direct ? 'On my list' : `New season of ${esc(m.from)}`}</p>
      <div class="scard-row">
        ${aired ? '<span class="badge-new">NEW</span>' : ''}
        <span class="chip">EP ${ep}${m.episodes ? ` of ${m.episodes}` : ''}</span>
        <span class="chip">${esc(aired ? local : clock(at))}</span>
      </div>
      <div class="countdown"><b data-at="${at}">${countdown(at)}</b></div>
      ${m.episodes ? `<div class="progress" style="--p:${pct.toFixed(1)}%"><i></i></div>` : ''}
    </div>
  </article>`;
}

function upCard(m) {
  const w = when(m);
  return `
  <a class="ucard" href="${esc(m.url)}" target="_blank" rel="noopener" data-reveal data-tilt="7">
    <img src="${esc(m.cover)}" alt="" loading="lazy" decoding="async">
    ${FORMAT_LABEL[m.format] ? `<span class="ucard-format">${FORMAT_LABEL[m.format]}</span>` : ''}
    <span class="ucard-meta">
      <b>${esc(m.title)}</b>
      <span class="ucard-when${w ? '' : ' tba'}">${w || 'Date TBA'}</span>
    </span>
  </a>`;
}

function render(data) {
  const now = Date.now() / 1000;
  const byId = new Map(data.media.map((m) => [m.id, m]));

  const eps = [];
  const has = new Set();
  for (const r of data.aired) {
    const m = byId.get(r.mediaId);
    if (!m || has.has(m.id) || now - r.airingAt > 48 * 3600) continue;
    has.add(m.id);
    eps.push({ m, at: r.airingAt, ep: r.episode, aired: true });
  }
  for (const m of data.media) {
    if (!m.next) continue;
    const passed = m.next.airingAt <= now;
    if (passed && has.has(m.id)) continue;
    eps.push({ m, at: m.next.airingAt, ep: m.next.episode, aired: passed });
  }

  const justAired = eps.filter((e) => e.aired).sort((a, b) => b.at - a.at);
  const upcoming = eps.filter((e) => !e.aired).sort((a, b) => a.at - b.at);
  const scheduled = new Set(eps.map((e) => e.m.id));
  const announced = data.media
    .filter((m) => !scheduled.has(m.id))
    .sort((a, b) => {
      const ka = a.start?.year ? a.start.year * 10000 + (a.start.month || 12) * 100 + (a.start.day || 31) : Infinity;
      const kb = b.start?.year ? b.start.year * 10000 + (b.start.month || 12) * 100 + (b.start.day || 31) : Infinity;
      return ka - kb || a.title.localeCompare(b.title);
    });

  let html = '';

  if (justAired.length || upcoming.length) {
    html += `<section class="sched-block"><h3 class="sched-title" data-reveal>Airing now<small>${scheduled.size} show${scheduled.size === 1 ? '' : 's'}</small></h3>`;
    if (justAired.length) {
      html += `<p class="day today" data-reveal>Just aired</p><div class="slist">${justAired.map(epCard).join('')}</div>`;
    }
    let day = '';
    let group = [];
    const flush = () => group.length && (html += `<div class="slist">${group.map(epCard).join('')}</div>`);
    for (const e of upcoming) {
      const d = dayOf(e.at);
      if (d.label !== day) {
        flush();
        group = [];
        day = d.label;
        html += `<p class="day${d.today ? ' today' : ''}" data-reveal>${esc(d.label)}</p>`;
      }
      group.push(e);
    }
    flush();
    html += '</section>';
  }

  if (announced.length) {
    html += `
      <section class="sched-block">
        <h3 class="sched-title" data-reveal>Coming soon<small>${announced.length} announced</small></h3>
        <div class="upcoming">${announced.map(upCard).join('')}</div>
      </section>`;
  }

  if (!html) {
    html = `<div class="state"><p class="state-title">Nothing on the way</p><p class="state-sub">No new seasons of anything on my list are airing or announced right now.</p></div>`;
  }

  box.innerHTML = html;
  reveal(box);
}

function tick() {
  for (const b of box.querySelectorAll('[data-at]')) {
    const text = countdown(Number(b.dataset.at));
    if (b.textContent !== text) b.textContent = text;
  }
}

async function load(force) {
  if (loading) return;
  const cached = readCache();
  if (cached && !force) render(cached);
  if (cached && !force && Date.now() - cached.at < FRESH_FOR) return;

  loading = true;
  const btn = $('#schedRefresh', root);
  btn.classList.add('spinning');
  if (!cached) box.innerHTML = loader();
  try {
    const data = await crawl();
    writeCache(data);
    render(data);
  } catch (err) {
    if (!cached) {
      const limited = /429|too many/i.test(String(err.message));
      box.innerHTML = `
        <div class="state">
          <p class="state-title">${limited ? 'AniList says slow down' : "Couldn't reach AniList"}</p>
          <p class="state-sub">${limited ? 'Too many requests for a minute. Try again shortly.' : 'The schedule comes from AniList and it did not answer.'}</p>
          <button class="btn btn-ghost btn-sm" type="button" data-retry>Try again</button>
        </div>`;
    }
  } finally {
    loading = false;
    btn.classList.remove('spinning');
  }
}

export function init(el) {
  root = el;
  box = $('#sched', root);
  $('#schedRefresh', root).addEventListener('click', () => load(true));
  box.addEventListener('click', (e) => e.target.closest('[data-retry]') && load(true));
  load(false);
}

export function enter() {
  if (root && box.children.length) load(false);
  clearInterval(timer);
  timer = setInterval(tick, 1000);
}

export function leave() {
  clearInterval(timer);
}
