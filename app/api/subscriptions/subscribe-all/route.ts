import { NextResponse } from 'next/server';
import { subscribeToAllZones } from '@/lib/sonos/subscriptions';

/**
 * Subscribe to webhook events for all zones
 * Call this once after setting up zones
 */
export async function POST() {
  try {
    await subscribeToAllZones();

    return NextResponse.json({
      success: true,
      message: 'Subscribed to all zones',
    });
  } catch (error: any) {
    console.error('Error subscribing:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// Allow GET for easy testing
export async function GET() {
  return POST();
}
