-- The Claude map: Claude projects and their threads, mirrored from what the platform says about them.
-- Claude keeps it; Jon only reads it (and can hide a project). It never touches Jon's own maps.

CREATE TABLE claude_projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    -- a friendlier label for the map, if Claude or Jon gave one
    short_name TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    -- when the last snapshot of this project arrived
    last_synced_at TEXT NOT NULL
);

CREATE TABLE claude_threads (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES claude_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('working', 'blocked', 'review_ready', 'done', 'failed', 'stopped')),
    -- times the platform gave, when it gave them
    created_at TEXT,
    last_activity_at TEXT,
    first_seen_at TEXT NOT NULL,
    -- the last snapshot that listed this thread; older than its project's last_synced_at means it wasn't in the latest one
    last_seen_at TEXT NOT NULL
);

CREATE INDEX claude_threads_by_project ON claude_threads (project_id);

-- The inbox: every snapshot Claude sent, exactly as sent, before it is applied. A repeat is ignored.
-- If applying one ever fails, it can be replayed from here, so nothing Claude reported is lost.
CREATE TABLE claude_snapshots (
    hash TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    received_at TEXT NOT NULL,
    applied_at TEXT
);
