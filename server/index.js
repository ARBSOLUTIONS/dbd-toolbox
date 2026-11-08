// Small local web server.
// - Serves the saved data (data/*.json) and icons to the React app.
// - Lets the "Refresh data" button start a refresh and follow its progress.
// - Checks the wiki for new patches automatically (see autoUpdate.js).
// - In production (npm start) it also serves the built app from dist/.
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, ICON_DIR } from './refresh.js';
import { refresh, startRefresh, startAutoUpdate, autoUpdateStatus, checkForUpdate } from './autoUpdate.js';
import { listBuilds, createBuild, voteBuild, reportBuild, indexGameData, visitorHash, CommunityError } from './community/core.js';
import { jsonStore } from './community/stores.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// API_PORT (not PORT) so it never clashes with tools that set PORT for the web app.
const PORT = Number(process.env.API_PORT) || 3001;
const app = express();

async function readJsonFrom(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}
const readJson = (name, fallback) => readJsonFrom(path.join(DATA_DIR, name), fallback);

app.get('/api/data', async (_req, res) => {
  res.json({
    meta: await readJson('meta.json', null),
    perks: await readJson('perks.json', []),
    killers: await readJson('killers.json', []),
    survivors: await readJson('survivors.json', []),
    items: await readJson('items.json', []),
    addons: await readJson('addons.json', []),
    offerings: await readJson('offerings.json', []),
    changes: await readJson('changes.json', null),
    stats: await readJson('nightlight.json', null),
    patchNotes: await readJson('patch-notes.json', []),
    patchHistory: await readJson('patch-history.json', []),
    // Hand-picked builds live outside data/ so a refresh never overwrites them.
    curated: await readJsonFrom(path.join(ROOT, 'builds', 'builds.json'), { builds: [] }),
  });
});

// --- Refresh (only one at a time) ---
app.post('/api/refresh', (_req, res) => {
  if (!startRefresh('manual')) return res.status(409).json({ error: 'A refresh is already running.' });
  res.status(202).json({ started: true });
});

app.get('/api/refresh', (_req, res) => res.json(refresh));

// --- Automatic updates ---
app.get('/api/auto-update', async (_req, res) => res.json(await autoUpdateStatus()));
app.post('/api/auto-update/check', async (_req, res) => res.json(await checkForUpdate({ force: true })));

// --- Community builds (local test version; the live site uses Cloudflare D1) ---
// Same rules as the live site (server/community/core.js); data in data/community-local.json.
const communityStore = jsonStore(path.join(DATA_DIR, 'community-local.json'), fs);
app.use('/api/community', express.json({ limit: '20kb' }));
const community = (handler) => async (req, res) => {
  try {
    const voter = await visitorHash(req.headers['x-test-voter'] || req.ip, 'local-dev');
    const game = indexGameData({
      perks: await readJson('perks.json', []),
      killers: await readJson('killers.json', []),
      items: await readJson('items.json', []),
      addons: await readJson('addons.json', []),
      offerings: await readJson('offerings.json', []),
    });
    res.json(await handler(req, { voter, game }));
  } catch (err) {
    if (err instanceof CommunityError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};
app.get('/api/community/builds', community((req, ctx) =>
  listBuilds(communityStore, { role: req.query.role, killer: req.query.killer, sort: req.query.sort, voter: ctx.voter }).then((builds) => ({ builds })),
));
app.post('/api/community/builds', community(async (req, ctx) => ({ build: await createBuild(communityStore, req.body, ctx) })));
app.post('/api/community/builds/:id/vote', community((req, ctx) => voteBuild(communityStore, req.params.id, req.body?.value, ctx)));
app.post('/api/community/builds/:id/report', community((req, ctx) => reportBuild(communityStore, req.params.id, ctx)));

app.use('/icons', express.static(ICON_DIR, { maxAge: '7d' }));

// Production: serve the built React app.
const dist = path.join(ROOT, 'dist');
app.use(express.static(dist));
app.get(/^\/(?!api|icons).*/, (_req, res, next) =>
  res.sendFile(path.join(dist, 'index.html'), (err) => err && next()),
);

app.listen(PORT, () => {
  console.log(`DBD Build Helper server running on http://localhost:${PORT}`);
  startAutoUpdate();
});
