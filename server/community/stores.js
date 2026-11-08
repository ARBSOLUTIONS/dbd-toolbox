// Two storage back-ends with the same interface, used by core.js.
//   d1Store(db)        Cloudflare D1 (the live website)
//   jsonStore(file)    a JSON file (local development with npm run dev)

const parseRow = (r) =>
  r && {
    ...r,
    perks: JSON.parse(r.perks),
    addons: JSON.parse(r.addons),
    playstyles: JSON.parse(r.playstyles),
  };

export function d1Store(db) {
  return {
    async list({ role, killer }) {
      let sql = 'SELECT * FROM builds WHERE hidden = 0';
      const args = [];
      if (role) {
        sql += ' AND role = ?';
        args.push(role);
      }
      if (killer) {
        sql += ' AND (killer = ? OR killer IS NULL)';
        args.push(killer);
      }
      sql += ' ORDER BY (up - down) DESC, created_at DESC LIMIT 500';
      const { results } = await db.prepare(sql).bind(...args).all();
      return results.map(parseRow);
    },
    async get(id) {
      return parseRow(await db.prepare('SELECT * FROM builds WHERE id = ?').bind(id).first());
    },
    async insert(row) {
      await db
        .prepare(
          `INSERT INTO builds (id, created_at, role, killer, name, description, author, perks, item, addons, offering, playstyles, up, down, reports, hidden, creator)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?)`,
        )
        .bind(
          row.id, row.created_at, row.role, row.killer, row.name, row.description, row.author,
          JSON.stringify(row.perks), row.item, JSON.stringify(row.addons), row.offering,
          JSON.stringify(row.playstyles), row.creator,
        )
        .run();
    },
    async countCreated(creator, since) {
      const r = await db.prepare('SELECT COUNT(*) AS n FROM builds WHERE creator = ? AND created_at >= ?').bind(creator, since).first();
      return r?.n ?? 0;
    },
    async setVote(id, voter, value) {
      if (value === 0) await db.prepare('DELETE FROM votes WHERE build_id = ? AND voter = ?').bind(id, voter).run();
      else
        await db
          .prepare('INSERT INTO votes (build_id, voter, value) VALUES (?, ?, ?) ON CONFLICT (build_id, voter) DO UPDATE SET value = excluded.value')
          .bind(id, voter, value)
          .run();
    },
    async recount(id) {
      const r = await db
        .prepare('SELECT COALESCE(SUM(value = 1), 0) AS up, COALESCE(SUM(value = -1), 0) AS down FROM votes WHERE build_id = ?')
        .bind(id)
        .first();
      await db.prepare('UPDATE builds SET up = ?, down = ? WHERE id = ?').bind(r.up, r.down, id).run();
      return { up: r.up, down: r.down };
    },
    async votesBy(voter, ids) {
      if (!ids.length) return {};
      const marks = ids.map(() => '?').join(',');
      const { results } = await db.prepare(`SELECT build_id, value FROM votes WHERE voter = ? AND build_id IN (${marks})`).bind(voter, ...ids).all();
      return Object.fromEntries(results.map((r) => [r.build_id, r.value]));
    },
    async addReport(id, voter) {
      await db.prepare('INSERT OR IGNORE INTO reports (build_id, voter) VALUES (?, ?)').bind(id, voter).run();
      const r = await db.prepare('SELECT COUNT(*) AS n FROM reports WHERE build_id = ?').bind(id).first();
      await db.prepare('UPDATE builds SET reports = ? WHERE id = ?').bind(r.n, id).run();
      return r.n;
    },
    async hide(id) {
      await db.prepare('UPDATE builds SET hidden = 1 WHERE id = ?').bind(id).run();
    },
  };
}

/** Simple JSON-file store for local development (not for the live site). */
export function jsonStore(file, fs) {
  let cache = null;
  const load = async () => {
    if (cache) return cache;
    try {
      cache = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
      cache = { builds: [], votes: {}, reports: {} };
    }
    return cache;
  };
  const save = async () => fs.writeFile(file, JSON.stringify(cache, null, 2));

  return {
    async list({ role, killer }) {
      const d = await load();
      return d.builds.filter((b) => !b.hidden && (!role || b.role === role) && (!killer || !b.killer || b.killer === killer));
    },
    async get(id) {
      return (await load()).builds.find((b) => b.id === id) ?? null;
    },
    async insert(row) {
      (await load()).builds.push(row);
      await save();
    },
    async countCreated(creator, since) {
      return (await load()).builds.filter((b) => b.creator === creator && b.created_at >= since).length;
    },
    async setVote(id, voter, value) {
      const d = await load();
      d.votes[id] ??= {};
      if (value === 0) delete d.votes[id][voter];
      else d.votes[id][voter] = value;
      await save();
    },
    async recount(id) {
      const d = await load();
      const values = Object.values(d.votes[id] ?? {});
      const up = values.filter((v) => v === 1).length;
      const down = values.filter((v) => v === -1).length;
      Object.assign(d.builds.find((b) => b.id === id), { up, down });
      await save();
      return { up, down };
    },
    async votesBy(voter, ids) {
      const d = await load();
      return Object.fromEntries(ids.filter((id) => d.votes[id]?.[voter]).map((id) => [id, d.votes[id][voter]]));
    },
    async addReport(id, voter) {
      const d = await load();
      d.reports[id] = [...new Set([...(d.reports[id] ?? []), voter])];
      d.builds.find((b) => b.id === id).reports = d.reports[id].length;
      await save();
      return d.reports[id].length;
    },
    async hide(id) {
      (await load()).builds.find((b) => b.id === id).hidden = 1;
      await save();
    },
  };
}
