// Audits game data + NightLight stats + build coverage and prints a concise checklist.
// Usage:
//   npm run check-data
//   node scripts/check-data-health.js --markdown --write-issue /tmp/followup.md
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTags, keywordTags } from '../src/lib/tags.js';
import { resolveBuild, scoreBuild } from '../src/lib/builds.js';
import { buildStats } from '../src/lib/nlStats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const asMarkdown = args.includes('--markdown');
const issueFile = opt('--write-issue');
const strict = args.includes('--strict');

const readJson = async (rel, fallback) => {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, rel), 'utf8'));
  } catch {
    return fallback;
  }
};

const BROKEN_DESC_RE = /#effect(?:\(\d+\))?|\{\{|\}\}/i;

const meta = await readJson('data/meta.json', null);
const perks = withTags(await readJson('data/perks.json', []));
const killers = await readJson('data/killers.json', []);
const survivors = await readJson('data/survivors.json', []);
const items = await readJson('data/items.json', []);
const addons = await readJson('data/addons.json', []);
const offerings = await readJson('data/offerings.json', []);
const stats = await readJson('data/nightlight.json', null);
const curated = (await readJson('builds/builds.json', { builds: [] })).builds ?? [];

const data = { meta, perks, killers, survivors, items, addons, offerings, stats };

// 1. Perks without manual tags
const untagged = perks
  .filter((p) => p.tagSource !== 'manual')
  .map((p) => ({ name: p.name, role: p.role, suggested: keywordTags(p, p.role) }));

// 2. Broken build references in builds/builds.json
const brokenBuilds = [];
let scoredWithCommunity = 0;
let killerSpecificScored = 0;
for (const b of curated) {
  const r = resolveBuild(b, data);
  if (r.missing.length) brokenBuilds.push({ id: b.id, name: b.name, missing: r.missing });
  const rating = scoreBuild(r.resolved.perks, b.role, b.playstyles, { stats, killerId: r.resolved.killer?.id });
  const nl = buildStats({ ...r, rating }, stats);
  if (rating.community) scoredWithCommunity++;
  if (nl?.killerScope) killerSpecificScored++;
}

// 3. Broken wiki placeholders
const brokenText = [];
for (const [kind, list] of [
  ['perk', perks],
  ['item', items],
  ['add-on', addons],
  ['offering', offerings],
]) {
  for (const x of list) {
    const d = String(x.description ?? '').trim();
    if (!d || BROKEN_DESC_RE.test(d)) brokenText.push({ kind, name: x.name, sample: d.slice(0, 90).replace(/\n/g, ' ') });
  }
}

// 4. NightLight stats summary
const nlPerkCount = Object.keys(stats?.perks ?? {}).length;
const nlKillerCount = Object.keys(stats?.killers ?? {}).length;
const nlKillerDetailCount = Object.values(stats?.killers ?? {}).filter((k) => k.topPerks?.length).length;
const nlUnmatched = [
  ...(stats?.unmatched?.killers ?? []).map((n) => `killer: ${n}`),
  ...(stats?.unmatched?.survivors ?? []).map((n) => `survivor: ${n}`),
  ...(stats?.unmatched?.perks ?? []).map((n) => `perk: ${n}`),
];

const hasIssues = untagged.length > 0 || brokenBuilds.length > 0 || brokenText.length > 0;

if (asMarkdown || issueFile) {
  const lines = [
    `## Data health checklist — Patch ${meta?.patch ?? '?'}`,
    '',
    `- **Game data:** ${perks.length} perks, ${killers.length} killers, ${survivors.length} survivors, ${addons.length} add-ons, ${offerings.length} offerings`,
    `- **NightLight stats:** ${stats?.games ?? 0} killer games · ${nlPerkCount} perks · ${nlKillerCount} killers (${nlKillerDetailCount} with killer-specific top perks)`,
    `- **Curated builds using NightLight ratings:** ${scoredWithCommunity}/${curated.length} (${killerSpecificScored} killer-specific)`,
    '',
  ];
  if (untagged.length) {
    lines.push(`### New perks needing manual tags in \`src/lib/perkTags.js\` (${untagged.length})`);
    for (const p of untagged) {
      lines.push(`- [ ] **${p.name}** (${p.role}) — suggested: \`[${p.suggested.map((t) => `'${t}'`).join(', ')}]\``);
    }
    lines.push('');
  }
  if (brokenBuilds.length) {
    lines.push(`### Hand-picked builds with missing names in \`builds/builds.json\` (${brokenBuilds.length})`);
    for (const b of brokenBuilds) {
      lines.push(`- [ ] **${b.name}** (\`${b.id}\`): ${b.missing.join(', ')}`);
    }
    lines.push('');
  }
  if (brokenText.length) {
    lines.push(`### Wiki descriptions with unresolved placeholders (${brokenText.length})`);
    for (const t of brokenText) {
      lines.push(`- [ ] ${t.kind} **${t.name}**: \`${t.sample}\``);
    }
    lines.push('');
  }
  if (nlUnmatched.length) {
    lines.push(`### Unmatched NightLight names (${nlUnmatched.length})`);
    lines.push(nlUnmatched.map((n) => `- ${n}`).join('\n'));
    lines.push('');
  }
  const md = lines.join('\n');
  if (asMarkdown) console.log(md);
  if (issueFile && hasIssues) await fs.writeFile(issueFile, md);
} else {
  console.log(`Data health (patch ${meta?.patch ?? '?'}):`);
  console.log(`  NightLight: ${nlPerkCount} perks, ${nlKillerCount} killers (${nlKillerDetailCount} with topPerks), ${scoredWithCommunity}/${curated.length} curated builds scored (${killerSpecificScored} killer-specific)`);
  console.log(`  Untagged perks: ${untagged.length}${untagged.length ? ' -> ' + untagged.map((p) => p.name).join(', ') : ' ✓'}`);
  console.log(`  Broken builds:  ${brokenBuilds.length}${brokenBuilds.length ? ' -> ' + brokenBuilds.map((b) => b.name).join(', ') : ' ✓'}`);
  console.log(`  Wiki glitches:  ${brokenText.length}${brokenText.length ? ' -> ' + brokenText.map((t) => `${t.kind} "${t.name}"`).join(', ') : ' ✓'}`);
  if (nlUnmatched.length) console.log(`  NightLight unmatched (${nlUnmatched.length}): ${nlUnmatched.join(', ')}`);
}

if (strict && hasIssues) process.exit(1);
