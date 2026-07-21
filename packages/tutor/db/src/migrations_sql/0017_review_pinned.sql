-- Generated from 0017_review_pinned.ts — faithful SQL capture. Do not edit by hand.

alter table "review" add column "pinned" boolean default false not null;
