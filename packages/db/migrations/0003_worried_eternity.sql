CREATE TABLE IF NOT EXISTS "gift_profiles" (
	"trend_id" integer PRIMARY KEY NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"age_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"personalisation" varchar(10) DEFAULT 'none' NOT NULL,
	"price_min_inr" double precision,
	"price_max_inr" double precision,
	"corporate" jsonb,
	"is_sample" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_snapshots" ADD COLUMN "metrics" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gift_profiles" ADD CONSTRAINT "gift_profiles_trend_id_trend_entities_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
