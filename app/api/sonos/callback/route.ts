import { NextRequest, NextResponse } from 'next/server';
import { sonosClient } from '@/lib/sonos/client';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?error=sonos_auth_failed`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?error=no_code`
    );
  }

  try {
    await sonosClient.exchangeCodeForToken(code);

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?sonos_auth=success`
    );
  } catch (error: any) {
    console.error('Error exchanging Sonos code:', error);
    const errorMessage = encodeURIComponent(error?.message || 'Unknown error');
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin?error=sonos_token_exchange_failed&details=${errorMessage}`
    );
  }
}
