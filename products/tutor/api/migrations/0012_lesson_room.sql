-- Generated from 0012_lesson_room.ts — faithful SQL capture. Do not edit by hand.

ALTER TYPE message_type ADD VALUE IF NOT EXISTS 'lesson_room';

alter table "lesson" add column "room_tutor_url" text;
