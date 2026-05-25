# GhostShare: Production-Grade Ephemeral File Sharing Platform

GhostShare is an enterprise-grade, portfolio-quality Ephemeral (Self-Destructing) File Sharing Platform built using Next.js 15, Supabase, and PostgreSQL. It solves the scalability and security issues of traditional file upload architectures by implementing a client-side **Direct-to-Storage Split-Chunk Pipeline** using temporary signed URLs, ensuring that the backend application server never proxies raw file bytes.

## Key Architectures

### Direct-to-Storage Pipeline
Unlike typical architectures where uploads flow: `Browser -> Web Server -> Cloud Storage` (creating major memory and bandwidth bottlenecks on the web server), GhostShare works as follows:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Browser
    participant API as Next.js API
    participant DB as Postgres (Supabase)
    participant Storage as Supabase Storage

    Client->>API: 1. Initiate upload (filename, size, chunks, expiration, password)
    API->>API: 2. Validate parameters & hash password (bcrypt)
    API->>DB: 3. Create 'pending' metadata entry
    API->>Storage: 4. Request signed upload URLs for chunks (e.g. upload/sign/path)
    Storage-->>API: 5. Return signed upload URLs
    API-->>Client: 6. Return publicId, chunks URLs, and deleteToken
    
    loop For each chunk in parallel
        Client->>Storage: 7. Upload chunk directly (PUT binary body)
    end

    Client->>API: 8. Complete upload (publicId)
    API->>Storage: 9. List and verify chunk count & sizes match
    API->>DB: 10. Update status to 'completed'
    API-->>Client: 11. Return share link success
```

### Self-Destruct & Reassembly Pipeline
Downloads are securely segmented. For password-protected links, a rate-limited gateway validates queries before generating temporary signed download URLs:

```mermaid
sequenceDiagram
    autonumber
    actor Recipient as Browser
    participant API as Next.js API
    participant DB as Postgres (Supabase)
    participant Storage as Supabase Storage

    Recipient->>API: 1. Fetch metadata (publicId)
    API->>DB: 2. Verify file is active & unexpired
    DB-->>API: 3. Return status (requires password)
    API-->>Recipient: 4. Ask password prompt
    Recipient->>API: 5. Submit password
    API->>DB: 6. Check brute-force limits & verify hash
    API-->>Recipient: 7. Return verified JWT-equivalent HMAC token
    Recipient->>API: 8. Request download links (publicId, token)
    API->>DB: 9. Increment download count & check limit
    API->>Storage: 10. Request short-lived signed URLs for all chunks
    Storage-->>API: 11. Return URLs
    API-->>Recipient: 12. Send chunk URLs
    
    loop For each chunk
        Recipient->>Storage: 13. Fetch chunk ArrayBuffer
    end
    
    Recipient->>Recipient: 14. Concatenate chunks to Blob
    Recipient->>Recipient: 15. Trigger browser file save dialog
```

---

## Security Architecture

1. **Private Buckets & Signed URLs**: Storage is strictly private. Files are inaccessible without short-lived signatures (valid 60s for uploads, 15m for downloads).
2. **Stateless HMAC Tokens**: Passwords unlock a short-lived, tamper-proof Base64 session token signed with SHA-256 HMAC, avoiding database roundtrips during chunk downloads.
3. **Database Brute-Force Rate Limiter**: A dedicated `failed_attempts` table records incorrect passwords by SHA-256 IP hashes, locking out clients for 15 minutes after 5 failures.
4. **MIME & Size Restrictions**: Enforced at the initiate API layer before any storage tokens are generated.
5. **Event-driven / Cron Cleanup**: An administrative endpoint `/api/internal/cleanup` protected by a `CRON_SECRET` purges expired database records and their associated file chunks from Supabase Storage.

---

## Tech Stack
* **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Framer Motion, Zustand (State), Axios (Network)
* **Backend**: Next.js Route Handlers, Supabase JS SDK (Server Admin)
* **Database**: PostgreSQL (Row Level Security enabled on all tables)
* **Testing**: Vitest unit test suite

---

## Repository Structure

```
├── .github/workflows/    # CI/CD pipelines
├── supabase/
│   └── schema.sql        # Database migrations, bucket creation, & RLS policies
├── src/
│   ├── app/
│   │   ├── api/          # Stateless Route Handlers (initiate, complete, verify, download, cleanup)
│   │   ├── share/[id]/   # Dynamic Download & Preview page
│   │   ├── layout.tsx    # Layout and metadata
│   │   └── page.tsx      # Landing page & config form
│   ├── config/
│   │   └── env.ts        # Runtime environment validator (Zod)
│   ├── lib/
│   │   ├── supabaseClient.ts # Client-side anon client
│   │   └── supabaseAdmin.ts  # Administrative server client
│   ├── providers/
│   │   └── QueryProvider.tsx # TanStack Query Provider
│   ├── store/
│   │   └── uploadStore.ts    # Zustand upload queue store
│   └── utils/
│       ├── crypto.ts     # IP & Password hashing
│       ├── token.ts      # HMAC verification
│       ├── uploadManager.ts  # Split-chunk concurrent upload client
│       └── downloadManager.ts # Reassembler client
├── Dockerfile            # Multi-stage production container configuration
├── docker-compose.yml    # Local test compose runner
└── vitest.config.ts      # Test configuration
```

---

## Getting Started

### 1. Database Setup
Execute the SQL statements in [supabase/schema.sql](file:///C:/Users/Admin/.gemini/antigravity-ide/scratch/ephemeral-share/supabase/schema.sql) in your Supabase SQL Editor. This initializes the tables, indices, RLS policies, and registers the `ephemeral-files` private storage bucket.

### 2. Environment Variables Configuration
Copy `.env.example` to `.env.local` (or `.env` in production):
```bash
cp .env.example .env.local
```
Fill in your Supabase Project credentials:
* `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL (e.g. `https://xxx.supabase.co`).
* `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public anon key.
* `SUPABASE_SERVICE_ROLE_KEY`: Service role secret key (keep private!).
* `CRON_SECRET`: Random secret string to authenticate internal cleanup.

### 3. Installation
Install the project dependencies:
```bash
npm install
```

### 4. Running Locally
Start the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to upload your first file.

### 5. Running Tests
Run the Vitest unit tests:
```bash
npm run test
```

### 6. Run via Docker Compose
Build and start the container locally:
```bash
docker-compose up --build
```
The application will be accessible at [http://localhost:3000](http://localhost:3000).

---

## Cleanup Chronology Configuration

To automate files cleanup upon expiration, trigger the `/api/internal/cleanup` endpoint periodically.

### Option A: Supabase pg_cron + pg_net (Recommended)
Execute inside Supabase SQL Editor to invoke cleanup every 10 minutes:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'purge-expired-files',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    'https://your-domain.vercel.app/api/internal/cleanup',
    '{}',
    '{}',
    '{"Authorization": "Bearer your-cron-secret-token"}'
  );
  $$
);
```

### Option B: GitHub Actions / Vercel Cron
Add a scheduled workflow to ping `/api/internal/cleanup` sending the `Authorization: Bearer <CRON_SECRET>` header.
"# filehsare" 
"# filehsare" 
