-- Every artifact on the Claude map, not just each thread's latest. Claude lists artifacts per project
-- (list_project_artifacts), with no word on which thread made them, so threads say which ones are theirs.
-- An artifact is one row per project and link; the threads that made or updated it hang off it.

CREATE TABLE claude_artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES claude_projects(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    -- the platform's last update, when a sync passed it on
    updated_at TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    -- when Jon last opened it from the map: it decides the "New" and "Updated" pills
    opened_at TEXT,
    UNIQUE (project_id, url)
);

-- Which threads said they made or updated it, and when they last said so
CREATE TABLE claude_artifact_threads (
    artifact_id INTEGER NOT NULL REFERENCES claude_artifacts(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL REFERENCES claude_threads(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    PRIMARY KEY (artifact_id, thread_id)
);

CREATE INDEX claude_artifact_threads_by_thread ON claude_artifact_threads (thread_id);

-- Artifacts that were already there when the map started counting them aren't news. For a project that joins
-- later, this is when it joined.
ALTER TABLE claude_projects ADD COLUMN artifacts_since TEXT;
UPDATE claude_projects SET artifacts_since = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- Start from the latest artifact each thread's card already names
INSERT OR IGNORE INTO claude_artifacts (project_id, url, title, first_seen_at, last_seen_at)
    SELECT project_id, artifact_url, artifact_title, COALESCE(card_at, first_seen_at), last_seen_at
    FROM claude_threads WHERE artifact_url IS NOT NULL AND artifact_title IS NOT NULL
    ORDER BY card_at;
INSERT OR IGNORE INTO claude_artifact_threads (artifact_id, thread_id, at)
    SELECT a.id, t.id, COALESCE(t.card_at, t.first_seen_at)
    FROM claude_threads t JOIN claude_artifacts a ON a.project_id = t.project_id AND a.url = t.artifact_url;
