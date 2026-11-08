-- A to-do can wait on someone outside Jon's list (Netlify support, a delivery), not only on another to-do.
-- Until the check-back day it sits under Opens up later; on that day it comes back as "check on <who>".
ALTER TABLE checklist_items ADD COLUMN waiting_for TEXT;
ALTER TABLE checklist_items ADD COLUMN check_back_on TEXT;
