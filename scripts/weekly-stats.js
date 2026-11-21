// NightLight stats refresh in one command:
//
//   npm run weekly-stats                 Quick mode (~5 sec, 4 requests): updates all perk
//                                        rankings, perk stats, and build rating scores while
//                                        keeping existing per-killer top perks/builds intact.
//   npm run weekly-stats -- --killers    Killer mode (~70 sec): also refreshes every killer's
//                                        top perks (for killer-specific scores) and top builds.
//   npm run weekly-stats -- --full       Full mode (~2.5 min): every killer + survivor page.
//   npm run weekly-stats -- --bookmarklet  Prints a 1-click browser bookmarklet for `npm run dev`.
//
// Options:
//   --no-publish        import only, do not commit/push
//   --no-open           do not copy/open anything; only wait for the export
//   --downloads <dir>   fallback folder where the browser saves files (default ~/Downloads)
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { importStats, importStatsObject } from '../server/nightlight.js';

const args = process.argv.slice(2);
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const mode = args.includes('--full') ? 'full' : args.includes('--killers') ? 'killers' : 'quick';
const downloads = opt('--downloads') ?? path.join(os.homedir(), 'Downloads');
const publish = !args.includes('--no-publish');
const noOpen = args.includes('--no-open');
const root = new URL('..', import.meta.url);
const collectorSource = fs.readFileSync(new URL('scripts/nightlight-collector.js', root), 'utf8');
const VIEWER = 'https://nightlight.gg/perks/viewer';
const TIMEOUT_MIN = 20;

if (args.includes('--bookmarklet')) {
  const apiUrl = opt('--url') ?? 'http://localhost:3001/api/import-stats';
  const stripped = collectorSource
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  const payload = `javascript:void((function(){window.__DBD_COLLECTOR__=${JSON.stringify({ mode, receiverUrl: apiUrl })};${stripped}})())`;
  console.log(`\nBookmarklet (mode: ${mode} -> ${apiUrl}):\nCreate a browser bookmark and paste this as its URL. Then click it on https://nightlight.gg/perks/viewer while "npm run dev" runs:\n`);
  console.log(payload);
  process.exit(0);
}

function copyToClipboard(text) {
  const cmd =
    process.platform === 'win32'
      ? ['clip', []]
      : process.platform === 'darwin'
      ? ['pbcopy', []]
      : ['xclip', ['-selection', 'clipboard']];
  execFileSync(cmd[0], cmd[1], { input: text });
}

function openUrl(url) {
  const [cmd, a] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
  spawn(cmd, a, { detached: true, stdio: 'ignore' }).unref();
}

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

function publishChanges() {
  if (git('status', '--porcelain', '--', 'data/nightlight.json') === '') {
    console.log('Nothing to publish: data/nightlight.json did not change.');
    return;
  }
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  git('add', '--', 'data/nightlight.json');
  git('commit', '-m', `Update NightLight stats (${mode}, ${new Date().toISOString().slice(0, 10)})`, '--', 'data/nightlight.json');
  console.log(`Committed data/nightlight.json on ${branch}; pushing...`);
  git('push', 'origin', branch);
  console.log('Pushed. Cloudflare Pages rebuilds the site in a few minutes.');
}

// Temporary local HTTP receiver so the browser collector can POST directly (no Downloads polling needed).
const token = crypto.randomBytes(16).toString('hex');
let resolveDirect;
const directPromise = new Promise((r) => {
  resolveDirect = r;
});

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://nightlight.gg');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Import-Token');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === 'POST' && req.url === '/import') {
    if (req.headers['x-import-token'] !== token) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid token' }));
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        resolveDirect({ kind: 'direct', payload: json });
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const receiverUrl = `http://127.0.0.1:${port}/import`;
const configuredCollector = `window.__DBD_COLLECTOR__ = ${JSON.stringify({ mode, receiverUrl, token })};\n${collectorSource}`;

const listExports = () =>
  fs.existsSync(downloads)
    ? fs.readdirSync(downloads).filter((f) => /^nightlight-export-.*\.json$/.test(f)).map((f) => path.join(downloads, f))
    : [];
const startedAt = Date.now();
const seen = new Set(listExports().filter((f) => fs.statSync(f).mtimeMs < startedAt));

const eta = mode === 'quick' ? '~5 seconds' : mode === 'killers' ? '~70 seconds' : '~2.5 minutes';
if (noOpen) {
  console.log(`Waiting for NightLight export (${mode}) on ${receiverUrl} or in ${downloads} ...`);
} else {
  copyToClipboard(configuredCollector);
  openUrl(VIEWER);
  console.log(`Collector (${mode}, ${eta}) is on your clipboard and ${VIEWER} is opening.
In that tab: press F12 → Console → Ctrl+V → Enter.
It sends directly back here (no file save needed), with fallback to ${downloads}.`);
}

let pollTimer;
const filePromise = new Promise((resolve, reject) => {
  pollTimer = setInterval(() => {
    const fresh = listExports().find((f) => !seen.has(f) && fs.statSync(f).mtimeMs >= startedAt && fs.statSync(f).size > 0);
    if (fresh) {
      clearInterval(pollTimer);
      setTimeout(() => resolve({ kind: 'file', file: fresh }), 1500);
    } else if (Date.now() - startedAt > TIMEOUT_MIN * 60_000) {
      clearInterval(pollTimer);
      reject(new Error(`No export arrived within ${TIMEOUT_MIN} minutes.`));
    }
  }, 2000);
});

let result;
try {
  result = await Promise.race([directPromise, filePromise]);
} catch (err) {
  clearInterval(pollTimer);
  server.close();
  console.error(err.message);
  process.exit(1);
}
clearInterval(pollTimer);
server.close();

try {
  const summary =
    result.kind === 'direct'
      ? await importStatsObject(result.payload)
      : await importStats(result.file);
  console.log('Import summary:', JSON.stringify(summary));
  if (publish) publishChanges();
} catch (err) {
  console.error('Import failed:', err.message);
  process.exit(1);
}

for (const script of ['scripts/check-builds.js', 'scripts/check-data-health.js']) {
  if (!fs.existsSync(new URL(script, root))) continue;
  try {
    execFileSync(process.execPath, [script], { cwd: root, stdio: 'inherit' });
  } catch {
    console.log(`${script} reported items to review (see above); stats were imported anyway.`);
  }
}
