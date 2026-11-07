-- Where Jon can be: a small tree of spots of its own (not part of any map), so Your move can show only what he can do
-- from where he is. "Anywhere" is the root: a phone in hand. A spot "stays put" (In bed): only things tagged there or
-- Anywhere fit, not everything at Home. A spot with hours is closed outside them, and so is everything under it.

CREATE TABLE spots (
    id TEXT PRIMARY KEY,
    -- NULL only for the root, Anywhere
    parent_id TEXT REFERENCES spots(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    stays_put INTEGER NOT NULL DEFAULT 0,
    -- JSON {"mon": [["10:00", "18:00"]], ...}; NULL = always open; a day left out = closed that day
    hours TEXT,
    position INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX spots_by_name ON spots (name COLLATE NOCASE);

INSERT INTO spots (id, parent_id, name, stays_put, position) VALUES
    ('anywhere', NULL, 'Anywhere', 0, 0),
    ('home', 'anywhere', 'Home', 0, 0),
    ('mac', 'home', 'At my Mac', 0, 0),
    ('bed', 'home', 'In bed', 1, 1),
    ('garage', 'home', 'Garage', 0, 2),
    ('out', 'anywhere', 'Out', 0, 1),
    ('library', 'out', 'Library', 0, 0),
    ('park', 'out', 'Park', 0, 1),
    ('school', 'out', 'School', 0, 2),
    ('supermarket', 'out', 'Supermarket', 0, 3),
    ('costco', 'out', 'Costco', 0, 4),
    ('home-depot', 'out', 'Home Depot', 0, 5);

-- Where Jon says he is right now, until a time (a pick wears off). One row.
CREATE TABLE whereabouts (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    spot_id TEXT REFERENCES spots(id) ON DELETE SET NULL,
    set_at TEXT NOT NULL,
    until TEXT NOT NULL
);

-- Where a to-do can be done, by spot name: Claude's guess, until Jon corrects it
ALTER TABLE checklist_items ADD COLUMN where_spot TEXT;
ALTER TABLE checklist_items ADD COLUMN where_by TEXT CHECK (where_by IN ('claude', 'jon'));

-- Where a thread's ask can be answered (part of its card), and Jon's correction, kept only for the ask it was made on
ALTER TABLE claude_threads ADD COLUMN ask_where TEXT;
ALTER TABLE claude_threads ADD COLUMN ask_where_jon TEXT;
ALTER TABLE claude_threads ADD COLUMN ask_where_jon_for TEXT;
