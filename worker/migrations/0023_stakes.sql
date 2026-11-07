-- The spoken map (PRD v1.0, E7.S3). Autopilot reads a monologue's readings and plants dashed stakes: proposed places
-- beside the map, never in it. A stake turns solid only when Jon charts it (the app then saves a real place), and
-- "Not now" sets it aside. A topic that names a place already on the map is a mention of that place, not a new stake.

CREATE TABLE stakes (
    id TEXT PRIMARY KEY,
    monologue_id TEXT NOT NULL REFERENCES monologues(id) ON DELETE CASCADE,
    -- the first utterance that named the topic
    seq INTEGER NOT NULL,
    map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    -- the reading's move that placed it: drill (under), sideways (beside), surface (above), jump (under a region)
    move TEXT NOT NULL,
    -- where it goes: under a place on the map, or under another stake from the same monologue
    under_note_id TEXT,
    under_stake_id TEXT REFERENCES stakes(id) ON DELETE CASCADE,
    -- a mention: the topic is this place already on the map
    note_id TEXT,
    made_at TEXT NOT NULL,
    -- charted (the place Jon made of it, or the mentioned place he went to) or dismissed ("Not now")
    settled TEXT CHECK (settled IN ('charted', 'dismissed')),
    settled_at TEXT,
    charted_note_id TEXT,
    CHECK ((note_id IS NOT NULL) + (under_note_id IS NOT NULL) + (under_stake_id IS NOT NULL) = 1)
);

CREATE INDEX stakes_by_map ON stakes (map_id, settled);
CREATE INDEX stakes_by_monologue ON stakes (monologue_id);
