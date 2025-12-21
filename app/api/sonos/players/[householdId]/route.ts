import { NextRequest, NextResponse } from 'next/server';
import { sonosClient } from '@/lib/sonos/client';

/**
 * GET /api/sonos/players/[householdId]
 *
 * Get all available players/devices in a household
 * Used in admin UI for device selection when creating/editing zones
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ householdId: string }> }
) {
  try {
    const { householdId } = await params;

    // Load credentials and get players
    const loaded = await sonosClient.loadCredentials();
    if (!loaded) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated with Sonos' },
        { status: 401 }
      );
    }

    const players = await sonosClient.getPlayers(householdId);

    return NextResponse.json({
      success: true,
      data: { players },
    });
  } catch (error: any) {
    console.error('Error fetching players for household:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
