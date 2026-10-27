ALTER TABLE "inquiries" ADD COLUMN "partner" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "sender_name" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "sender_address" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "suggestion" jsonb;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "reply" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "processing_error" text;