import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';

// Sonos webhook endpoint for real-time playback events
// This receives notifications when playback state changes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Log the webhook event for now
    console.log('Sonos webhook event received:', JSON.stringify(body, null, 2));

    // Common Sonos webhook events:
    // - playbackStatus: playback state changed (playing, paused, idle)
    // - playback: track changed
    // - playbackMetadata: metadata updated
    // - playbackError: playback error occurred
    // - groupVolume: volume changed

    const { namespace, type, groupId } = body;

    // Handle playback status changes
    if (namespace === 'playbackStatus' || type === 'playbackStatus') {
      // Find zone by sonos_group_id
      const zone = await db.queryOne<{ id: string }>(
        'SELECT id FROM zones WHERE sonos_group_id = $1',
        [groupId]
      );

      if (zone) {
        // Update playback_state last_updated timestamp
        await db.execute(
          'UPDATE playback_state SET last_updated = CURRENT_TIMESTAMP WHERE zone_id = $1',
          [zone.id]
        );

        console.log(`Updated playback state for zone ${zone.id}`);
      }
    }

    // TODO Phase 3: Implement queue processor logic here
    // When track ends, this webhook will notify us immediately
    // instead of polling every minute

    // Sonos expects a 200 response
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    // Still return 200 to prevent Sonos from retrying
    return NextResponse.json({ success: false, error: 'Internal error' });
  }
}

// Sonos may send a GET request to verify the webhook endpoint
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Sonos webhook endpoint ready'
  });
}
