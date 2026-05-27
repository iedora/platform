CREATE SCHEMA IF NOT EXISTS "menu";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu"."ai_menu_generation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu"."category" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"name_i18n" jsonb,
	"description" text,
	"description_i18n" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"translations_synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu"."daily_view" (
	"organization_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"day" text NOT NULL,
	"language" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_view_restaurant_id_day_language_pk" PRIMARY KEY("restaurant_id","day","language")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu"."invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"status" text DEFAULT 'paid' NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu"."item" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"name_i18n" jsonb,
	"description" text,
	"description_i18n" jsonb,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"image_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"variants" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"translations_synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu"."menu" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"name_i18n" jsonb,
	"description" text,
	"description_i18n" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu"."org_plan" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu"."qr_code" (
	"code" text PRIMARY KEY NOT NULL,
	"restaurant_id" text,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"bound_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu"."rate_limit_event" (
	"key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu"."restaurant" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"description_i18n" jsonb,
	"logo_url" text,
	"banner_url" text,
	"theme" jsonb,
	"default_language" text DEFAULT 'en' NOT NULL,
	"supported_languages" jsonb DEFAULT '["en"]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu"."view_seen" (
	"visitor_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"hour_bucket" text NOT NULL,
	"seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "view_seen_visitor_id_restaurant_id_hour_bucket_pk" PRIMARY KEY("visitor_id","restaurant_id","hour_bucket")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "menu"."category" ADD CONSTRAINT "category_menu_id_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "menu"."menu"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "menu"."category" ADD CONSTRAINT "category_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "menu"."restaurant"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "menu"."daily_view" ADD CONSTRAINT "daily_view_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "menu"."restaurant"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "menu"."item" ADD CONSTRAINT "item_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "menu"."category"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "menu"."item" ADD CONSTRAINT "item_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "menu"."restaurant"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "menu"."menu" ADD CONSTRAINT "menu_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "menu"."restaurant"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "menu"."qr_code" ADD CONSTRAINT "qr_code_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "menu"."restaurant"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "menu"."view_seen" ADD CONSTRAINT "view_seen_restaurant_id_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "menu"."restaurant"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_menu_generation_org_time_idx" ON "menu"."ai_menu_generation" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "category_menu_idx" ON "menu"."category" USING btree ("menu_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "category_restaurant_idx" ON "menu"."category" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_view_org_day_idx" ON "menu"."daily_view" USING btree ("organization_id","day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_org_idx" ON "menu"."invoice" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_issued_at_idx" ON "menu"."invoice" USING btree ("issued_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_category_idx" ON "menu"."item" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_restaurant_idx" ON "menu"."item" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_restaurant_idx" ON "menu"."menu" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qr_code_restaurant_idx" ON "menu"."qr_code" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limit_event_key_time_idx" ON "menu"."rate_limit_event" USING btree ("key","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restaurant_org_idx" ON "menu"."restaurant" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "view_seen_seen_at_idx" ON "menu"."view_seen" USING btree ("seen_at");