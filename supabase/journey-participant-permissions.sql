-- Adds journey-wide default permissions for invited participants.
alter table journeys
  add column if not exists participant_permissions jsonb
  default '{"editTimeline":true,"addMoments":true,"editChecklist":false,"checkChecklistItems":true,"inviteParticipants":false}'::jsonb;
