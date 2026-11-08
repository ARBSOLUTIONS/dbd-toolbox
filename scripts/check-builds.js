// Run with:  npm run check-builds
// Checks builds/builds.json against the current data: lists names that no
// longer exist (e.g. a perk was renamed in a patch) and prints each build's score.
import fs from 'node:fs';
import { resolveBuild, scoreBuild } from '../src/lib/builds.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
const data = {
  perks: read('../data/perks.json'),
  killers: read('../data/killers.json'),
  items: read('../data/items.json'),
  addons: read('../data/addons.json'),
  offerings: read('../data/offerings.json'),
};
const verbose = process.argv.includes('--verbose');

let problems = 0;
for (const build of read('../builds/builds.json').builds) {
  const r = resolveBuild(build, data);
  const { score } = scoreBuild(r.resolved.perks, build.role, build.playstyles);
  const status = r.missing.length ? 'MISSING' : 'ok';
  console.log(`${status.padEnd(7)} ${String(score).padStart(3)}  ${build.name} (${build.killer ?? build.role})`);
  for (const m of r.missing) console.log(`          - not found: ${m}`);
  if (verbose) {
    for (const a of r.resolved.addons.filter(Boolean)) {
      console.log(`          add-on ${a.name}: ${a.description.replace(/\n/g, ' ').slice(0, 160)}`);
    }
  }
  problems += r.missing.length;
}
console.log(problems ? `\n${problems} name(s) need fixing in builds/builds.json` : '\nAll builds OK.');
process.exit(problems ? 1 : 0);
