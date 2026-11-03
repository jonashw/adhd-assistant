-- Rich notes (FR-20): photos on a place's note. The note's markdown points at /api/media/<id>.
-- Photos are shrunk in the browser before upload, so they fit in a D1 row; they can move to R2 later
-- without changing the note text. No foreign key to maps, because a photo can be added to a map
-- that hasn't been saved yet; deleting a map deletes its photos.

CREATE TABLE media (
    id TEXT PRIMARY KEY,
    map_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX media_by_map ON media (map_id);
