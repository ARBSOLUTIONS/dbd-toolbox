// Builds the PUBLIC website into dist/ (run: npm run build:static).
//
// 1. The React app is built by Vite in static mode (no server needed).
// 2. This script adds:
//    - dist/data/app-data.json + status.json  (data for the app)
//    - dist/icons/                            (cached wiki icons)
//    - one plain HTML page per perk, killer, survivor and build, readable by
//      search engines and AI crawlers without running JavaScript
//    - sitemap.xml, robots.txt, llms.txt, about page, 404 page, IndexNow key
//
// Settings (environment variables):
//   SITE_URL                   e.g. https://dbd-toolbox.pages.dev (no trailing slash)
//   GOOGLE_SITE_VERIFICATION   code from Google Search Console (optional;
//   BING_SITE_VERIFICATION     code from Bing Webmaster Tools   or put them in seo.config.json)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTags, PLAYSTYLES } from '../src/lib/tags.js';
import { resolveBuild, scoreBuild } from '../src/lib/builds.js';
import { generateBuilds } from '../src/lib/generator.js';
import { suggestPerks } from '../src/lib/combos.js';
import { predictNextPatch } from '../server/predict.js';
import { withOfferingRatings, stars, KIND_LABEL } from '../src/lib/offeringRatings.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE_URL = (process.env.SITE_URL || 'https://dbd-toolbox.pages.dev').replace(/\/$/, '');
const SITE = 'DBD-Toolbox';
const TAGLINE = 'Dead by Daylight build generator, perk combos & challenges';

const readJson = async (rel, fallback) => {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, rel), 'utf8'));
  } catch {
    return fallback;
  }
};
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const para = (text) => esc(text).replace(/\n/g, '<br>');
const icon = (e, size = 64) => {
  const src = e?.icon?.local ?? e?.portrait?.local;
  return src ? `<img src="${src}" alt="${esc(e.name)} icon" width="${size}" height="${size}" loading="lazy">` : '';
};
const short = (text, n = 155) => {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t;
};

async function write(rel, content) {
  const file = path.join(DIST, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

// ---------- Data ----------
const meta = await readJson('data/meta.json', null);
if (!meta) throw new Error('No data in data/. Run "npm run refresh-data" first.');
const raw = {
  perks: await readJson('data/perks.json', []),
  killers: await readJson('data/killers.json', []),
  survivors: await readJson('data/survivors.json', []),
  items: await readJson('data/items.json', []),
  addons: await readJson('data/addons.json', []),
  offerings: await readJson('data/offerings.json', []),
};
const curatedFile = await readJson('builds/builds.json', { builds: [] });
const changes = await readJson('data/changes.json', null);
const history = await readJson('data/patch-history.json', []);
const autoState = await readJson('data/auto-update.json', {});

const data = { meta, ...raw, perks: withTags(raw.perks), changes };
const curated = curatedFile.builds.map((b) => {
  const r = resolveBuild(b, data);
  return { ...r, rating: scoreBuild(r.resolved.perks, b.role, b.playstyles) };
});
const generated = generateBuilds(data, curated, changes);
const allBuilds = [...curated, ...generated];
const perkById = new Map(data.perks.map((p) => [p.id, p]));
const today = new Date().toISOString().slice(0, 10);
const lastmod = (meta.fetchedAt ?? new Date().toISOString()).slice(0, 10);

// ---------- 1. App data ----------
await write('data/app-data.json', JSON.stringify({ meta, ...raw, changes, curated: curatedFile }));
const prediction = predictNextPatch(history, autoState.announcements ?? meta.announcements ?? [], new Date());
await write(
  'data/status.json',
  JSON.stringify({ enabled: true, static: true, lastCheck: autoState.lastCheck ?? null, lastResult: autoState.lastResult ?? null, prediction }),
);
await fs.cp(path.join(ROOT, 'data', 'icons'), path.join(DIST, 'icons'), { recursive: true });

// ---------- 2. Page template ----------
const urls = []; // for the sitemap

function page({ url, title, description, body, jsonLd = [], crumbs = [] }) {
  urls.push(url);
  const canonical = `${SITE_URL}${url}`;
  const breadcrumb = crumbs.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [{ name: SITE, url: '/' }, ...crumbs].map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: c.name,
          item: `${SITE_URL}${c.url}`,
        })),
      }
    : null;
  const ld = [breadcrumb, ...jsonLd].filter(Boolean);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/seo.css">
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n')}
</head>
<body>
<header class="top"><a class="logo" href="/">DBD-<span>Toolbox</span></a>
<nav><a href="/">Build generator</a><a href="/builds/">Builds</a><a href="/perks/">Perks</a><a href="/killers/">Killers</a><a href="/survivors/">Survivors</a><a href="/offerings/">Offerings</a></nav></header>
<main>
${crumbs.length ? `<p class="crumbs"><a href="/">${SITE}</a>${crumbs.map((c) => ` › <a href="${c.url}">${esc(c.name)}</a>`).join('')}</p>` : ''}
${body}
<p class="cta"><a class="button" href="/">Open the interactive build generator →</a></p>
</main>
<footer>Data: <a href="https://deadbydaylight.wiki.gg">Dead by Daylight Wiki</a> (CC BY-NC-SA 3.0), patch ${esc(meta.patch)}, updated ${lastmod}.
${SITE} is a free fan project, not affiliated with Behaviour Interactive. <a href="/about/">About &amp; licence</a></footer>
</body>
</html>`;
}

const perkLink = (p) => (p ? `<a href="/perks/${p.id}/">${esc(p.name)}</a>` : '');
const buildUrl = (b) => `/builds/${b.id}/`;
const roleLabel = (r) => (r === 'killer' ? 'Killer' : 'Survivor');
const styleLabel = (role, s) => PLAYSTYLES[role]?.[s] ?? s;

function buildCardHtml(b) {
  const perks = b.resolved.perks.filter(Boolean);
  const extra = [b.resolved.item, b.resolved.killer, ...(b.resolved.addons ?? [])].filter(Boolean);
  return `<article class="card"><h3><a href="${buildUrl(b)}">${esc(b.name)}</a> <span class="score">${b.rating.score}</span></h3>
