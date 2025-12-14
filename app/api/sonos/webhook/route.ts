import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import db from '@/lib/db/client';

/**
 * Sonos webhook endpoint for real-time playback events
 * Docs: https://docs.sonos.com/docs/subscribe
 *
 * Important: Must respond within 1 second with 200 OK
 * Sonos retries 3 times if we fail to respond
 */
export async function POST(request: NextRequest) {
  try {
    // Extract Sonos event headers
    const seqId = request.headers.get('x-sonos-event-seq-id') || '';
    const signature = request.headers.get('x-sonos-event-signature') || '';
    const namespace = request.headers.get('x-sonos-namespace') || '';
    const type = request.headers.get('x-sonos-type') || '';
    const targetType = request.headers.get('x-sonos-target-type') || '';
    const targetValue = request.headers.get('x-sonos-target-value') || '';
    const householdId = request.headers.get('x-sonos-household-id') || '';

    // Verify signature to ensure request is from Sonos
    const isValid = verifySignature({
      seqId,
      namespace,
      type,
      targetType,
      targetValue,
      signature,
    });

    if (!isValid) {
      console.warn('Invalid Sonos webhook signature');
      // Return 200 anyway to prevent retries
      return NextResponse.json({ success: false, error: 'Invalid signature' });
    }

    const body = await request.json();

    console.log('Sonos webhook event:', {
      seqId,
      namespace,
      type,
      targetType,
      targetValue,
      householdId,
      body,
    });

    // Handle playbackStatus events (playing, paused, idle)
    if (namespace === 'playbackStatus') {
      await handlePlaybackStatusEvent(targetValue, body);
    }

    // Handle playback events (track changed)
    if (namespace === 'playback') {
      await handlePlaybackEvent(targetValue, body);
    }

    // Must respond within 1 second with 200 OK
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    // Still return 200 to prevent Sonos from retrying
    return NextResponse.json({ success: true }, { status: 200 });
  }
}

/**
 * Verify Sonos webhook signature
 * Concatenates headers + client credentials and compares SHA-256 hash
 */
function verifySignature(params: {
  seqId: string;
  namespace: string;
  type: string;
  targetType: string;
  targetValue: string;
  signature: string;
}): boolean {
  const clientId = process.env.SONOS_CLIENT_ID || '';
  const clientSecret = process.env.SONOS_CLIENT_SECRET || '';

  // Concatenate values in order specified by Sonos docs
  const message =
    params.seqId +
    params.namespace +
    params.type +
    params.targetType +
    params.targetValue +
    clientId +
    clientSecret;

  // Create SHA-256 hash and base64 encode (URL-safe, no padding)
  const hash = crypto
    .createHash('sha256')
    .update(message, 'utf8')
    .digest('base64url');

  return hash === params.signature;
}

/**
 * Handle playbackStatus events (playing, paused, idle)
 */
async function handlePlaybackStatusEvent(groupId: string, body: any) {
  try {
    const zone = await db.queryOne<{ id: string }>(
      'SELECT id FROM zones WHERE sonos_group_id = $1',
      [groupId]
    );

    if (!zone) {
      console.warn(`No zone found for group ${groupId}`);
      return;
    }

    // Update playback_state timestamp
    await db.execute(
      'UPDATE playback_state SET last_updated = CURRENT_TIMESTAMP WHERE zone_id = $1',
      [zone.id]
    );

    console.log(`Updated playback state for zone ${zone.id}`);
  } catch (error) {
    console.error('Error handling playbackStatus event:', error);
  }
}

/**
 * Handle playback events (track changed, queue updated)
 */
async function handlePlaybackEvent(groupId: string, body: any) {
  try {
    const zone = await db.queryOne<{ id: string }>(
      'SELECT id FROM zones WHERE sonos_group_id = $1',
      [groupId]
    );

    if (!zone) {
      console.warn(`No zone found for group ${groupId}`);
      return;
    }

    // TODO Phase 3: Check if a visitor track just finished
    // If so, load next pending request or resume schedule

    console.log(`Playback event for zone ${zone.id}`);
  } catch (error) {
    console.error('Error handling playback event:', error);
  }
}

// Sonos may send a GET request to verify the webhook endpoint
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Sonos webhook endpoint ready'
  });
}
