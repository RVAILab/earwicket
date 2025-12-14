import { NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';

export async function GET() {
  try {
    // Get current credentials to get access token
    const creds = await db.queryOne<{ access_token: string }>(
      `SELECT access_token FROM ${TABLES.SONOS_CREDENTIALS} LIMIT 1`
    );

    if (!creds) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated with Sonos' },
        { status: 401 }
      );
    }

    // Fetch all households
    const response = await fetch('https://api.ws.sonos.com/control/api/v1/households', {
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch households');
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      data: data.households || [],
    });
  } catch (error: any) {
    console.error('Error fetching households:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST to set which household to use
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { household_id } = body;

    if (!household_id) {
      return NextResponse.json(
        { success: false, error: 'household_id required' },
        { status: 400 }
      );
    }

    // Update the stored household ID
    await db.execute(
      `UPDATE ${TABLES.SONOS_CREDENTIALS} SET household_id = $1`,
      [household_id]
    );

    return NextResponse.json({
      success: true,
      data: { household_id },
    });
  } catch (error: any) {
    console.error('Error setting household:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