<p class="muted">${b.type === 'auto' ? 'Auto-generated' : b.type === 'meta' ? 'Strong / meta' : 'Fun'} · ${esc(b.killer ?? roleLabel(b.role))} · ${b.playstyles.map((s) => esc(styleLabel(b.role, s))).join(', ')}</p>
<p class="icons">${perks.map((p) => `<a href="/perks/${p.id}/" title="${esc(p.name)}">${icon(p, 48)}</a>`).join('')}</p>
<p>${perks.map(perkLink).join(' · ')}${extra.length ? `<br><span class="muted">${extra.map((e) => esc(e.name)).join(' · ')}</span>` : ''}</p></article>`;
}

// ---------- 3. Perk pages ----------
for (const p of data.perks) {
  const partners = suggestPerks([p], data.perks, curated, { limit: 8 });
  const usedIn = allBuilds.filter((b) => b.resolved.perks.some((x) => x?.id === p.id)).slice(0, 8);
  const owner = p.character ? `${p.role === 'killer' ? '' : ''}${esc(p.character)}` : 'a general perk (any character)';
  const title = `${p.name} – ${roleLabel(p.role)} perk: best builds & combos | ${SITE}`;
  const description = short(`${p.name} (Dead by Daylight ${p.role} perk${p.character ? ` of ${p.character}` : ''}): ${p.description}`);
  const tags = p.tags.map((t) => styleLabel(p.role, t)).join(', ');
  const body = `<article class="hero">${icon(p, 96)}<div><h1>${esc(p.name)}</h1>
