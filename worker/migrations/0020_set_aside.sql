-- "Put a pin in it": an ask set aside until a day. Until then it isn't Jon's move: Your move lists it under
-- Opens up later and the thread's flare stays down. The thread sets it when Jon defers (set_aside_by 'thread'),
-- or Jon sets it from Your move ('jon'). It clears when the thread works again or Jon brings it back.
ALTER TABLE claude_threads ADD COLUMN set_aside_until TEXT;
ALTER TABLE claude_threads ADD COLUMN set_aside_by TEXT CHECK (set_aside_by IN ('thread', 'jon'));
ALTER TABLE linked_items ADD COLUMN set_aside_until TEXT;
