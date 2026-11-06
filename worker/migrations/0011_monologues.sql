-- The spoken map (PRD v1.0, E7). A monologue is something Jon said, split into sentence-sized utterances.
-- Both tables only ever grow: readings, charting and replay (later stories) build on them without editing them.
-- (0006, 0008, 0009 and 0010 are taken by open branches.)

CREATE TABLE monologues (
    id TEXT PRIMARY KEY,
    -- where the words came from: a Claude thread's dictation (E7 phase 1) or the app's own screen (phase 2)
    source TEXT NOT NULL CHECK (source IN ('claude_thread', 'app')),
    -- the Claude thread's link, and its linked item if it checked in, when known
    thread_url TEXT,
    thread_item_id TEXT,
    -- the words exactly as sent
    text TEXT NOT NULL,
    -- sha256 of the text, so the same dictation sent twice in a row is stored once
    text_hash TEXT NOT NULL,
    received_at TEXT NOT NULL
);

CREATE INDEX monologues_by_hash ON monologues (text_hash, received_at);
CREATE INDEX monologues_by_time ON monologues (received_at);

CREATE TABLE utterances (
    monologue_id TEXT NOT NULL REFERENCES monologues(id) ON DELETE CASCADE,
    -- 0, 1, 2... in the order spoken
    seq INTEGER NOT NULL,
    text TEXT NOT NULL,
    -- where it sits in the monologue's text
    start_char INTEGER NOT NULL,
    end_char INTEGER NOT NULL,
    -- spoken times, when a live recording gives them (phase 2); empty for dictation sent from a thread
    start_ms INTEGER,
    end_ms INTEGER,
    PRIMARY KEY (monologue_id, seq)
);
