CREATE TABLE IF NOT EXISTS "backtest_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"term" text NOT NULL,
	"lag_group" varchar(30) NOT NULL,
	"us_rise" varchar(7) NOT NULL,
	"in_rise" varchar(7) NOT NULL,
	"estimated_lag_months" double precision NOT NULL,
	"measured_lag_months" double precision,
	"measured_correlation" double precision,
	"measured_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "backtest_term_uq" ON "backtest_cases" USING btree ("term");