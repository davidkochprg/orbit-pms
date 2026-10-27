CREATE TYPE "public"."audit_actor" AS ENUM('user', 'agent');--> statement-breakpoint
CREATE TYPE "public"."booking_source" AS ENUM('email', 'phone', 'web', 'ota', 'walk_in');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('hold', 'confirmed', 'checked_in', 'checked_out', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."housekeeping_task_status" AS ENUM('open', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."housekeeping_task_type" AS ENUM('turnover', 'stayover', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."inquiry_channel" AS ENUM('email', 'phone', 'web', 'ota');--> statement-breakpoint
CREATE TYPE "public"."inquiry_status" AS ENUM('new', 'quoted', 'replied', 'converted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('cs', 'de', 'en', 'pl');--> statement-breakpoint
CREATE TYPE "public"."room_kind" AS ENUM('room', 'apartment');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('clean', 'dirty', 'inspected', 'out_of_order');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor" "audit_actor" NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"guest_id" text NOT NULL,
	"room_id" text NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"adults" integer NOT NULL,
	"child_ages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "booking_status" NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"source" "booking_source" NOT NULL,
	"price_snapshot" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_dates_check" CHECK ("bookings"."check_out" > "bookings"."check_in")
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"language" "language" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "housekeeping_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"type" "housekeeping_task_type" NOT NULL,
	"status" "housekeeping_task_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"raw_text" text NOT NULL,
	"channel" "inquiry_channel" NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"parsed" jsonb,
	"status" "inquiry_status" DEFAULT 'new' NOT NULL,
	"booking_id" text
);
--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"max_adults" integer NOT NULL,
	"max_children" integer NOT NULL,
	"base_price" integer NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"room_type_id" text NOT NULL,
	"kind" "room_kind" NOT NULL,
	"floor" integer NOT NULL,
	"status" "room_status" DEFAULT 'clean' NOT NULL,
	CONSTRAINT "rooms_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_room_dates_idx" ON "bookings" USING btree ("room_id","check_in","check_out");--> statement-breakpoint
CREATE INDEX "bookings_guest_idx" ON "bookings" USING btree ("guest_id");