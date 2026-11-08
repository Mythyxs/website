import { createHash } from 'node:crypto';

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

// Lets a local preview (VS Code Live Preview, any localhost port) use the live functions.
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function withCors(handler) {
  return async (req, context) => {
    const origin = req.headers.get('origin') || '';
    // Always vary by origin so the CDN never hands a cached copy without these headers to a preview.
    const allow = { vary: 'origin', 'netlify-vary': 'header=Origin' };
    if (LOCAL.test(origin)) {
      allow['access-control-allow-origin'] = origin;
      allow['access-control-allow-methods'] = 'GET, POST, OPTIONS';
      allow['access-control-allow-headers'] = 'content-type';
    }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: allow });
    const res = await handler(req, context);
    for (const [k, v] of Object.entries(allow)) res.headers.set(k, v);
    return res;
  };
}

// Visitor IPs are only ever stored hashed.
export function ipKey(ip) {
  const salt = process.env.IP_SALT || 'shemxz-votes';
  return createHash('sha256').update(`${salt}:${ip || 'unknown'}`).digest('hex').slice(0, 24);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Read-modify-write on one blob key, retried until nobody else wrote in between.
export async function update(store, key, fn, seed) {
  for (let i = 0; i < 8; i++) {
    let hit = await store.getWithMetadata(key, { type: 'json' });
    if (!hit) {
      await store.setJSON(key, await seed(), { onlyIfNew: true });
      hit = await store.getWithMetadata(key, { type: 'json' });
    }
    const next = fn(hit.data);
    // Netlify returns an etag on reads; the local dev emulator doesn't, so there it's a plain write.
    const { modified } = await store.setJSON(key, next, hit.etag ? { onlyIfMatch: hit.etag } : {});
    if (modified) return next;
    await sleep(15 + Math.random() * 40 * (i + 1));
  }
  throw new Error(`busy: ${key}`);
}
