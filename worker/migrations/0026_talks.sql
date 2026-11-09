-- The live screen (E7 phase 2, stories 1 and 2): a talk is one sitting of dictation. The phone (or, for now, the browser)
-- commits a stretch at each pause; Claude reads each new stretch against the idea tree so far and the open questions, and
-- answers with the cleaned text, a few edits to the tree and coverage for the answer checklist. Everything is only ever
-- added, so replay can rebuild the tree at any moment.

CREATE TABLE talks (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    -- typed: the "type a stretch" box; replay: a saved listen-test log played back at its real timing; phone: the Android shell
    source TEXT NOT NULL CHECK (source IN ('typed', 'replay', 'phone')),
    label TEXT,
    -- while a read is running, until when; another stretch arriving meanwhile is picked up by that read's next pass
    reading_until TEXT
);

-- The questions Jon is answering in this talk (answer_checklist questions, E10)
CREATE TABLE talk_questions (
    talk_id TEXT NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES answer_questions(id) ON DELETE CASCADE,
    added_at TEXT NOT NULL,
    PRIMARY KEY (talk_id, question_id)
);

-- Exactly what the recogniser committed, kept raw for replay
CREATE TABLE talk_stretches (
    talk_id TEXT NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    -- when it was said, in ms from the start of the talk (the log's timing on a replay)
    said_at_ms INTEGER NOT NULL,
    received_at TEXT NOT NULL,
    PRIMARY KEY (talk_id, seq)
);

-- Each read of one or more stretches. A failed read stores no edits; the stretches stay grey and the next read takes them.
CREATE TABLE talk_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    talk_id TEXT NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
    first_seq INTEGER NOT NULL,
    last_seq INTEGER NOT NULL,
    model TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('read', 'no_key', 'failed')),
    note TEXT,
    -- [{seq, text, move}]: each stretch cleaned (punctuation, "scratch that") and its move
    cleaned_json TEXT,
    -- the tree edits, with node ids already given out: [{op, id, parent?, kind?, text?, into?}]
    edits_json TEXT,
    -- the node Jon is on after this read
    here TEXT,
    -- [{questionId, needId, state, nodes: [...], quote}]
    coverage_json TEXT,
    -- Jon said he's going deep on purpose, so no "back to the question?" cue
    going_deep INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_read_tokens INTEGER,
    cache_write_tokens INTEGER,
    took_ms INTEGER,
    made_at TEXT NOT NULL
);

CREATE INDEX talk_reads_by_talk ON talk_reads (talk_id, id);