<p class="muted">Dead by Daylight ${p.role} perk · ${p.character ? `Unique perk of <strong>${esc(p.character)}</strong>` : 'General perk'}${p.identicalTo ? ` · same effect as ${perkLink(perkById.get(data.perks.find((x) => x.name === p.identicalTo && x.role === p.role)?.id))}` : ''}</p>
<p class="tags">${p.tags.map((t) => `<span>${esc(styleLabel(p.role, t))}</span>`).join('')}</p></div></article>
<h2>What does ${esc(p.name)} do?</h2>
<p>${para(p.description)}</p>
${p.quote ? `<blockquote>${esc(p.quote)}</blockquote>` : ''}
<h2>Best perks to combine with ${esc(p.name)}</h2>
${partners.length ? `<ul class="combos">${partners.map((x) => `<li>${icon(x.perk, 32)} ${perkLink(x.perk)} – ${esc(x.reasons.join(' '))}</li>`).join('')}</ul>` : '<p>No clear partners found.</p>'}
<h2>Builds with ${esc(p.name)}</h2>
${usedIn.length ? `<div class="grid">${usedIn.map(buildCardHtml).join('')}</div>` : `<p>No build uses ${esc(p.name)} yet. Try it in the <a href="/">build maker</a>.</p>`}
<h2>Frequently asked</h2>
<h3>Who has ${esc(p.name)}?</h3><p>${esc(p.name)} is ${p.character ? `the unique perk of ${owner}` : owner} in Dead by Daylight.</p>
<h3>What playstyle is ${esc(p.name)} good for?</h3><p>${esc(p.name)} fits a ${esc(tags.toLowerCase() || 'flexible')} playstyle.</p>`;
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: `What does ${p.name} do in Dead by Daylight?`, acceptedAnswer: { '@type': 'Answer', text: short(p.description, 500) } },
      {
        '@type': 'Question',
        name: `What perks go well with ${p.name}?`,
        acceptedAnswer: { '@type': 'Answer', text: partners.slice(0, 5).map((x) => x.perk.name).join(', ') || 'No clear partners.' },
      },
    ],
  };
  await write(
    `perks/${p.id}/index.html`,
    page({ url: `/perks/${p.id}/`, title, description, body, jsonLd: [faq], crumbs: [{ name: 'Perks', url: '/perks/' }, { name: p.name, url: `/perks/${p.id}/` }] }),
  );
}

// Perk index
{
  const section = (role) =>
    `<h2>${roleLabel(role)} perks (${data.perks.filter((p) => p.role === role).length})</h2><ul class="list">${data.perks
      .filter((p) => p.role === role)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => `<li>${icon(p, 32)} ${perkLink(p)} <span class="muted">${esc(p.character ?? 'General')}</span></li>`)
      .join('')}</ul>`;
  await write(
    'perks/index.html',
    page({
      url: '/perks/',
      title: `All Dead by Daylight perks (${data.perks.length}) with combos | ${SITE}`,
      description: `Every Dead by Daylight survivor and killer perk for patch ${meta.patch}, with descriptions, playstyle tags and the best perk combinations.`,
      body: `<h1>All Dead by Daylight perks</h1><p>Patch ${esc(meta.patch)}. Click a perk to see what it does and which perks work best with it.</p>${section('survivor')}${section('killer')}`,
      crumbs: [{ name: 'Perks', url: '/perks/' }],
    }),
  );
}

// ---------- 4. Killer & survivor pages ----------
for (const role of ['killer', 'survivor']) {
  const list = role === 'killer' ? data.killers : data.survivors;
  const folder = `${role}s`;
  for (const c of list) {
    const own = (c.perks ?? []).map((id) => perkById.get(id)).filter(Boolean);
    const addons = role === 'killer' ? data.addons.filter((a) => a.killer === c.name) : [];
    const builds = allBuilds.filter((b) => role === 'killer' && b.killer === c.name);
    const power = addons[0]?.power;
    const title = `${c.name} – ${role === 'killer' ? 'best builds, perks & add-ons' : 'perks & builds'} (DBD ${meta.patch}) | ${SITE}`;
    const description = short(
      role === 'killer'
        ? `${c.name} in Dead by Daylight: best builds, unique perks (${own.map((p) => p.name).join(', ')})${power ? `, ${power} add-ons` : ''} and how to play them.`
        : `${c.name} in Dead by Daylight: unique perks (${own.map((p) => p.name).join(', ')}), what they do and builds that use them.`,
    );
    const body = `<article class="hero">${icon(c, 96)}<div><h1>${esc(c.name)}</h1><p class="muted">Dead by Daylight ${role}${power ? ` · Power: ${esc(power)}` : ''}</p></div></article>
