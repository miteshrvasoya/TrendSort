CREATE TABLE IF NOT EXISTS "alert_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"alert_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"trend_id" integer NOT NULL,
	"message" text NOT NULL,
	"fingerprint" varchar(80) NOT NULL,
	"seen" boolean DEFAULT false NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"from_stage" varchar(30),
	"to_stage" varchar(30) NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_of" date NOT NULL,
	"mode" varchar(10) NOT NULL,
	"payload" jsonb NOT NULL,
	"emailed_at" timestamp with time zone,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_items" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "pipeline_items" ADD COLUMN "quotes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_items" ADD COLUMN "results" text;--> statement-breakpoint
ALTER TABLE "pipeline_items" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "origin" varchar(10) DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "algorithm_version" varchar(20);--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "basis" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "hit" varchar(10);--> statement-breakpoint
ALTER TABLE "predictions" ADD COLUMN "stage_error" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_trend_id_trend_entities_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_events" ADD CONSTRAINT "pipeline_events_item_id_pipeline_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pipeline_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "alert_events_uq" ON "alert_events" USING btree ("alert_id","trend_id","fingerprint");