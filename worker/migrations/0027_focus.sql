-- What Jon is focused on (src/focus.ts). Domains are the big necks of the woods, Personal and Work to start; each
-- Claude project belongs to one (NULL = Personal). Later, work items from outside Claude (enterprise GitHub, Jira)
-- join the same domains.

CREATE TABLE domains (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('personal', 'work')),
    position INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX domains_by_name ON domains (name COLLATE NOCASE);

INSERT INTO domains (id, name, kind, position) VALUES
    ('personal', 'Personal', 'personal', 0),
    ('work', 'Work', 'work', 1);

ALTER TABLE claude_projects ADD COLUMN domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL;

-- The mode (how much of Jon is at work, 0 to 1 in quarters) and the focus (one domain or one project), until a time:
-- it wears off overnight. One row.
CREATE TABLE focus (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    work_share REAL NOT NULL DEFAULT 0.5,
    scope_kind TEXT CHECK (scope_kind IN ('domain', 'project')),
    scope_id TEXT,
    set_at TEXT NOT NULL,
    until TEXT NOT NULL
);