<h2>Unique perks</h2><ul class="combos">${own.map((p) => `<li>${icon(p, 32)} ${perkLink(p)} – ${esc(short(p.description, 180))}</li>`).join('')}</ul>
${builds.length ? `<h2>Builds for ${esc(c.name)}</h2><div class="grid">${builds.map(buildCardHtml).join('')}</div>` : ''}
${addons.length ? `<h2>${esc(power ?? 'Power')} add-ons (${addons.length})</h2><ul class="list addons">${addons.map((a) => `<li>${icon(a, 32)} <strong>${esc(a.name)}</strong> <span class="muted">${esc(a.rarity)}</span><br><span class="small">${esc(short(a.description, 200))}</span></li>`).join('')}</ul>` : ''}`;
    await write(
      `${folder}/${c.id}/index.html`,
      page({ url: `/${folder}/${c.id}/`, title, description, body, crumbs: [{ name: `${roleLabel(role)}s`, url: `/${folder}/` }, { name: c.name, url: `/${folder}/${c.id}/` }] }),
    );
  }
  await write(
    `${folder}/index.html`,
    page({
      url: `/${folder}/`,
      title: `All Dead by Daylight ${folder} (${list.length}) – perks & builds | ${SITE}`,
      description: `All ${list.length} Dead by Daylight ${folder} with their unique perks${role === 'killer' ? ', add-ons and recommended builds' : ''}.`,
      body: `<h1>All Dead by Daylight ${folder}</h1><ul class="tiles">${list.map((c) => `<li><a href="/${folder}/${c.id}/">${icon(c, 72)}<span>${esc(c.name)}</span></a></li>`).join('')}</ul>`,
      crumbs: [{ name: `${roleLabel(role)}s`, url: `/${folder}/` }],
    }),
  );
}

// ---------- 5. Build pages ----------
for (const b of allBuilds) {
  const perks = b.resolved.perks.filter(Boolean);
  const kind = b.type === 'auto' ? 'auto-generated' : b.type === 'meta' ? 'strong (meta)' : 'fun';
  const who = b.killer ?? (b.role === 'killer' ? 'any killer' : 'survivors');
  const title = `${b.name} – ${b.role === 'killer' ? `${who} build` : 'survivor build'}: ${perks.map((p) => p.name).join(', ')} | ${SITE}`;
  const description = short(`${b.name}: a ${kind} Dead by Daylight build for ${who}. ${b.why}`);
  const extra = [b.resolved.item, b.resolved.killer, ...(b.resolved.addons ?? []), b.resolved.offering].filter(Boolean);
  const body = `<h1>${esc(b.name)}</h1>
