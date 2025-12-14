import { NextRequest, NextResponse } from 'next/server';
import { createAdminUser } from '@/lib/auth/admin';
import db from '@/lib/db/client';

// This endpoint is for initial setup only
// In production, you should disable this or add additional protection
export async function POST(request: NextRequest) {
  try {
    // Check if any admin users already exist
    const existingUsers = await db.query('SELECT id FROM admin_users LIMIT 1');

    if (existingUsers.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Admin users already exist' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const user = await createAdminUser(username, password);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
        },
      },
    });
  } catch (error: any) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
