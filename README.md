# DBD-Toolbox

A personal web app that helps you find strong and fun Dead by Daylight builds.
It runs on your own PC and opens in your browser.

## What it can do

- **Builds**: hand-picked strong (meta) and fun builds with explanations and a
  synergy score. You can filter by role, killer, playstyle and meta/fun.
- **Combos**: pick a perk and see which perks, items and add-ons work best with
  it, each with a reason, plus the builds that use it. You can also click
  "Best combos →" on any perk card.
- **Build maker**: put together your own build. You get a live score with
  ✓/✗ explanations, warnings (e.g. two Exhaustion perks), and suggested perks
  and add-ons you can add with one click.
- **★ Favourites**: star any build or save your own. They are stored in your
  browser on this PC. Use **Export** to make a backup file and **Import** to
  load it again.
- **🎲 Challenges**: a challenge generator. It gives you a build plus an
  objective to complete in a real match. Choose role, difficulty and kind, or
  let it surprise you. You also get a **daily** and a **weekly** challenge (the
  same all day or all week). Accept a challenge, play it, and mark it ✓
  Completed or ✗ Failed to earn points.
- **🏆 Achievements**: 26 achievements you unlock by completing challenges,
  with progress bars and a pop-up when you unlock one.
- **Offerings tier list**: every offering rated 1–5 stars for how much it helps
  you **win**, with a short reason (`src/lib/offeringRatings.js`). The build
  maker sorts offerings by rating and suggests one, and generated builds get a
  fitting offering. The public site has the same list at `/offerings/`.
- **Perks, Killers, Survivors, Items, Offerings**: browse everything with icons
  and descriptions.

> **Licensed perks:** some perks from licensed chapters (e.g. Laurie Strode's
> Decisive Strike) are now copies of another perk (Will to Live). The app shows
> "same effect as …" on those perks and treats both as the same perk.

## What you need

- **Node.js** (version 20 or newer). Check in a terminal with `node -v`.
  Download it from <https://nodejs.org> if you don't have it.

## Install (once)

Open a terminal in this folder and run:

```bash
npm install
```

## Start the app

```bash
npm run dev
```

Then open **http://localhost:5173** in your browser.
Stop the app with `Ctrl + C` in the terminal.

## Refresh the data (after a new patch or chapter)

There are two ways to do it:

- In the app, click **Refresh data** (top right). The top bar shows the patch
  number and how old the data is. It turns orange after 14 days.
- Or run this in the terminal:

  ```bash
  npm run refresh-data
  ```

The first refresh takes about 8 minutes because it downloads around 1,500 icons
(perks, add-ons, items, offerings and portraits). Later refreshes only download
new icons and take about 20 seconds.

### Community stats (NightLight)

Pick rates, kill and escape rates, perk usage and the **📊 Most played** builds
come from [NightLight](https://nightlight.gg) (last 28 days, from matches that
players upload). They are saved in `data/nightlight.json` and used in:

- **Killers / Survivors**: pick rate, kill or escape rate, kill distribution,
  and each character's most used perks and builds.
- **Perks**: every perk card has a stats block: how often it is used (and its
  rank), its kill or escape rate against the average perk of its role, the
  number of games, and a verdict (▲ above average, ● about average, ▼ below
  average, ? too few games, under 100). The **Stats table** view lists all
  perks with these numbers; sort by most used, best rate or most above/below
  average, and filter by verdict.
- **Build scores**: the score (0–100) is the rule-based score (playstyle fit,
  synergy, balance) plus a **community part of −10 to +10**: for each perk,
  its kill/escape rate minus the average, weighted by how many games back it
  up (full weight from 400 games), times 0.6. Killer perks use that killer's
  own numbers when known, compared with that killer's kill rate. "Why this
  score" names the perks that win clearly more or less (4+ points) and perks
  with too few games. The generator uses the same score, so generated builds
  now prefer perks that win more often.
- **Builds**: every build card shows a 📊 line (the build's own numbers when
  NightLight lists that exact build, otherwise the average of its perks). You
  can sort by kill/escape rate or by most played. The generator adds "Most
  played" builds per killer and for survivors.
