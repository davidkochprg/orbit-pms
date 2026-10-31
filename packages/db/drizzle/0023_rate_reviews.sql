CREATE TABLE "rate_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"basis" text NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"signals" jsonb NOT NULL
);
