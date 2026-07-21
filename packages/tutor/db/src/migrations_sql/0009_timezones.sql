-- Generated from 0009_timezones.ts — faithful SQL capture. Do not edit by hand.

alter table "tutor" add column "timezone" text default 'Europe/London' not null;

alter table "student" add column "timezone" text default 'Europe/London' not null;
