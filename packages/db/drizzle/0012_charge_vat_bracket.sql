CREATE TYPE "public"."vat_bracket" AS ENUM('standard', 'reduced', 'none');--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "vat_bracket" "vat_bracket" DEFAULT 'standard' NOT NULL;