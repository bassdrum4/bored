-- Seven prompts drawn at random from the archive of past dives, for Krillion's
-- unlimited mode. The answers travel with them because unlimited is scored in
-- the browser; only the service role may call this, and the game reaches it
-- through the krillion edge function. Today's book is deliberately excluded, so
-- the live daily dive's answer key never leaves the server.
create or replace function public.krillion_random_prompts(p_count integer default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(entry), '[]'::jsonb)
  from (
    select prompt as entry
    from public.krillion_books book
    cross join lateral jsonb_array_elements(book.book -> 'prompts') prompt
    where book.date < to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD')
    order by random()
    limit least(greatest(coalesce(p_count, 7), 1), 7)
  ) picked;
$$;

revoke all on function public.krillion_random_prompts(integer) from public;
revoke all on function public.krillion_random_prompts(integer) from anon;
revoke all on function public.krillion_random_prompts(integer) from authenticated;
grant execute on function public.krillion_random_prompts(integer) to service_role;

comment on function public.krillion_random_prompts(integer) is
  'Random archived Krillion prompts for unlimited dives; service role only.';
