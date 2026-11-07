-- The spoken map (PRD v1.0, E7.S5): replay. Where autopilot started charting a monologue, so replay begins there,
-- and the scene switches Jon makes while watching, so a later replay switches at the same moments.

CREATE TABLE monologue_starts (
    monologue_id TEXT PRIMARY KEY REFERENCES monologues(id) ON DELETE CASCADE,
    map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    note_id TEXT NOT NULL
);

CREATE TABLE scene_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monologue_id TEXT NOT NULL REFERENCES monologues(id) ON DELETE CASCADE,
    -- from this utterance on
    seq INTEGER NOT NULL,
    scene TEXT NOT NULL CHECK (scene IN ('crew', 'burrow')),
    made_at TEXT NOT NULL
);

CREATE INDEX scene_changes_by_monologue ON scene_changes (monologue_id, seq, id);
