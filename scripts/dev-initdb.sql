-- Dev-only: pre-create each service's database on first Postgres init.
-- Most services create their own DB on boot (runMigrations createDatabase:true),
-- but the standalone auth service migrates an existing DB, so we create them all
-- here. Runs once on a fresh data dir; reset with `pnpm api:reset`.
CREATE DATABASE auth;
CREATE DATABASE menu;
CREATE DATABASE audit;
CREATE DATABASE billing;
CREATE DATABASE email;
CREATE DATABASE tutor;
