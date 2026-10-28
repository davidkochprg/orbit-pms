CREATE TYPE "public"."message_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"inquiry_id" text NOT NULL,
	"direction" "message_direction" NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"author" text,
	"translation" jsonb
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "last_message_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "unread" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "language" "language" DEFAULT 'cs' NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_messages_inquiry_idx" ON "inbox_messages" USING btree ("inquiry_id","sent_at");;--> statement-breakpoint
-- Each inquiry's text becomes its first message, and a reply marked as sent its second.
INSERT INTO "inbox_messages" ("id", "inquiry_id", "direction", "body", "sent_at", "author", "translation")
SELECT 'msg_' || "id", "id", 'in', "raw_text", "received_at", NULL, NULL FROM "inquiries";--> statement-breakpoint
INSERT INTO "inbox_messages" ("id", "inquiry_id", "direction", "body", "sent_at", "author", "translation")
SELECT 'msg_' || "id" || '_reply', "id", 'out', "reply", COALESCE("processed_at", "received_at") + interval '1 minute', NULL, NULL
FROM "inquiries" WHERE "reply" IS NOT NULL;--> statement-breakpoint
UPDATE "inquiries" SET
  "last_message_at" = CASE WHEN "reply" IS NOT NULL THEN COALESCE("processed_at", "received_at") + interval '1 minute' ELSE "received_at" END,
  "unread" = ("status" = 'new');--> statement-breakpoint
ALTER TABLE "inquiries" ALTER COLUMN "last_message_at" SET NOT NULL;
