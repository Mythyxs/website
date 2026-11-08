import { getStore } from '@netlify/blobs';
import { json, ipKey, withCors } from '../lib/http.mjs';

const LIST_URL = 'https://raw.githubusercontent.com/Mythyxs/website/refs/heads/main/anime_backup.json';
const LEGACY_URL = 'https://api.npoint.io/66b6e148c5fa0574e5f7';
const VOTER = /^[A-Za-z0-9-]{8,64}$/;
const KINDS = ['like', 'dislike'];
const RATE_WINDOW = 10 * 60e3;
const RATE_MAX = 60;

// Every vote is its own key (v/<title>/<kind>/<voter>), so two people voting at once
// never overwrite each other. Totals = boost + the old npoint tallies + a count of these keys.
const enc = (s) => Buffer.from(s, 'utf8').toString('base64url');
const dec = (s) => Buffer.from(s, 'base64url').toString('utf8');
const voteKey = (title, kind, voter) => `v/${enc(title)}/${kind}/${voter}`;

let ratings;
let ratingsAt = 0;

async function loadRatings() {
  if (ratings && Date.now() - ratingsAt < 5 * 60e3) return ratings;
  const res = await fetch(LIST_URL);
  if (!res.ok) {
    if (ratings) return ratings;
    throw new Error(`anime list: ${res.status}`);
  }
  ratings = new Map((await res.json()).map((a) => [a.title, Number(a.rating) || 0]));
  ratingsAt = Date.now();
  return ratings;
}

// Seeded from the title, so a show's base never changes between requests. Better rated
// shows draw more likes; lower rated ones draw a bigger share of dislikes.
function boost(title, rating) {
  let h = 2166136261;
  for (let i = 0; i < title.length; i++) h = Math.imul(h ^ title.charCodeAt(i), 16777619);
  const rand = () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

  if (!rating) return { likes: 150 + Math.floor(rand() * 200), dislikes: 3 + Math.floor(rand() * 20) };
  const likes = Math.max(120, Math.round(4.66 * Math.exp(0.653 * rating) * Math.exp(gauss() * 0.35)));
  const share = (0.025 + (10 - rating) * 0.045) * Math.exp(gauss() * 0.5);
  return { likes, dislikes: Math.max(4, Math.round(likes * share)) };
}

// Ratings shift a little with every phone update, so each show's boost is worked out once and
// saved. A planned show (no rating yet) gets redone once, when it's first rated.
async function boosts(store, list) {
  const saved = (await store.get('boost', { type: 'json' })) || {};
  let changed = false;
  for (const [title, rating] of list) {
    if (saved[title] && (saved[title].rated || !rating)) continue;
    saved[title] = { ...boost(title, rating), rated: rating > 0 };
    changed = true;
  }
  if (changed) await store.setJSON('boost', saved);
  return saved;
}

// The old bin still reads fine; its votes are anonymous, so they stay as a fixed base.
async function legacy(store) {
  const hit = await store.get('legacy', { type: 'json' });
  if (hit) return hit;
  const counts = {};
  try {
    const res = await fetch(LEGACY_URL);
    for (const row of (await res.json()).data || []) {
      counts[row.title] = { likes: row.likes | 0, dislikes: row.dislikes | 0 };
    }
  } catch {
    return {};
  }
  await store.setJSON('legacy', counts, { onlyIfNew: true });
  return counts;
}

function base(title, saved, old) {
  const b = saved[title] || { likes: 0, dislikes: 0 };
  return { likes: b.likes + (old[title]?.likes || 0), dislikes: b.dislikes + (old[title]?.dislikes || 0) };
}

function parse(key) {
  const [, t, kind, voter] = key.split('/');
  return { title: dec(t), kind, voter };
}

async function underLimit(store, ip) {
  const key = `rate/${ipKey(ip)}`;
  const now = Date.now();
  const r = (await store.get(key, { type: 'json' })) || { t: now, n: 0 };
  if (now - r.t > RATE_WINDOW) {
    r.t = now;
    r.n = 0;
  }
  r.n++;
  await store.setJSON(key, r);
  return r.n <= RATE_MAX;
}

export default withCors(async (req, context) => {
  const store = getStore({ name: 'votes', consistency: 'strong' });

  if (req.method === 'GET') {
    const me = new URL(req.url).searchParams.get('voter') || '';
    const [list, old, { blobs }] = await Promise.all([loadRatings(), legacy(store), store.list({ prefix: 'v/' })]);
    const saved = await boosts(store, list);
    const counts = {};
    for (const title of list.keys()) counts[title] = base(title, saved, old);
    const mine = {};
    for (const { key } of blobs) {
      const v = parse(key);
      if (!counts[v.title]) continue;
      counts[v.title][`${v.kind}s`]++;
      if (v.voter === me) mine[v.title] = v.kind;
    }
    return json({ counts, mine });
  }

  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }

  const { voter, title } = body || {};
  const vote = body?.vote ?? null;
  if (!VOTER.test(voter || '') || typeof title !== 'string' || (vote !== null && !KINDS.includes(vote))) {
    return json({ error: 'bad request' }, 400);
  }
  const list = await loadRatings();
  if (!list.has(title)) return json({ error: 'unknown title' }, 404);
  if (!(await underLimit(store, context.ip))) return json({ error: 'too many votes, slow down' }, 429);

  await Promise.all(KINDS.filter((k) => k !== vote).map((k) => store.delete(voteKey(title, k, voter))));
  if (vote) await store.set(voteKey(title, vote, voter), '1');

  const [old, saved, { blobs }] = await Promise.all([legacy(store), boosts(store, list), store.list({ prefix: `v/${enc(title)}/` })]);
  let { likes, dislikes } = base(title, saved, old);
  for (const { key } of blobs) {
    const v = parse(key);
    // This voter's own state is known exactly; don't trust a listing that may lag behind the write.
    if (v.voter === voter) continue;
    if (v.kind === 'like') likes++;
    else dislikes++;
  }
  if (vote === 'like') likes++;
  if (vote === 'dislike') dislikes++;

  return json({ title, likes, dislikes, mine: vote });
});

export const config = { path: '/api/votes' };
