-- Generated from 0005_generic_messaging.ts — faithful SQL capture. Do not edit by hand.

drop table if exists "email_outbox";

drop table if exists "audit_event";

create table "outbox_message" ("id" uuid default gen_random_uuid() primary key, "topic" text not null, "payload" jsonb default '{}'::jsonb not null, "attempts" integer default 0 not null, "next_attempt_at" timestamptz default now() not null, "delivered_at" timestamptz, "dead_at" timestamptz, "last_error" text, "created_at" timestamptz default now() not null);

CREATE INDEX outbox_message_due_idx ON outbox_message (next_attempt_at)
            WHERE delivered_at IS NULL AND dead_at IS NULL;

create table "inbox_message" ("message_id" text primary key, "topic" text not null, "processed_at" timestamptz default now() not null);
