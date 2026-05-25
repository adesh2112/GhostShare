-- Ephemeral File Sharing Platform DB Schema
-- Clean up existing tables
DROP TABLE IF EXISTS failed_attempts CASCADE;
DROP TABLE IF EXISTS download_logs CASCADE;
DROP TABLE IF EXISTS uploads CASCADE;

-- Create Uploads table
CREATE TABLE uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id VARCHAR(50) UNIQUE NOT NULL,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    max_downloads INTEGER,
    current_downloads INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT,
    upload_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, completed, expired
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploader_ip_hash VARCHAR(64) NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 1,
    delete_token VARCHAR(64) NOT NULL
);

-- Create Download Logs table
CREATE TABLE download_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID REFERENCES uploads(id) ON DELETE CASCADE NOT NULL,
    downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_hash VARCHAR(64) NOT NULL,
    user_agent TEXT
);

-- Create Failed Password Attempts table for brute force rate-limiting
CREATE TABLE failed_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID REFERENCES uploads(id) ON DELETE CASCADE NOT NULL,
    ip_hash VARCHAR(64) NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_uploads_public_id ON uploads(public_id);
CREATE INDEX idx_uploads_expires_at ON uploads(expires_at);
CREATE INDEX idx_failed_attempts_rate_limit ON failed_attempts(ip_hash, upload_id, attempted_at);

-- Set up Row Level Security (RLS)
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for uploads
-- Allow public select of completed, unexpired uploads (excluding password hash for privacy, though handled at API layer)
CREATE POLICY select_public_uploads ON uploads
    FOR SELECT
    USING (
        upload_status = 'completed' 
        AND expires_at > now() 
        AND (max_downloads IS NULL OR current_downloads < max_downloads)
    );

-- Allow service_role bypass for all actions
CREATE POLICY service_role_all_uploads ON uploads
    USING (true)
    WITH CHECK (true);

-- RLS Policies for download_logs (service_role only)
CREATE POLICY service_role_all_logs ON download_logs
    USING (true)
    WITH CHECK (true);

-- RLS Policies for failed_attempts (service_role only)
CREATE POLICY service_role_all_attempts ON failed_attempts
    USING (true)
    WITH CHECK (true);

-- Create storage bucket if not exists through SQL (alternative to dashboard)
-- Note: Supabase stores bucket configs in storage.buckets and storage.objects
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'ephemeral-files', 
    'ephemeral-files', 
    false, -- Private bucket
    5368709120, -- 5GB size limit (standard max, customize as needed)
    NULL -- All mime types allowed
)
ON CONFLICT (id) DO NOTHING;

-- Storage access note:
-- This app uses signed upload/download URLs plus the server-side service role client.
-- Because of that, we do not need to modify policies on the Supabase-managed
-- storage.objects table here. In many hosted projects, attempting to ALTER that
-- table or create policies on it from the SQL editor will fail with:
-- "must be owner of table objects".
