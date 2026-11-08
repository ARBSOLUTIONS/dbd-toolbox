// Judges patch changes: is a perk change a buff or a nerf, how big is it, and
// which builds does it affect? Works on the old and new perk text, so it is an
// estimate: numbers like durations, cooldowns and percentages are compared and
// the words around each number decide whether more is better or worse.

// Words that mean "a lower number is better for the player using the perk".
const LOWER_IS_BETTER =
  /\b(exhaust\w*|cool-?downs?|recharg\w*|requir\w*|needs?|needed|costs?|penalt\w*|delay\w*|lose|loses|losing|wait\w*|after\s+\w+\s+seconds?)\b/i;

// "60/50/40 seconds", "+15%", "3.5 metres": we compare the last (best tier) value.
const NUMBER = /[+-]?\d+(?:\.\d+)?(?:\s*\/\s*[+-]?\d+(?:\.\d+)?)*\s*(%|seconds?|metres?|meters?|tokens?|times?|charges?)?/gi;

/** Cuts text to about n characters at a word boundary (n < 0: keep the end). */
function clip(text, n) {
  const t = text.replace(/^[\s•]+/, '');
  if (Math.abs(n) >= t.length) return t;
  if (n > 0) return `${t.slice(0, n).replace(/\s+\S*$/, '')} …`;
  return `… ${t.slice(n).replace(/^\S*\s+/, '')}`;
}

function numbersIn(text) {
  const out = [];
  for (const line of (text ?? '').split(/\n|(?<=\.)\s+/)) {
    for (const m of line.matchAll(NUMBER)) {
      const values = m[0].match(/[+-]?\d+(?:\.\d+)?/g).map(Number);
      const before = line.slice(0, m.index);
      const words = before.toLowerCase().match(/[a-z]+/g) ?? [];
      out.push({
        value: Math.abs(values[values.length - 1]),
        unit: (m[1] ?? '').toLowerCase().replace(/s$/, '').replace('meter', 'metre'),
        context: words.slice(-5).join(' '),
        // The words before and right after the number decide the direction.
        lowerBetter: LOWER_IS_BETTER.test(`${words.slice(-6).join(' ')} ${line.slice(m.index, m.index + m[0].length + 30)}`),
        raw: m[0].trim(),
        pre: clip(before, -45),
        post: clip(line.slice(m.index + m[0].length), 40),
      });
    }
  }
  return out;
}

const overlap = (a, b) => {
  const A = new Set(a.split(' '));
  return b.split(' ').filter((w) => w && A.has(w)).length;
};

/** Pairs old and new numbers: by position when the count is equal, else by unit and context. */
function pairNumbers(before, after) {
  if (before.length === after.length) return before.map((b, i) => [b, after[i]]);
  const free = [...after];
  const pairs = [];
  for (const b of before) {
    let best = -1;
    let bestScore = 0;
    free.forEach((a, i) => {
      if (a.unit !== b.unit) return;
      const s = overlap(a.context, b.context) + 1;
      if (s > bestScore) {
        best = i;
        bestScore = s;
      }
    });
    if (best >= 0) pairs.push([b, free.splice(best, 1)[0]]);
  }
  return pairs;
}

/** Readable label for a number change: "Exhausted for 40 → 30 seconds". */
function describe(b, a) {
  const what = b.context.split(' ').slice(-3).join(' ');
  const unit = a.unit ? (a.unit === '%' ? '%' : ` ${a.unit}${a.value === 1 ? '' : 's'}`) : '';
  return `${what ? `${what[0].toUpperCase()}${what.slice(1)} ` : ''}${b.value} → ${a.value}${unit}`;
}

export const VERDICTS = {
  buff: { label: 'Buff', icon: '▲', className: 'buff' },
  nerf: { label: 'Nerf', icon: '▼', className: 'nerf' },
  mixed: { label: 'Mixed', icon: '◆', className: 'mixed' },
  rework: { label: 'Reworked', icon: '↻', className: 'rework' },
  text: { label: 'Text update', icon: '✎', className: 'text' },
};

export const LEVELS = { 1: 'Small', 2: 'Medium', 3: 'Big' };

/**
 * Compares the old and new description of one perk.
 * Returns { verdict, level (1-3), score (signed, + = buff), changes: [{label, good, pct}] }.
 */
