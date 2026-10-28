CREATE TYPE "public"."id_scan_status" AS ENUM('waiting', 'reading', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "id_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"stay_guest_id" text,
	"status" "id_scan_status" NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stay_guests" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"guest_id" text,
	"name" text NOT NULL,
	"nationality" text,
	"date_of_birth" date,
	"document_type" "document_type",
	"document_number" text,
	"address" text,
	"registered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "id_scans" ADD CONSTRAINT "id_scans_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_guests" ADD CONSTRAINT "stay_guests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_guests" ADD CONSTRAINT "stay_guests_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "id_scans_expires_idx" ON "id_scans" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "stay_guests_booking_idx" ON "stay_guests" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "stay_guests_guest_idx" ON "stay_guests" USING btree ("guest_id","registered_at");--> statement-breakpoint
-- Each stay's main-guest registration becomes that guest's guest-book entry.
INSERT INTO "stay_guests" ("id", "booking_id", "guest_id", "name", "nationality", "date_of_birth", "document_type", "document_number", "address", "registered_at", "created_at")
SELECT 'sg_' || r."booking_id", r."booking_id", r."guest_id", g."name", r."nationality", r."date_of_birth", r."document_type", r."document_number", r."address", r."registered_at", r."registered_at"
FROM "registrations" r JOIN "guests" g ON g."id" = r."guest_id";
