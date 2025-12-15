import { NextRequest, NextResponse } from 'next/server';
import { sonosClient } from '@/lib/sonos/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { group_id } = body;

    if (!group_id) {
      return NextResponse.json(
        { success: false, error: 'group_id required' },
        { status: 400 }
      );
    }

    await sonosClient.play(group_id);

    return NextResponse.json({
      success: true,
      message: 'Playing',
    });
  } catch (error: any) {
    console.error('Error playing:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
