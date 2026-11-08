// The phone app commits this file straight to GitHub, so the page reads it from there (no redeploy needed).
export const ANIME_URL = 'https://raw.githubusercontent.com/Mythyxs/website/refs/heads/main/anime_backup.json';

export const CATS = [
  { name: 'Platinum Masterpiece', short: 'Platinum', color: 'var(--cat-platinum)' },
  { name: 'Overaveragely Enjoyable', short: 'Over Average', color: 'var(--cat-over)' },
  { name: 'Average Enjoyability', short: 'Average', color: 'var(--cat-average)' },
  { name: 'Unfinished / Disinterested', short: 'Unfinished', color: 'var(--cat-unfinished)' },
  { name: 'Planned to Watch', short: 'Planned', color: 'var(--cat-planned)' },
];

export const catOf = (name) => CATS.find((c) => c.name === name) || { name, short: name, color: '#9a9aa3' };

export async function fetchJSON(url, { timeout = 15000, ...opts } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalize(raw) {
  return raw
    .filter((a) => a && a.title)
    .map((a) => {
      const cover = a.coverImageUrl || '';
      const id = /\/[a-z]*(\d+)-[^/]*$/.exec(cover);
      return {
        title: a.title,
        category: a.category || 'Unsorted',
        note: a.note || '',
        rating: Number(a.rating) || 0,
        watched: a.watchedEpisodes ?? null,
        total: a.totalEpisodes ?? null,
        cover: cover.replace('/cover/small/', '/cover/medium/'),
        id: id ? Number(id[1]) : null,
      };
    });
}

let animeReq;

export function loadAnime() {
  animeReq ??= fetchJSON(ANIME_URL)
    .then(normalize)
    .catch((e) => {
      animeReq = null;
      throw e;
    });
  return animeReq;
}

export const anilistUrl = (a) => (a.id ? `https://anilist.co/anime/${a.id}` : `https://anilist.co/search/anime?search=${encodeURIComponent(a.title)}`);

/* site functions (votes, visits, gakuran) */

const LIVE = 'https://shemxz.com';
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

// A plain local preview (VS Code Live Preview) has no functions, so it borrows the live site's.
async function api(path, opts) {
  try {
    return await fetchJSON(path, opts);
  } catch (e) {
    if (!isLocal || (e.status && ![404, 405, 501].includes(e.status))) throw e;
    return fetchJSON(LIVE + path, opts);
  }
}

/* votes */

let sessionVoter;

function voterId() {
  try {
    let id = localStorage.getItem('voter-id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('voter-id', id);
    }
    return id;
  } catch {
    sessionVoter ??= `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return sessionVoter;
  }
}

export const getVotes = () => api(`/api/votes?voter=${encodeURIComponent(voterId())}`);

export const sendVote = (title, vote) =>
  api('/api/votes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ voter: voterId(), title, vote }),
  });

/* visitor counter: counted once per browser session */

export function countVisit() {
  let counted = false;
  try {
    counted = sessionStorage.getItem('visit-counted') === '1';
  } catch {}
  const req = api('/api/visits', counted ? {} : { method: 'POST' });
  if (!counted) {
    req.then(
      () => {
        try {
          sessionStorage.setItem('visit-counted', '1');
        } catch {}
      },
      () => {},
    );
  }
  return req;
}

/* gakuran live stats (cached server side for a minute) */

const UNIVERSE = 9199655655;

// roproxy is a public Roblox mirror that browsers may call. It has no like/dislike counts,
// so the rating shows N/A when this fallback is in use.
async function fromRoproxy() {
  const [games, thumbs] = await Promise.all([
    fetchJSON(`https://games.roproxy.com/v1/games?universeIds=${UNIVERSE}`),
    fetchJSON(`https://thumbnails.roproxy.com/v1/games/multiget/thumbnails?universeIds=${UNIVERSE}&size=768x432&format=Webp&countPerUniverse=12`).catch(() => null),
  ]);
  const g = games.data[0];
  return {
    name: g.name,
    description: g.description || '',
    playing: g.playing,
    visits: g.visits,
    favorites: g.favoritedCount,
    maxPlayers: g.maxPlayers,
    created: g.created,
    updated: g.updated,
    genre: g.genre_l2 || g.genre_l1 || g.genre,
    upVotes: null,
    downVotes: null,
    playUrl: `https://www.roblox.com${g.canonicalUrlPath || `/games/${g.rootPlaceId}`}`,
    groupUrl: 'https://www.roblox.com/communities/416091513',
    thumbs: (thumbs?.data?.[0]?.thumbnails || []).filter((t) => t.state === 'Completed').map((t) => t.imageUrl),
  };
}

let gkReq;
let gkAt = 0;

export function loadGakuran(maxAge = 55e3) {
  if (!gkReq || Date.now() - gkAt > maxAge) {
    gkAt = Date.now();
    gkReq = api('/api/gakuran')
      .catch(fromRoproxy)
      .catch((e) => {
        gkReq = null;
        throw e;
      });
  }
  return gkReq;
}
