-- Match the client author time (round(17529 * 0.85) = 14900 ms).
update public.trackbound_campaign_tracks
set author_ms = 14900
where id = 'overpass';
