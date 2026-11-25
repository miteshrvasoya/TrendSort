CREATE TABLE IF NOT EXISTS "product_fit" (
	"trend_id" integer PRIMARY KEY NOT NULL,
	"attrs" jsonb NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"trend_id" integer NOT NULL,
	"source" varchar(60) NOT NULL,
	"rating" double precision NOT NULL,
	"review_text" text NOT NULL,
	"reviewed_at" date,
	"text_hash" varchar(40) NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unit_economics_scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"trend_id" integer,
	"name" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"assumptions" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"table_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "duty_gst_tables" ADD COLUMN "group_key" varchar(40);--> statement-breakpoint
ALTER TABLE "duty_gst_tables" ADD COLUMN "is_indicative" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_tables" ADD COLUMN "is_indicative" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "listings_india" ADD COLUMN "external_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_fit" ADD CONSTRAINT "product_fit_trend_id_trend_entities_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_trend_id_trend_entities_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "unit_economics_scenarios" ADD CONSTRAINT "unit_economics_scenarios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "unit_economics_scenarios" ADD CONSTRAINT "unit_economics_scenarios_trend_id_trend_entities_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_reviews_uq" ON "product_reviews" USING btree ("trend_id","text_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "listings_india_mk_ext" ON "listings_india" USING btree ("marketplace","external_id");