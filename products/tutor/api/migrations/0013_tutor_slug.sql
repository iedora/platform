-- Generated from 0013_tutor_slug.ts — faithful SQL capture. Do not edit by hand.

alter table "tutor" add column "slug" text;

create unique index "tutor_slug_key" on "tutor" ("slug");