<p class="muted">A ${esc(kind)} Dead by Daylight build for ${esc(who)} · playstyle: ${b.playstyles.map((s) => esc(styleLabel(b.role, s))).join(', ')} · synergy score ${b.rating.score}/100 · patch ${esc(meta.patch)}</p>
<h2>Perks</h2><ul class="combos">${perks.map((p) => `<li>${icon(p, 48)} ${perkLink(p)} – ${esc(short(p.description, 200))}</li>`).join('')}</ul>
${extra.length ? `<h2>${b.role === 'killer' ? 'Killer & add-ons' : 'Item & add-ons'}</h2><ul class="combos">${extra.map((e) => `<li>${icon(e, 40)} <strong>${esc(e.name)}</strong>${e.description ? ` – ${esc(short(e.description, 160))}` : ''}</li>`).join('')}</ul>` : ''}
<h2>Why it works</h2><p>${esc(b.why)}</p>
${b.howToPlay ? `<h2>How to play</h2><p>${esc(b.howToPlay)}</p>` : ''}
${b.rating.pros.length || b.rating.cons.length ? `<h2>Rating details</h2><ul>${b.rating.pros.map((r) => `<li>✓ ${esc(r)}</li>`).join('')}${b.rating.cons.map((r) => `<li>✗ ${esc(r)}</li>`).join('')}</ul>` : ''}`;
  await write(
    `builds/${b.id}/index.html`,
    page({ url: buildUrl(b), title, description, body, crumbs: [{ name: 'Builds', url: '/builds/' }, { name: b.name, url: buildUrl(b) }] }),
  );
}
{
  const section = (role, label) => {
    const list = allBuilds.filter((b) => b.role === role).sort((a, b) => b.rating.score - a.rating.score);
    return `<h2>${label} (${list.length})</h2><div class="grid">${list.map(buildCardHtml).join('')}</div>`;
  };
  await write(
    'builds/index.html',
    page({
      url: '/builds/',
      title: `Best Dead by Daylight builds (${meta.patch}) – meta & fun | ${SITE}`,
      description: `The best Dead by Daylight survivor and killer builds for patch ${meta.patch}: meta, fun and auto-generated combinations, each with explanation and synergy score.`,
      body: `<h1>Dead by Daylight builds</h1><p>Hand-picked meta and fun builds plus builds generated from the current patch data. Updated automatically after every patch.</p>${section('survivor', 'Survivor builds')}${section('killer', 'Killer builds')}`,
      crumbs: [{ name: 'Builds', url: '/builds/' }],
    }),
  );
}

// ---------- 5b. Offering tier list ----------
{
  const rated = withOfferingRatings(raw.offerings)
    .map((o) => ({ ...o, role: o.rating.role ?? o.role }))
    .filter((o) => o.rating.available);
  const tiers = [
    [5, 'S tier – game changers'],
    [4, 'A tier – strong'],
    [3, 'B tier – good in the right situation'],
    [2, 'C tier – small effect'],
    [1, 'D tier – barely any effect / Bloodpoints only'],
  ];
  const roleName = { survivor: 'Survivor', killer: 'Killer', both: 'Both roles' };
  const section = (role) =>
    tiers
      .map(([n, label]) => {
        const list = rated
          .filter((o) => o.rating.stars === n && (o.role === role || o.role === 'both'))
          .filter((o) => o.rating.kind !== 'bloodpoints' || n === 1)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!list.length) return '';
        return `<h3>${label}</h3><ul class="combos">${list
          .map(
            (o) =>
              `<li>${icon(o, 40)} <strong>${esc(o.name)}</strong> <span class="score">${stars(o.rating.stars)}</span> <span class="muted">${esc(KIND_LABEL[o.rating.kind])} · ${esc(roleName[o.role] ?? o.role)}</span><br>${esc(o.rating.why)}<br><span class="muted small">${esc(short(o.description, 200))}</span></li>`,
          )
          .join('')}</ul>`;
      })
      .join('');
  const best = rated.filter((o) => o.rating.stars >= 4).map((o) => o.name);
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'What is the best killer offering in Dead by Daylight?', acceptedAnswer: { '@type': 'Answer', text: 'Ebony Memento Mori (kill every survivor on their last hook state), followed by Ivory Memento Mori and Putrid Oak (hooks closer together).' } },
      { '@type': 'Question', name: 'What is the best offering to farm Bloodpoints in Dead by Daylight?', acceptedAnswer: { '@type': 'Answer', text: 'Bloody Party Streamers (+100% Bloodpoints in every category for everyone in the match), then Escape! Cake (survivor) and Survivor Pudding (killer), each +100% in every category. Bloodpoint offerings stack.' } },
      { '@type': 'Question', name: 'What is the best survivor offering in Dead by Daylight?', acceptedAnswer: { '@type': 'Answer', text: "Vigo's Shroud (spawn far from the killer) and Shroud of Separation (all survivors spawn apart). White Ward is great to keep an expensive item." } },
    ],
  };
  await write(
    'offerings/index.html',
    page({
      url: '/offerings/',
      title: `Best Dead by Daylight offerings – tier list & Bloodpoint farming (${meta.patch}) | ${SITE}`,
      description: `Dead by Daylight offerings tier list for patch ${meta.patch}: every killer and survivor offering rated 1–5 stars for how much it helps you win. Best: ${best.join(', ')}.`,
      body: `<h1>Dead by Daylight offerings tier list</h1>
