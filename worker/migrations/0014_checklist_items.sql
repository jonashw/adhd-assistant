-- To-dos a Claude thread leaves for Jon at a place: things only he can do (add a secret, merge a PR).
-- They live beside the map, like signals, so adding one never bumps the map's revision or edits a place's note.

CREATE TABLE checklist_items (
    id TEXT PRIMARY KEY,
    map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    -- NULL while it waits on the place its thread suggested; charting (or picking a place) moves it there
    note_id TEXT,
    text TEXT NOT NULL,
    -- the text trimmed, spaces collapsed and lowercased: the same words twice at one place are stored once
    text_key TEXT NOT NULL,
    -- an optional heading such as "From home" or "Anytime"
    item_group TEXT,
    link TEXT,
    -- the thread that added it; its title and link are copied so the item still says who asked if the thread is forgotten
    thread_item_id TEXT REFERENCES linked_items(id) ON DELETE SET NULL,
    thread_title TEXT NOT NULL,
    thread_url TEXT,
    added_at TEXT NOT NULL,
    done_at TEXT,
    -- Jon checks his own items; a thread may check one it added once it saw it happen (a PR merged)
    done_by TEXT CHECK (done_by IN ('jon', 'claude'))
);

CREATE UNIQUE INDEX checklist_once_per_place ON checklist_items (map_id, note_id, text_key) WHERE note_id IS NOT NULL;
CREATE UNIQUE INDEX checklist_once_per_waiting_thread ON checklist_items (thread_item_id, text_key) WHERE note_id IS NULL;
CREATE INDEX checklist_by_map ON checklist_items (map_id, note_id);
