// Used by GitHub Actions every hour (see .github/workflows/update-data.yml).
// Decides with the patch prediction whether a check is due. Usually it exits
// without contacting the wiki at all. If a new patch is live, it refreshes the
// data and waits until that is done. The workflow then commits the changes,
// and Cloudflare Pages rebuilds the public site.
import { checkForUpdate } from '../server/autoUpdate.js';

const force = process.argv.includes('--force');
const result = await checkForUpdate({ force, wait: true });
console.log(JSON.stringify(result));
