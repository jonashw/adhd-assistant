-- The connector's protocol version each thread has been told about. A thread reads the connector's instructions
-- once, when its session starts, so a running thread learns of newer rules from its next tool reply instead.
-- NULL means it started before versions were counted (version 1).
ALTER TABLE claude_threads ADD COLUMN protocol_seen INTEGER;
ALTER TABLE linked_items ADD COLUMN protocol_seen INTEGER;
