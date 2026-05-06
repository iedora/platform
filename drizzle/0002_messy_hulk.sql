ALTER TABLE "item" ADD COLUMN "name_i18n" jsonb;--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "description_i18n" jsonb;--> statement-breakpoint
ALTER TABLE "restaurant" ADD COLUMN "default_language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant" ADD COLUMN "supported_languages" jsonb DEFAULT '["en"]'::jsonb NOT NULL;