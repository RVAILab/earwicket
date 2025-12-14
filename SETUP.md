# Earwicket Setup Guide

## Phase 1: Foundation - ✅ COMPLETE

Phase 1 is complete! The following has been implemented:

### ✅ Completed

1. **Next.js Project Setup**
   - TypeScript configuration
   - Tailwind CSS styling
   - App Router structure
   - All dependencies installed

2. **Database Schema**
   - Complete PostgreSQL schema in `lib/db/schema.sql`
   - Tables for: environments, zones, schedules, song_requests, playback_state, credentials, admin_users, rate_limits
   - Database client wrapper in `lib/db/client.ts`

3. **Sonos Integration**
   - OAuth2 flow implementation
   - Sonos API client with token refresh
   - API routes: `/api/sonos/auth`, `/api/sonos/callback`, `/api/sonos/groups`
   - Methods for: groups, playback status, load playlist, load track, play/pause

4. **Spotify Integration**
   - OAuth2 flow implementation
   - Spotify API client with token refresh
   - API routes: `/api/spotify/auth`, `/api/spotify/callback`, `/api/spotify/playlists`
   - Search endpoint: `/api/search`
   - Methods for: user playlists, search tracks, get track details

5. **Admin Authentication**
   - JWT-based authentication
   - Password hashing with bcrypt
   - API routes: `/api/auth/login`, `/api/auth/verify`, `/api/auth/setup`
   - Token generation and verification

6. **TypeScript Types**
   - Complete type definitions in `types/index.ts`
   - Types for all database models
   - Sonos and Spotify API types

## Next: Phase 2 - Scheduling System

To continue with Phase 2, we need to implement:

1. **Environment & Zone Management**
   - API endpoints for CRUD operations
   - Admin UI to configure environments and zones

2. **Schedule Management**
   - API endpoints for schedule CRUD
   - Schedule evaluation logic using Luxon for timezone handling
   - Admin UI for creating schedules with Spotify playlist selection

3. **Cron Job for Schedule Checking**
   - `/api/cron/check-schedules` endpoint
   - Runs every 5 minutes via Vercel Cron
   - Evaluates active schedules and triggers playback

4. **Testing**
   - Test scheduled playlist playback
   - Verify timezone handling

## Current File Structure

```
sonos-server/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   ├── setup/route.ts
│   │   │   └── verify/route.ts
│   │   ├── sonos/
│   │   │   ├── auth/route.ts
│   │   │   ├── callback/route.ts
│   │   │   └── groups/route.ts
│   │   ├── spotify/
│   │   │   ├── auth/route.ts
│   │   │   ├── callback/route.ts
│   │   │   └── playlists/route.ts
│   │   └── search/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── auth/
│   │   └── admin.ts
│   ├── db/
│   │   ├── client.ts
│   │   └── schema.sql
│   ├── sonos/
│   │   └── client.ts
│   └── spotify/
│       └── client.ts
├── types/
│   └── index.ts
├── .env.example
├── .gitignore
├── next.config.js
├── package.json
├── postcss.config.js
├── README.md
├── SETUP.md
├── tailwind.config.js
└── tsconfig.json
```

## Before You Start Development

1. **Set up environment variables**:
   ```bash
   cp .env.example .env.local
   # Fill in all values
   ```

2. **Set up database**:
   - Create Vercel project with Neon PostgreSQL
   - Run schema: `psql $POSTGRES_URL -f lib/db/schema.sql`

3. **Create API credentials**:
   - Sonos Developer: https://developer.sonos.com
   - Spotify Developer: https://developer.spotify.com/dashboard

4. **Initialize admin user**:
   ```bash
   npm run dev
   curl -X POST http://localhost:3000/api/auth/setup \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"your-password"}'
   ```

5. **Authorize APIs**:
   - Visit: `http://localhost:3000/api/sonos/auth`
   - Visit: `http://localhost:3000/api/spotify/auth`

## Testing the Build

```bash
npm run build  # Should complete successfully
npm run dev    # Start development server
```

Visit `http://localhost:3000` to see the landing page.