- `npm run check-builds` shows the numbers for the hand-picked builds and
  flags meta builds whose perks win clearly less than average.

NightLight's bot protection blocks scripts, so this project never downloads
from NightLight itself. You collect the stats in your own browser instead
(about 3 minutes, roughly 105 slow requests; please do this at most once a week):

1. Open <https://nightlight.gg/perks/viewer> in your browser and wait until it
   has loaded.
2. Open the developer console (F12 → Console), paste the whole content of
   `scripts/nightlight-collector.js` and press Enter. (Chrome may ask you to
   type `allow pasting` first.)
3. Wait until it downloads `nightlight-export-<date>.json`.
4. Import it:

   ```bash
   npm run update-stats -- --file path/to/nightlight-export-<date>.json
   ```

5. Commit `data/nightlight.json`. The public site picks it up on its next build.

A single saved killers feed (<https://nightlight.gg/api/v1/stats/global/killers>,
Ctrl + S) also works for a quick killer-only update; it keeps the perk and
build stats from the previous full import.

**Only the perk stats** (no console needed, about a minute):

1. Open <https://nightlight.gg/perks/viewer>, choose **Survivor Perks**, wait
   until the list has loaded, select all (Ctrl + A), copy (Ctrl + C) and paste
   it into a text file, e.g. `survivor-perks.txt`.
2. Do the same with **Killer Perks** → `killer-perks.txt`.
3. Import both:

   ```bash
   npm run update-stats -- --perks-text survivor-perks.txt --perks-text killer-perks.txt
   ```

The "Empty Slot" rows on that page (builds with fewer than 4 perks) are left
out: they are no perk, and their kill rates (up to 70%+) would distort the
average.

## Public website (DBD-Toolbox)

The public version is a **static website**. It has no server: the data is
built in, and visitors cannot start a wiki refresh. It is hosted for free on
**Cloudflare Pages**. **GitHub Actions** keeps the data up to date.

```
GitHub Actions (every hour)
  └─ scripts/ci-update.js  → is a check due? (patch prediction)
       └─ new patch? → refresh data → commit to GitHub
                                        └─ Cloudflare Pages rebuilds the site
                                             └─ IndexNow tells Bing about new pages
```

Build it yourself:

```bash
npm run build:static
```

The result is in `dist/`. Preview it with `npx vite preview`.

### Making it easy to find (Google and AI search)

`npm run build:static` creates, besides the app:

- **552 plain HTML pages**: one per perk, killer, survivor and build. Each has
  its own title, description, canonical URL and structured data
  (BreadcrumbList, FAQPage, WebApplication). Search engines and AI crawlers can
  read them without running JavaScript.
- `sitemap.xml`, `robots.txt` (all search engines **and** AI bots such as
  GPTBot, ClaudeBot and PerplexityBot are allowed) and `llms.txt` (a summary
  for AI assistants).
- Crawlable content on the home page (top builds and links) that shows until
  the app has loaded.

Two things only you can do (you need your own account):

1. **Google Search Console**: add the site → choose "HTML tag" → copy the code.
   In Cloudflare Pages → Settings → Environment variables, add
   `GOOGLE_SITE_VERIFICATION` = that code, then redeploy and click *Verify*.
   Then submit `https://dbd-toolbox.pages.dev/sitemap.xml` under *Sitemaps*.
2. **Bing Webmaster Tools** (also used by ChatGPT search and Copilot): import
   the site from Google Search Console, or use `BING_SITE_VERIFICATION` in the
   same way. New pages are also reported to Bing automatically with
   **IndexNow** (`npm run indexnow`).

Indexing usually takes a few days to a few weeks. Nobody can guarantee a
ranking.

## Automatic updates

**While the app is running** (`npm run dev` or `npm start`), the server checks
the wiki for a new patch by itself. Each check is one small request to the
wiki's main page. If the patch number changed, or the data is older than 14
days, it refreshes everything and the open app reloads the new data.

### Patch prediction: checking at the right time

The app **predicts when the next patch will come** and checks more often around
that time:

- **Announced releases**: the wiki main page announces upcoming chapters, e.g.
  *"Terrifier … set to release on 24 November 2026"*. The app reads this on
  every check.
