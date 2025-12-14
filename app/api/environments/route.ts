import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import { TABLES } from '@/lib/db/tables';
import { Environment } from '@/types';

// GET all environments
export async function GET() {
  try {
    const environments = await db.query<Environment>(
      `SELECT * FROM ${TABLES.ENVIRONMENTS} ORDER BY created_at ASC`
    );

    return NextResponse.json({
      success: true,
      data: environments,
    });
  } catch (error: any) {
    console.error('Error fetching environments:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST create new environment (linked to a Sonos household)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, timezone, household_id } = body;

    if (!name || !timezone || !household_id) {
      return NextResponse.json(
        { success: false, error: 'Name, timezone, and household_id required' },
        { status: 400 }
      );
    }

    const environment = await db.queryOne<Environment>(
      `INSERT INTO ${TABLES.ENVIRONMENTS} (name, timezone, household_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, timezone, household_id]
    );

    return NextResponse.json({
      success: true,
      data: environment,
    });
  } catch (error: any) {
    console.error('Error creating environment:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
