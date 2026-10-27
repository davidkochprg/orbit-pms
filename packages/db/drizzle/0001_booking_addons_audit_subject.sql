ALTER TABLE "audit_log" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "addons" jsonb DEFAULT '{"wellness":false,"dogs":0,"extraBeds":0}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_log_subject_idx" ON "audit_log" USING btree ("subject_id","created_at");