import { NextRequest, NextResponse } from 'next/server';
import { spotifyClient } from '@/lib/spotify/client';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?error=spotify_auth_failed`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?error=no_code`
    );
  }

  try {
    await spotifyClient.exchangeCodeForToken(code);

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?spotify_auth=success`
    );
  } catch (error) {
    console.error('Error exchanging Spotify code:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?error=spotify_token_exchange_failed`
    );
  }
}
