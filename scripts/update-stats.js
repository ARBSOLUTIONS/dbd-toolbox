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
// NightLight's bot protection blocks scripts, so this project never downloads
// from NightLight itself. See the README.
import { importStats, importPerkText } from '../server/nightlight.js';

const args = process.argv.slice(2);
const valuesOf = (flag) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const file = valuesOf('--file')[0];
const perkTexts = valuesOf('--perks-text');
if (!file && !perkTexts.length) {
  console.error(
    'Usage:\n' +
      '  npm run update-stats -- --file <nightlight-export.json>\n' +
      '  npm run update-stats -- --perks-text <survivor.txt> --perks-text <killer.txt>\n' +
      'See the README for how to make these files.',
  );
  process.exit(1);
}

try {
  if (file) console.log(JSON.stringify(await importStats(file)));
  if (perkTexts.length) console.log(JSON.stringify(await importPerkText(perkTexts)));
} catch (err) {
  console.error('Stats import failed:', err.message);
  process.exit(1);
}
