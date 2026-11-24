CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"trend_id" integer,
	"rule" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_fired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_versions" (
	"version" varchar(20) PRIMARY KEY NOT NULL,
	"released_on" date NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"url" text,
	"source_key" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "countries" (
	"code" varchar(2) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"currency" varchar(3) NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "duty_gst_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"hs_code" varchar(12) NOT NULL,
	"description" text,
	"basic_duty_pct" double precision NOT NULL,
	"igst_pct" double precision NOT NULL,
	"other_pct" double precision DEFAULT 0 NOT NULL,
	"effective_from" date NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"marketplace" varchar(40) NOT NULL,
	"category" text NOT NULL,
	"referral_pct" double precision NOT NULL,
	"closing_fee_inr" double precision DEFAULT 0 NOT NULL,
	"effective_from" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "festivals" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(50) NOT NULL,
	"name" text NOT NULL,
	"foreign_equivalent" text,
	"gift_intensity" integer DEFAULT 3 NOT NULL,
	"dates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "festivals_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "listings_india" (
	"id" serial PRIMARY KEY NOT NULL,
	"trend_id" integer,
	"marketplace" varchar(40) NOT NULL,
	"title" text NOT NULL,
	"price_inr" double precision,
	"rating" double precision,
	"review_count" integer,
	"url" text,
	"source_id" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" double precision DEFAULT 0.5 NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"trend_id" integer,
	"headline" text NOT NULL,
	"publisher" text,
	"published_at" timestamp with time zone,
	"url" text NOT NULL,
	"summary" text,
	"summary_method" varchar(20),
	"source_id" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" double precision DEFAULT 0.5 NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "occasions" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(50) NOT NULL,
	"name" text NOT NULL,
	"festival_id" integer,
	CONSTRAINT "occasions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"trend_id" integer,
	"stage" varchar(30) DEFAULT 'spotted' NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"trend_id" integer NOT NULL,
	"predicted_stage" varchar(30) NOT NULL,
	"horizon_date" date NOT NULL,
	"actual_stage" varchar(30),
	"confidence" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"price" double precision,
	"currency" varchar(3),
	"rating" double precision,
	"review_count" integer,
	"bsr" integer,
	"source_id" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" double precision DEFAULT 0.5 NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"trend_id" integer,
	"marketplace" varchar(40) NOT NULL,
	"country_code" varchar(2),
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"brand" text,
	"seller" text,
	"image_url" text,
	"url" text,
	"hs_code" varchar(12),
	"source_id" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" double precision DEFAULT 0.5 NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit_usage" (
	"source_id" integer NOT NULL,
	"day" date NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_usage_source_id_day_pk" PRIMARY KEY("source_id","day")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raw_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer,
	"kind" varchar(30) NOT NULL,
	"external_id" text,
	"payload" jsonb NOT NULL,
	"source_id" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" double precision DEFAULT 0.5 NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "release_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" varchar(20) NOT NULL,
	"added" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"changed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fixed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"removed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"for_you" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"trend_id" integer NOT NULL,
	"algorithm_version" varchar(20) NOT NULL,
	"momentum" double precision,
	"breadth" double precision,
	"sustainability" double precision,
	"commercial_proof" double precision,
	"opportunity" double precision,
	"adoption_stage" varchar(30),
	"lag_months" double precision,
	"weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"item_count" integer DEFAULT 0 NOT NULL,
	"http_calls" integer DEFAULT 0 NOT NULL,
	"error" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(60) NOT NULL,
	"name" text NOT NULL,
	"type" varchar(30) NOT NULL,
	"method" varchar(30) NOT NULL,
	"scraped" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"reliability" double precision DEFAULT 0.5 NOT NULL,
	"cost_per_call" double precision DEFAULT 0 NOT NULL,
	"limit_calls" integer DEFAULT 0 NOT NULL,
	"limit_window" varchar(10) DEFAULT 'day' NOT NULL,
	"terms_note" text,
	"phase" integer DEFAULT 1 NOT NULL,
	"circuit_state" varchar(10) DEFAULT 'closed' NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "sources_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tour_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" varchar(20) NOT NULL,
	"feature_key" varchar(60) NOT NULL,
	"target" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"order" integer NOT NULL,
	"route" text,
	"screenshot_url" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(120) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" integer,
	"sub_category" text,
	"vertical_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"occasion_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_band_inr" text,
	"target_buyer" text,
	"embedding" vector(384),
	"source_id" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" double precision DEFAULT 0.5 NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	CONSTRAINT "trend_entities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_signals_timeseries" (
	"trend_id" integer NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"metric" varchar(40) NOT NULL,
	"week_start" date NOT NULL,
	"value" double precision NOT NULL,
	"is_estimated" boolean DEFAULT false NOT NULL,
	"method" text,
	"source_id" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" double precision DEFAULT 0.5 NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	CONSTRAINT "trend_signals_timeseries_trend_id_country_code_metric_week_start_pk" PRIMARY KEY("trend_id","country_code","metric","week_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(20) DEFAULT 'admin' NOT NULL,
	"last_seen_version" varchar(20),
	"tour_completed_version" varchar(20),
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verticals" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(50) NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "verticals_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trend_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alerts" ADD CONSTRAINT "alerts_trend_id_trend_entities_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listings_india" ADD CONSTRAINT "listings_india_trend_id_trend_entities_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listings_india" ADD CONSTRAINT "listings_india_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "news_items" ADD CONSTRAINT "news_items_trend_id_trend_entities_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "news_items" ADD CONSTRAINT "news_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "occasions" ADD CONSTRAINT "occasions_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_items" ADD CONSTRAINT "pipeline_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pipeline_items" ADD CONSTRAINT "pipeline_items_trend_id_trend_entities_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "predictions" ADD CONSTRAINT "predictions_trend_id_trend_entities_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_snapshots" ADD CONSTRAINT "product_snapshots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_snapshots" ADD CONSTRAINT "product_snapshots_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_trend_id_trend_entities_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_entities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rate_limit_usage" ADD CONSTRAINT "rate_limit_usage_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raw_signals" ADD CONSTRAINT "raw_signals_run_id_source_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."source_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raw_signals" ADD CONSTRAINT "raw_signals_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_version_app_versions_version_fk" FOREIGN KEY ("version") REFERENCES "public"."app_versions"("version") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scores" ADD CONSTRAINT "scores_trend_id_trend_entities_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "source_runs" ADD CONSTRAINT "source_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tour_steps" ADD CONSTRAINT "tour_steps_version_app_versions_version_fk" FOREIGN KEY ("version") REFERENCES "public"."app_versions"("version") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trend_entities" ADD CONSTRAINT "trend_entities_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trend_entities" ADD CONSTRAINT "trend_entities_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trend_signals_timeseries" ADD CONSTRAINT "trend_signals_timeseries_trend_id_trend_entities_id_fk" FOREIGN KEY ("trend_id") REFERENCES "public"."trend_entities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trend_signals_timeseries" ADD CONSTRAINT "trend_signals_timeseries_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trend_signals_timeseries" ADD CONSTRAINT "trend_signals_timeseries_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "news_url_idx" ON "news_items" USING btree ("url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_snapshots_p_idx" ON "product_snapshots" USING btree ("product_id","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_mk_ext" ON "products" USING btree ("marketplace","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_signals_source_idx" ON "raw_signals" USING btree ("source_id","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "release_notes_v" ON "release_notes" USING btree ("version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scores_trend_idx" ON "scores" USING btree ("trend_id","computed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "source_runs_source_idx" ON "source_runs" USING btree ("source_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tour_steps_v_f" ON "tour_steps" USING btree ("version","feature_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trend_entities_cat_idx" ON "trend_entities" USING btree ("category_id");