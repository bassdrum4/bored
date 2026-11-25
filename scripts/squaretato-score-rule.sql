-- Squaretato uses the shared Bored board; no new tables or permissions.
insert into public.score_rules (game,label,better,min_value,max_value)
values ('squaretato','Waves cleared, then Danger level, then kills (survival score)','high',1,50059999)
on conflict (game) do update set label=excluded.label,better=excluded.better,min_value=excluded.min_value,max_value=excluded.max_value;
