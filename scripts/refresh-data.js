// Run with:  npm run refresh-data
// Fetches fresh data from the Dead by Daylight Wiki into data/.
//
// Add --if-new-patch to only refresh when the wiki shows a new patch
// (one small request otherwise). Handy for Windows Task Scheduler:
//   npm run refresh-data -- --if-new-patch
import { refreshData, fetchLivePatch, readCurrentData } from '../server/refresh.js';

async function main() {
  if (process.argv.includes('--if-new-patch')) {
    const [{ meta }, live] = await Promise.all([readCurrentData(), fetchLivePatch()]);
    if (meta && live && live === meta.patch) {
      console.log(`Still on patch ${live}: nothing to do.`);
      return;
    }
    console.log(`Patch changed (${meta?.patch ?? 'none'} -> ${live}): refreshing...`);
  }
  await refreshData();
}

main().catch((err) => {
  console.error('Refresh failed:', err.message);
  process.exit(1);
});
