// Weekly NightLight refresh in one command:  npm run weekly-stats
//
// NightLight's bot protection blocks scripts, so the collector still runs in
// YOUR browser (see scripts/nightlight-collector.js). This script does the rest:
//   1. copies the collector to the clipboard,
//   2. opens https://nightlight.gg/perks/viewer in your default browser,
//   3. waits for nightlight-export-<date>.json to appear in your Downloads,
//   4. imports it (perk stats, killer/survivor stats and their top builds, which
//      the build generator turns into "most played" meta builds),
//   5. commits data/nightlight.json and pushes, so Cloudflare rebuilds the site.
// You only press F12, paste (Ctrl + V) in the Console and press Enter.
//
// Options:  --no-publish   import only, do not commit/push
//           --no-open      do not copy/open anything; only wait for the export
//                          (used when an agent runs the collector in Chrome)
//           --downloads <dir>   where your browser saves files (default ~/Downloads)
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const downloads = opt('--downloads') ?? path.join(os.homedir(), 'Downloads');
const publish = !args.includes('--no-publish');
const noOpen = args.includes('--no-open');
const root = new URL('..', import.meta.url);
const collector = fs.readFileSync(new URL('scripts/nightlight-collector.js', root), 'utf8');
const VIEWER = 'https://nightlight.gg/perks/viewer';
const TIMEOUT_MIN = 20;

function copyToClipboard(text) {
  const cmd = process.platform === 'win32' ? ['clip', []] : process.platform === 'darwin' ? ['pbcopy', []] : ['xclip', ['-selection', 'clipboard']];
  execFileSync(cmd[0], cmd[1], { input: text });
}

function openUrl(url) {
  const [cmd, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
  spawn(cmd, a, { detached: true, stdio: 'ignore' }).unref();
}

const exports = () =>
  fs.existsSync(downloads)
    ? fs.readdirSync(downloads).filter((f) => /^nightlight-export-.*\.json$/.test(f)).map((f) => path.join(downloads, f))
    : [];

const startedAt = Date.now();
const seen = new Set(exports().filter((f) => fs.statSync(f).mtimeMs < startedAt));

if (noOpen) {
  console.log(`Waiting for nightlight-export-*.json in ${downloads} ...`);
} else {
copyToClipboard(collector);
openUrl(VIEWER);
console.log(`The collector is on your clipboard and ${VIEWER} is opening.
In that tab: press F12, open Console, paste (Ctrl + V; Chrome may ask you to type "allow pasting") and press Enter.
It takes about 3 minutes. Waiting for nightlight-export-*.json in ${downloads} ...`);
}

const file = await new Promise((resolve, reject) => {
  const timer = setInterval(() => {
    const fresh = exports().find((f) => !seen.has(f) && fs.statSync(f).mtimeMs >= startedAt && fs.statSync(f).size > 0);
    if (fresh) {
      clearInterval(timer);
      setTimeout(() => resolve(fresh), 1500); // let the browser finish writing
    } else if (Date.now() - startedAt > TIMEOUT_MIN * 60_000) {
      clearInterval(timer);
      reject(new Error(`No export appeared in ${downloads} within ${TIMEOUT_MIN} minutes. Run again, or import by hand: npm run update-stats -- --file <file>`));
    }
  }, 2000);
}).catch((err) => {
  console.error(err.message);
  process.exit(1);
});

console.log(`Found ${path.basename(file)}. Importing...`);
const updateArgs = ['scripts/update-stats.js', '--file', file, ...(publish ? ['--publish'] : [])];
try {
  execFileSync(process.execPath, updateArgs, { cwd: root, stdio: 'inherit' });
} catch {
  process.exit(1);
}
// Report only: flags hand-picked builds whose perks now win clearly less often.
try {
  execFileSync(process.execPath, ['scripts/check-builds.js'], { cwd: root, stdio: 'inherit' });
} catch {
  console.log('check-builds reported problems (see above); the stats were imported anyway.');
}
