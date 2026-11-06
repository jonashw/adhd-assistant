-- Glance cards on the Claude map. Each thread tells the map about itself (headline, what it asks,
-- progress, topic), and any thread passes on the project's PRs, matched to the thread that opened them.
-- (0008 is taken by the artifacts branch.)

-- The thread's latest card, as it last sent it; a new card replaces the whole thing
ALTER TABLE claude_threads ADD COLUMN headline TEXT;
-- question, decision, approval or review
ALTER TABLE claude_threads ADD COLUMN ask_kind TEXT;
ALTER TABLE claude_threads ADD COLUMN ask_text TEXT;
ALTER TABLE claude_threads ADD COLUMN progress_done INTEGER;
ALTER TABLE claude_threads ADD COLUMN progress_total INTEGER;
ALTER TABLE claude_threads ADD COLUMN progress_now TEXT;
ALTER TABLE claude_threads ADD COLUMN artifact_title TEXT;
ALTER TABLE claude_threads ADD COLUMN artifact_url TEXT;
ALTER TABLE claude_threads ADD COLUMN topic TEXT;
-- a JSON array of a few words
ALTER TABLE claude_threads ADD COLUMN keywords TEXT;
-- when the card last changed
ALTER TABLE claude_threads ADD COLUMN card_at TEXT;
-- when Jon last opened the thread from the map: a card newer than this is "New"
ALTER TABLE claude_threads ADD COLUMN opened_at TEXT;

-- Every topic a thread has had, so a search still finds it after it moves on
CREATE TABLE claude_topics (
    thread_id TEXT NOT NULL REFERENCES claude_threads(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    keywords TEXT,
    at TEXT NOT NULL,
    PRIMARY KEY (thread_id, topic)
);

-- The project's PRs as the platform last listed them. A sync that sends PRs replaces the project's set.
CREATE TABLE claude_prs (
    project_id TEXT NOT NULL REFERENCES claude_projects(id) ON DELETE CASCADE,
    repo TEXT NOT NULL,
    number INTEGER NOT NULL,
    -- the thread that opened it, when the sender could tell
    thread_id TEXT,
    title TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('open', 'draft', 'merged', 'closed')),
    -- success, failure, pending, or none
    ci TEXT,
    url TEXT NOT NULL,
    seen_at TEXT NOT NULL,
    PRIMARY KEY (project_id, repo, number)
);

CREATE INDEX claude_prs_by_thread ON claude_prs (thread_id);