- **The patch rhythm**: the app stores the patch history from
  `/wiki/Patches/<year>` in `data/patch-history.json`. In 2025–2026, 83% of
  patches came out on a **Tuesday**, about every 9 days (counting hotfixes).
  From that it predicts the next likely day.

How often it checks:

| When | Check every |
|---|---|
| Normal days | 12 hours |
| Predicted patch day, from 14:00 UTC (15:00 Dutch time in winter) until the end of the next day | **1 hour** |
| The 2 days after that (the wiki is still being updated) | 4 hours |
| 24 hours after an update | one extra **follow-up refresh**, to pick up wiki edits made after the release |

The top bar shows *"Next patch ≈ Tue 10 Nov (likely) · Tue 24 Nov Terrifier
chapter"* and *"Auto-update on · next check in 11 hours"*. Hover over them for
details.

> The prediction is an estimate. The wiki only gives dates, not times, and
> 14:00 UTC as the start of the release window is an assumption. If a patch
> comes on an unexpected day, the normal 12-hour check still finds it.

After an update that changed something, a yellow banner shows **what changed**:
new perks, changed perks, new killers and add-ons. Click a perk to see its best
combos. Builds that use a new perk get a ✨ label, and you can filter them with
"✨ Uses new perks".

You can change this with environment variables, for example in PowerShell:

```powershell
$env:AUTO_UPDATE="off"; npm run dev          # no automatic checks
$env:AUTO_UPDATE_HOURS="6"; npm run dev      # normal checks every 6 hours instead of 12
```

**When the app is closed**, you can let Windows do the check once a day with
Task Scheduler:

1. Open *Task Scheduler* → *Create Basic Task* → name it "DBD data" → *Daily*.
2. Action: *Start a program*.
   - Program: `cmd`
   - Arguments: `/c npm run refresh-data -- --if-new-patch`
   - Start in: the folder of this project, e.g. `G:\dead by daylight build`
3. Finish. It makes one small request a day and only downloads everything when
   there is a new patch.

## Automatically generated builds and combinations

Besides the hand-picked builds, the app **generates builds by itself** from the
current data each time it loads. Choose **Auto-generated** on the Builds tab.

- Per playstyle, a standard build and an **off-meta** variant that avoids the
  most common perks, so you also see less obvious combinations.
- **One build per killer**, built around that killer's own perks and add-ons.
- **A "New: …" build for every new perk** after a patch, so new perks are
  tried in a full combination right away.

The generator (`src/lib/generator.js`) adds one perk at a time: each time it
picks the perk that raises the synergy score the most. It also respects the
rules (one Exhaustion perk, no identical twins). Generated builds are a
starting point. They are not tested in real matches.

> **Why no scraping of build websites?** Sites with build statistics
> (Nightlight.gg, dbd.tricky.lol) blocked automated access, and their terms of
> use could not be read. So it is unclear whether scraping them is allowed. If
> you check their terms in your browser and they allow it, a statistics source
> can be added later.

## Challenges and achievements

**Kinds of challenges**

| Kind | What you get |
|---|---|
| Perk roulette | 4 random perks (never two Exhaustion perks or identical twins) and a random item or add-ons |
| Theme | Only perks from one playstyle, e.g. "Only Stealth" |
| Adept | Only the 3 unique perks of one character, like the in-game *Adept* achievements. Survivors must escape; killers need a Merciless Killer result |
| Restriction | A rule: *Naked* (no perks), *Hex Gambler* (only hexes), *Totem Keeper* (only boons), *Hipster* (only perks no hand-picked build uses), *Empty Hands* (no item) or *Base Kit Power* (no add-ons) |
| Meme build | Out of 12 random builds, the one with the **lowest** synergy score |
| Killer roster | A random killer with a build made for it |

**Points**: easy 10, medium 25, hard 50. Adept gives +25, meme and restriction
give +15, and *Naked* gives ×1.5.

**Achievements** include First Blood, Dedicated (10), Veteran (50), Adept
Collector (10 characters), Full Roster (every killer), Jack of All Trades (every
survivor playstyle), daily streaks of 3 and 7 days, Meme Lord and Architect (3
of your own builds). The full list with conditions is in
`src/lib/achievements.js`.

