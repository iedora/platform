-- Generated from 0010_timezone_source.ts — faithful SQL capture. Do not edit by hand.

alter table "student" add column "timezone_source" text default 'auto' not null;

alter table "tutor" add column "timezone_source" text default 'auto' not null;
