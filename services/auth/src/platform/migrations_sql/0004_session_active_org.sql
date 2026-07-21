-- Generated from 0004_session_active_org.ts — faithful SQL capture. Do not edit by hand.

alter table "session" add column "active_organization_id" uuid references "organization" ("id") on delete set null;