export function judgeChange(before, after) {
  const b = numbersIn(before);
  const a = numbersIn(after);
  const pairs = pairNumbers(b, a);
  const changes = [];
  let score = 0;
  for (const [ob, na] of pairs) {
    if (ob.value === na.value || !ob.value) continue;
    const rel = (na.value - ob.value) / ob.value;
    const good = ob.lowerBetter ? rel < 0 : rel > 0;
    // Cap a single number so "1 → 3 tokens" does not dominate everything.
    const weight = Math.min(Math.abs(rel), 1);
    score += good ? weight : -weight;
    changes.push({ label: describe(ob, na), pre: na.pre, from: ob.raw, to: na.raw, post: na.post, good, pct: Math.round(rel * 100) });
  }

  // Rewritten: more than 40% of the words changed, or numbers could not be paired.
  const diff = wordDiff(before, after).filter((d) => d.text.trim());
  const words = (type) => diff.filter((d) => d.type === type).reduce((n, d) => n + d.text.trim().split(/\s+/).length, 0);
  const total = Math.max(1, words('same') + Math.max(words('del'), words('add')));
  const rewritten = Math.max(words('del'), words('add')) / total > 0.4 || pairs.length < Math.min(b.length, a.length);

  let verdict;
  if (!changes.length) verdict = rewritten ? 'rework' : 'text';
  else if (changes.every((c) => c.good)) verdict = 'buff';
  else if (changes.every((c) => !c.good)) verdict = 'nerf';
  else verdict = Math.abs(score) < 0.1 ? 'mixed' : score > 0 ? 'buff' : 'nerf';
  if (rewritten && changes.length && verdict !== 'mixed') verdict = changes.length >= 2 ? verdict : 'rework';

  const size = Math.abs(score);
  const level = verdict === 'text' ? 1 : verdict === 'rework' ? 2 : size >= 0.4 ? 3 : size >= 0.15 ? 2 : 1;
  return { verdict, level, score: Math.round(score * 100) / 100, changes };
}

/** Word-level diff for the before/after view: [{type: 'same'|'del'|'add', text}]. */
export function wordDiff(before, after) {
  const A = (before ?? '').split(/(\s+)/);
  const B = (after ?? '').split(/(\s+)/);
  const n = A.length;
  const m = B.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = [];
  const push = (type, text) => {
    if (out.length && out[out.length - 1].type === type) out[out.length - 1].text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      push('same', A[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) push('del', A[i++]);
    else push('add', B[j++]);
  }
  while (i < n) push('del', A[i++]);
  while (j < m) push('add', B[j++]);
  return out;
}

/**
 * Full analysis of one patch-notes record against the current data and builds.
 * Returns { perks: [...judged perk changes], builds: [...affected builds], counts }.
 */
export function analysePatch(record, data, builds) {
  const perkData = new Map((data.perks ?? []).map((p) => [`${p.role}:${p.id}`, p]));
  const usage = new Map();
  for (const b of builds) {
    for (const p of b.resolved?.perks ?? []) {
      if (!p) continue;
      const k = `${p.role}:${p.id}`;
      if (!usage.has(k)) usage.set(k, []);
      usage.get(k).push(b);
    }
  }

  const perks = (record?.details?.perks ?? []).map((d) => {
    const key = `${d.role}:${d.id}`;
    const used = usage.get(key) ?? [];
    return {
      ...d,
      perk: perkData.get(key) ?? null,
      judgement: judgeChange(d.before, d.after),
      builds: used,
      handPicked: used.filter((b) => b.type !== 'auto').length,
    };
  });
  // Most impactful first: size of the change, then how many builds use the perk.
  perks.sort(
    (x, y) =>
      y.judgement.level - x.judgement.level ||
      Math.abs(y.judgement.score) - Math.abs(x.judgement.score) ||
      y.builds.length - x.builds.length,
  );

  const byBuild = new Map();
  for (const p of perks) {
    if (p.judgement.verdict === 'text') continue;
    for (const b of p.builds) {
      if (!byBuild.has(b.id)) byBuild.set(b.id, { build: b, score: 0, perks: [] });
      const entry = byBuild.get(b.id);
      entry.score += p.judgement.verdict === 'rework' ? 0 : p.judgement.score;
      entry.perks.push(p);
    }
  }
  const affected = [...byBuild.values()].sort(
    (x, y) =>
      (y.build.type !== 'auto') - (x.build.type !== 'auto') ||
      Math.abs(y.score) - Math.abs(x.score) ||
      y.perks.length - x.perks.length,
  );

  const newPerkIds = new Set(record?.newPerkIds ?? []);
  const newPerks = (data.perks ?? []).filter((p) => newPerkIds.has(p.id));

  const counts = { buff: 0, nerf: 0, mixed: 0, rework: 0, text: 0 };
  for (const p of perks) counts[p.judgement.verdict]++;
  return { perks, builds: affected, newPerks, counts };
}
