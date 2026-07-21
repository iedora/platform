-- Generated from 0002_quests.ts — faithful SQL capture. Do not edit by hand.

ALTER TYPE xp_event_type ADD VALUE IF NOT EXISTS 'quest_reward';

alter table "quest" add column "kind" text default 'lesson_completed' not null;
