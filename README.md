# Earwicket - Sonos Control App

Schedule Spotify playlists across your Sonos system and allow visitors to request songs.

## Features

- **Scheduled Playlists**: Schedule Spotify playlists to play at specific times and days across different zones
- **Visitor Song Requests**: Public interface for visitors to search and request songs
- **Sequential Queue**: Visitor songs queue up and play in order before resuming scheduled content
- **Multi-Zone Support**: Control multiple Sonos zones across different environments
- **OAuth Integration**: Secure integration with both Sonos and Spotify APIs

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ installed
- Vercel account (for deployment and database)
- Sonos Developer account
- Spotify Developer account

### 2. Database Setup

1. Create a new project on [Vercel](https://vercel.com)
2. Add Neon PostgreSQL integration
3. Copy your PostgreSQL connection string
4. Run the schema to initialize your database:

```bash
# You can use psql or any PostgreSQL client
psql $POSTGRES_URL -f lib/db/schema.sql
```

### 3. Sonos API Setup

1. Go to [Sonos Developer Portal](https://developer.sonos.com)
2. Create a new Control Integration
3. Note your Client ID and Client Secret
4. Add redirect URI: `http://localhost:3000/api/sonos/callback` (for local) and your production URL

### 4. Spotify API Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Note your Client ID and Client Secret
4. Add redirect URI: `http://localhost:3000/api/spotify/callback` (for local) and your production URL

### 5. Environment Configuration

1. Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

2. Fill in all the values in `.env.local`:

```env
# Database
POSTGRES_URL="postgres://..."

# Sonos API
SONOS_CLIENT_ID="your-sonos-client-id"
SONOS_CLIENT_SECRET="your-sonos-client-secret"
SONOS_REDIRECT_URI="http://localhost:3000/api/sonos/callback"

# Spotify API
SPOTIFY_CLIENT_ID="your-spotify-client-id"
SPOTIFY_CLIENT_SECRET="your-spotify-client-secret"
SPOTIFY_REDIRECT_URI="http://localhost:3000/api/spotify/callback"

# Admin Auth
ADMIN_JWT_SECRET="generate-a-secure-random-string-here"
ADMIN_PASSWORD_SALT_ROUNDS="10"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 6. Install Dependencies and Run

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`

### 7. Initial Setup

1. **Create Admin User**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/setup \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"your-secure-password"}'
   ```

2. **Authorize Sonos**: Visit `http://localhost:3000/api/sonos/auth`

3. **Authorize Spotify**: Visit `http://localhost:3000/api/spotify/auth`

## Development

### Project Structure

```
├── app/                    # Next.js App Router
│   ├── admin/             # Admin interface
│   ├── visitor/           # Visitor interface
│   └── api/               # API routes
├── lib/                   # Core libraries
│   ├── sonos/            # Sonos API client
│   ├── spotify/          # Spotify API client
│   ├── db/               # Database client
│   ├── scheduler/        # Schedule evaluation
│   ├── queue/            # Queue processor
│   └── auth/             # Authentication
├── components/           # React components
└── types/               # TypeScript types
```

### Next Steps

Phase 1 (Foundation) is complete! ✅

**Phase 2: Scheduling System**
- Build schedule CRUD API endpoints
- Implement schedule evaluation logic
- Create Vercel Cron job for schedule checking
- Build admin UI for schedule management
- Test scheduled playlist playback

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Add all environment variables
4. Configure custom domain (update redirect URIs in Sonos/Spotify apps)
5. Deploy!

### Vercel Cron Jobs

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/check-schedules",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/process-queue",
      "schedule": "* * * * *"
    }
  ]
}
```

## License

ISC
