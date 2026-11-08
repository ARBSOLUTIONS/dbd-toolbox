// Community builds: shared logic for the live site (Cloudflare Pages Functions +
// D1 database) and the local dev server (JSON file). Both pass in a `store` with
// the same small interface, so the rules below are the same everywhere.
//
// Rules against abuse:
//   - all perk/item/add-on/offering names must exist in the current game data
//   - names and texts have length limits; control characters are removed
//   - at most CREATE_LIMIT new builds per visitor per hour
//   - one vote per visitor per build (a visitor = a salted hash of their IP;
//     the IP itself is never stored)
//   - builds are hidden after HIDE_REPORTS reports, or when the score is HIDE_SCORE or lower

export const CREATE_LIMIT = 5;
export const HIDE_REPORTS = 3;
export const HIDE_SCORE = -5;
const PLAYSTYLE_IDS = {
  survivor: ['stealth', 'chase', 'gen-rush', 'altruism', 'aura', 'anti-tunnel', 'healing', 'endgame', 'sabotage', 'boon', 'items', 'totems'],
  killer: ['slowdown', 'aura', 'chase', 'stealth', 'hex', 'scourge', 'endgame', 'anti-heal', 'snowball', 'info'],
};

export class CommunityError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const clean = (s, max) =>
  String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** Builds quick lookup sets from the game data (app-data.json). */
export function indexGameData(data) {
  const byRole = (role) => new Set(data.perks.filter((p) => p.role === role).map((p) => p.name));
  return {
    perks: { survivor: byRole('survivor'), killer: byRole('killer') },
    killers: new Set(data.killers.map((k) => k.name)),
    items: new Map(data.items.map((i) => [i.name, i.type])),
    addons: data.addons,
    offerings: new Set(data.offerings.map((o) => o.name)),
  };
}

/** Checks a submitted build. Returns a clean build object or throws CommunityError. */
export function validateBuild(body, game) {
  if (!body || typeof body !== 'object') throw new CommunityError('Invalid request.');
  const role = body.role === 'killer' ? 'killer' : body.role === 'survivor' ? 'survivor' : null;
  if (!role) throw new CommunityError('Role must be survivor or killer.');

  const name = clean(body.name, 40);
  if (name.length < 3) throw new CommunityError('Give your build a name (at least 3 characters).');
  const description = clean(body.description, 500);
  const author = clean(body.author, 24) || null;

  const perks = [...new Set((body.perks ?? []).map((p) => String(p)))];
  if (perks.length < 1 || perks.length > 4) throw new CommunityError('A build needs 1 to 4 perks.');
  const unknown = perks.filter((p) => !game.perks[role].has(p));
  if (unknown.length) throw new CommunityError(`Unknown ${role} perk: ${unknown.join(', ')}`);

  let killer = null;
  let item = null;
  if (role === 'killer') {
    killer = body.killer ? String(body.killer) : null;
    if (killer && !game.killers.has(killer)) throw new CommunityError('Unknown killer.');
  } else {
    item = body.item ? String(body.item) : null;
    if (item && !game.items.has(item)) throw new CommunityError('Unknown item.');
  }

  const addons = [...new Set((body.addons ?? []).map(String))].slice(0, 2);
  for (const a of addons) {
    const ok = game.addons.some((x) =>
      x.name === a && (role === 'killer' ? x.killer === killer : x.itemType === game.items.get(item)),
    );
    if (!ok) throw new CommunityError(`Add-on "${a}" does not fit this ${role === 'killer' ? 'killer' : 'item'}.`);
  }

  const offering = body.offering ? String(body.offering) : null;
  if (offering && !game.offerings.has(offering)) throw new CommunityError('Unknown offering.');

  const playstyles = (body.playstyles ?? []).filter((s) => PLAYSTYLE_IDS[role].includes(s)).slice(0, 3);

  return { role, name, description, author, killer, perks, item, addons, offering, playstyles };
}

/** Salted SHA-256 of the visitor's IP (works in Cloudflare Workers and Node 20+). */
export async function visitorHash(ip, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

const newId = () => `cb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Public shape of a stored build (never includes the visitor hash). */
function publicBuild(row, myVote = 0) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    author: row.author,
    role: row.role,
    killer: row.killer,
    perks: row.perks,
    item: row.item,
    addons: row.addons,
    offering: row.offering,
    playstyles: row.playstyles,
    up: row.up,
    down: row.down,
    score: row.up - row.down,
    createdAt: row.created_at,
    myVote,
  };
}

export async function listBuilds(store, { role, killer, sort = 'top', voter } = {}) {
  const rows = await store.list({ role: role === 'killer' || role === 'survivor' ? role : null, killer: killer || null });
  const visible = rows.filter((r) => !r.hidden);
  visible.sort((a, b) =>
    sort === 'new'
      ? b.created_at.localeCompare(a.created_at)
      : b.up - b.down - (a.up - a.down) || b.created_at.localeCompare(a.created_at),
  );
  const top = visible.slice(0, 100);
  const votes = voter ? await store.votesBy(voter, top.map((r) => r.id)) : {};
  return top.map((r) => publicBuild(r, votes[r.id] ?? 0));
}

export async function createBuild(store, body, { game, voter, now = new Date() }) {
  const build = validateBuild(body, game);
  const since = new Date(now.getTime() - 3600e3).toISOString();
  if ((await store.countCreated(voter, since)) >= CREATE_LIMIT) {
    throw new CommunityError(`You can share at most ${CREATE_LIMIT} builds per hour. Try again later.`, 429);
  }
  const row = { id: newId(), ...build, up: 0, down: 0, reports: 0, hidden: 0, created_at: now.toISOString(), creator: voter };
  await store.insert(row);
  return publicBuild(row);
}

/** value: 1 (thumbs up), -1 (thumbs down) or 0 (remove your vote). */
export async function voteBuild(store, id, value, { voter }) {
  const v = Number(value);
  if (![1, -1, 0].includes(v)) throw new CommunityError('Vote must be 1, -1 or 0.');
  const row = await store.get(id);
  if (!row || row.hidden) throw new CommunityError('Build not found.', 404);
  await store.setVote(id, voter, v);
  const counts = await store.recount(id);
  const hidden = counts.up - counts.down <= HIDE_SCORE || row.reports >= HIDE_REPORTS;
  if (hidden) await store.hide(id);
  return { id, up: counts.up, down: counts.down, score: counts.up - counts.down, myVote: v, hidden };
}

export async function reportBuild(store, id, { voter }) {
  const row = await store.get(id);
  if (!row) throw new CommunityError('Build not found.', 404);
  const reports = await store.addReport(id, voter);
  if (reports >= HIDE_REPORTS) await store.hide(id);
  return { id, reported: true };
}
