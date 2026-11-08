// Tells search engines that support IndexNow (Bing, Yandex, Seznam, ...) about
// all pages in the sitemap, so new and updated pages get indexed quickly.
// Bing also powers Copilot and ChatGPT search results. We post to Bing's
// endpoint directly; it shares submissions with the other IndexNow engines.
// Run after the site is deployed:  npm run indexnow
import fs from 'node:fs/promises';

const SITE_URL = (process.env.SITE_URL || 'https://dbd-toolbox.pages.dev').replace(/\/$/, '');
const { key } = JSON.parse(await fs.readFile(new URL('../indexnow.json', import.meta.url), 'utf8'));
const sitemap = await fetch(`${SITE_URL}/sitemap.xml`).then((r) => r.text());
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urlList.length) throw new Error('No URLs found in the live sitemap. Is the site deployed?');

const res = await fetch('https://www.bing.com/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE_URL).host, key, keyLocation: `${SITE_URL}/${key}.txt`, urlList }),
});
const body = (await res.text()).trim();
console.log(`IndexNow: sent ${urlList.length} URLs, response HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
if (res.status === 403) {
  console.log('A brand-new key is verified by the search engine first; large batches are refused until then. Try again later.');
}
if (res.status >= 400) process.exit(1);
