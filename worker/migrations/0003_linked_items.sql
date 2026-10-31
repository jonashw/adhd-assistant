-- E4: things outside the map that places point at (Claude threads, Claude projects, GitHub PRs, any URL),
-- the places each one serves, and which item raised each signal.

CREATE TABLE linked_items (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('claude.thread', 'claude.project', 'github.pr', 'url')),
    -- a Claude thread that doesn't know its own link checks in without one
    url TEXT UNIQUE,
    title TEXT NOT NULL,
    -- Claude threads only: what the thread last said about itself, and when
    state TEXT CHECK (state IN ('working', 'waiting', 'done', 'failed')),
    state_note TEXT,
    last_heard_at TEXT,
    created_at TEXT NOT NULL
);

-- The places an item serves. One of them is primary: that is where its signals land.
CREATE TABLE item_places (
    item_id TEXT NOT NULL REFERENCES linked_items(id) ON DELETE CASCADE,
    map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    note_id TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, map_id, note_id)
);

CREATE UNIQUE INDEX item_places_one_primary ON item_places (item_id) WHERE is_primary = 1;
CREATE INDEX item_places_by_note ON item_places (map_id, note_id);

-- A Claude thread keeps at most one open signal; item_id says which. Fresh tracks expire on their own.
ALTER TABLE signals ADD COLUMN item_id TEXT REFERENCES linked_items(id) ON DELETE CASCADE;
ALTER TABLE signals ADD COLUMN expires_at TEXT;

CREATE INDEX signals_by_item ON signals (item_id) WHERE cleared_at IS NULL;
