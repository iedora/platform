-- Generated from 0002_saas_foundation.ts — faithful SQL capture. Do not edit by hand.

create table "organization" ("id" uuid default gen_random_uuid() primary key, "tenant_id" uuid not null references "tenant" ("id") on delete cascade, "slug" text not null, "name" text not null, "metadata" jsonb default '{}'::jsonb not null, "created_at" timestamptz default now() not null, constraint "organization_tenant_slug_unique" unique ("tenant_id", "slug"));

create table "membership" ("id" uuid default gen_random_uuid() primary key, "tenant_id" uuid not null references "tenant" ("id") on delete cascade, "organization_id" uuid not null references "organization" ("id") on delete cascade, "user_id" uuid not null references "user" ("id") on delete cascade, "role" text default 'member' not null, "created_at" timestamptz default now() not null, constraint "membership_org_user_unique" unique ("organization_id", "user_id"));

create index "membership_user_idx" on "membership" ("user_id");

alter table "user" add column "banned" boolean default false not null, add column "ban_reason" text, add column "ban_expires_at" timestamptz, add column "must_change_password" boolean default false not null, add column "password_changed_at" timestamptz;

alter table "session" add column "family_id" uuid default gen_random_uuid() not null, add column "replaced_by" uuid, add column "absolute_expires_at" timestamptz, add column "ip" text, add column "user_agent" text;

create index "session_family_idx" on "session" ("family_id");

create table "password_reset_token" ("id" uuid default gen_random_uuid() primary key, "tenant_id" uuid not null references "tenant" ("id") on delete cascade, "user_id" uuid not null references "user" ("id") on delete cascade, "token_hash" text not null unique, "expires_at" timestamptz not null, "claimed_at" timestamptz, "created_at" timestamptz default now() not null);

create table "service_client" ("id" uuid default gen_random_uuid() primary key, "tenant_id" uuid references "tenant" ("id") on delete cascade, "client_id" text not null unique, "secret_hash" text not null, "audience" text not null, "name" text not null, "created_at" timestamptz default now() not null);

create table "audit_event" ("id" uuid default gen_random_uuid() primary key, "tenant_id" uuid references "tenant" ("id") on delete cascade, "type" text not null, "payload" jsonb default '{}'::jsonb not null, "created_at" timestamptz default now() not null, "delivered_at" timestamptz);

CREATE INDEX audit_event_undelivered_idx ON audit_event (created_at) WHERE delivered_at IS NULL;
