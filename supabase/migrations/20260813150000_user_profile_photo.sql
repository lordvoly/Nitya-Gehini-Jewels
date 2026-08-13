-- Profile photo for the self-service user profile panel. Nullable — the
-- avatar falls back to initials (name-derived) until a photo is uploaded.
alter table users add column photo_url text;
