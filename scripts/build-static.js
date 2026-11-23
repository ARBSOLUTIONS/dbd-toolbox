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
//   SITE_URL                   e.g. https://dbdtoolbox.wiki (no trailing slash)
//   GOOGLE_SITE_VERIFICATION   code from Google Search Console (optional;
//   BING_SITE_VERIFICATION     code from Bing Webmaster Tools   or put them in seo.config.json)
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTags, PLAYSTYLES } from '../src/lib/tags.js';
import { resolveBuild, scoreBuild } from '../src/lib/builds.js';
import { repairBuild } from '../src/lib/patchAware.js';
import { generateBuilds } from '../src/lib/generator.js';
import { suggestPerks } from '../src/lib/combos.js';
import { predictNextPatch } from '../server/predict.js';
import { withOfferingRatings, stars, KIND_LABEL } from '../src/lib/offeringRatings.js';
import { analysePatch, VERDICTS, LEVELS } from '../src/lib/patchImpact.js';
import { rankPerks, PRIOR_GAMES, MIN_PERK_GAMES, MIN_SAMPLES, periodLabel } from '../src/lib/nlStats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE_URL = (process.env.SITE_URL || 'https://dbdtoolbox.wiki').replace(/\/$/, '');
const SITE = 'DBD-Toolbox';
// Ads (off unless ADSENSE_CLIENT is set, e.g. ca-pub-1234567890123456).
// Consent banner: use Google's own CMP (AdSense > Privacy & messaging), it loads with this script.
// Set via env vars or seo.config.json ({ "adsenseClient": "ca-pub-…", "adsenseSlot": "…" }); the IDs are public anyway.
const adConfig = await fs.readFile(path.join(ROOT, 'seo.config.json'), 'utf8').then(JSON.parse).catch(() => ({}));
const ADSENSE_CLIENT = (process.env.ADSENSE_CLIENT || adConfig.adsenseClient || '').trim();
const ADSENSE_SLOT = (process.env.ADSENSE_SLOT || adConfig.adsenseSlot || '').trim();
if (ADSENSE_CLIENT && !/^ca-pub-\d{10,20}$/.test(ADSENSE_CLIENT)) throw new Error(`ADSENSE_CLIENT looks wrong: ${ADSENSE_CLIENT}`);
const adHead = ADSENSE_CLIENT
  ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>`
  : '';
const adSlot = ADSENSE_CLIENT && ADSENSE_SLOT
  ? `<aside class="ad" aria-label="Advertisement"><ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE_CLIENT}" data-ad-slot="${ADSENSE_SLOT}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></aside>`
  : '';
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
  return src ? `<img src="${src}" alt="${esc(e.name)} icon" width="${size}" height="${size}" loading="lazy" decoding="async">` : '';
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
const patchNotes = await readJson('data/patch-notes.json', []);
const autoState = await readJson('data/auto-update.json', {});
const stats = await readJson('data/nightlight.json', null);

const data = { meta, ...raw, perks: withTags(raw.perks), changes, stats };
const curated = curatedFile.builds.map((b) => {
  const r = repairBuild(resolveBuild(b, data), data, changes);
  return { ...r, rating: scoreBuild(r.resolved.perks, b.role, b.playstyles, { stats: data.stats, killerId: r.resolved.killer?.id }) };
});
const generated = generateBuilds(data, curated, changes);
const allBuilds = [...curated, ...generated];
const perkById = new Map(data.perks.map((p) => [p.id, p]));
const today = new Date().toISOString().slice(0, 10);
const lastmod = (meta.fetchedAt ?? new Date().toISOString()).slice(0, 10);
// Every page shows build scores, which include the NightLight community part,
// so a page also changes when new stats are imported.
const sitemapLastmod = [lastmod, stats?.collectedAt?.slice(0, 10)].filter(Boolean).sort().at(-1);

// ---------- 1. App data ----------
// Trim fields that the public static app never needs:
// - remote wiki icon URLs when a local cached icon exists (~175 KB saved)
// - survivor topPerks beyond top 10 / topBuilds beyond top 5 (~500 KB saved; CharacterList only renders those)
// Also embed pre-generated build blueprints + auto-update status so the browser
// avoids running generateBuilds() (~5.6 s) and an extra /data/status.json waterfall.
const stripRemote = (list, field = 'icon') =>
  list.map((x) => {
    const img = x[field];
    if (!img?.local || !img.remote) return x;
    return { ...x, [field]: { local: img.local } };
  });
const compactRaw = {
  perks: stripRemote(raw.perks, 'icon'),
  killers: stripRemote(raw.killers, 'portrait'),
  survivors: stripRemote(raw.survivors, 'portrait'),
  items: stripRemote(raw.items, 'icon'),
  addons: stripRemote(raw.addons, 'icon'),
  offerings: stripRemote(raw.offerings, 'icon'),
};
const compactStats = stats
  ? {
      ...stats,
      survivors: stats.survivors
        ? Object.fromEntries(
            Object.entries(stats.survivors).map(([id, entry]) => [
              id,
              {
                ...entry,
                topPerks: (entry.topPerks ?? []).slice(0, 10),
                topBuilds: (entry.topBuilds ?? []).filter((b) => b.samples >= MIN_SAMPLES / 4).slice(0, 5),
              },
            ]),
          )
        : undefined,
    }
  : null;
const generatedBuilds = generated.map((b) => ({
  id: b.id,
  name: b.name,
  role: b.role,
  type: b.type,
  variant: b.variant,
  killer: b.killer,
  playstyles: b.playstyles,
  perks: b.perks,
  item: b.item,
  ...(b.itemAddons ? { itemAddons: b.itemAddons } : {}),
  ...(b.addons ? { addons: b.addons } : {}),
  offering: b.offering,
  why: b.why,
  howToPlay: b.howToPlay,
  ...(b.newPerks?.length ? { newPerks: b.newPerks } : {}),
}));
const prediction = predictNextPatch(history, autoState.announcements ?? meta.announcements ?? [], new Date());
const statusPayload = {
  enabled: true,
  static: true,
  lastCheck: autoState.lastCheck ?? null,
  lastResult: autoState.lastResult ?? null,
  prediction,
};
const appDataJson = JSON.stringify({
  meta,
  ...compactRaw,
  changes,
  stats: compactStats,
  patchNotes,
  patchHistory: history,
  curated: curatedFile,
  generatedBuilds,
  status: statusPayload,
});
const appDataHash = crypto.createHash('sha256').update(appDataJson).digest('hex').slice(0, 10);
const appDataFile = `data/app-data.${appDataHash}.json`;
await write(appDataFile, appDataJson);
await write('data/app-data.json', appDataJson);
await write('data/status.json', JSON.stringify(statusPayload));
// Tiny name/type index for functions/api/community so the Worker avoids parsing the full app-data.json on cold start.
await write(
  'data/community-index.json',
  JSON.stringify({
    perks: raw.perks.map((p) => ({ name: p.name, role: p.role })),
    killers: raw.killers.map((k) => ({ name: k.name })),
    items: raw.items.map((i) => ({ name: i.name, type: i.type })),
    addons: raw.addons.map((a) => ({ name: a.name, killer: a.killer, itemType: a.itemType })),
    offerings: raw.offerings.map((o) => ({ name: o.name })),
  }),
);
await fs.cp(path.join(ROOT, 'data', 'icons'), path.join(DIST, 'icons'), { recursive: true });

if (ADSENSE_CLIENT) await write('ads.txt', `google.com, ${ADSENSE_CLIENT.replace('ca-', '')}, DIRECT, f08c47fec0942fa0
`);

// ---------- 2. Page template ----------
const urls = []; // for the sitemap

// Google shows about 60 characters of a title; drop the site name before the
// page's own words get cut off.
const fitTitle = (title) => (title.length > 60 && title.endsWith(` | ${SITE}`) ? title.slice(0, -` | ${SITE}`.length) : title);

function page({ url, title, description, body, jsonLd = [], crumbs = [], noindex = false }) {
  if (!noindex) urls.push(url);
  title = fitTitle(title);
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
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}">`}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image"><meta property="og:image" content="${SITE_URL}/og-image.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:image" content="${SITE_URL}/og-image.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/seo.css">
${adHead}
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n')}
</head>
<body>
<header class="top"><a class="logo" href="/"><img src="/logo.svg" alt="" width="32" height="32">DBD<span>Toolbox</span></a>
<nav><a href="/">Build generator</a><a href="/builds/">Builds</a><a href="/perks/">Perks</a><a href="/patch/">Patch ${esc(meta.patch)}</a><a href="/perk-ranking/">Perk ranking</a><a href="/killers/">Killers</a><a href="/survivors/">Survivors</a><a href="/offerings/">Offerings</a></nav></header>
<main>
${crumbs.length ? `<p class="crumbs"><a href="/">${SITE}</a>${crumbs.map((c) => ` › <a href="${c.url}">${esc(c.name)}</a>`).join('')}</p>` : ''}
${body}
${adSlot}
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
<p class="muted">${b.type === 'beginner' ? 'Beginner' : b.type === 'auto' ? 'Auto-generated' : b.type === 'popular' ? 'Most played (NightLight)' : b.type === 'creator' ? 'Community pick' : b.type === 'meta' ? 'Strong / meta' : 'Fun'} · ${esc(b.killer ?? roleLabel(b.role))} · ${b.playstyles.map((s) => esc(styleLabel(b.role, s))).join(', ')}</p>
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
      body: `<h1>All Dead by Daylight perks</h1><p>Patch ${esc(meta.patch)}. Click a perk to see what it does and which perks work best with it.${stats?.perks ? ' See also the <a href="/perk-ranking/">perk ranking</a> from community stats.' : ''}</p>${section('survivor')}${section('killer')}`,
      crumbs: [{ name: 'Perks', url: '/perks/' }],
    }),
  );
}

