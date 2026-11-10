-- Tell me when: threads in different projects tell each other when a place on Jon's map changes.
-- Places hold the meaning, projects are workshops, threads are work at one place. Most listening needs no rows:
-- a place's listeners are the other projects whose threads check in there (item_places → linked_items →
-- claude_threads). The tables below hold only the exceptions, Jon's switches, and the log of every tell.

-- Each project's reach, switched only by Jon on the Claude map:
--   open     it can listen, be told things, and tell others (the default)
--   receive  it can listen and be told things, but its own syncs never match anyone else's watches
--   walled   none of these
ALTER TABLE claude_projects ADD COLUMN reach TEXT NOT NULL DEFAULT 'open' CHECK (reach IN ('open', 'receive', 'walled'));

-- Explicit watches, only for exceptions: a knowledge base listening to a whole area, a few words inside a busy place,
-- or something Jon asked for in words. Not called "interests": that word already means drawn, neutral or reluctant.
CREATE TABLE watches (
    id TEXT PRIMARY KEY,
    -- who hears: a whole project (its id), one thread (its cmsg id), or Jon himself ('jon').
    -- jon rows are asks in his own words ("pull me back when the Warholizer PR lands"); Keep my place reads them as
    -- extra pull-backs and never writes them, and Tell me when never sends them anywhere.
    listener_kind TEXT NOT NULL CHECK (listener_kind IN ('project', 'thread', 'jon')),
    listener_id TEXT NOT NULL,
    map_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    -- place: that place only; area: that place and everything under it
    scope TEXT NOT NULL DEFAULT 'place' CHECK (scope IN ('place', 'area')),
    -- optional words (a JSON list): when given, a change matches only if the sender's title, topic or keywords use one
    words TEXT,
    -- one line on what it's for, shown to the sender when it matches
    note TEXT,
    -- Jon's words that asked for it, exactly as he said them
    jons_words TEXT,
    -- the thread that added it (cmsg id), or 'jon'
    added_by TEXT NOT NULL,
    added_at TEXT NOT NULL,
    -- Jon stopped it from the place's card; kept for the record
    stopped_at TEXT
);

CREATE INDEX watches_by_place ON watches (map_id, note_id);

-- Jon stopped a project from hearing about a place it would hear about by itself (a derived watch).
CREATE TABLE watch_stops (
    map_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    stopped_at TEXT NOT NULL,
    PRIMARY KEY (map_id, note_id, project_id)
);

-- Every tell, logged when it is offered to the sending thread. It backs the rate limit (one ask per watch per
-- sending thread per day), the Told chip on the Log, and the two-week look back at how Tell me when went.
-- Only a line of text and a link ever cross; nothing here holds what was said.
CREATE TABLE tells (
    id TEXT PRIMARY KEY,
    -- which watch matched: "place:<map>/<note>:<project>" for a derived one, "watch:<id>" for a row above
    watch_key TEXT NOT NULL,
    sender_project_id TEXT NOT NULL,
    sender_thread_id TEXT NOT NULL,
    listener_kind TEXT NOT NULL CHECK (listener_kind IN ('project', 'thread')),
    listener_id TEXT NOT NULL,
    listener_project_id TEXT NOT NULL,
    map_id TEXT,
    note_id TEXT,
    -- why it matched, in a line
    why TEXT NOT NULL,
    offered_at TEXT NOT NULL,
    -- offered: in the sender's hints; sent: the sender asked; skipped: it judged the news didn't matter to them;
    -- answered: the listener acted on it; failed: the ask didn't go through
    outcome TEXT NOT NULL DEFAULT 'offered' CHECK (outcome IN ('offered', 'sent', 'skipped', 'answered', 'failed')),
    outcome_at TEXT,
    -- when the sender asked; the account allows 100 fires an hour, so the hints hold back near that
    sent_at TEXT,
    -- the sender's or listener's line about it, such as why it was skipped
    outcome_note TEXT
);

CREATE INDEX tells_by_sender ON tells (sender_thread_id, watch_key, offered_at);
CREATE INDEX tells_by_sent ON tells (sent_at);
