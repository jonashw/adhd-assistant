-- The map: places form a tree under one HOME (parent_id), ties across the tree are links,
-- visits are the trail, and origin_id records where a place was first seen.

CREATE TABLE maps (
    id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE notes (
    map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('HOME', 'RabbitHole')),
    label TEXT NOT NULL,
    body TEXT,
    status TEXT CHECK (status IN ('captured', 'active', 'waiting', 'someday', 'done', 'dropped')),
    done_at TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    parent_id TEXT,
    origin_id TEXT,
    -- order within the map, so a map reads back exactly as it was saved
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (map_id, id),
    CHECK ((type = 'HOME') = (parent_id IS NULL))
);

CREATE UNIQUE INDEX notes_one_home_per_map ON notes (map_id) WHERE type = 'HOME';
CREATE INDEX notes_by_parent ON notes (map_id, parent_id);

CREATE TABLE links (
    map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('BLOCKED_BY', 'ALSO_IN', 'LABELLED')),
    label TEXT,
    PRIMARY KEY (map_id, from_id, to_id, type)
);

CREATE TABLE visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    note_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('arrive', 'untie', 'tie_off')),
    at TEXT NOT NULL
);

CREATE INDEX visits_by_map ON visits (map_id, at);

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
