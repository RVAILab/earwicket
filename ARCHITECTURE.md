# Earwicket Architecture Documentation

## Overview

Earwicket is a Next.js application that provides scheduled playlist playback and visitor song request functionality across multiple Sonos systems. It integrates with both Sonos Control API and Spotify Web API to enable automatic music scheduling and interactive song requests.

## System Architecture

### Technology Stack

- **Framework**: Next.js 14+ (App Router)
- **Runtime**: Node.js 18+
- **Database**: PostgreSQL (Neon via Vercel)
- **Deployment**: Vercel with Cron Jobs
- **Authentication**:
  - Sonos OAuth2 (Control API)
  - Spotify OAuth2 (Web API)
  - JWT for admin users
- **Key Libraries**:
  - `@vercel/postgres` - Database client
  - `spotify-web-api-node` - Spotify API wrapper
  - `luxon` - Timezone handling
  - `zod` - Schema validation (installed but not fully utilized yet)
  - `bcryptjs` - Password hashing
  - `jsonwebtoken` - JWT tokens

### Database Schema

All tables use `earwicket_` prefix to avoid conflicts in shared databases.

**Core Tables:**

1. **earwicket_environments** - Represents Sonos households
   - Maps 1:1 to Sonos households
   - Contains timezone for schedule evaluation
   - `household_id` links to Sonos API household

2. **earwicket_zones** - Sonos groups (speakers/rooms)
   - Maps to Sonos group IDs
   - Belongs to an environment
   - `sonos_group_id` is the actual Sonos API group identifier

3. **earwicket_schedules** - Scheduled playlist playback
   - Links to a zone
   - Contains Spotify playlist URI
   - Days of week (0-6, Sunday=0)
   - Start/end times (TIME type, no date)
   - Enabled/disabled flag

4. **earwicket_song_requests** - Visitor song queue
   - Links to a zone
   - Contains Spotify track URI and metadata
   - Status: pending → playing → completed/failed
   - Optional `requested_by` name

5. **earwicket_playback_state** - Current activity per zone
   - One row per zone (primary key on zone_id)
   - `current_activity`: scheduled | visitor_request | idle
   - Tracks interrupted schedule for resume logic
   - Stores interrupted track position (not fully implemented)

6. **earwicket_sonos_credentials** - OAuth tokens (singleton)
   - Single row with Sonos access/refresh tokens
   - Auto-refreshes when expired
   - Stores household_id (though we support multiple households via environments)

7. **earwicket_spotify_credentials** - OAuth tokens (singleton)
   - Single row with Spotify access/refresh tokens
   - Auto-refreshes when expired
   - Used for playlist browsing and search

8. **earwicket_admin_users** - Admin authentication
   - Username/password hash
   - Used for admin dashboard access (basic implementation)

9. **earwicket_rate_limits** - IP-based rate limiting
   - 5 requests per 5 minutes per IP
   - For visitor song requests

## Core Workflows

### 1. Schedule Playback Flow

**Trigger**: Vercel Cron runs every 30 minutes (`:00` and `:30`)

**Process** (`/api/cron/check-schedules`):

1. Fetch all zones from database
2. For each zone:
   - Evaluate which schedule should be active using timezone-aware logic
   - Check if visitor requests are pending/playing → Skip if yes
   - Check actual Sonos playback state → Don't interrupt if playing
   - Only start schedule if zone is truly idle
3. If schedule should start:
   - Call Sonos API: `POST /groups/{groupId}/playback/content`
   - Payload: `{ type: 'PLAYLIST', id: { objectId, serviceId: '9' }, playModes }`
   - Update `playback_state` to mark as 'scheduled'

**Schedule Evaluation** (`lib/scheduler/index.ts`):
- Uses Luxon to get current time in zone's timezone
- Checks day of week matches
- Checks time is between start_time and end_time
- Returns matching schedule or null

**Important Notes:**
- Schedule checker is conservative - will NOT interrupt ongoing playback
- Uses timezone-aware comparisons (critical for multi-environment setups)
- Only updates database state, doesn't stop playback unless actively starting a schedule

### 2. Visitor Song Request Flow

**Request Process:**

1. Visitor searches Spotify (`/api/search`)
2. Visitor selects track and submits request (`POST /api/requests`)
3. Rate limiting check (5 per 5 minutes per IP)
4. Request stored as 'pending' in database

**Queue Processing** (`/api/cron/process-queue`):

**Trigger**: Vercel Cron runs every 1 minute

