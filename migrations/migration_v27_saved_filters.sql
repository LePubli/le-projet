-- Migration v2.7: saved_filters table for user-saved list filters

CREATE TABLE IF NOT EXISTS saved_filters (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    entity VARCHAR(50) NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_saved_filters_user_entity ON saved_filters(user_id, entity);
