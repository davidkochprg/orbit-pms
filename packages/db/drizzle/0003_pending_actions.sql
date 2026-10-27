CREATE TYPE "public"."pending_action_status" AS ENUM('pending', 'confirmed', 'rejected', 'failed');--> statement-breakpoint
CREATE TABLE "pending_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"input" jsonb NOT NULL,
	"summary" text NOT NULL,
	"status" "pending_action_status" DEFAULT 'pending' NOT NULL,
	"booking_id" text,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone
);
