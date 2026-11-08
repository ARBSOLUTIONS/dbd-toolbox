// Polite HTTP client for the Dead by Daylight Wiki.
// - Only fetches /wiki/ article pages and /images/ files (allowed by robots.txt;
//   api.php, Special: pages and Cargo queries are disallowed and never used).
// - Waits between requests and backs off when the wiki says "slow down" (HTTP 429/503).
import { WIKI_BASE } from './parse.js';

const USER_AGENT = 'DBDBuildHelper/0.1 (personal, non-commercial build helper; low request rate)';
const DELAY_MS = 1000; // at most ~1 request per second
const ALLOWED = [/^\/wiki\/(?!Special:|Data:|User:|MediaWiki:)[^?]+$/, /^\/images\//];

let lastRequest = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function politeFetch(path, { binary = false, delayMs = DELAY_MS } = {}) {
  const url = new URL(path, WIKI_BASE);
  if (url.origin !== WIKI_BASE || !ALLOWED.some((re) => re.test(url.pathname))) {
    throw new Error(`Refusing to fetch ${url.href}: not an allowed wiki path`);
  }

  for (let attempt = 1; attempt <= 4; attempt++) {
    const wait = lastRequest + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();

    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) return binary ? Buffer.from(await res.arrayBuffer()) : res.text();

    if (res.status === 429 || res.status === 503) {
      const retryAfter = Number(res.headers.get('retry-after')) || 5 * attempt;
      await sleep(retryAfter * 1000);
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${url.href}`);
  }
  throw new Error(`Gave up on ${url.href} after repeated rate limiting`);
}
