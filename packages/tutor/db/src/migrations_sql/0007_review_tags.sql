-- Generated from 0007_review_tags.ts — faithful SQL capture. Do not edit by hand.

alter table "review" add column "tags" text[] default '{}'::text[] not null;
