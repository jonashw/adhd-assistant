-- E3: what a place needs to be ranked, and signals over places.

-- small: its next step fits in 5 minutes. interest: Jon's own 1 to 5, unset means neutral.
ALTER TABLE notes ADD COLUMN small INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN interest INTEGER CHECK (interest BETWEEN 1 AND 5);

-- Signals sit over places. Jon plants flags (deadlines) himself; flares, smoke and fresh tracks
-- come from Claude and Jira later. They live beside the map, so raising one never bumps its revision.
CREATE TABLE signals (
    id TEXT PRIMARY KEY,
    map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    note_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('deadline', 'request', 'trouble', 'news')),
    source TEXT NOT NULL CHECK (source IN ('jon', 'claude', 'jira', 'calendar')),
    label TEXT NOT NULL,
    due_at TEXT,
    raised_at TEXT NOT NULL,
    cleared_at TEXT
);

CREATE INDEX signals_open_by_map ON signals (map_id) WHERE cleared_at IS NULL;
CREATE INDEX visits_by_note ON visits (map_id, note_id, at);
