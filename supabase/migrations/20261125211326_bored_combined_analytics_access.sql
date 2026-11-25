-- One account-scoped read instead of two permission queries.
create or replace function public.my_analytics_access()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'admin', exists(select 1 from public.analytics_admins a where a.user_id = (select auth.uid())),
    'games', coalesce((select jsonb_agg(g.game order by g.game) from public.game_analytics_readers g where g.user_id = (select auth.uid())), '[]'::jsonb)
  );
$$;
revoke all on function public.my_analytics_access() from public, anon;
grant execute on function public.my_analytics_access() to authenticated;

