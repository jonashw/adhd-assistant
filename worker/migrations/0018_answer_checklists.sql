-- The answer checklist (PRD E10.S1, FR-44, FR-45): a question asked in a Claude thread, the needs a full answer covers,
-- and how far each need is covered. It reads only Jon's words; checking Claude's own answers is E11, not built.
-- (0017 is taken by another branch.)

CREATE TABLE answer_questions (
    id TEXT PRIMARY KEY,
    -- where it was asked: the Claude map's thread id (cmsg_...), the linked item from check_in, and the link, when known
    claude_thread_id TEXT,
    thread_item_id TEXT REFERENCES linked_items(id) ON DELETE SET NULL,
    thread_url TEXT,
    text TEXT NOT NULL,
    asked_by TEXT NOT NULL CHECK (asked_by IN ('jon', 'claude', 'someone')),
    -- who it was asked of, in plain words ("Jon", "Claude", "Culien")
    asked_of TEXT,
    -- finish: a closed question with a fixed set of needs; expand: an open interview whose needs can grow
    mode TEXT NOT NULL CHECK (mode IN ('finish', 'expand')),
    created_at TEXT NOT NULL
);

CREATE INDEX answer_questions_by_claude_thread ON answer_questions (claude_thread_id, created_at);
CREATE INDEX answer_questions_by_thread_item ON answer_questions (thread_item_id, created_at);

CREATE TABLE answer_needs (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL REFERENCES answer_questions(id) ON DELETE CASCADE,
    -- 0, 1, 2... in the order they were added; an expand question appends
    seq INTEGER NOT NULL,
    text TEXT NOT NULL,
    added_at TEXT NOT NULL,
    UNIQUE (question_id, seq)
);

-- Coverage is only ever added; the newest row for a need counts. A need with no row is open.
CREATE TABLE answer_coverage (
    need_id TEXT NOT NULL REFERENCES answer_needs(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (state IN ('open', 'partly', 'covered', 'set_aside')),
    -- a sentence number from a monologue, or a short quote of Jon's words
    evidence TEXT,
    -- who marked it: Claude in the thread, the reading pass over dictation (E10.S4), or Jon in the app
    marked_by TEXT NOT NULL CHECK (marked_by IN ('claude', 'reading', 'jon')),
    at TEXT NOT NULL
);

CREATE INDEX answer_coverage_by_need ON answer_coverage (need_id, at);
