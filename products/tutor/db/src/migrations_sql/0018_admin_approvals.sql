-- Generated from 0018_admin_approvals.ts — faithful SQL capture. Do not edit by hand.

create table "admin" ("id" uuid default gen_random_uuid() primary key, "email" text not null unique, "created_at" timestamptz default now() not null);

create table "profile_change" ("id" uuid default gen_random_uuid() primary key, "tutor_id" uuid not null references "tutor" ("id") on delete cascade, "kind" text not null, "payload" jsonb not null, "summary" text not null, "status" text default 'pending' not null, "reviewer_note" text, "created_at" timestamptz default now() not null, "resolved_at" timestamptz);

create index "profile_change_status_idx" on "profile_change" ("status");
