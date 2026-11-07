-- The estimates a thread gives with a to-do, for the Leverage order on Your move. All optional: the order fills in
-- middling defaults. Jon's thumbs up or down on Claude's interest guess are kept so later guesses can learn from them.

ALTER TABLE checklist_items ADD COLUMN worth INTEGER CHECK (worth IN (1, 2, 3));
ALTER TABLE checklist_items ADD COLUMN why TEXT;
ALTER TABLE checklist_items ADD COLUMN size TEXT CHECK (size IN ('minutes', 'half_hour', 'longer'));
ALTER TABLE checklist_items ADD COLUMN delay_class TEXT CHECK (delay_class IN ('expedite', 'fixed_date', 'standard', 'intangible'));
ALTER TABLE checklist_items ADD COLUMN due_on TEXT;
-- JSON arrays of strings
ALTER TABLE checklist_items ADD COLUMN needs TEXT;
ALTER TABLE checklist_items ADD COLUMN done_when TEXT;
-- JSON array of other checklist item ids
ALTER TABLE checklist_items ADD COLUMN waits_on TEXT;
ALTER TABLE checklist_items ADD COLUMN interest_guess TEXT CHECK (interest_guess IN ('drawn', 'neutral', 'reluctant'));
ALTER TABLE checklist_items ADD COLUMN interest_reason TEXT;
ALTER TABLE checklist_items ADD COLUMN interest_answer TEXT CHECK (interest_answer IN ('up', 'down'));
ALTER TABLE checklist_items ADD COLUMN interest_answered_at TEXT;
