// Forgiving search: ignores case, accents (Déjà Vu = deja vu), spaces and
// punctuation (Pop Goes the Weasel = popgoestheweasel, Hex: Ruin = hex ruin),
// and allows small typos in names (barbeque, decisive strik, dejavu).

/** Lowercase, strip accents and everything that is not a letter or digit. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Smallest edit distance between `q` and any part of `t` (Sellers' algorithm). */
function substringDistance(q, t) {
  let prev = new Array(t.length + 1).fill(0);
  for (let i = 1; i <= q.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = q[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return Math.min(...prev);
}

const allowedTypos = (n) => (n < 4 ? 0 : n < 8 ? 1 : 2);

/**
 * Prepared query. `matches(text)` checks one field:
 *   exact = also allow typos (use for names), otherwise only accent/space-insensitive.
 */
export function makeQuery(query) {
  const q = normalize(query);
  const typos = allowedTypos(q.length);
  // Separate words, for queries that skip a word ("pop goes weasel").
  const words = String(query ?? '')
    .split(/\s+/)
    .map(normalize)
    .filter((w) => w.length >= 2);
  return {
    empty: !q,
    q,
    /** 0 = starts with, 1 = contains, 2 = close (typo), Infinity = no match. */
    rank(text, { fuzzy = true } = {}) {
      if (!q) return 0;
      const t = normalize(text);
      if (t.startsWith(q)) return 0;
      if (t.includes(q)) return 1;
      if (fuzzy && typos && substringDistance(q, t) <= typos) return 2;
      if (fuzzy && words.length > 1 && words.every((w) => substringDistance(w, t) <= allowedTypos(w.length))) return 2;
      return Infinity;
    },
    matches(text, opts) {
      return this.rank(text, opts) !== Infinity;
    },
  };
}
