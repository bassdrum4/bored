-- 20261118130000_unified_feedback.sql copied every row from public.feedback and
-- public.enjoyment_feedback into public.feedback_entries and moved the originals
-- to bored_archive. Those copies have served their purpose, so remove them and
-- leave one feedback table. Guarded for the isolated Together fixture, which
-- never had either table.
drop table if exists bored_archive.feedback;
drop table if exists bored_archive.enjoyment_feedback;
