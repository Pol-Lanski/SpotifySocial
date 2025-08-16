-- Database schema for Spotify Comments Extension
-- This should be run in your Supabase project

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playlist_id TEXT NOT NULL,
    track_uri TEXT NULL,
    text TEXT NOT NULL CHECK (length(text) > 0 AND length(text) <= 500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_comments_playlist_id ON comments(playlist_id);
CREATE INDEX IF NOT EXISTS idx_comments_track_uri ON comments(track_uri) WHERE track_uri IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_playlist_track ON comments(playlist_id, track_uri);

-- Row Level Security (RLS) policies
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read comments (since we have no auth in MVP)
CREATE POLICY "Allow public read access" ON comments
    FOR SELECT USING (true);

-- Allow anyone to insert comments (since we have no auth in MVP)
CREATE POLICY "Allow public insert access" ON comments
    FOR INSERT WITH CHECK (true);

-- Optional: Allow updates (for future features like edit/delete)
CREATE POLICY "Allow public update access" ON comments
    FOR UPDATE USING (true);

-- Optional: Allow deletes (for future moderation features)
CREATE POLICY "Allow public delete access" ON comments
    FOR DELETE USING (true);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- View for comment statistics (optional, for analytics)
CREATE OR REPLACE VIEW comment_stats AS
SELECT 
    playlist_id,
    track_uri,
    COUNT(*) as comment_count,
    MAX(created_at) as latest_comment,
    MIN(created_at) as first_comment
FROM comments
GROUP BY playlist_id, track_uri;

-- Function to get comments with pagination (for future scalability)
CREATE OR REPLACE FUNCTION get_comments(
    p_playlist_id TEXT,
    p_track_uri TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
    id UUID,
    playlist_id TEXT,
    track_uri TEXT,
    text TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.playlist_id,
        c.track_uri,
        c.text,
        c.created_at
    FROM comments c
    WHERE 
        c.playlist_id = p_playlist_id
        AND (p_track_uri IS NULL OR c.track_uri = p_track_uri)
    ORDER BY c.created_at ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get comment counts for multiple tracks (bulk operation)
CREATE OR REPLACE FUNCTION get_track_comment_counts(
    p_playlist_id TEXT,
    p_track_uris TEXT[]
)
RETURNS TABLE(
    track_uri TEXT,
    comment_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.track_uri,
        COUNT(*) as comment_count
    FROM comments c
    WHERE 
        c.playlist_id = p_playlist_id
        AND c.track_uri = ANY(p_track_uris)
    GROUP BY c.track_uri;
END;
$$ LANGUAGE plpgsql;

-- Sample data for testing (optional - remove in production)
-- INSERT INTO comments (playlist_id, text) VALUES 
-- ('test_playlist_123', 'This is a great playlist!'),
-- ('test_playlist_123', 'Love the song selection 🎵');

-- INSERT INTO comments (playlist_id, track_uri, text) VALUES 
-- ('test_playlist_123', 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh', 'This song is amazing!'),
-- ('test_playlist_123', 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh', 'One of my favorites');

-- Grant permissions (adjust as needed based on your Supabase setup)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE comments TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
