import { NextResponse } from 'next/server';
import { sonosClient } from '@/lib/sonos/client';

export async function GET() {
  try {
    const authUrl = sonosClient.getAuthorizationUrl();
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating Sonos auth:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to initiate Sonos authentication' },
      { status: 500 }
    );
  }
}
