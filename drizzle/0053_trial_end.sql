-- Task 9.4: the record that the trial of the live app has ended (D52; plan of 9.4, decided item 2,
-- Look first). Written once by `npm run trial:reset`; its row makes the reset and the seed refuse.
-- One row at most: the key is always true.
CREATE TABLE "trial_end" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	CONSTRAINT "trial_end_one_row_check" CHECK ("trial_end"."id")
);
