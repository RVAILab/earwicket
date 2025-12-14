import db from './db/client';
import { TABLES } from './db/tables';

const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes in ms
const MAX_REQUESTS = 5;

export async function checkRateLimit(ipAddress: string): Promise<{
  allowed: boolean;
  remaining: number;
}> {
  try {
    // Get or create rate limit record
    const record = await db.queryOne<{ request_count: number; window_start: Date }>(
      `SELECT request_count, window_start FROM ${TABLES.RATE_LIMITS} WHERE ip_address = $1`,
      [ipAddress]
    );

    const now = new Date();

    if (!record) {
      // First request from this IP
      await db.execute(
        `INSERT INTO ${TABLES.RATE_LIMITS} (ip_address, request_count, window_start)
         VALUES ($1, 1, $2)`,
        [ipAddress, now]
      );
      return { allowed: true, remaining: MAX_REQUESTS - 1 };
    }

    const windowStart = new Date(record.window_start);
    const windowAge = now.getTime() - windowStart.getTime();

    // If window has expired, reset
    if (windowAge > RATE_LIMIT_WINDOW) {
      await db.execute(
        `UPDATE ${TABLES.RATE_LIMITS}
         SET request_count = 1, window_start = $1
         WHERE ip_address = $2`,
        [now, ipAddress]
      );
      return { allowed: true, remaining: MAX_REQUESTS - 1 };
    }

    // Check if limit exceeded
    if (record.request_count >= MAX_REQUESTS) {
      return { allowed: false, remaining: 0 };
    }

    // Increment count
    await db.execute(
      `UPDATE ${TABLES.RATE_LIMITS}
       SET request_count = request_count + 1
       WHERE ip_address = $1`,
      [ipAddress]
    );

    return {
      allowed: true,
      remaining: MAX_REQUESTS - record.request_count - 1,
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    // Allow request on error to avoid blocking legitimate users
    return { allowed: true, remaining: MAX_REQUESTS };
  }
}
