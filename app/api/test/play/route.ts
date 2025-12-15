import { NextRequest, NextResponse } from 'next/server';
import { sonosClient } from '@/lib/sonos/client';

/**
 * Simple test: just call the play endpoint
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

    console.log('[TEST] Calling play on group:', groupId);

    await sonosClient.play(groupId);

    console.log('[TEST] Play command sent successfully');

    return NextResponse.json({
      success: true,
      message: 'Play command sent',
    });
  } catch (error: any) {
    console.error('[TEST] Error calling play:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
