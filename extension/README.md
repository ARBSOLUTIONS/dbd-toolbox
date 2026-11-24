# DBD-Toolbox Updater (Chrome extension)

One-click update of the site data: it triggers the wiki check (`update-data.yml`),
collects the NightLight stats in a normal nightlight.gg tab and commits
`data/nightlight.json` through the GitHub API (Cloudflare Pages then rebuilds).

Install: `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
After changing a file here, press **Reload** on the extension card: Chrome keeps
running the old service worker until you do.

- **Full** update: feeds + every killer and survivor page (top perks and builds).
- **Quick** update: feeds only. It keeps the top perks and builds of the current
  `data/nightlight.json` (`mergeNightlight` in `lib/nightlight-core.js`). A commit
  that would lose them is refused.

The GitHub token is entered in the popup and kept in `chrome.storage`; it is never
part of these files.
