CREATE TABLE "local_events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"first_night" date NOT NULL,
	"last_night" date NOT NULL,
	"impact" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
