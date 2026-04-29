# WithU Supabase Scale Audit

Date: 2026-04-29

## Goal

Prepare the current Supabase schema for a much larger user base by adding indexes that match the app's busiest reads and writes. This is a database-level performance pass only. It does not make the app ready for one million users by itself, but it removes several obvious query bottlenecks.

## Main Risks Found

1. Discovery, feed, chat, reports, push notifications and volunteer screens will become the busiest tables.
2. Many screens already use `limit`, which is good, but those limits only help when the filtered/order columns are indexed.
3. Realtime and push triggers can become expensive if every message immediately performs too much work.
4. Feed images now require moderation, so admins need fast lookup of `image_status = 'pending'`.
5. Admin dashboards must avoid full-table scans as reports and users grow.

## Added Scale Pack

Run:

`supabase/migrations/20260429100000_scale_indexes_and_audit.sql`

The pack adds idempotent indexes for:

- `profiles`: discovery, age filters, city/country filters, activity arrays.
- `matches`: sent/received match lists and pending requests.
- `messages`: conversation loading, unread messages, sender history.
- `posts`: visible feed, type filters, user posts, pending image review.
- `post_likes`, `post_comments`, `post_participants`: user and post lookups.
- `thoughts` and related tables: active thoughts, comments, reactions, talk requests.
- `now_status`: live activity within time window.
- `reports` and `blocked_users`: moderation and safety tools.
- `push_tokens` and `notifications`: notification delivery and inbox reads.
- volunteer tables: applications, profiles, availability and support/contact requests.

## How To Check After Running SQL

In Supabase SQL Editor:

```sql
select *
from public.get_scale_index_audit();
```

Expected result:

- Important existing tables should show `ok`.
- Tables not created yet may show `missing_table`; that is fine if that feature is not active.

## Important Next Backend Steps

1. Move heavy matching/search into RPC functions so the client does not compose large filters.
2. Add cursor pagination everywhere, not offset pagination.
3. Keep realtime scoped to the current user's conversations and notifications only.
4. Move push notification work to Edge Functions or a queue when traffic grows.
5. Add image thumbnail generation so the app does not load original photos in feeds.
6. Add automated retention cleanup for old resolved reports, old notifications and expired presence rows.
7. For one million users, plan for Supabase Pro/Team and database monitoring before launch campaigns.
