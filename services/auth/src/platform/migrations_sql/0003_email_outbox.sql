-- Generated from 0003_email_outbox.ts — faithful SQL capture. Do not edit by hand.

create table "email_outbox" ("id" uuid default gen_random_uuid() primary key, "tenant_id" uuid references "tenant" ("id") on delete cascade, "to_email" text not null, "subject" text not null, "html" text not null, "text" text not null, "attempts" integer default 0 not null, "last_error" text, "sent_at" timestamptz, "created_at" timestamptz default now() not null);

CREATE INDEX email_outbox_unsent_idx ON email_outbox (created_at) WHERE sent_at IS NULL;
