-- Reaching a thread in another project. The platform's own tools address a thread by its session id, not by the
-- cmsg id the map keys on, and a thread can only list the threads of its own project. Each sync now brings every
-- thread's session id as list_threads gives it (cse_...), so a thread anywhere can look another one up by title.
-- Null until its project's first sync after this.
ALTER TABLE claude_threads ADD COLUMN session_id TEXT;
