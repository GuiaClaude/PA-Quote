-- ============================================================================
-- 0018  Web push (Phase 7)
-- ============================================================================
-- Every in-app notification can also go to the person's installed phones.
-- The server marks a notification as pushed (pushed_at) before sending, so it
-- is never sent twice even if two dispatchers run at the same time.
-- ============================================================================
alter table public.notifications add column if not exists pushed_at timestamptz;
create index if not exists notifications_push_pending_idx on public.notifications (created_at) where pushed_at is null;

-- Old, unsent notices are never pushed later (a push about yesterday is noise).
-- Existing rows count as handled.
update public.notifications set pushed_at = created_at where pushed_at is null;

alter table public.push_subscriptions add column if not exists last_used_at timestamptz;
create index if not exists push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

-- A phone that was used by someone else (shared device) moves to whoever turns
-- notifications on now, so the previous person stops getting its pushes.
create or replace function public.claim_push_endpoint(p_endpoint text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_active_user() then raise exception 'Not signed in.' using errcode = '42501'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and profile_id <> auth.uid();
end $$;
revoke all on function public.claim_push_endpoint(text) from public, anon;
grant execute on function public.claim_push_endpoint(text) to authenticated;