**Process**:

1. For each zone:
   - Get pending requests (ordered by created_at)
   - Get currently playing request
   - Check actual Sonos playback status

2. **Case A: Start first visitor request**
   - If pending request exists AND no playing request
   - If currently playing scheduled content → Save interrupted state
   - Pause current playback (500ms delay)
   - Load track: `POST /groups/{groupId}/playback/content` with `{ type: 'TRACK', id: { objectId, serviceId: '9' }}`
   - Call play endpoint explicitly (500ms after load)
   - Mark request as 'playing'

3. **Case B: Load next visitor request**
   - If playing request finished (Sonos not playing)
   - Mark completed request as 'completed'
   - Check for next pending request
   - If exists → Load and play it
   - If none → Call resume logic

4. **Resume Logic**
   - Check if interrupted schedule still active (time/day match)
   - If yes → Reload schedule playlist
   - If no → Mark zone as 'idle'

**Important Implementation Details:**
- Sequential queue: All visitor songs play before resuming schedule
- Pause-before-load prevents Sonos "Failed to enqueue" errors
- Explicit play() call required (playbackAction doesn't reliably work)
- 500ms delays allow Sonos state to settle

### 3. Now Playing Display

**Endpoint**: `/api/now-playing?zone_id={id}`

**Data Sources:**

1. **Sonos playbackMetadata API** - Current track info
   - Returns: container, currentItem, nextItem
   - **Issue**: Often returns incomplete track data (missing name/artist)

2. **Spotify enrichment** (workaround for Sonos limitation)
   - Extract track ID from `objectId: "spotify:track:{id}"`
   - Fetch full track details from Spotify API
   - Merge: name, artist, album into metadata
   - **This is critical** - without it, "Unknown Track" displays

3. **Database queue** - Visitor requests (pending only)
   - Shows what will play after current track
   - Excludes currently playing request

**UI Refresh**: Every 3 seconds (polling, not webhooks yet)

## API Endpoints

### Public Endpoints

- `GET /api/zones/public` - List zones for visitor UI
- `GET /api/search?q={query}` - Search Spotify tracks
- `POST /api/requests` - Submit song request (rate limited)
- `GET /api/now-playing?zone_id={id}` - Current playback + queue

### Admin Endpoints

**Environments:**
- `GET /api/environments` - List all environments
- `POST /api/environments` - Create (requires household_id)
- `PATCH /api/environments/{id}` - Update
- `DELETE /api/environments/{id}` - Delete (cascades to zones/schedules)

**Zones:**
- `GET /api/zones` - List all zones
- `POST /api/zones` - Create (maps Sonos group to environment)
- `PATCH /api/zones/{id}` - Update
- `DELETE /api/zones/{id}` - Delete (cascades to schedules)

**Schedules:**
- `GET /api/schedules` - List all schedules
- `POST /api/schedules` - Create schedule
- `PATCH /api/schedules/{id}` - Update schedule
- `DELETE /api/schedules/{id}` - Delete schedule

**Requests:**
- `GET /api/requests?zone_id={id}` - Get queue for zone
- `GET /api/requests/all` - All requests (admin view)
- `DELETE /api/requests/{id}` - Remove pending request

**Playback Control:**
- `POST /api/playback/play` - Play (requires group_id)
- `POST /api/playback/pause` - Pause (requires group_id)
- `POST /api/playback/skip` - Skip to next track (requires group_id)

### Sonos Integration

**OAuth:**
- `GET /api/sonos/auth` - Initiate OAuth flow
- `GET /api/sonos/callback` - OAuth callback handler

**API:**
- `GET /api/sonos/households` - List all Sonos households
- `POST /api/sonos/households` - Switch active household
- `GET /api/sonos/groups` - List groups (uses stored household)
- `GET /api/sonos/groups/{householdId}` - List groups for specific household
- `POST /api/sonos/webhook` - Receive Sonos events (not fully implemented)

### Spotify Integration

**OAuth:**
- `GET /api/spotify/auth` - Initiate OAuth flow
- `GET /api/spotify/callback` - OAuth callback handler

**API:**
- `GET /api/spotify/playlists` - User's Spotify playlists
- `GET /api/search?q={query}` - Search tracks

### Cron Jobs

- `POST /api/cron/check-schedules` - Every 30 minutes (`:00` and `:30`)
- `POST /api/cron/process-queue` - Every 1 minute

### Testing/Debug Endpoints

- `GET /api/test/play-playlist` - Test playlist loading
- `GET /api/test/play-track` - Test track loading
- `GET /api/test/play` - Test play command
- `GET /api/test/pause` - Test pause command
- `GET /api/test/list-groups` - List all groups with status
- `GET /api/test/metadata` - Get playback metadata
- `GET /api/playback-status` - Get Sonos playback status
- `POST /api/test/reset-queue` - Clear stuck queue states
- `GET /api/subscriptions/subscribe-all` - Subscribe to Sonos webhooks

## Critical Implementation Details

### Sonos API Quirks

**Service ID Confusion:**
- **Correct**: Spotify service ID is `"9"`
- **Incorrect**: Documentation sometimes shows `"12"` or `"3"`
- Confirmed by inspecting actual playback metadata
- **Both playlist and track loading must use serviceId: "9"**

**Credential Types:**
- Sonos provides 3 credentials: Client ID, Key, Secret
- **Authorization URL**: Uses `SONOS_API_KEY` (the "Key" field)
- **Token Exchange**: Uses `SONOS_API_KEY:SONOS_CLIENT_SECRET` for Basic Auth
- **Client ID field**: Not used for OAuth (confusing naming)

**Content Loading:**
- Endpoint: `POST /groups/{groupId}/playback/content`
- **playbackAction parameter doesn't reliably work** - must call `/playback/play` separately
- Requires pause-before-load to avoid "Failed to enqueue" errors
- 500ms delays needed between operations for state to settle

**Metadata Limitation:**
- Sonos playbackMetadata often returns incomplete track info
- Only imageUrl and track ID are reliable
- **Must enrich from Spotify API** to get name/artist/album
- This is a known limitation, not a bug in our code

### Multi-Household Support

**Current Implementation:**
- OAuth tokens stored globally (singleton tables)
- Environments map to Sonos households via `household_id`
- Groups fetched per household via `/api/sonos/groups/{householdId}`
- Works but has architectural tension (global tokens vs multi-household)

**Design Decision:**
- User treats "Environment = Household"
- Each environment represents a physical location with its own Sonos system
- Zones are the individual speaker groups within that environment

### Timezone Handling

- All schedule times stored as PostgreSQL TIME (no date)
- Evaluation happens in environment's timezone using Luxon
- `DateTime.now().setZone(timezone)` for accurate comparisons
- Day of week: Luxon uses 1-7 (Mon-Sun), converted to 0-6 (Sun-Sat) for storage

### Rate Limiting

- IP-based: 5 requests per 5 minutes
- Uses `earwicket_rate_limits` table
- Window slides (not fixed intervals)
- Gracefully allows requests on error to avoid blocking legitimate users

## Known Issues & Technical Debt

### High Priority

1. **Webhook Implementation Incomplete**
   - Webhook endpoint exists (`/api/sonos/webhook`)
   - Signature verification implemented
   - Subscription logic exists (`/api/subscriptions/subscribe-all`)
   - **NOT INTEGRATED**: Events received but not used to update UI
   - **TODO**: Use webhooks instead of polling for real-time updates
   - Currently polling every 3 seconds (inefficient)

2. **Metadata Enrichment Overhead**
   - Every Now Playing fetch calls Spotify API
   - Should cache enriched metadata
   - **TODO**: Cache track details by Spotify ID (15-30 min TTL)

3. **No Authentication on Admin Features**
   - Admin controls visible to all users
   - JWT auth exists but not enforced on routes
   - **TODO**: Add middleware to protect `/admin/*` and admin API endpoints
   - **TODO**: Add auth check for Skip/Pause/Delete buttons on home page

4. **Position Tracking Not Implemented**
   - Database has `interrupted_position_ms` field
   - Not populated when interrupting schedules
   - Schedules always resume from beginning, not mid-track
   - **TODO**: Store and restore playback position

5. **Error Handling Inconsistent**
   - Some endpoints return generic errors
   - Token refresh failures not always handled gracefully
   - **TODO**: Standardize error responses and add retry logic

### Medium Priority

6. **Sonos Credential Architecture**
   - Tokens stored globally but system supports multiple households
   - **REFACTOR NEEDED**: Store credentials per environment/household
   - Current workaround: Environments reference household_id
   - Works but creates confusion

7. **Schedule Conflicts Not Handled**
   - Multiple schedules can overlap on same zone
   - Currently uses first match in evaluation
   - **TODO**: Add priority field or conflict detection

8. **Queue Processor Reliability**
   - Detects track completion by checking if Sonos is playing
   - **Issue**: Doesn't differentiate between "track ended" vs "user paused"
   - **TODO**: Use webhooks for accurate track-end detection
   - **TODO**: Add retry logic for failed track loads

9. **No Subscription Management**
   - Webhooks expire after 3 days
   - No automatic renewal
   - **TODO**: Add cron to re-subscribe or subscribe on zone creation

10. **Type Safety**
    - Many `any` types used (especially for Sonos/Spotify responses)
    - **TODO**: Create proper TypeScript interfaces for all API responses
    - `zod` is installed but not used for validation

### Low Priority

11. **UI State Management**
    - All components use local useState
    - Causes multiple API calls for same data
    - **TODO**: Consider React Query or global state (Zustand/Context)

12. **No Logging/Monitoring**
    - Console.log for debugging
    - **TODO**: Add structured logging (Pino, Winston)
    - **TODO**: Add error tracking (Sentry)

13. **No Tests**
    - Zero test coverage
    - **TODO**: Add unit tests for scheduler logic
    - **TODO**: Add integration tests for API endpoints

14. **Hardcoded Timezones**
    - Only 4 US timezones in dropdown
    - **TODO**: Support all IANA timezones or auto-detect

15. **No Volume Control**
    - Schedules can't set volume levels
    - **TODO**: Add volume control to schedules and playback API

## File Structure

```
app/
├── api/
│   ├── auth/              # Admin JWT authentication
│   ├── cron/              # Vercel Cron jobs
│   │   ├── check-schedules/   # Schedule evaluation (30 min)
│   │   └── process-queue/      # Queue processing (1 min)
│   ├── environments/      # Environment CRUD
│   ├── zones/             # Zone CRUD + public list
│   ├── schedules/         # Schedule CRUD
│   ├── requests/          # Song request CRUD
│   ├── playback/          # Play/pause/skip controls
│   ├── sonos/             # Sonos OAuth + API
│   ├── spotify/           # Spotify OAuth + API
│   ├── search/            # Spotify search proxy
│   ├── now-playing/       # Combined playback status
│   ├── status/            # Auth status check
│   ├── subscriptions/     # Webhook subscriptions
│   └── test/              # Debug/testing endpoints
├── admin/                 # Admin UI pages
│   ├── page.tsx           # Dashboard
│   ├── zones/             # Zone management
│   ├── schedules/         # Schedule management
│   └── requests/          # Request queue management
├── visitor/               # Visitor song request UI
└── page.tsx               # Home (Now Playing + controls)

lib/
├── sonos/
│   ├── client.ts          # Sonos API wrapper
│   └── subscriptions.ts   # Webhook subscription logic
├── spotify/
│   └── client.ts          # Spotify API wrapper
├── db/
│   ├── client.ts          # Database wrapper
│   ├── tables.ts          # Table name constants
│   ├── schema.sql         # Original schema
│   └── schema-prefixed.sql # With earwicket_ prefix
├── scheduler/
│   └── index.ts           # Schedule evaluation logic
├── queue/
│   └── processor.ts       # Queue processing + resume
├── auth/
│   └── admin.ts           # Admin authentication
└── rate-limit.ts          # Rate limiting logic

types/
└── index.ts               # Shared TypeScript types
```

## Environment Variables

**Required:**

```env
# Database
POSTGRES_URL="postgres://..."

# Sonos API
SONOS_API_KEY="..." # The "Key" field from Sonos portal
SONOS_CLIENT_ID="..." # The "Client ID" from top of Sonos portal
SONOS_CLIENT_SECRET="..." # The "Secret" field
SONOS_REDIRECT_URI="https://your-domain.com/api/sonos/callback"

# Spotify API
SPOTIFY_CLIENT_ID="..."
SPOTIFY_CLIENT_SECRET="..."
SPOTIFY_REDIRECT_URI="https://your-domain.com/api/spotify/callback"

# Admin Auth
ADMIN_JWT_SECRET="..." # Random secure string
ADMIN_PASSWORD_SALT_ROUNDS="10"

# App
NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

**Optional:**

```env
# Cron protection (recommended)
CRON_SECRET="..." # Bearer token for cron endpoints
```

## Setup Checklist

1. ✅ Deploy to Vercel
2. ✅ Add Neon PostgreSQL integration
3. ✅ Run `lib/db/schema-prefixed.sql` in Neon SQL Editor
4. ✅ Set all environment variables in Vercel
5. ✅ Create admin user: `POST /api/auth/setup`
6. ✅ Authorize Sonos: Visit `/api/sonos/auth`
7. ✅ Authorize Spotify: Visit `/api/spotify/auth`
8. ✅ Create environments (one per Sonos household)
9. ✅ Create zones (map Sonos groups to environments)
10. ✅ Create schedules
11. ⚠️ Subscribe to webhooks: `GET /api/subscriptions/subscribe-all` (optional but recommended)
12. ✅ Vercel Cron jobs auto-enabled via `vercel.json`

## Data Flow Diagrams

### Schedule Activation

```
Cron (30 min) → Evaluate schedules (timezone-aware)
                ↓
         Check visitor queue
                ↓
         Check Sonos playing
                ↓
         Zone idle? → Load playlist → Update playback_state
```

### Visitor Request

```
Visitor → Search Spotify → Select track → Rate limit check
                                              ↓
                                    Insert as 'pending'
                                              ↓
Cron (1 min) → Process queue → Pause current → Load track → Play
                                              ↓
                                    Mark as 'playing'
                                              ↓
                    Track ends → Mark 'completed' → Next request OR resume schedule
```

### Metadata Enrichment

```
UI poll (3s) → /api/now-playing → Fetch Sonos metadata
                                        ↓
                                  Track info missing?
                                        ↓
                                  Extract Spotify ID
                                        ↓
                                  Fetch from Spotify API
                                        ↓
                                  Merge data → Return to UI
```

## Debugging Guide

### Common Issues

**"Failed to enqueue track"**
- Cause: Wrong serviceId (must be "9")
- Cause: Trying to load while playing (need to pause first)
- Fix: Ensure serviceId is "9" and pause-before-load logic exists

**Schedules not starting**
- Check: Is cron enabled? (vercel.json)
- Check: Is schedule enabled in database?
- Check: Does time/day/timezone match?
- Check: Are visitor requests blocking it?
- Check: Is zone marked as 'idle' or is music playing?
- Logs: Look for `[CRON]` messages in Vercel

**Queue not processing**
- Check: Is queue cron enabled?
- Check: Are requests marked as 'pending'?
- Check: Database playback_state for zone
- Test manually: `curl POST /api/cron/process-queue`
- Logs: Look for `[QUEUE]` messages

**"Unknown Track" displaying**
- Cause: Sonos metadata incomplete
- Check: Spotify credentials valid?
- Check: `/api/now-playing` logs for enrichment
- Should see: `[NOW-PLAYING] Enriched metadata from Spotify for: {name}`

**Songs stopping randomly**
- **Fixed**: Schedule checker now checks for visitor requests
- Check: Verify `vercel.json` cron schedules
- Disable schedules temporarily to isolate issue

### Debug Endpoints

**Check what's actually playing:**
```bash
curl "https://your-domain.com/api/test/metadata?group_id={groupId}"
```

**List all groups and their status:**
```bash
curl "https://your-domain.com/api/test/list-groups"
```

**Test basic playback:**
```bash
curl "https://your-domain.com/api/test/play-playlist?group_id={id}&playlist_uri=spotify:playlist:{id}"
curl "https://your-domain.com/api/test/play-track?group_id={id}&track_uri=spotify:track:{id}"
```

**Reset stuck queue:**
```bash
curl -X POST "https://your-domain.com/api/test/reset-queue"
```

**Manual trigger crons:**
```bash
curl -X POST "https://your-domain.com/api/cron/check-schedules"
curl -X POST "https://your-domain.com/api/cron/process-queue"
```

## Security Considerations

**Current State:**
- ⚠️ No authentication on most endpoints
- ⚠️ Admin controls visible to all users
- ⚠️ Rate limiting only on visitor requests
- ⚠️ Cron endpoints unprotected (should check CRON_SECRET)
- ✅ Passwords hashed with bcrypt
- ✅ JWT tokens expire after 7 days
- ✅ OAuth tokens auto-refresh

**Production Recommendations:**
1. Add middleware to protect `/admin/*` routes
2. Implement admin auth check on all admin API endpoints
3. Add CRON_SECRET verification to cron endpoints
4. Add CORS restrictions
5. Add request validation with Zod
6. Implement API rate limiting (not just visitor requests)
7. Add CSRF protection for state-changing operations

## Performance Considerations

**Current Bottlenecks:**
- Polling every 3 seconds (should use webhooks)
- Spotify enrichment on every metadata fetch (should cache)
- Multiple zones evaluated sequentially in crons (could parallelize)
- No database connection pooling configuration

**Optimization Opportunities:**
1. Implement webhook event handling
2. Add Redis/KV cache for enriched metadata
3. Parallelize zone processing in crons
4. Add database indexes (already have some)
5. Lazy-load Spotify playlists (currently fetches all)

## Future Enhancements

**High Value:**
- Real-time UI updates via webhooks or SSE
- Proper authentication with role-based access
- Schedule priority/conflict resolution
- Volume control per schedule
- Mobile-optimized UI

**Nice to Have:**
- Analytics dashboard (popular requests, usage patterns)
- Approval queue for visitor requests
- Multi-user admin with permissions
- Dark mode
- Playlist creation/editing within app
- Support for Apple Music, Amazon Music
- Schedule templates (quick setups)

## Maintenance Tasks

**Weekly:**
- Monitor Vercel function logs for errors
- Check Neon database size/performance

**Monthly:**
- Review rate limit table for cleanup (old entries)
- Check for stuck 'playing' requests in song_requests table
- Verify OAuth tokens are refreshing correctly

**Quarterly:**
- Review and update dependencies
- Check Sonos/Spotify API for breaking changes
- Renew webhook subscriptions if not automated

## Development Workflow

**Local Development:**
- HTTPS required for OAuth (use ngrok or deploy to Vercel for testing)
- Database: Use Vercel preview deployment or local PostgreSQL
- Crons: Test manually via API endpoints

**Deployment:**
1. Push to GitHub (RVAILab/earwicket)
2. Vercel auto-deploys
3. Crons automatically enabled via `vercel.json`
4. Monitor deployment logs for build errors

**Database Migrations:**
- No migration framework (manual SQL)
- Run new migrations in Neon SQL Editor
- Document in `/lib/db/migration-*.sql` files

## API Response Patterns

**Standard Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Standard Error:**
```json
{
  "success": false,
  "error": "Error message"
}
```

**Rate Limited:**
```json
{
  "success": false,
  "error": "Rate limit exceeded..."
}
// HTTP 429
```

## Sonos API Reference (Actual Working Values)

**Load Playlist:**
```typescript
POST /groups/{groupId}/playback/content
{
  "type": "PLAYLIST",
  "id": {
    "objectId": "spotify:playlist:{id}",
    "serviceId": "9" // MUST BE 9 for Spotify
  },
  "playModes": {
    "repeat": false,
    "shuffle": false
  }
}
// Then call: POST /groups/{groupId}/playback/play
```

**Load Track:**
```typescript
POST /groups/{groupId}/playback/content
{
  "type": "TRACK",
  "id": {
    "objectId": "spotify:track:{id}",
    "serviceId": "9" // MUST BE 9 for Spotify
  },
  "playModes": {
    "repeat": false,
    "shuffle": false
  }
}
// Then call: POST /groups/{groupId}/playback/play
```

**Why playbackAction doesn't work:**
- Documentation suggests `playbackAction: "PLAY"` should work
- In practice, content loads but doesn't auto-play
- **Solution**: Always call `/playback/play` explicitly after loading
- Add 500ms delay between load and play

## Contributing Guidelines

**Code Style:**
- TypeScript strict mode
- Async/await (no callbacks)
- Error logging with context
- Descriptive variable names

**Database Queries:**
- Use `TABLES` constant (never hardcode table names)
- Parameterized queries (never string interpolation)
- Use transactions for multi-step operations (not implemented yet)

**API Endpoints:**
- Return consistent JSON structure
- Log errors with context
- Validate input (should use Zod)
- Use Next.js 16 async params pattern

**Commit Messages:**
- Descriptive first line
- Explain "why" not just "what"
- Reference issue numbers if applicable

## Conclusion

Earwicket is a functional Sonos control system with room for improvement. The core features work:
- ✅ Multi-household support
- ✅ Scheduled playlist playback
- ✅ Visitor song requests
- ✅ Real-time playback display
- ✅ Queue management

**Key architectural decisions were made for rapid development** rather than long-term maintainability. Before scaling or adding major features, consider refactoring:
1. Authentication/authorization layer
2. Webhook integration (replace polling)
3. Metadata caching
4. Type safety improvements
5. Error handling standardization

The codebase is well-structured and documented enough for developers or AI assistants to understand and extend. Most complexity is in the Sonos API integration quirks rather than application logic.
