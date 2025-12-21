import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';
import { sonosClient } from '@/lib/sonos/client';

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

          // Check if we need Spotify enrichment:
          // 1. Track info is missing
          // 2. Album art is a local URL (not accessible from browser)
          const needsEnrichment =
            !data.currentItem?.track?.name ||
            (data.currentItem?.track?.imageUrl &&
             (data.currentItem.track.imageUrl.startsWith('http://') &&
              data.currentItem.track.imageUrl.includes(':1400')));

          // Enrich with Spotify data if needed and we have a track ID
          if (needsEnrichment && data.currentItem?.track?.id?.objectId) {
            const trackUri = data.currentItem.track.id.objectId;
            const trackId = trackUri.split(':')[2];

            if (trackId) {
              try {
                // Fetch from Spotify
                const spotifyCreds = await db.queryOne<{ access_token: string }>(
                  `SELECT access_token FROM ${TABLES.SPOTIFY_CREDENTIALS} LIMIT 1`
                );

                if (spotifyCreds) {
                  const spotifyResponse = await fetch(
                    `https://api.spotify.com/v1/tracks/${trackId}`,
                    {
                      headers: {
                        Authorization: `Bearer ${spotifyCreds.access_token}`,
                      },
                    }
                  );

                  if (spotifyResponse.ok) {
                    const spotifyTrack = await spotifyResponse.json();

                    // Enrich the metadata with Spotify data
                    metadata.currentItem.track.name = spotifyTrack.name;
                    metadata.currentItem.track.artist = { name: spotifyTrack.artists[0]?.name };
                    metadata.currentItem.track.album = { name: spotifyTrack.album.name };
                    // Use Spotify's album artwork (prefer largest image)
                    metadata.currentItem.track.imageUrl = spotifyTrack.album.images[0]?.url || metadata.currentItem.track.imageUrl;

                    console.log('[NOW-PLAYING] Enriched metadata from Spotify for:', spotifyTrack.name);
                  }
                }
              } catch (enrichError) {
                console.error('[NOW-PLAYING] Failed to enrich from Spotify:', enrichError);
              }
            }
          }
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

    return NextResponse.json({
      success: true,
      data: {
        zone: zone.name,
        activity: state?.current_activity || 'idle',
        schedule: currentSchedule,
        playbackStatus,
        metadata,
        queue,
      },
    });
  } catch (error: any) {
    console.error('Error fetching now playing:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
