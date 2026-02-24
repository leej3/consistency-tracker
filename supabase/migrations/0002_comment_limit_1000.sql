alter table if exists public.consistency_entries
  drop constraint if exists consistency_entries_comment_length;

alter table if exists public.consistency_entries
  add constraint consistency_entries_comment_length
  check (char_length(coalesce(comment, '')) <= 1000);
