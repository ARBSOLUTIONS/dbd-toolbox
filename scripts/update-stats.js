// Run with:  npm run update-stats -- --file nightlight-export-<date>.json
// Imports NightLight community stats into data/nightlight.json.
//
// Make the file first with scripts/nightlight-collector.js, which runs in your
// own browser on nightlight.gg (NightLight's bot protection blocks scripts, so
// this project never downloads from NightLight itself). See the README.
import { importStats } from '../server/nightlight.js';

const args = process.argv.slice(2);
const file = args[args.indexOf('--file') + 1];
if (!args.includes('--file') || !file) {
  console.error(
    'Usage: npm run update-stats -- --file <nightlight-export.json>\n' +
      'Create the file with scripts/nightlight-collector.js in your browser (see README).',
  );
  process.exit(1);
}

try {
  console.log(JSON.stringify(await importStats(file)));
} catch (err) {
  console.error('Stats import failed:', err.message);
  process.exit(1);
}