// Perk ranking (tier list from NightLight community stats). Rebuilt on every
// deploy, so it follows each new stats import automatically.
if (stats?.perks && Object.keys(stats.perks).length) {
  const pct = (v) => (v == null ? '–' : `${v.toFixed(1)}%`);
  const section = (role) => {
    const r = rankPerks(data.perks, stats, { role });
    const label = role === 'killer' ? 'kill rate' : 'escape rate';
    const tiers = r.tiers
      .map(
        (t) => `<h3>Tier ${t.id} <span class="muted">– ${esc(t.label.toLowerCase())} (${t.perks.length})</span></h3>` +
          (t.perks.length
            ? `<ol class="list" start="${t.perks[0].place}">${t.perks
                .map((e) => `<li>${icon(e.perk, 32)} ${perkLink(e.perk)} <span class="muted">${pct(e.rate)} ${label} (${e.delta >= 0 ? '+' : ''}${e.delta.toFixed(1)}), used in ${pct(e.usage)} of games, ${e.count} games</span></li>`)
                .join('')}</ol>`
            : '<p class="muted">No perks.</p>'),
      )
      .join('');
    return `<h2>${roleLabel(role)} perk ranking</h2><p class="muted">${r.ranked.length} perks ranked, average ${label} ${r.average}%. ${r.unranked.length} perks have fewer than ${MIN_PERK_GAMES} games and are not ranked.</p>${tiers}`;
  };
  const top = (role) => rankPerks(data.perks, stats, { role }).ranked.slice(0, 3).map((e) => e.perk.name).join(', ');
  await write(
    'perk-ranking/index.html',
    page({
      url: '/perk-ranking/',
      title: `Dead by Daylight perk tier list from community stats (${periodLabel(stats)}) | ${SITE}`,
      description: short(`Which Dead by Daylight perks win most often? Tier list of survivor and killer perks from NightLight community stats. Top survivor perks: ${top('survivor')}. Top killer perks: ${top('killer')}.`),
      body: `<h1>Dead by Daylight perk ranking</h1>
<p>Survivor and killer perks ranked by how often they win compared with the average perk, from matches players upload to <a href="https://nightlight.gg">NightLight</a> (${esc(periodLabel(stats))}). The difference is shrunk for small samples (× games ÷ (games + ${PRIOR_GAMES})), so a perk with only a few games cannot top the list. Tiers: S ≥ +3, A ≥ +1.25, B about average, C ≤ −1.25, D ≤ −3. Community numbers are a strong hint, not proof: a perk can also win because good players pick it.</p>
${section('survivor')}${section('killer')}`,
      crumbs: [{ name: 'Perk ranking', url: '/perk-ranking/' }],
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
    const body = `<article class="hero">${icon(c, 96)}<div><h1>${esc(c.name)}${role === 'killer' ? ' builds &amp; perks' : ''}</h1><p class="muted">Dead by Daylight ${role}${power ? ` · Power: ${esc(power)}` : ''}</p></div></article>
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

// How a build's score is made: the parts, and the NightLight numbers per perk.
function scoreSection(b) {
  const r = b.rating;
  if (!r.parts?.length) return '';
  const sign = (v) => `${v > 0 ? '+' : ''}${v}`;
  const parts = r.parts
    .map((p) => `<tr><td>${esc(p.label)}</td><td>${p.id === 'community' ? sign(p.value) : p.value}${p.max && p.id !== 'community' ? ` / ${p.max}` : ''}</td><td class="muted">${esc(p.explain)}</td></tr>`)
    .join('');
  const c = r.community;
  const label = b.role === 'killer' ? 'Kill rate' : 'Escape rate';
  const perkRows = c
    ? c.perks
        .map((p) => `<tr><td>${esc(p.name)}</td><td>${p.rate != null ? `${p.rate.toFixed(1)}%` : '–'}</td><td>${p.delta != null ? sign(p.delta.toFixed(1)) : '–'}</td><td>${p.count != null ? p.count.toLocaleString('en') : '–'}</td><td>${p.strength == null || p.weight === 0 ? 'not counted' : sign(p.strength.toFixed(1))}</td></tr>`)
        .join('')
    : '';
  return `<h2>How this score is made</h2>
<p>Score ${r.score}/100 = rules ${r.base}${c ? ` ${c.points >= 0 ? '+' : '−'} ${Math.abs(c.points)} from NightLight community stats` : ''}${r.base + (c?.points ?? 0) !== r.score ? ' (capped to 0–100)' : ''}. The rules part is calculated by this site from the perk descriptions; only the community part comes from real match results.</p>
<table class="stats-table"><thead><tr><th>Part</th><th>Points</th><th>What it measures</th></tr></thead><tbody>${parts}</tbody></table>
${c ? `<h3>NightLight numbers per perk</h3><p class="muted">${label} of each perk vs the average ${b.role} perk (${stats.perkAverage?.[b.role]}%). Strength = difference × games ÷ (games + ${PRIOR_GAMES}); perks under ${MIN_PERK_GAMES} games count 0. Build points = 0.6 × sum of strength, at most ±10. Source: NightLight.gg, ${esc(periodLabel(stats))}.</p>
<table class="stats-table"><thead><tr><th>Perk</th><th>${label}</th><th>vs avg</th><th>Games</th><th>Strength</th></tr></thead><tbody>${perkRows}</tbody></table>` : ''}`;
}

// ---------- 5. Build pages ----------
const buildTitles = new Set();
for (const b of allBuilds) {
  const perks = b.resolved.perks.filter(Boolean);
  const kind = b.type === 'beginner' ? 'beginner-friendly' : b.type === 'auto' ? 'auto-generated' : b.type === 'popular' ? 'most played (community stats)' : b.type === 'creator' ? 'community-recommended' : b.type === 'meta' ? 'strong (meta)' : 'fun';
  const who = b.killer ?? (b.role === 'killer' ? 'any killer' : 'survivors');
  let title = `${b.name} – ${b.role === 'killer' ? `${who} build` : 'survivor build'} | ${SITE}`;
  // Two builds can share a name; the first two perks tell them apart.
  if (buildTitles.has(title)) title = `${b.name} – ${perks.slice(0, 2).map((p) => p.name).join(' & ')} | ${SITE}`;
  buildTitles.add(title);
  const description = short(`${b.name}: a ${kind} Dead by Daylight build for ${who} with ${perks.map((p) => p.name).join(', ')}. ${b.why}`);
  const extra = [b.resolved.item, b.resolved.killer, ...(b.resolved.addons ?? []), b.resolved.offering].filter(Boolean);
  const body = `<h1>${esc(b.name)}</h1>
<p class="muted">A ${esc(kind)} Dead by Daylight build for ${esc(who)} · playstyle: ${b.playstyles.map((s) => esc(styleLabel(b.role, s))).join(', ')} · synergy score ${b.rating.score}/100 · patch ${esc(meta.patch)}</p>
<h2>Perks</h2><ul class="combos">${perks.map((p) => `<li>${icon(p, 48)} ${perkLink(p)} – ${esc(short(p.description, 200))}</li>`).join('')}</ul>
${extra.length ? `<h2>${b.role === 'killer' ? 'Killer & add-ons' : 'Item & add-ons'}</h2><ul class="combos">${extra.map((e) => `<li>${icon(e, 40)} <strong>${esc(e.name)}</strong>${e.description ? ` – ${esc(short(e.description, 160))}` : ''}</li>`).join('')}</ul>` : ''}
<h2>Why it works</h2><p>${esc(b.why)}</p>
${b.source ? `<p class="muted">Recommended by <a href="${esc(b.source.url)}" rel="nofollow noopener">${esc(b.source.name)}</a>${b.source.date ? ` (${esc(b.source.date)})` : ''}.</p>` : ''}
${b.howToPlay ? `<h2>How to play</h2><p>${esc(b.howToPlay)}</p>` : ''}
${scoreSection(b)}
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

// ---------- 5a. Current patch page ----------
// One fixed URL (/patch/) that always shows the newest patch: what changed and
// the best builds now. The hourly patch check rebuilds it on patch day, so the
// fresh content is there when people search for "best builds patch X".
{
  // A patch can arrive in several refreshes (patch day, then wiki edits), so
  // merge every record for the current patch: earliest "before", latest "after".
  const records = patchNotes.filter((r) => r.toPatch === meta.patch && r.fromPatch !== null);
  const perkDetails = new Map();
  for (const r of [...records].reverse()) {
    for (const d of r.details?.perks ?? []) {
      const k = `${d.role}:${d.id}`;
      perkDetails.set(k, perkDetails.has(k) ? { ...d, before: perkDetails.get(k).before } : d);
    }
  }
  const merged = {
    details: { perks: [...perkDetails.values()].filter((d) => d.before !== d.after) },
    newPerkIds: [...new Set(records.flatMap((r) => r.newPerkIds ?? []))],
  };
  const impact = analysePatch(merged, data, allBuilds);
  const newNames = (kind) => [...new Set(records.flatMap((r) => r[kind]?.added ?? []))];
  const newKillers = data.killers.filter((c) => newNames('killers').includes(c.name));
  const newSurvivors = data.survivors.filter((c) => newNames('survivors').includes(c.name));
  const patchDate = history.find((h) => h.version === meta.patch)?.date;
  const real = impact.perks.filter((x) => x.judgement.verdict !== 'text');
  const best = (role, n = 6) =>
    allBuilds.filter((b) => b.role === role && b.type !== 'auto').sort((a, b) => b.rating.score - a.rating.score).slice(0, n);
  const withNew = allBuilds.filter((b) => b.resolved.perks.some((p) => p && merged.newPerkIds.includes(p.id))).slice(0, 6);
  const charLink = (c, folder) => `<li>${icon(c, 40)} <a href="/${folder}/${c.id}/">${esc(c.name)}</a></li>`;
  const topPerks = (role) =>
    stats?.perks ? rankPerks(data.perks, stats, { role }).ranked.slice(0, 5).map((e) => perkLink(e.perk)).join(', ') : '';

  // The wiki often lists a new killer before the patch is out, so the refresh
  // on patch day sees nothing new. The killers page is in release order, so
  // the last one is the newest: always show it with its perks and builds.
  const newest = newKillers.length ? null : data.killers.at(-1);
  const newestPerks = newest ? (newest.perks ?? []).map((id) => perkById.get(id)).filter(Boolean) : [];
  const newestBuilds = newest ? allBuilds.filter((b) => b.killer === newest.name).sort((a, b) => b.rating.score - a.rating.score).slice(0, 3) : [];
  const newestHtml = newest
    ? `<h2>Newest killer: ${esc(newest.name)}</h2><article class="hero">${icon(newest, 96)}<div><p><a href="/killers/${newest.id}/">${esc(newest.name)} builds, perks &amp; add-ons</a></p><p>Perks: ${newestPerks.map(perkLink).join(', ')}</p></div></article>${newestBuilds.length ? `<div class="grid">${newestBuilds.map(buildCardHtml).join('')}</div>` : ''}`
    : '';
  const whatsNew = [
    newKillers.length ? `<h3>New killer${newKillers.length > 1 ? 's' : ''}</h3><ul class="combos">${newKillers.map((c) => charLink(c, 'killers')).join('')}</ul>` : '',
    newSurvivors.length ? `<h3>New survivor${newSurvivors.length > 1 ? 's' : ''}</h3><ul class="combos">${newSurvivors.map((c) => charLink(c, 'survivors')).join('')}</ul>` : '',
    impact.newPerks.length ? `<h3>New perks (${impact.newPerks.length})</h3><ul class="combos">${impact.newPerks.map((p) => `<li>${icon(p, 32)} ${perkLink(p)} <span class="muted">${roleLabel(p.role)}</span> – ${esc(short(p.description, 180))}</li>`).join('')}</ul>` : '',
    real.length
      ? `<h3>Perk changes (${real.length})</h3><p class="muted">Buff or nerf is judged by this site from the old and new perk text (numbers, durations, conditions).</p><ul class="combos">${real
          .map((x) => `<li>${x.perk ? icon(x.perk, 32) : ''} ${x.perk ? perkLink(x.perk) : esc(x.name)} <strong>${VERDICTS[x.judgement.verdict].icon} ${LEVELS[x.judgement.level] ?? ''} ${VERDICTS[x.judgement.verdict].label.toLowerCase()}</strong> <span class="muted">${roleLabel(x.role)} perk, in ${x.builds.length} build${x.builds.length === 1 ? '' : 's'}</span>${x.judgement.changes.length ? `<br><span class="small">${x.judgement.changes.map((c) => esc(c.label)).join(' · ')}</span>` : ''}</li>`)
          .join('')}</ul>`
      : '',
  ].join('');
  const affected = impact.builds.filter((e) => !['auto', 'popular'].includes(e.build.type)).slice(0, 6).map((e) => e.build);
  const summary = [
    newKillers.length ? `new killer ${newKillers.map((c) => c.name).join(', ')}` : '',
    impact.newPerks.length ? `${impact.newPerks.length} new perks` : '',
    real.length ? `${real.length} perk changes` : '',
  ].filter(Boolean);
  const description = short(
    `Dead by Daylight patch ${meta.patch}${patchDate ? ` (${patchDate})` : ''}: ${summary.length ? `${summary.join(', ')}, ` : ''}the best killer and survivor builds now and which builds the patch changes.`,
  );
  await write(
    'patch/index.html',
    page({
      url: '/patch/',
      title: `Best DBD builds for patch ${meta.patch}${newKillers.length ? ` (${newKillers[0].name})` : ''} – what changed | ${SITE}`,
      description,
      body: `<h1>Best Dead by Daylight builds for patch ${esc(meta.patch)}</h1>
<p>Patch ${esc(meta.patch)}${patchDate ? `, released ${esc(patchDate)}` : ''}. This page updates automatically when a new patch comes out: what changed for perks and characters, which builds are affected, and the strongest builds right now.</p>
<h2>What changed in patch ${esc(meta.patch)}</h2>
${whatsNew || '<p>No perk or character changes in this patch so far. Changes appear here as soon as the Dead by Daylight Wiki is updated.</p>'}
${newestHtml}
${withNew.length ? `<h2>Builds with the new perks</h2><div class="grid">${withNew.map(buildCardHtml).join('')}</div>` : ''}
${affected.length ? `<h2>Builds changed by this patch</h2><p class="muted">Hand-picked builds that use a perk that changed.</p><div class="grid">${affected.map(buildCardHtml).join('')}</div>` : ''}
<h2>Best killer builds in patch ${esc(meta.patch)}</h2><div class="grid">${best('killer').map(buildCardHtml).join('')}</div>
<h2>Best survivor builds in patch ${esc(meta.patch)}</h2><div class="grid">${best('survivor').map(buildCardHtml).join('')}</div>
${stats?.perks ? `<h2>Top perks from community stats</h2><p>Survivor: ${topPerks('survivor')}.<br>Killer: ${topPerks('killer')}.</p><p class="muted">From NightLight (${esc(periodLabel(stats))}). Full list: <a href="/perk-ranking/">perk ranking</a>.</p>` : ''}
<p><a href="/builds/">All builds</a> · <a href="/perks/">All perks</a> · <a href="/killers/">All killers</a></p>`,
      crumbs: [{ name: `Patch ${meta.patch}`, url: '/patch/' }],
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
      description: short(`Dead by Daylight offerings tier list for patch ${meta.patch}: every offering rated 1–5 stars for how much it helps you win. Best: ${best.join(', ')}.`),
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
<h2>Community statistics</h2><p>Pick rates, kill and escape rates and the "Most played" builds come from <a href="https://nightlight.gg">NightLight</a>, which collects them from matches that players upload. They are not official numbers and only cover players who use NightLight.</p>
<h2>Privacy</h2><p>${ADSENSE_CLIENT ? 'No accounts. Visitor counts come from Cloudflare Web Analytics, which uses no cookies and does not track individual visitors. Pages show ads from Google AdSense; in the EU/UK you are asked for consent first, and Google may use cookies only as you allow (<a href="https://policies.google.com/technologies/ads">how Google uses data</a>).' : 'No accounts, no ads and no tracking cookies. Visitor counts come from Cloudflare Web Analytics, which uses no cookies and does not track individual visitors.'} Favourites, your own builds and challenge progress are stored only in your own browser (localStorage).</p>`,
    crumbs: [{ name: 'About', url: '/about/' }],
  }),
);
await write(
  '404.html',
  page({ url: '/404', noindex: true, title: `Page not found | ${SITE}`, description: 'This page does not exist.', body: '<h1>Page not found</h1><p>This page does not exist (anymore). Perks are sometimes renamed after a patch.</p>' }),
);

// ---------- 7. Home page (the React app) with crawlable fallback content ----------
{
  const file = path.join(DIST, 'index.html');
  let html = await fs.readFile(file, 'utf8');
  const description = `Free Dead by Daylight build generator: meta & fun survivor and killer builds for patch ${meta.patch}, perk combos, a build maker and challenges.`;
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
<meta property="og:url" content="${SITE_URL}/"><meta name="twitter:card" content="summary_large_image"><meta property="og:image" content="${SITE_URL}/og-image.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:image" content="${SITE_URL}/og-image.png">
<link rel="preload" href="/${appDataFile}" as="fetch" crossorigin>
${verification}
${adHead}
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
${urls.map((u) => `<url><loc>${SITE_URL}${u}</loc><lastmod>${sitemapLastmod}</lastmod></url>`).join('\n')}
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
- [Current patch](${SITE_URL}/patch/): what changed in patch ${meta.patch} and the best builds for it, updated on every patch
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
  '_headers',
  `/assets/*
  Cache-Control: public, max-age=31536000, immutable
/data/app-data.*.json
  Cache-Control: public, max-age=31536000, immutable
/data/app-data.json
  Cache-Control: public, max-age=300, stale-while-revalidate=3600
/data/status.json
  Cache-Control: public, max-age=300, stale-while-revalidate=3600
/data/community-index.json
  Cache-Control: public, max-age=300, stale-while-revalidate=3600
/icons/*
  Cache-Control: public, max-age=2592000, stale-while-revalidate=86400
/seo.css
  Cache-Control: public, max-age=86400, stale-while-revalidate=86400
`,
);
// Exclude static assets from Pages Functions (_middleware.js) so Cloudflare serves them directly from edge CDN.
await write(
  '_routes.json',
  JSON.stringify(
    {
      version: 1,
      include: ['/*'],
      exclude: [
        '/assets/*',
        '/icons/*',
        '/data/*',
        '/seo.css',
        '/favicon.svg',
        '/logo.svg',
        '/og-image.png',
        '/robots.txt',
        '/sitemap.xml',
        '/llms.txt',
        '/ads.txt',
      ],
    },
    null,
    2,
  ),
);

console.log(`Static site ready in dist/: ${urls.length} pages in the sitemap, ${allBuilds.length} builds. Site URL: ${SITE_URL}`);
