// Run with:  npm run update-stats                     (skips when the stats are < 24 h old)
//            npm run update-stats -- --force          (fetch now)
//            npm run update-stats -- --file stats.json (import a file saved in your browser from
//                                                       https://nightlight.gg/api/v1/stats/global/killers)
// Saves killer pick/kill rates from NightLight into data/killer-stats.json.
import { updateKillerStats } from '../server/nightlight.js';

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
const file = fileIndex >= 0 ? args[fileIndex + 1] : null;
if (fileIndex >= 0 && !file) {
  console.error('Usage: npm run update-stats -- --file <saved NightLight JSON>');
  process.exit(1);
}

try {
  const result = await updateKillerStats({ force: args.includes('--force'), file });
  console.log(JSON.stringify(result));
} catch (err) {
  console.error('Stats update failed:', err.message);
  process.exit(1);
}
