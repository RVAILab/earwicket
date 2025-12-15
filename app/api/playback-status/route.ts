import { NextRequest, NextResponse } from 'next/server';
import { sonosClient } from '@/lib/sonos/client';

/**
 * Get real-time playback status from Sonos (not database)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const groupId = searchParams.get('group_id');

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: 'group_id required' },
        { status: 400 }
      );
    }

    // Get actual status from Sonos
    const status = await sonosClient.getPlaybackStatus(groupId);

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    console.error('Error fetching playback status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
