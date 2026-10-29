CREATE TABLE "stay_readings" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"pets" boolean NOT NULL,
	"mess" text NOT NULL,
	"mess_reason" text,
	"prepare" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stay_readings" ADD CONSTRAINT "stay_readings_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;