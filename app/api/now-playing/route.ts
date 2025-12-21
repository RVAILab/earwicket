import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';
import { sonosClient } from '@/lib/sonos/client';
import { spotifyClient } from '@/lib/spotify/client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const zoneId = searchParams.get('zone_id');

    if (!zoneId) {
      return NextResponse.json(
        { success: false, error: 'zone_id required' },
        { status: 400 }
      );
    }

    // Get zone info
    const zone = await db.queryOne<{ sonos_group_id: string; name: string }>(
      `SELECT sonos_group_id, name FROM ${TABLES.ZONES} WHERE id = $1`,
      [zoneId]
    );

    if (!zone) {
      return NextResponse.json(
        { success: false, error: 'Zone not found' },
        { status: 404 }
      );
    }

    // Get playback state
    const state = await db.queryOne<{
      current_activity: string;
      interrupted_schedule_id: string | null;
    }>(
      `SELECT ps.current_activity, ps.interrupted_schedule_id
       FROM ${TABLES.PLAYBACK_STATE} ps
       WHERE ps.zone_id = $1`,
      [zoneId]
    );

    // Get current schedule if playing
    let currentSchedule = null;
    if (state?.current_activity === 'scheduled') {
      // When scheduled, the interrupted_schedule_id holds the current schedule
      const scheduleId = state.interrupted_schedule_id;
      if (scheduleId) {
        currentSchedule = await db.queryOne(
          `SELECT name, playlist_name FROM ${TABLES.SCHEDULES} WHERE id = $1`,
          [scheduleId]
        );
      }
    } else if (state?.interrupted_schedule_id) {
      // When interrupted, show what will resume
      currentSchedule = await db.queryOne(
        `SELECT name, playlist_name FROM ${TABLES.SCHEDULES} WHERE id = $1`,
        [state.interrupted_schedule_id]
      );
    }

    // Get Sonos playback status
    let playbackStatus = null;
    try {
      playbackStatus = await sonosClient.getPlaybackStatus(zone.sonos_group_id);
    } catch (error) {
      console.error('Failed to get playback status:', error);
    }

    // Get actual playback metadata (what's really playing)
    let metadata = null;
    try {
      const creds = await db.queryOne<{ access_token: string }>(
        `SELECT access_token FROM ${TABLES.SONOS_CREDENTIALS} LIMIT 1`
      );

      if (creds) {
        const metadataResponse = await fetch(
          `https://api.ws.sonos.com/control/api/v1/groups/${zone.sonos_group_id}/playbackMetadata`,
          {
            headers: {
              Authorization: `Bearer ${creds.access_token}`,
            },
          }
        );

        if (metadataResponse.ok) {
          const data = await metadataResponse.json();
          metadata = data;

          // For Spotify tracks, ALWAYS fetch album art from Spotify API (never use local URLs)
          const trackUri = data.currentItem?.track?.id?.objectId;
          const isSpotifyTrack = trackUri?.startsWith('spotify:track:');

          console.log('[NOW-PLAYING] Track URI:', trackUri);
          console.log('[NOW-PLAYING] Is Spotify track:', isSpotifyTrack);

          if (isSpotifyTrack) {
            const trackId = trackUri.split(':')[2];
            console.log('[NOW-PLAYING] Track ID:', trackId);

            if (trackId) {
              try {
                // Use spotifyClient which handles token refresh automatically
                console.log('[NOW-PLAYING] Fetching from Spotify API with auto-refresh...');
                const spotifyTrack = await spotifyClient.getTrack(trackId);

                console.log('[NOW-PLAYING] Spotify track data:', {
                  name: spotifyTrack.body.name,
                  albumImages: spotifyTrack.body.album?.images?.length,
                  imageUrl: spotifyTrack.body.album?.images[0]?.url
                });

                // Always use Spotify data for Spotify tracks
                if (!metadata.currentItem.track.name) {
                  metadata.currentItem.track.name = spotifyTrack.body.name;
                }
                if (!metadata.currentItem.track.artist?.name) {
                  metadata.currentItem.track.artist = { name: spotifyTrack.body.artists[0]?.name };
                }
                if (!metadata.currentItem.track.album?.name) {
                  metadata.currentItem.track.album = { name: spotifyTrack.body.album.name };
                }
                // ALWAYS use Spotify's album artwork (HTTPS URL)
                metadata.currentItem.track.imageUrl = spotifyTrack.body.album.images[0]?.url;

                console.log('[NOW-PLAYING] Set imageUrl to:', metadata.currentItem.track.imageUrl);
              } catch (enrichError) {
                console.error('[NOW-PLAYING] Failed to fetch from Spotify:', enrichError);
                // Remove local URL even if Spotify fetch fails
                if (metadata.currentItem?.track?.imageUrl?.includes(':1400')) {
                  metadata.currentItem.track.imageUrl = null;
                }
              }
            } else {
              console.error('[NOW-PLAYING] Could not extract track ID from URI:', trackUri);
            }
          }

          // Safety net: Strip out ANY local URLs (HTTP + port, or local IPs)
          const stripLocalUrls = (obj: any) => {
            if (!obj || typeof obj !== 'object') return;

            for (const key in obj) {
              if (typeof obj[key] === 'string' && key.toLowerCase().includes('url')) {
                // Remove if it's a local URL (has port :1400 or starts with http://192, etc)
                if (obj[key].includes(':1400') ||
                    obj[key].startsWith('http://192.') ||
                    obj[key].startsWith('http://10.') ||
                    obj[key].startsWith('http://172.')) {
                  console.log('[NOW-PLAYING] Stripped local URL:', obj[key].substring(0, 50));
                  obj[key] = null;
                }
              } else if (typeof obj[key] === 'object') {
                stripLocalUrls(obj[key]);
              }
            }
          };

          stripLocalUrls(metadata);
        } else {
          console.error('[NOW-PLAYING] Failed to fetch metadata:', metadataResponse.status);
        }
      }
    } catch (error) {
      console.error('Failed to get metadata:', error);
    }

    // Get visitor queue - ONLY pending (not currently playing)
    const queue = await db.query(
      `SELECT id, track_name, artist_name, requested_by, status FROM ${TABLES.SONG_REQUESTS}
       WHERE zone_id = $1 AND status = 'pending'
       ORDER BY created_at ASC`,
      [zoneId]
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          zone: zone.name,
          activity: state?.current_activity || 'idle',
          schedule: currentSchedule,
          playbackStatus,
          metadata,
          queue,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error: any) {
    console.error('Error fetching now playing:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
