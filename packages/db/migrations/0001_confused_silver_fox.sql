CREATE TABLE IF NOT EXISTS "tracked_keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"trend_id" integer NOT NULL,
	"term" text NOT NULL,
	"geos" jsonb DEFAULT '["US","IN"]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_fetched_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "product_snapshots" ADD COLUMN "list_type" varchar(30);--> statement-breakpoint
ALTER TABLE "product_snapshots" ADD COLUMN "category_path" text;--> statement-breakpoint
ALTER TABLE "trend_entities" ADD COLUMN "status" varchar(20) DEFAULT 'tracked' NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_entities" ADD COLUMN "origin" varchar(20) DEFAULT 'user' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tracked_keywords" ADD CONSTRAINT "tracked_keywords_trend_id_trend_entities_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tracked_kw_uq" ON "tracked_keywords" USING btree ("trend_id","term");