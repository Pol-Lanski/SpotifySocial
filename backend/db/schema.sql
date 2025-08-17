-- Database schema for Spotify Comments Extension (server)
-- Run these in your Supabase or PostgreSQL instance

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table to track ownership and map to Privy identity
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    privy_user_id TEXT UNIQUE NOT NULL,
    email TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playlist_id TEXT NOT NULL,
    track_uri TEXT NULL,
    text TEXT NOT NULL CHECK (length(text) > 0 AND length(text) <= 500),
    user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_playlist_id ON comments(playlist_id);
CREATE INDEX IF NOT EXISTS idx_comments_track_uri ON comments(track_uri) WHERE track_uri IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_playlist_track ON comments(playlist_id, track_uri);

-- Supabase RLS (optional for plain Postgres; remove if not applicable)
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON comments FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON comments FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON comments FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


