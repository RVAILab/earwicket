import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';
import { checkRateLimit } from '@/lib/rate-limit';
import { SongRequest } from '@/types';

// GET requests for a zone (current queue)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const zoneId = searchParams.get('zone_id');

    if (!zoneId) {
      return NextResponse.json(
        { success: false, error: 'zone_id required' },
        { status: 400 }
      );
    }

    const requests = await db.query<SongRequest>(
      `SELECT * FROM ${TABLES.SONG_REQUESTS}
       WHERE zone_id = $1 AND status IN ('pending', 'playing')
       ORDER BY created_at ASC`,
      [zoneId]
    );

    return NextResponse.json({
      success: true,
      data: requests,
    });
  } catch (error: any) {
    console.error('Error fetching requests:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST create new song request
export async function POST(request: NextRequest) {
  try {
    // Get IP address for rate limiting
    const ip = request.headers.get('x-forwarded-for') ||
                request.headers.get('x-real-ip') ||
                'unknown';

    // Check rate limit
    const rateLimit = await checkRateLimit(ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please wait a few minutes before requesting more songs.',
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { zone_id, track_uri, track_name, artist_name, requested_by } = body;

    if (!zone_id || !track_uri || !track_name || !artist_name) {
      return NextResponse.json(
        { success: false, error: 'zone_id, track_uri, track_name, and artist_name required' },
        { status: 400 }
      );
    }

    const songRequest = await db.queryOne<SongRequest>(
      `INSERT INTO ${TABLES.SONG_REQUESTS}
       (zone_id, track_uri, track_name, artist_name, requested_by, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [zone_id, track_uri, track_name, artist_name, requested_by || null]
    );

    return NextResponse.json(
      {
        success: true,
        data: songRequest,
        rateLimit: {
          remaining: rateLimit.remaining,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating song request:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
