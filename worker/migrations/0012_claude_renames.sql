-- Renames on the Claude map. A thread's own end-of-turn word on its state stamps last_activity_at with the
-- server's clock, which runs ahead of the platform's list. A rename doesn't move the platform's time, so the
-- next list looked older than the row and its new title was thrown away. Titles now compare against the
-- platform's own time only, which a thread's self-report never touches.

-- the last_activity_at the platform's list gave, as it gave it
ALTER TABLE claude_threads ADD COLUMN listed_activity_at TEXT;
UPDATE claude_threads SET listed_activity_at = last_activity_at;
