import { NextRequest, NextResponse } from 'next/server';
import { sonosClient } from '@/lib/sonos/client';

/**
 * POST /api/sonos/groups/create
 *
 * Create a new Sonos group from a list of player IDs
 * Players will be automatically moved from their current groups if needed
 *
 * Body: { householdId: string, playerIds: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { householdId, playerIds } = body;

    // Validate input
    if (!householdId) {
      return NextResponse.json(
        { success: false, error: 'householdId is required' },
        { status: 400 }
      );
    }

    if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'playerIds array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Load credentials and create group
    const loaded = await sonosClient.loadCredentials();
    if (!loaded) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated with Sonos' },
        { status: 401 }
      );
    }

    const group = await sonosClient.createGroup(householdId, playerIds);

    return NextResponse.json({
      success: true,
      data: { group },
    });
  } catch (error: any) {
    console.error('Error creating Sonos group:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
