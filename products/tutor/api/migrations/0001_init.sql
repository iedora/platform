-- Generated from 0001_init.ts — faithful SQL capture. Do not edit by hand.

create type "rank_tier" as enum ('bronze', 'silver', 'gold', 'platinum', 'elite');

create type "lesson_type" as enum ('free_intro', 'standard');

create type "lesson_mode" as enum ('recurring', 'one_off');

create type "lesson_status" as enum ('booked', 'charge_due', 'charging', 'awaiting_payment', 'paid', 'in_progress', 'completed', 'payment_failed', 'auto_released', 'cancelled', 'late_cancelled', 'student_no_show', 'tutor_no_show', 'refunded');

create type "negotiation_state" as enum ('none', 'awaiting_tutor', 'awaiting_student');

create type "payment_status" as enum ('pending', 'action_required', 'paid', 'failed', 'refunded');

create type "party" as enum ('tutor', 'student');

create type "sender_type" as enum ('tutor', 'student', 'system');

create type "message_type" as enum ('text', 'proposal', 'payment_request', 'confirmation', 'review_request', 'rank_up', 'system', 'lesson_room');

create type "reschedule_thread_status" as enum ('open', 'confirmed', 'cancelled', 'expired');

create type "xp_event_type" as enum ('lesson_completed', 'review_5', 'review_4', 'review_3', 'review_low', 'retention', 'clean_month', 'verified_credential', 'tutor_no_show', 'quest_reward');

create type "owner_type" as enum ('tutor', 'student');

create table "subject" ("id" uuid default gen_random_uuid() primary key, "name" text not null, "level" text, "base_rate_pennies" integer not null, "created_at" timestamptz default now() not null);

create table "rank" ("id" uuid default gen_random_uuid() primary key, "tier" rank_tier not null unique, "name" text not null, "min_xp" integer not null, "multiplier" real not null);

create table "tutor" ("id" uuid default gen_random_uuid() primary key, "user_id" text not null, "display_name" text not null, "bio" text, "created_at" timestamptz default now() not null);

create table "student" ("id" uuid default gen_random_uuid() primary key, "user_id" text not null, "display_name" text not null, "has_completed_intro" boolean default false not null, "stripe_customer_id" text, "default_payment_method_id" text, "learner_level" integer default 1 not null, "learner_xp" integer default 0 not null, "created_at" timestamptz default now() not null);

create table "qualification" ("id" uuid default gen_random_uuid() primary key, "tutor_id" uuid not null references "tutor" ("id") on delete cascade, "subject_id" uuid not null references "subject" ("id") on delete restrict, "rank_id" uuid not null references "rank" ("id"), "xp" integer default 0 not null, "verified" boolean default false not null, "verified_at" timestamptz, "created_at" timestamptz default now() not null, constraint "qualification_tutor_subject_unique" unique ("tutor_id", "subject_id"));

create table "availability" ("id" uuid default gen_random_uuid() primary key, "tutor_id" uuid not null references "tutor" ("id") on delete cascade, "weekday" integer not null, "start_time" time not null, "end_time" time not null);

create table "lesson_series" ("id" uuid default gen_random_uuid() primary key, "student_id" uuid not null references "student" ("id") on delete cascade, "tutor_id" uuid not null references "tutor" ("id") on delete cascade, "qualification_id" uuid not null references "qualification" ("id"), "weekday" integer not null, "local_time" text not null, "timezone" text default 'Europe/London' not null, "price_pennies" integer not null, "status" text default 'active' not null, "start_date" timestamptz not null, "end_date" timestamptz, "created_at" timestamptz default now() not null);

create table "lesson" ("id" uuid default gen_random_uuid() primary key, "series_id" uuid references "lesson_series" ("id") on delete set null, "student_id" uuid not null references "student" ("id") on delete cascade, "tutor_id" uuid not null references "tutor" ("id") on delete cascade, "subject_id" uuid not null references "subject" ("id"), "qualification_id" uuid references "qualification" ("id"), "type" lesson_type not null, "mode" lesson_mode not null, "status" lesson_status default 'booked' not null, "negotiation" negotiation_state default 'none' not null, "starts_at_utc" timestamptz not null, "duration_min" integer not null, "buffer_min" integer default 0 not null, "price_pennies" integer default 0 not null, "payment_id" uuid, "room_url" text, "created_at" timestamptz default now() not null);

