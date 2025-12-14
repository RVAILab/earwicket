import { NextResponse } from 'next/server';
import { sonosClient } from '@/lib/sonos/client';

export async function GET() {
  try {
    const groups = await sonosClient.getGroups();

    return NextResponse.json({
      success: true,
      data: groups,
    });
  } catch (error: any) {
    console.error('Error fetching Sonos groups:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch Sonos groups',
      },
      { status: 500 }
    );
  }
}
