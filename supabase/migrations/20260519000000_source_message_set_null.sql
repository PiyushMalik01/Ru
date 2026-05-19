-- Change source_message_id FKs from NO ACTION to SET NULL.
--
-- The original constraints rejected any delete on a `messages` row that had
-- referrers in tasks/routine_logs/activity_log/tracker_entries — meaning
-- deleting a CHAT (which cascade-drops its messages) would fail with:
--
--   update or delete on table "messages" violates foreign key constraint
--   "routine_logs_source_message_id_fkey" on table "routine_logs"
--
-- source_message_id is only a provenance pointer ("Ru created this entity
-- in response to that message"). The user's tasks, completed routines,
-- logged activities, and tracker entries should outlive the chat they
-- originated from. SET NULL preserves them; the pointer just goes blank.

alter table tasks
  drop constraint tasks_source_message_id_fkey,
  add constraint tasks_source_message_id_fkey
    foreign key (source_message_id) references messages(id)
    on delete set null;

alter table routine_logs
  drop constraint routine_logs_source_message_id_fkey,
  add constraint routine_logs_source_message_id_fkey
    foreign key (source_message_id) references messages(id)
    on delete set null;

alter table activity_log
  drop constraint activity_log_source_message_id_fkey,
  add constraint activity_log_source_message_id_fkey
    foreign key (source_message_id) references messages(id)
    on delete set null;

alter table tracker_entries
  drop constraint tracker_entries_source_message_id_fkey,
  add constraint tracker_entries_source_message_id_fkey
    foreign key (source_message_id) references messages(id)
    on delete set null;
