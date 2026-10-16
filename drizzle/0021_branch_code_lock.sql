-- The branch code locks after the branch's first order (04-catalogs.md, Catalogs table:
-- Branches), read as its first order with a number: the code is used only in order numbers
-- (plan of 2.7, decided item 8, Look first). updateBranch refuses first; this trigger is the
-- database's last defence (CLAUDE.md rule 5). It raises as orders_guard of 0019 does, so the
-- action wrapper and the tests read the constraint name (review of the plan, correction 2).
CREATE FUNCTION "branches_code_locked"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF NEW."code" IS DISTINCT FROM OLD."code" AND EXISTS (
		SELECT 1 FROM "orders" WHERE "branch_id" = OLD."id" AND "number" IS NOT NULL
	) THEN
		RAISE EXCEPTION 'The code of a branch with a submitted order never changes.'
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'branches_code_locked',
				TABLE = 'branches';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "branches_code_locked"
	BEFORE UPDATE OF "code" ON "branches"
	FOR EACH ROW EXECUTE FUNCTION "branches_code_locked"();
