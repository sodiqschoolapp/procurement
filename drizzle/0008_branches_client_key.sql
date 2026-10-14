ALTER TABLE "branches" ADD COLUMN "client_key" uuid;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_client_key_key" UNIQUE("client_key");