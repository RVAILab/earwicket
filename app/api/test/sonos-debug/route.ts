import { NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';

export async function GET() {
  const results: Record<string, any> = {};

  // 1. Check env vars (masked)
  results.env = {
    SONOS_API_KEY: process.env.SONOS_API_KEY ? `${process.env.SONOS_API_KEY.substring(0, 8)}...` : 'MISSING',
    SONOS_CLIENT_SECRET: process.env.SONOS_CLIENT_SECRET ? `${process.env.SONOS_CLIENT_SECRET.substring(0, 8)}...` : 'MISSING',
    SONOS_REDIRECT_URI: process.env.SONOS_REDIRECT_URI || 'MISSING',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'MISSING',
  };

  // 2. Check stored credentials
  try {
    const creds = await db.queryOne<{
      id: string;
      access_token: string;
      refresh_token: string;
      expires_at: any;
      household_id: string | null;
      created_at: any;
      updated_at: any;
    }>(`SELECT * FROM ${TABLES.SONOS_CREDENTIALS} LIMIT 1`);

    if (creds) {
      results.storedCredentials = {
        id: creds.id,
        access_token: `${creds.access_token.substring(0, 20)}...`,
        refresh_token: creds.refresh_token ? `${creds.refresh_token.substring(0, 10)}...` : null,
        expires_at_raw: creds.expires_at,
        expires_at_type: typeof creds.expires_at,
        expires_at_parsed: new Date(creds.expires_at).toISOString(),
        is_expired: new Date(creds.expires_at) < new Date(),
        household_id: creds.household_id,
        created_at: creds.created_at,
        updated_at: creds.updated_at,
      };

      // 3. Try to call Sonos API directly with stored token
      try {
        const householdsResponse = await fetch('https://api.ws.sonos.com/control/api/v1/households', {
          headers: {
            Authorization: `Bearer ${creds.access_token}`,
          },
        });

        const householdsText = await householdsResponse.text();
        results.householdsApiCall = {
          status: householdsResponse.status,
          statusText: householdsResponse.statusText,
          headers: Object.fromEntries(householdsResponse.headers.entries()),
          body: householdsText,
        };

        // If we got households, try to get groups from the first one
        if (householdsResponse.ok) {
          try {
            const householdsData = JSON.parse(householdsText);
            if (householdsData.households && householdsData.households.length > 0) {
              const firstHousehold = householdsData.households[0];
              results.firstHousehold = firstHousehold;

              // Try to get groups
              const groupsResponse = await fetch(
                `https://api.ws.sonos.com/control/api/v1/households/${firstHousehold.id}/groups`,
                {
                  headers: {
                    Authorization: `Bearer ${creds.access_token}`,
                  },
                }
              );
              const groupsText = await groupsResponse.text();
              results.groupsApiCall = {
                status: groupsResponse.status,
                statusText: groupsResponse.statusText,
                body: groupsText,
              };
            }
          } catch (e: any) {
            results.parseError = e.message;
          }
        }
      } catch (e: any) {
        results.householdsApiCall = { error: e.message };
      }

      // 4. Try token refresh to see if refresh token works
      try {
        const apiKey = process.env.SONOS_API_KEY!;
        const clientSecret = process.env.SONOS_CLIENT_SECRET!;

        const refreshResponse = await fetch('https://api.sonos.com/login/v3/oauth/access', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${apiKey}:${clientSecret}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: creds.refresh_token,
          }).toString(),
        });

        const refreshText = await refreshResponse.text();
        results.tokenRefresh = {
          status: refreshResponse.status,
          statusText: refreshResponse.statusText,
          body: refreshResponse.ok ? 'Token refresh successful (new token received)' : refreshText,
        };

        // If refresh worked, try households again with the new token
        if (refreshResponse.ok) {
          try {
            const refreshData = JSON.parse(refreshText);
            const newToken = refreshData.access_token;

            const retryHouseholdsResponse = await fetch('https://api.ws.sonos.com/control/api/v1/households', {
              headers: {
                Authorization: `Bearer ${newToken}`,
              },
            });
            const retryHouseholdsText = await retryHouseholdsResponse.text();
            results.householdsWithNewToken = {
              status: retryHouseholdsResponse.status,
              body: retryHouseholdsText,
            };
          } catch (e: any) {
            results.retryError = e.message;
          }
        }
      } catch (e: any) {
        results.tokenRefresh = { error: e.message };
      }
    } else {
      results.storedCredentials = null;
    }
  } catch (e: any) {
    results.dbError = e.message;
  }

  return NextResponse.json(results, { status: 200 });
}
