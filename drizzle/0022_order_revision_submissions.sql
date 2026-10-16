-- A taken-back Draft keeps its revision at its next Submit (decisions 2.3 item 1), and every
-- submit keeps a full copy (14-data-model.md, order_revisions): so one revision can hold more than
-- one copy, numbered by `submission` (plan of 2.11, decided item 2, Look first). The rows already
-- there are each the first submit of their revision. No row is updated: the column is added with
-- a default that fills them, then the default is dropped so every insert names its submission.
ALTER TABLE "order_revisions" DROP CONSTRAINT "order_revisions_order_id_revision_key";--> statement-breakpoint
ALTER TABLE "order_revisions" ADD COLUMN "submission" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_revisions" ALTER COLUMN "submission" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_order_id_revision_submission_key" UNIQUE("order_id","revision","submission");--> statement-breakpoint
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_submission_check" CHECK ("order_revisions"."submission" >= 1);