<p>Every offering rated from 1 to 5 stars for how much it helps you <strong>win the match</strong>. Bloodpoint offerings are great for grinding but do nothing in the match, so they are in D tier. Patch ${esc(meta.patch)}.</p>
<p class="jump"><a class="button" href="#farming">🩸 Best offerings for farming Bloodpoints ↓</a> <a class="button" href="#killer">🏆 Best killer offerings ↓</a> <a class="button" href="#survivor">🏆 Best survivor offerings ↓</a></p>
<h2 id="killer">Killer offerings (best for winning)</h2>${section('killer')}
<h2 id="survivor">Survivor offerings (best for winning)</h2>${section('survivor')}
<h2 id="farming">🩸 Best offerings for farming Bloodpoints</h2>
<p>Bloodpoint offerings do nothing in the match, but they are the fastest way to level up. Rated 1–5 stars for how many extra Bloodpoints they give. They stack, and Bloody Party Streamers boost everyone in the match.</p>
<ul class="combos">${rated
        .filter((o) => (o.rating.bp?.stars ?? 0) > 0)
        .sort((a, b) => b.rating.bp.stars - a.rating.bp.stars || a.name.localeCompare(b.name))
        .map(
          (o) =>
            `<li>${icon(o, 40)} <strong>${esc(o.name)}</strong> <span class="score">${stars(o.rating.bp.stars)}</span> <span class="muted">${esc(roleName[o.role] ?? o.role)}${o.rating.legacy ? ' · legacy (no longer in the Bloodweb)' : ''}</span><br>${esc(o.rating.bp.why)}</li>`,
        )
        .join('')}</ul>`,
      jsonLd: [faq],
      crumbs: [{ name: 'Offerings', url: '/offerings/' }],
    }),
  );
}

// ---------- 6. About, 404 ----------
await write(
  'about/index.html',
  page({
    url: '/about/',
    title: `About ${SITE} – sources, licence & privacy`,
    description: `${SITE} is a free, non-commercial Dead by Daylight fan tool. Sources, licence, privacy and disclaimer.`,
    body: `<h1>About ${SITE}</h1>
<p>${SITE} helps you find strong and fun Dead by Daylight builds: hand-picked and auto-generated builds, perk combinations, a build maker with ratings, and a challenge generator with achievements.</p>
<h2>Sources</h2><p>Game data (perk, item, add-on and offering names and descriptions, and icons) comes from the <a href="https://deadbydaylight.wiki.gg">Dead by Daylight Wiki</a>. The text is available under <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/">CC BY-NC-SA 3.0</a>. The data on this site that is derived from it is shared under the same licence. Data is fetched politely (only allowed pages, low request rate) and updated automatically after each game patch.</p>
<h2>Not affiliated</h2><p>${SITE} is an unofficial fan project and is not affiliated with, endorsed or sponsored by Behaviour Interactive Inc. Dead by Daylight, its characters, names and artwork are trademarks and property of Behaviour Interactive Inc. and their respective licensors. If you are a rights holder and want something removed, please <a href="https://github.com/ARBSOLUTIONS/dbd-toolbox/issues">open an issue on GitHub</a>.</p>
<h2>Source code</h2><p>The project is open on <a href="https://github.com/ARBSOLUTIONS/dbd-toolbox">GitHub</a>. Suggestions for builds and perk tags are welcome.</p>
<h2>Build ratings</h2><p>Hand-picked builds are based on general community knowledge. Synergy scores and generated builds are calculated by this site from perk descriptions and known combinations. They are a guide, not win-rate statistics.</p>
<h2>Privacy</h2><p>No accounts, no ads, no tracking cookies and no analytics. Favourites, your own builds and challenge progress are stored only in your own browser (localStorage).</p>`,
    crumbs: [{ name: 'About', url: '/about/' }],
  }),
);
urls.pop(); // keep /about/ in sitemap? yes: re-add below with low priority
urls.push('/about/');
await write(
  '404.html',
  page({ url: '/404', title: `Page not found | ${SITE}`, description: 'This page does not exist.', body: '<h1>Page not found</h1><p>This page does not exist (anymore). Perks are sometimes renamed after a patch.</p>' }),
);
urls.pop();

// ---------- 7. Home page (the React app) with crawlable fallback content ----------
{
  const file = path.join(DIST, 'index.html');
  let html = await fs.readFile(file, 'utf8');
  const description = `Free Dead by Daylight build generator: the best meta & fun survivor and killer builds for patch ${meta.patch}, perk combos, a build maker with ratings, and a challenge generator with achievements.`;
  // Verification codes: from environment variables or from seo.config.json in the repo.
  const seoConfig = await readJson('seo.config.json', {});
  const google = process.env.GOOGLE_SITE_VERIFICATION || seoConfig.googleSiteVerification;
  const bing = process.env.BING_SITE_VERIFICATION || seoConfig.bingSiteVerification;
  const verification = [
    google && `<meta name="google-site-verification" content="${esc(google)}">`,
    bing && `<meta name="msvalidate.01" content="${esc(bing)}">`,
  ]
    .filter(Boolean)
    .join('\n');
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, url: `${SITE_URL}/`, description },
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: SITE,
      url: `${SITE_URL}/`,
      applicationCategory: 'GameApplication',
      operatingSystem: 'Any (web browser)',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      description,
      about: { '@type': 'VideoGame', name: 'Dead by Daylight' },
    },
  ];
  const head = `<title>${SITE} – ${TAGLINE}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE_URL}/">
