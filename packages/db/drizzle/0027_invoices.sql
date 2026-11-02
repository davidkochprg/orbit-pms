CREATE TYPE "public"."invoice_kind" AS ENUM('invoice', 'receipt');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('issued', 'void');--> statement-breakpoint
CREATE TYPE "public"."supplier_invoice_status" AS ENUM('to_review', 'unpaid', 'paid');--> statement-breakpoint
CREATE TABLE "invoice_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"status" "id_scan_status" NOT NULL,
	"supplier_invoice_id" text,
	"error" text,
	"reading_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"kind" "invoice_kind" NOT NULL,
	"status" "invoice_status" NOT NULL,
	"booking_id" text NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"status" "supplier_invoice_status" NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_scans_expires_idx" ON "invoice_scans" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "invoices_booking_idx" ON "invoices" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "supplier_invoices_status_idx" ON "supplier_invoices" USING btree ("status","created_at");