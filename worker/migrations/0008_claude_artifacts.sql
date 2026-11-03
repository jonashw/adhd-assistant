-- Artifacts on the Claude map. Claude lists them per project (not per thread), so they hang off the project.
-- opened_at is when Jon last opened one from the map: it decides the "New" and "Updated" badges.

CREATE TABLE claude_artifacts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES claude_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    updated_at TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    opened_at TEXT
);

CREATE INDEX claude_artifacts_by_project ON claude_artifacts (project_id);
