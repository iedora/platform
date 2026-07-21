-- Generated from 0004_tutor_credential.ts — faithful SQL capture. Do not edit by hand.

alter table "tutor" add column "university" text, add column "degree" text;

alter table "tutor" drop column "headline";
