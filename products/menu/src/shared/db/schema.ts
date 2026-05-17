import { relations } from 'drizzle-orm'
import {
  bigint,
  pgSchema,
  primaryKey,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type { LanguageCode, LocalizedText } from '@/features/i18n/types'
import type { PlanCode } from '@/features/plans/types'

// Single Postgres schema for the menu product: `menu.*`. Genkan (the IdaaS)
// owns its own database — menu has ZERO coupling to genkan's tables. Identity
// federates over OAuth via Better Auth's `generic-oauth` plugin (see
// `features/auth/adapters/better-auth-instance.ts`).
//
// The Better Auth client tables (`user`, `session`, `account`, `verification`)
// live under `menu.*` and represent the LOCAL cache of users who have signed
// in to menu through genkan. The canonical identity record lives in genkan;
// these rows are created by Better Auth on the first OAuth callback.
export const menuSchema = pgSchema('menu')

// ─── Better Auth: client tables (local cache of federated identity) ──────────
// Regenerate with `bun run auth:generate` after changing auth plugins.

export const user = menuSchema.table('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const session = menuSchema.table(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_userId_idx').on(t.userId)],
)

// `account` is where Better Auth's generic-oauth plugin stores the user's
// OAuth tokens (access_token, refresh_token, expiry). One row per
// (userId, providerId='genkan'). The identity slice reads `accessToken` here
// before calling genkan's HTTP organization API on the user's behalf.
export const account = menuSchema.table(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('account_userId_idx').on(t.userId)],
)

// `verification` is required by Better Auth's core even when email/password is
// disabled — the generic-oauth flow uses it for OAuth state + PKCE storage.
export const verification = menuSchema.table(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

// ─── Org plan (menu-owned billing metadata, keyed by genkan orgId) ───────────
// Genkan owns the organization record. The plan / tier is a menu-domain
// concern (it gates restaurant counts, monthly views, etc.) so it lives here.
// `organizationId` is a UUID handed back by genkan's create-organization API;
// no FK — genkan is a separate database.
export const orgPlan = menuSchema.table('org_plan', {
  organizationId: text('organization_id').primaryKey(),
  plan: text('plan').$type<PlanCode>().notNull().default('free'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

// ─── Domain: restaurant menu builder ──────────────────────────────────────────

export type RestaurantTheme = {
  primaryColor?: string
  secondaryColor?: string
  font?: 'inter' | 'playfair' | 'lora' | 'space-grotesk'
  layout?: 'classic' | 'minimal'
  // forward-compatible — extend without migrations
  [key: string]: unknown
}

export const restaurant = menuSchema.table(
  'restaurant',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Genkan-issued organization UUID. No FK — genkan lives in a separate
    // database. Tenancy is enforced at the DAL via the identity slice
    // (`requireRestaurantAccess` calls `listOrganizations` against genkan).
    organizationId: text('organization_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    descriptionI18n: jsonb('description_i18n').$type<LocalizedText>(),
    logoUrl: text('logo_url'),
    bannerUrl: text('banner_url'),
    theme: jsonb('theme').$type<RestaurantTheme>(),
    // i18n config — defaultLanguage names which language the row's plain text
    // columns are written in; supportedLanguages lists every language the
    // public menu offers. Adding a new language = entry in lib/i18n/registry +
    // checkbox saves into supportedLanguages here.
    defaultLanguage: text('default_language').$type<LanguageCode>().notNull().default('en'),
    supportedLanguages: jsonb('supported_languages')
      .$type<LanguageCode[]>()
      .notNull()
      .default(['en']),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('restaurant_org_idx').on(t.organizationId)],
)

export const menu = menuSchema.table(
  'menu',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    restaurantId: text('restaurant_id')
      .notNull()
      .references(() => restaurant.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameI18n: jsonb('name_i18n').$type<LocalizedText>(),
    description: text('description'),
    descriptionI18n: jsonb('description_i18n').$type<LocalizedText>(),
    position: integer('position').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('menu_restaurant_idx').on(t.restaurantId)],
)

export const category = menuSchema.table(
  'category',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    menuId: text('menu_id')
      .notNull()
      .references(() => menu.id, { onDelete: 'cascade' }),
    restaurantId: text('restaurant_id')
      .notNull()
      .references(() => restaurant.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameI18n: jsonb('name_i18n').$type<LocalizedText>(),
    description: text('description'),
    descriptionI18n: jsonb('description_i18n').$type<LocalizedText>(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('category_menu_idx').on(t.menuId),
    index('category_restaurant_idx').on(t.restaurantId),
  ],
)

export const item = menuSchema.table(
  'item',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    categoryId: text('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'cascade' }),
    restaurantId: text('restaurant_id')
      .notNull()
      .references(() => restaurant.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Translation overrides for non-default languages. Default language is
    // always read from `name` / `description`. See lib/i18n/format.ts.
    nameI18n: jsonb('name_i18n').$type<LocalizedText>(),
    description: text('description'),
    descriptionI18n: jsonb('description_i18n').$type<LocalizedText>(),
    priceCents: integer('price_cents').notNull(),
    currency: text('currency').notNull().default('EUR'),
    imageUrl: text('image_url'),
    position: integer('position').notNull().default(0),
    available: boolean('available').notNull().default(true),
    tags: jsonb('tags').$type<string[]>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('item_category_idx').on(t.categoryId),
    index('item_restaurant_idx').on(t.restaurantId),
  ],
)

// ─── Metrics ──────────────────────────────────────────────────────────────────

/**
 * Per-visitor dedup ledger. Composite PK on (visitor, restaurant, hour) lets
 * the track endpoint do an idempotent `INSERT … ON CONFLICT DO NOTHING`: when
 * a row is created, count the view; when it already exists, no-op. Cleared
 * periodically (vacuum/purge older than 24h) — only the current bucket needs
 * to be in the index for the gate to work.
 *
 * `hour_bucket` is `YYYY-MM-DD-HH` (UTC). Plain text so the PK comparison is
 * lex-equality and we don't bind ourselves to a timezone-shifted date type.
 */
export const viewSeen = menuSchema.table(
  'view_seen',
  {
    visitorId: text('visitor_id').notNull(),
    restaurantId: text('restaurant_id')
      .notNull()
      .references(() => restaurant.id, { onDelete: 'cascade' }),
    hourBucket: text('hour_bucket').notNull(),
    seenAt: timestamp('seen_at').defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.visitorId, t.restaurantId, t.hourBucket] }),
    index('view_seen_seen_at_idx').on(t.seenAt),
  ],
)

/**
 * Per-day, per-language page-view counter for the public menu. The composite
 * PK lets us upsert in one round-trip; org id is denormalized so the dashboard
 * roll-ups (today / last 7 days / last 30 days, current month for the meter)
 * stay a single indexed scan instead of joining through restaurant.
 *
 * `day` is `YYYY-MM-DD` text so range queries are plain lex comparisons —
 * keeps the schema portable and timezone-explicit (we always store UTC days).
 * `language` lets the Casa "reading the menu in" card group without a second
 * table.
 */
export const dailyView = menuSchema.table(
  'daily_view',
  {
    // Genkan-issued org UUID. No FK — genkan is a separate database.
    organizationId: text('organization_id').notNull(),
    restaurantId: text('restaurant_id')
      .notNull()
      .references(() => restaurant.id, { onDelete: 'cascade' }),
    day: text('day').notNull(),
    language: text('language').$type<LanguageCode>().notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.restaurantId, t.day, t.language] }),
    index('daily_view_org_day_idx').on(t.organizationId, t.day),
  ],
)

