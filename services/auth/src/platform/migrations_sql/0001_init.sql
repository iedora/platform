-- Generated from 0001_init.ts — faithful SQL capture. Do not edit by hand.

create table "tenant" ("id" uuid default gen_random_uuid() primary key, "slug" text not null unique, "name" text not null, "allowed_origins" jsonb default '[]'::jsonb not null, "token_audience" text not null, "access_ttl" integer, "created_at" timestamptz default now() not null);

create table "tenant_provider" ("id" uuid default gen_random_uuid() primary key, "tenant_id" uuid not null references "tenant" ("id") on delete cascade, "provider_id" text not null, "kind" text not null, "config" jsonb default '{}'::jsonb not null, "enabled" boolean default true not null, "created_at" timestamptz default now() not null, constraint "tenant_provider_unique" unique ("tenant_id", "provider_id"));

create table "user" ("id" uuid default gen_random_uuid() primary key, "tenant_id" uuid not null references "tenant" ("id") on delete cascade, "email" text not null, "email_verified" boolean default false not null, "name" text, "created_at" timestamptz default now() not null, constraint "user_tenant_email_unique" unique ("tenant_id", "email"));

create table "identity" ("id" uuid default gen_random_uuid() primary key, "tenant_id" uuid not null references "tenant" ("id") on delete cascade, "user_id" uuid not null references "user" ("id") on delete cascade, "provider_id" text not null, "subject" text not null, "password_hash" text, "created_at" timestamptz default now() not null, constraint "identity_provider_subject_unique" unique ("tenant_id", "provider_id", "subject"));

create table "session" ("id" uuid default gen_random_uuid() primary key, "tenant_id" uuid not null references "tenant" ("id") on delete cascade, "user_id" uuid not null references "user" ("id") on delete cascade, "refresh_token_hash" text not null unique, "expires_at" timestamptz not null, "revoked_at" timestamptz, "created_at" timestamptz default now() not null);

create index "session_user_idx" on "session" ("user_id");
