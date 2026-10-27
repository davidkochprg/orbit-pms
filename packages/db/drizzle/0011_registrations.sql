CREATE TYPE "public"."document_type" AS ENUM('id_card', 'passport');--> statement-breakpoint
CREATE TABLE "registrations" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"guest_id" text NOT NULL,
	"nationality" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"document_type" "document_type" NOT NULL,
	"document_number" text NOT NULL,
	"address" text,
	"registered_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registrations_guest_idx" ON "registrations" USING btree ("guest_id","registered_at");