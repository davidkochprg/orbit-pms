CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"person" text,
	"trades" jsonb NOT NULL,
	"phone" text,
	"email" text,
	"language" "language" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "housekeeping_tasks" ADD COLUMN "trade" text;--> statement-breakpoint
ALTER TABLE "housekeeping_tasks" ADD COLUMN "contact_id" text;