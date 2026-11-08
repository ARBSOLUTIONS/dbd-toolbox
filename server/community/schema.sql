-- Community builds database (Cloudflare D1 / SQLite).
-- Apply with:  npx wrangler d1 execute dbd-toolbox-community --remote --file server/community/schema.sql

CREATE TABLE IF NOT EXISTS builds (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  role        TEXT NOT NULL,           -- 'survivor' | 'killer'
  killer      TEXT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author      TEXT,
  perks       TEXT NOT NULL,           -- JSON array of perk names
  item        TEXT,
  addons      TEXT NOT NULL DEFAULT '[]',
  offering    TEXT,
  playstyles  TEXT NOT NULL DEFAULT '[]',
  up          INTEGER NOT NULL DEFAULT 0,
  down        INTEGER NOT NULL DEFAULT 0,
  reports     INTEGER NOT NULL DEFAULT 0,
  hidden      INTEGER NOT NULL DEFAULT 0,
  creator     TEXT NOT NULL            -- salted hash of the creator's IP (for the hourly limit)
);
CREATE INDEX IF NOT EXISTS builds_role ON builds (role, hidden);
CREATE INDEX IF NOT EXISTS builds_creator ON builds (creator, created_at);

CREATE TABLE IF NOT EXISTS votes (
  build_id TEXT NOT NULL,
  voter    TEXT NOT NULL,              -- salted hash of the voter's IP
  value    INTEGER NOT NULL,           -- 1 or -1
  PRIMARY KEY (build_id, voter)
);

CREATE TABLE IF NOT EXISTS reports (
  build_id TEXT NOT NULL,
  voter    TEXT NOT NULL,
  PRIMARY KEY (build_id, voter)
);
