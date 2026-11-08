// Run with:  npm run check-builds
// Checks builds/builds.json against the current data: lists names that no
// longer exist (e.g. a perk was renamed in a patch) and prints each build's score.
// With NightLight stats (data/nightlight.json) it also shows how often the
// perks are played and their kill/escape rate, and flags builds whose perks
// win clearly less often than average: candidates to review by hand.
import fs from 'node:fs';
import { resolveBuild, scoreBuild } from '../src/lib/builds.js';
import { buildStats } from '../src/lib/nlStats.js';

const read = (f, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
};
const data = {
  perks: read('../data/perks.json'),
  killers: read('../data/killers.json'),
  items: read('../data/items.json'),
  addons: read('../data/addons.json'),
  offerings: read('../data/offerings.json'),
};
const stats = read('../data/nightlight.json', null);
const verbose = process.argv.includes('--verbose');

let problems = 0;
const weak = [];
for (const build of read('../builds/builds.json').builds) {
  const r = resolveBuild(build, data);
  const { score } = scoreBuild(r.resolved.perks, build.role, build.playstyles);
  const status = r.missing.length ? 'MISSING' : 'ok';
  const nl = buildStats(r, stats);
  const nlText = nl
    ? `  [NightLight: ${nl.exact ? `exact build ${nl.exact.rate}%` : `perks ${nl.avgUsage}% used, ${nl.avgRate ?? '?'}%`} ${nl.rateLabel}, avg ${nl.baseline}%]`
    : '';
  console.log(`${status.padEnd(7)} ${String(score).padStart(3)}  ${build.name} (${build.killer ?? build.role})${nlText}`);
  for (const m of r.missing) console.log(`          - not found: ${m}`);
  if (verbose) {
    for (const a of r.resolved.addons.filter(Boolean)) {
      console.log(`          add-on ${a.name}: ${a.description.replace(/\n/g, ' ').slice(0, 160)}`);
    }
    for (const p of nl?.perks ?? []) console.log(`          ${p.name}: used ${p.usage}%, ${p.rate ?? '?'}% ${nl.rateLabel}`);
  }
  const rate = nl?.exact?.rate ?? nl?.avgRate;
  if (build.type === 'meta' && rate != null && nl.baseline != null && rate < nl.baseline - 3) weak.push(`${build.name} (${rate}% vs ${nl.baseline}%)`);
  problems += r.missing.length;
}
if (weak.length) console.log(`\nMeta builds whose perks win clearly less than average (NightLight), worth a look:\n  ${weak.join('\n  ')}`);
console.log(problems ? `\n${problems} name(s) need fixing in builds/builds.json` : '\nAll builds OK.');
process.exit(problems ? 1 : 0);
