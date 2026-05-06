ALTER TABLE "category" ADD COLUMN "name_i18n" jsonb;--> statement-breakpoint
ALTER TABLE "category" ADD COLUMN "description_i18n" jsonb;--> statement-breakpoint
ALTER TABLE "menu" ADD COLUMN "name_i18n" jsonb;--> statement-breakpoint
ALTER TABLE "menu" ADD COLUMN "description_i18n" jsonb;--> statement-breakpoint
ALTER TABLE "restaurant" ADD COLUMN "description_i18n" jsonb;