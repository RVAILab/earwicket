# Earwicket Deployment Guide

## GitHub Setup

### 1. Create GitHub Repository

Option A - Via GitHub CLI (if installed):
```bash
gh repo create earwicket --public --source=. --remote=origin --push
```

Option B - Via GitHub Web:
1. Go to https://github.com/new
2. Repository name: `earwicket`
3. Description: "Sonos control system with scheduled playlists and visitor song requests"
4. Choose public or private
5. **Do NOT initialize with README, .gitignore, or license** (we already have these)
6. Click "Create repository"

Then connect and push:
```bash
git remote add origin git@github.com:YOUR_USERNAME/earwicket.git
git branch -M main
git push -u origin main
```

### 2. Verify Repository

Visit your repository URL to confirm all files are there:
- `https://github.com/YOUR_USERNAME/earwicket`

## Vercel Deployment

### 1. Import Project to Vercel

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Select your `earwicket` repository from GitHub
4. Click "Import"

### 2. Configure Project

**Framework Preset**: Next.js (should auto-detect)

**Root Directory**: `./` (default)

**Build Settings**: Use defaults
- Build Command: `next build`
- Output Directory: `.next`
- Install Command: `npm install`

### 3. Add Neon PostgreSQL Integration

1. In project settings, go to "Storage" tab
2. Click "Add Integration"
3. Search for "Neon" or "PostgreSQL"
4. Click "Add Integration" on Neon Serverless Postgres
5. Follow the prompts to create a new database
6. This will automatically add `POSTGRES_URL` to your environment variables

### 4. Set Environment Variables

In Vercel project settings → Environment Variables, add all of these:

#### Sonos API
```
SONOS_CLIENT_ID=your-sonos-client-id
SONOS_CLIENT_SECRET=your-sonos-client-secret
SONOS_REDIRECT_URI=https://your-app.vercel.app/api/sonos/callback
```

#### Spotify API
```
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
SPOTIFY_REDIRECT_URI=https://your-app.vercel.app/api/spotify/callback
```

#### Admin Auth
```
ADMIN_JWT_SECRET=generate-a-secure-random-string-here
ADMIN_PASSWORD_SALT_ROUNDS=10
```

#### App URL
```
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

**Note**: Replace `your-app.vercel.app` with your actual Vercel deployment URL

### 5. Update API Redirect URIs

After deploying, update redirect URIs in:

**Sonos Developer Portal**:
- Go to https://developer.sonos.com
- Update Control Integration redirect URI to: `https://your-app.vercel.app/api/sonos/callback`

**Spotify Developer Dashboard**:
- Go to https://developer.spotify.com/dashboard
- Edit your app settings
- Add redirect URI: `https://your-app.vercel.app/api/spotify/callback`

### 6. Initialize Database

Connect to your Neon database and run the schema:

```bash
# Get your POSTGRES_URL from Vercel environment variables
psql "YOUR_POSTGRES_URL" -f lib/db/schema.sql
```

Or use the Neon dashboard SQL Editor to copy/paste the contents of `lib/db/schema.sql`

### 7. Deploy

Click "Deploy" in Vercel. The deployment will:
- Install dependencies
- Build the Next.js app
- Deploy to production

### 8. Post-Deployment Setup

Once deployed, visit your app and complete setup:

1. **Create Admin User**:
   ```bash
   curl -X POST https://your-app.vercel.app/api/auth/setup \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"your-secure-password"}'
   ```

2. **Authorize Sonos**: Visit `https://your-app.vercel.app/api/sonos/auth`

3. **Authorize Spotify**: Visit `https://your-app.vercel.app/api/spotify/auth`

### 9. Configure Cron Jobs (For Phase 2+)

When you implement the cron endpoints, add this to your repository as `vercel.json`:

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

Then commit and push:
```bash
git add vercel.json
git commit -m "Add Vercel cron configuration"
git push
```

Vercel will automatically redeploy with cron jobs enabled.

## Custom Domain (Optional)

1. In Vercel project settings → Domains
2. Add your custom domain
3. Configure DNS as instructed by Vercel
4. Update all redirect URIs in Sonos/Spotify to use your custom domain

## Monitoring & Logs

- **Build Logs**: Available in Vercel dashboard for each deployment
- **Runtime Logs**: Vercel Dashboard → Functions tab
- **Database**: Neon dashboard for query monitoring

## Troubleshooting

### Build Fails
- Check Vercel build logs
- Verify all environment variables are set
- Ensure `POSTGRES_URL` is available

### OAuth Fails
- Verify redirect URIs match exactly in Sonos/Spotify apps
- Check that environment variables are set correctly
- Ensure URLs use `https://` (not `http://`) in production

### Database Connection Issues
- Verify `POSTGRES_URL` is correct
- Check Neon database is running
- Ensure schema has been initialized

## Updating the App

To deploy updates:

```bash
git add .
git commit -m "Your commit message"
git push
```

Vercel will automatically build and deploy the changes.

## Environment-Specific Settings

For local development, use `.env.local`:
- Redirect URIs: `http://localhost:3000/api/...`
- App URL: `http://localhost:3000`

For production, use Vercel environment variables:
- Redirect URIs: `https://your-app.vercel.app/api/...`
- App URL: `https://your-app.vercel.app`
