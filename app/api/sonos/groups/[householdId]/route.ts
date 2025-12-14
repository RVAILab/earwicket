import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ householdId: string }> }
) {
  try {
    const { householdId } = await params;

    // Get access token
    const creds = await db.queryOne<{ access_token: string }>(
      `SELECT access_token FROM ${TABLES.SONOS_CREDENTIALS} LIMIT 1`
    );

    if (!creds) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated with Sonos' },
        { status: 401 }
      );
    }

    // Fetch groups for this household
    const response = await fetch(
      `https://api.ws.sonos.com/control/api/v1/households/${householdId}/groups`,
      {
        headers: {
          Authorization: `Bearer ${creds.access_token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch groups');
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      data: data.groups || [],
    });
  } catch (error: any) {
    console.error('Error fetching groups for household:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
