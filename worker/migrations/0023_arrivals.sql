-- Arrival alerts. Jon's phone automations (Tasker, MacroDroid, Shortcuts) call /api/hook/arrive when he gets to a
-- place; the app sets where he is and, if things wait for him there, sends a push notification to his phone.

-- Keys for the arrival link, made in the app and shown once; only a hash is kept. Revoking deletes the row.
CREATE TABLE hook_tokens (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT
);

-- Browsers that asked for notifications (Web Push subscriptions)
CREATE TABLE push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    -- the browser's keys, kept for payload encryption later; pushes are sent empty and the page asks what's new
    p256dh TEXT,
    auth TEXT,
    label TEXT,
    created_at TEXT NOT NULL
);

-- The latest arrivals, so the notification can say what waits there when the phone asks
CREATE TABLE arrivals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    spot_id TEXT,
    spot_name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('arrive', 'leave')),
    title TEXT,
    body TEXT
);
