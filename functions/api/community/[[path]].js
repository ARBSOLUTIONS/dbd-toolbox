// Community builds API on the live site (Cloudflare Pages Function + D1 database).
//
//   GET  /api/community/builds?role=&killer=&sort=top|new   list builds (with your own vote)
//   POST /api/community/builds                               share a build
//   POST /api/community/builds/:id/vote   { value: 1|-1|0 }  thumbs up / down / remove
//   POST /api/community/builds/:id/report                    report a build
//
// Needs a D1 binding called DB (see wrangler.toml). The rules live in server/community/core.js.
import {
  listBuilds,
  createBuild,
  voteBuild,
  reportBuild,
  indexGameData,
  visitorHash,
  CommunityError,
} from '../../../server/community/core.js';
import { d1Store } from '../../../server/community/stores.js';

let gameIndex = null; // cached per worker instance

async function loadGame(context) {
  if (gameIndex) return gameIndex;
  const res = await context.env.ASSETS.fetch(new URL('/data/app-data.json', context.request.url));
  gameIndex = indexGameData(await res.json());
  return gameIndex;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.DB) return json({ error: 'Community builds are not set up yet (no database).' }, 503);

  const path = Array.isArray(params.path) ? params.path : [];
  const url = new URL(request.url);
  const store = d1Store(env.DB);
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const voter = await visitorHash(ip, env.COMMUNITY_SALT || 'dbd-toolbox');

  // Only accept writes from our own pages (simple protection against other sites voting for you).
  if (request.method === 'POST') {
    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).host !== url.host) return json({ error: 'Forbidden' }, 403);
  }

  try {
    if (path[0] !== 'builds') return json({ error: 'Not found' }, 404);

    if (path.length === 1 && request.method === 'GET') {
      const builds = await listBuilds(store, {
        role: url.searchParams.get('role'),
        killer: url.searchParams.get('killer'),
        sort: url.searchParams.get('sort') === 'new' ? 'new' : 'top',
        voter,
      });
      return json({ builds });
    }
    if (path.length === 1 && request.method === 'POST') {
      const body = await request.json().catch(() => null);
      return json({ build: await createBuild(store, body, { game: await loadGame(context), voter }) }, 201);
    }
    if (path.length === 3 && path[2] === 'vote' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return json(await voteBuild(store, path[1], body.value, { voter }));
    }
    if (path.length === 3 && path[2] === 'report' && request.method === 'POST') {
      return json(await reportBuild(store, path[1], { voter }));
    }
    return json({ error: 'Not found' }, 404);
  } catch (err) {
    if (err instanceof CommunityError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Something went wrong.' }, 500);
  }
}