<meta property="og:type" content="website"><meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${SITE} – ${TAGLINE}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE_URL}/"><meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${verification}
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n')}`;
  html = html.replace(/<title>.*?<\/title>/, head);
  const top = [...curated].sort((a, b) => b.rating.score - a.rating.score).slice(0, 6);
  // Shown until the app has loaded (and to crawlers that do not run JavaScript).
  const fallback = `<div class="seo-fallback" style="max-width:900px;margin:24px auto;padding:0 16px;font-family:system-ui;color:#e8e6e3">
<h1>${SITE}: ${TAGLINE}</h1><p>${esc(description)}</p>
<p><a href="/builds/">All builds</a> · <a href="/perks/">All perks</a> · <a href="/killers/">All killers</a> · <a href="/survivors/">All survivors</a> · <a href="/about/">About</a></p>
<h2>Top builds for patch ${esc(meta.patch)}</h2><ul>${top.map((b) => `<li><a href="${buildUrl(b)}">${esc(b.name)}</a> – ${esc(b.killer ?? roleLabel(b.role))}: ${b.resolved.perks.filter(Boolean).map((p) => esc(p.name)).join(', ')}</li>`).join('')}</ul>
<noscript><p>The interactive tools (build maker, combos, challenges) need JavaScript. All builds and perks are also available as plain pages via the links above.</p></noscript></div>`;
  html = html.replace('<div id="root"></div>', `<div id="root">${fallback}</div>`);
  await fs.writeFile(file, html);
  urls.unshift('/');
}

// ---------- 8. Sitemap, robots, llms.txt, IndexNow, CSS, favicon ----------
await write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${SITE_URL}${u}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>`,
);
await write(
  'robots.txt',
  `# ${SITE}: everyone is welcome, including search engines and AI assistants.
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`,
);
await write(
  'llms.txt',
  `# ${SITE}

> ${SITE} is a free Dead by Daylight fan tool: best meta and fun builds for survivors and killers, perk combinations ("what goes well with this perk?"), a build maker with a synergy rating, and a challenge generator with achievements. Data is from the Dead by Daylight Wiki, currently patch ${meta.patch} (updated ${lastmod}), and refreshes automatically after each game patch.

## Main pages
- [Build generator (interactive app)](${SITE_URL}/): builds, combos, build maker, challenges
- [All builds](${SITE_URL}/builds/): ${allBuilds.length} survivor and killer builds with explanations and synergy scores
- [All perks](${SITE_URL}/perks/): ${data.perks.length} perks with descriptions and best combos
- [All killers](${SITE_URL}/killers/): ${data.killers.length} killers with perks, add-ons and builds
- [All survivors](${SITE_URL}/survivors/): ${data.survivors.length} survivors with their perks
- [Offerings tier list](${SITE_URL}/offerings/): every offering rated 1-5 stars for how much it helps you win
- [About, sources & licence](${SITE_URL}/about/)

## Top builds
${[...curated].sort((a, b) => b.rating.score - a.rating.score).slice(0, 10).map((b) => `- [${b.name}](${SITE_URL}${buildUrl(b)}): ${b.killer ?? roleLabel(b.role)} – ${b.resolved.perks.filter(Boolean).map((p) => p.name).join(', ')}`).join('\n')}
`,
);
const indexNowKey = process.env.INDEXNOW_KEY || (await readJson('indexnow.json', {})).key;
if (indexNowKey) await write(`${indexNowKey}.txt`, indexNowKey);
await fs.copyFile(path.join(ROOT, 'scripts', 'seo.css'), path.join(DIST, 'seo.css'));
await write(
  'favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#16161a"/><path d="M32 8 L44 30 L36 30 L40 56 L20 26 L29 26 Z" fill="#c0262d"/></svg>`,
);
await write('_headers', `/data/*\n  Cache-Control: public, max-age=300\n/icons/*\n  Cache-Control: public, max-age=604800\n`);

console.log(`Static site ready in dist/: ${urls.length} pages in the sitemap, ${allBuilds.length} builds. Site URL: ${SITE_URL}`);
