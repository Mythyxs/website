import { getStore } from '@netlify/blobs';
import { json, ipKey, update, withCors } from '../lib/http.mjs';

// Where the counter starts on the new site; real visits count up from here.
const START = 252387;
// One visit per network per 10 minutes, so refreshing doesn't pump the number.
const COOLDOWN = 10 * 60e3;

const seed = () => ({ count: START });

async function read(store) {
  const hit = await store.get('total', { type: 'json' });
  if (hit) return Math.max(hit.count, START);
  await store.setJSON('total', seed(), { onlyIfNew: true });
  return Math.max((await store.get('total', { type: 'json' })).count, START);
}

export default withCors(async (req, context) => {
  const store = getStore({ name: 'visits', consistency: 'strong' });

  if (req.method === 'GET') return json({ count: await read(store) });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const seenKey = `seen/${ipKey(context.ip)}`;
  const seen = await store.get(seenKey, { type: 'json' });
  if (seen && Date.now() - seen.t < COOLDOWN) return json({ count: await read(store) });

  await store.setJSON(seenKey, { t: Date.now() });
  const total = await update(store, 'total', (v) => ({ count: Math.max(v.count, START) + 1 }), seed);
  return json({ count: total.count });
});

export const config = { path: '/api/visits' };