// ─── Billing ──────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'paid' | 'pending' | 'void'

/**
 * One billing line per period, scoped to the organization. We persist the
 * plan code at the time of issuance so a rename or removal of a plan in code
 * never rewrites historical invoices. Stripe (or any PSP) will fill these in
 * later via webhook; for now the table is the single source of truth.
 *
 * `organizationId` is a genkan-issued UUID — no FK, since genkan is a
 * separate database.
 */
export const invoice = menuSchema.table(
  'invoice',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id').notNull(),
    plan: text('plan').$type<PlanCode>().notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('EUR'),
    status: text('status').$type<InvoiceStatus>().notNull().default('paid'),
    issuedAt: timestamp('issued_at').notNull().defaultNow(),
    paidAt: timestamp('paid_at'),
  },
  (t) => [
    index('invoice_org_idx').on(t.organizationId),
    index('invoice_issued_at_idx').on(t.issuedAt),
  ],
)

// ─── Rate limiter ─────────────────────────────────────────────────────────────
// Append-only log of rate-limit attempts. Sliding window is computed on read
// (DELETE-expired → INSERT-now → COUNT, all in one transaction guarded by an
// advisory lock keyed on the rate-limit key). Same shape as the Redis ZSET
// adapter that lived here previously — one row per attempt, periodic pruning
// keeps the table small. Composite index supports both the lookup pattern
// and the cleanup DELETE.

export const rateLimitEvent = menuSchema.table(
  'rate_limit_event',
  {
    key: text('key').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('rate_limit_event_key_time_idx').on(t.key, t.occurredAt)],
)

// Better Auth's own rate-limit store (when `rateLimit.storage: 'database'`).
// Separate from `rate_limit_event` above — Better Auth keeps a single row
// per key with running count + lastRequest timestamp; our app-side limiter
// uses an append-only event log. Both can coexist trivially.
export const rateLimit = menuSchema.table('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))

export const restaurantRelations = relations(restaurant, ({ many }) => ({
  menus: many(menu),
}))

export const menuRelations = relations(menu, ({ one, many }) => ({
  restaurant: one(restaurant, {
    fields: [menu.restaurantId],
    references: [restaurant.id],
  }),
  categories: many(category),
}))

export const categoryRelations = relations(category, ({ one, many }) => ({
  menu: one(menu, { fields: [category.menuId], references: [menu.id] }),
  restaurant: one(restaurant, {
    fields: [category.restaurantId],
    references: [restaurant.id],
  }),
  items: many(item),
}))

export const itemRelations = relations(item, ({ one }) => ({
  category: one(category, {
    fields: [item.categoryId],
    references: [category.id],
  }),
  restaurant: one(restaurant, {
    fields: [item.restaurantId],
    references: [restaurant.id],
  }),
}))
