import { json, withCors } from '../lib/http.mjs';

const UNIVERSE = 9199655655;
const GROUP = 416091513;

const get = (url) =>
  fetch(url, { headers: { accept: 'application/json' } }).then((r) =>
    r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${url}`)),
  );

// Roblox's APIs don't allow browser calls from other sites, so the page asks this instead.
// The CDN keeps each answer for a minute, so traffic never multiplies Roblox calls.
export default withCors(async () => {
  const [game, votes, icon, thumbs] = await Promise.allSettled([
    get(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE}`),
    get(`https://games.roblox.com/v1/games/votes?universeIds=${UNIVERSE}`),
    get(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${UNIVERSE}&size=512x512&format=Webp`),
    get(
      `https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${UNIVERSE}&size=768x432&format=Webp&countPerUniverse=12`,
    ),
  ]);

  const g = game.status === 'fulfilled' && game.value.data?.[0];
  if (!g) return json({ error: 'roblox unavailable' }, 502, { 'netlify-cdn-cache-control': 'public, s-maxage=15' });

  const v = votes.status === 'fulfilled' ? votes.value.data?.[0] : null;
  const body = {
    name: g.name,
    description: g.description || '',
    playing: g.playing,
    visits: g.visits,
    favorites: g.favoritedCount,
    maxPlayers: g.maxPlayers,
    created: g.created,
    updated: g.updated,
    genre: g.genre_l2 || g.genre_l1 || g.genre,
    upVotes: v?.upVotes ?? null,
    downVotes: v?.downVotes ?? null,
    playUrl: `https://www.roblox.com${g.canonicalUrlPath || `/games/${g.rootPlaceId}`}`,
    groupUrl: `https://www.roblox.com/communities/${GROUP}`,
    icon: icon.status === 'fulfilled' ? icon.value.data?.[0]?.imageUrl || null : null,
    thumbs:
      thumbs.status === 'fulfilled'
        ? (thumbs.value.data?.[0]?.thumbnails || []).filter((t) => t.state === 'Completed').map((t) => t.imageUrl)
        : [],
    at: Date.now(),
  };

  return json(body, 200, {
    'cache-control': 'public, max-age=30',
    'netlify-cdn-cache-control': 'public, durable, s-maxage=60, stale-while-revalidate=600',
  });
});

export const config = { path: '/api/gakuran' };
