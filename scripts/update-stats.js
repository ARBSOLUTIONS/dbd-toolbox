// Imports NightLight community stats into data/nightlight.json.
//
//   npm run update-stats -- --file nightlight-export-<date>.json
//       Everything, from scripts/nightlight-collector.js (runs in your browser).
//
//   npm run update-stats -- --perks-text survivor-perks.txt --perks-text killer-perks.txt
//       Only the perk stats: open https://nightlight.gg/perks/viewer, choose
//       Survivor Perks (then Killer Perks), select all (Ctrl + A), copy, and
//       save each as a .txt file.
//
//   Add --publish to also commit data/nightlight.json and push it. Cloudflare
//   Pages then rebuilds the public site, so the perk ranking, perk stats and
//   build scores update live within a few minutes.
//
// NightLight's bot protection blocks scripts, so this project never downloads
// from NightLight itself. See the README.
import { execFileSync } from 'node:child_process';
import { importStats, importPerkText } from '../server/nightlight.js';

const args = process.argv.slice(2);
const valuesOf = (flag) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const file = valuesOf('--file')[0];
const perkTexts = valuesOf('--perks-text');
if (!file && !perkTexts.length) {
  console.error(
    'Usage:\n' +
      '  npm run update-stats -- --file <nightlight-export.json> [--publish]\n' +
      '  npm run update-stats -- --perks-text <survivor.txt> --perks-text <killer.txt> [--publish]\n' +
      'See the README for how to make these files.',
  );
  process.exit(1);
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

/** Commits only data/nightlight.json and pushes the current branch. */
function publish() {
  if (git('status', '--porcelain', '--', 'data/nightlight.json') === '') {
    console.log('Nothing to publish: data/nightlight.json did not change.');
    return;
  }
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  git('add', '--', 'data/nightlight.json');
  git('commit', '-m', `Update NightLight stats (${new Date().toISOString().slice(0, 10)})`, '--', 'data/nightlight.json');
  console.log(`Committed data/nightlight.json on ${branch}; pushing...`);
  git('push', 'origin', branch);
  console.log('Pushed. Cloudflare Pages rebuilds the site in a few minutes.');
}

try {
  if (file) console.log(JSON.stringify(await importStats(file)));
  if (perkTexts.length) console.log(JSON.stringify(await importPerkText(perkTexts)));
  if (args.includes('--publish')) publish();
} catch (err) {
  console.error('Stats update failed:', err.message);
  process.exit(1);
}
