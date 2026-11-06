-- The Claude event log: each sync compares the map before and after it, and writes down what changed.
-- The syncs themselves are already kept, as sent, in claude_snapshots; the log shows them too, for debugging.

CREATE TABLE claude_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- when the map heard of it
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    project_id TEXT NOT NULL,
    thread_id TEXT,
    -- "owner/name#12", for a PR's events
    pr TEXT,
    -- what it was and what it became, as text (a title, a state, an ask)
    from_value TEXT,
    to_value TEXT,
    -- the snapshot that brought it (claude_snapshots.hash) and the thread that sent it
    snapshot_hash TEXT NOT NULL,
    by_thread TEXT
);

CREATE INDEX claude_events_by_time ON claude_events (at DESC);
CREATE INDEX claude_snapshots_by_time ON claude_snapshots (received_at DESC);
