-- The spoken map (PRD v1.0, E7.S2). A reading is how Claude, or a keyword Jon said, read one utterance.
-- Readings are only ever added: a later pass (the end pass, E7.S4) adds a new reading and the newest counts.

CREATE TABLE readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monologue_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    -- stay (carries on with the same topic), drill (deeper into the same topic), surface (back up toward its bigger picture), sideways (a related
    -- topic at the same level), jump (an unrelated topic), return (back to an earlier topic), ask (a question)
    move TEXT NOT NULL CHECK (move IN ('stay', 'drill', 'surface', 'sideways', 'jump', 'return', 'ask')),
    -- a short name, spelled the same each time the same topic comes up
    topic TEXT NOT NULL,
    -- 0 is the monologue's top level; each drill goes one deeper
    depth INTEGER NOT NULL,
    -- 0 to 1; a keyword Jon said gives 1
    confidence REAL NOT NULL,
    -- the model that read it, or 'keyword'
    model TEXT NOT NULL,
    -- the words Jon said that decided the move, when a keyword did
    cue TEXT,
    made_at TEXT NOT NULL,
    FOREIGN KEY (monologue_id, seq) REFERENCES utterances(monologue_id, seq) ON DELETE CASCADE
);

CREATE INDEX readings_by_utterance ON readings (monologue_id, seq, id);

-- Each try at reading a monologue. With no API key, or when the call fails, the monologue waits to be read.
CREATE TABLE monologue_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monologue_id TEXT NOT NULL REFERENCES monologues(id) ON DELETE CASCADE,
    tried_at TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('read', 'no_key', 'failed')),
    note TEXT
);

CREATE INDEX monologue_reads_by_monologue ON monologue_reads (monologue_id, id);