Your challenges and achievements are saved in this browser on this PC. Use
**Export** and **Import** on the Challenges tab to make a backup or move them.
The app cannot see your real matches, so *you* mark a challenge as completed.

## Builds: where they come from and how to add your own

- The builds are in **`builds/builds.json`**. A refresh never overwrites this file,
  so you can add or edit builds yourself. Copy an existing build and change it.
- Names must match the wiki exactly. After a new patch, run:

  ```bash
  npm run check-builds
  ```

  It lists every perk, item or add-on that was renamed or removed. The app
  also shows a ⚠ warning on such builds.
- Every perk has **hand-checked playstyle tags** (stealth, chase, slowdown, ...)
  in `src/lib/perkTags.js`. The first tag is the perk's main purpose. Perks
  that are new after a patch get a best guess from keyword rules until you add
  them to that file.
- The builds are hand-picked based on general community knowledge. They are
  **not** taken from live statistics.
- The **synergy score (0–100)** is calculated by the app (`src/lib/builds.js`).
  It looks at how well the perks fit the playstyle, at known strong pairs, and
  at basic needs (for example, killers need gen slowdown). It also gives
  penalties for conflicts, such as two Exhaustion perks or hexes without
  protection. Treat it as a rough guide, not as a win rate.

## After a new patch or chapter: checklist

1. Usually nothing: the app refreshes by itself (see *Automatic updates*).
   You can also click **Refresh data** or run `npm run refresh-data`.
2. Run the tests:

   ```bash
   npm test
   ```

   - *"Perks without manual tags"* lists new perks. Add them to
     `src/lib/perkTags.js` with 1–3 tags.
   - *"names not found in data"* means a perk was renamed or removed. Fix
     the name in `perkTags.js`.
   - *"Build ..."* means a hand-picked build uses a name that no longer
     exists. Fix it in `builds/builds.json`.

## Where the data comes from

| Source | What | Rules we follow |
|---|---|---|
| [Dead by Daylight Wiki](https://deadbydaylight.wiki.gg) | Perks, killers, survivors, items, add-ons, offerings, descriptions, icons | Only normal `/wiki/` pages and `/images/`, which robots.txt allows. No `api.php` or Special/Cargo pages. Max ~1 request per second. Content is **CC BY-NC-SA 3.0**: personal, non-commercial use with credit. |

| [NightLight](https://nightlight.gg/killers/viewer?shown=pick) | Killer and survivor pick, kill and escape rates; perk usage; each character's top perks and builds (last 28 days, from matches players upload) | Collected by hand in your own browser with `scripts/nightlight-collector.js`: the public stats feeds and character pages (allowed by robots.txt), one request every 1.5 s, at most about once a week. This project never fetches from NightLight automatically, because their bot protection blocks scripts. NightLight asks for a low request rate and credit, so every page with these numbers names NightLight as the source. |

## Project layout

```
builds/builds.json hand-picked builds (yours to edit; never overwritten)
data/              saved wiki data (*.json, meta.json, patch-history.json) and icons/
scripts/           refresh-data.js, check-builds.js, build-static.js (public site),
                   ci-update.js (GitHub Actions), indexnow.js
.github/workflows/ update-data.yml: hourly patch check and data update
server/
  parse.js         reads wiki pages and turns them into data
  wiki.js          polite downloader (rate limit, allowed paths only)
  refresh.js       fetches everything and writes data/
  index.js         small local server for the app (port 3001)
  autoUpdate.js    plans and runs the automatic patch checks
  predict.js       predicts the next patch (announcements + patch rhythm)
  changes.js       works out what changed between two refreshes
test/              npm test: checks tags, names and build logic
src/               the React web app (what you see in the browser)
  lib/perkTags.js  hand-checked tags for every perk
  lib/tags.js      playstyles + keyword rules for perks not in perkTags.js yet
  lib/builds.js    links builds to the data and calculates the score
  lib/combos.js    finds perks, items and add-ons that go well together
  lib/generator.js generates builds automatically from the current data
  lib/challenges.js  challenge generator (kinds, daily/weekly)
  lib/achievements.js achievements and their conditions
  lib/favorites.js saves favourites in the browser (localStorage)
```