create table "lesson_event" ("id" uuid default gen_random_uuid() primary key, "lesson_id" uuid not null references "lesson" ("id") on delete cascade, "from_status" text, "to_status" text not null, "reason" text, "at" timestamptz default now() not null);

create table "payment" ("id" uuid default gen_random_uuid() primary key, "lesson_id" uuid not null references "lesson" ("id") on delete cascade, "stripe_payment_intent_id" text, "status" payment_status default 'pending' not null, "amount_pennies" integer not null, "refunded_at" timestamptz, "created_at" timestamptz default now() not null);

create table "reschedule_thread" ("id" uuid default gen_random_uuid() primary key, "lesson_id" uuid not null references "lesson" ("id") on delete cascade, "status" reschedule_thread_status default 'open' not null, "opened_by" party not null, "created_at" timestamptz default now() not null, "resolved_at" timestamptz);

create table "time_proposal" ("id" uuid default gen_random_uuid() primary key, "thread_id" uuid not null references "reschedule_thread" ("id") on delete cascade, "proposed_by" party not null, "slots" jsonb not null, "message" text, "is_active" boolean default true not null, "created_at" timestamptz default now() not null);

create table "review" ("id" uuid default gen_random_uuid() primary key, "lesson_id" uuid not null references "lesson" ("id") on delete cascade, "student_id" uuid not null references "student" ("id") on delete cascade, "qualification_id" uuid not null references "qualification" ("id") on delete cascade, "rating" integer not null, "comment" text, "created_at" timestamptz default now() not null);

create table "xp_event" ("id" uuid default gen_random_uuid() primary key, "qualification_id" uuid not null references "qualification" ("id") on delete cascade, "tutor_id" uuid not null references "tutor" ("id") on delete cascade, "type" xp_event_type not null, "xp_delta" integer not null, "reason" text, "created_at" timestamptz default now() not null);

create table "badge" ("id" uuid default gen_random_uuid() primary key, "name" text not null, "description" text not null, "criteria" text not null);

create table "tutor_badge" ("id" uuid default gen_random_uuid() primary key, "tutor_id" uuid not null references "tutor" ("id") on delete cascade, "badge_id" uuid not null references "badge" ("id") on delete cascade, "awarded_at" timestamptz default now() not null, constraint "tutor_badge_unique" unique ("tutor_id", "badge_id"));

create table "quest" ("id" uuid default gen_random_uuid() primary key, "owner_type" owner_type not null, "owner_id" uuid not null, "title" text not null, "target" integer not null, "progress" integer default 0 not null, "xp_reward" integer not null, "period_start" timestamptz not null, "period_end" timestamptz not null, "completed_at" timestamptz);

create table "streak" ("id" uuid default gen_random_uuid() primary key, "owner_type" owner_type not null, "owner_id" uuid not null, "kind" text default 'weekly' not null, "count" integer default 0 not null, "last_at" timestamptz, constraint "streak_owner_kind_unique" unique ("owner_type", "owner_id", "kind"));

create table "conversation" ("id" uuid default gen_random_uuid() primary key, "tutor_id" uuid not null references "tutor" ("id") on delete cascade, "student_id" uuid not null references "student" ("id") on delete cascade, "created_at" timestamptz default now() not null, "last_message_at" timestamptz default now() not null, constraint "conversation_pair_unique" unique ("tutor_id", "student_id"));

create table "message" ("id" uuid default gen_random_uuid() primary key, "conversation_id" uuid not null references "conversation" ("id") on delete cascade, "sender_type" sender_type not null, "type" message_type default 'text' not null, "body" text, "payload" jsonb, "ref_id" text, "created_at" timestamptz default now() not null);
