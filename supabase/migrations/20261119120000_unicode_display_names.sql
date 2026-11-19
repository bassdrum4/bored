-- Display names were ASCII-only. The hub's cleanHandle() stripped anything else,
-- so a commander called "✈" became an empty string, was padded to three
-- characters, and showed up on the board as "___".
--
-- Allow letters from any script and emoji, keep the length and safety bounds,
-- keep short plain-ASCII names closed off, and repair the handle this produced.
-- Apply by hand in the SQL editor, like the other migrations here.

create or replace function public.set_handle(p_handle text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  clean text := coalesce(p_handle, '');
begin
  if uid is null then
    raise exception 'sign in to choose a name';
  end if;
  if clean ~ '[[:cntrl:][:space:]]' or clean ~ '["''<>/]' then
    raise exception 'names use 1 to 16 characters, no spaces';
  end if;
  if char_length(clean) not between 1 and 16 then
    raise exception 'names use 1 to 16 characters, no spaces';
  end if;
  -- A one- or two-character ASCII name is still a squatting handle; a single
  -- emoji or a non-Latin name is legitimate and is what this migration is for.
  if char_length(clean) < 3 and clean ~ '^[A-Za-z0-9_-]+$' then
    raise exception 'names use 1 to 16 characters, no spaces';
  end if;
  insert into public.profiles (id, handle)
  values (uid, clean)
  on conflict (id) do update set handle = excluded.handle;
  return clean;
exception
  when unique_violation then raise exception 'that name is taken';
end;
$function$;

-- The table itself carried the same ASCII-only rule, so it has to move with the
-- function: 1–16 characters, no spaces or markup, and short plain-ASCII names
-- still need three characters.
alter table public.profiles drop constraint if exists profiles_handle_check;
alter table public.profiles add constraint profiles_handle_check
  check (
    handle ~ '^[^[:space:][:cntrl:]"''<>/]{1,16}$'
    and (handle ~ '[^A-Za-z0-9_-]' or char_length(handle) >= 3)
  );

-- The one profile this bug mangled: a player whose name is the plane symbol.
update public.profiles
   set handle = '✈'
 where id = '8982279e-a29a-4101-a4ac-03669f9c624b'
   and handle = '___';
