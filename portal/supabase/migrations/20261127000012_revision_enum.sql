-- 0012  New revision status (own file: enum values must be committed before use).
alter type public.revision_status add value if not exists 'changes_requested';
