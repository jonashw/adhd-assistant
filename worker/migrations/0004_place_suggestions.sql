-- E4 follow-up: a Claude thread whose place isn't on the map yet suggests one, under the closest
-- existing parent. It waits for Jon to chart it (or pick another place); Claude never edits the map.

CREATE TABLE place_suggestions (
    item_id TEXT PRIMARY KEY REFERENCES linked_items(id) ON DELETE CASCADE,
    map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    -- the existing place the new names go under (HOME or any place)
    under_note_id TEXT NOT NULL,
    -- JSON array of 1 to 3 names, outermost first; the last one is the thread's place
    path TEXT NOT NULL,
    created_at TEXT NOT NULL
);
