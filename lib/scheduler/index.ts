import { DateTime } from 'luxon';
import db from '../db/client';
import { TABLES } from '../db/tables';
import { Schedule } from '@/types';

interface ScheduleWithTimezone extends Schedule {
  timezone: string;
}

/**
 * Evaluate which schedule should be active for a given zone at the current time
 * Takes timezone into account for proper time evaluation
 */
export async function getActiveSchedule(
  zoneId: string
): Promise<ScheduleWithTimezone | null> {
  // Get all enabled schedules for this zone with timezone
  const schedules = await db.query<ScheduleWithTimezone>(
    `SELECT s.*, e.timezone
     FROM ${TABLES.SCHEDULES} s
     JOIN ${TABLES.ZONES} z ON s.zone_id = z.id
     JOIN ${TABLES.ENVIRONMENTS} e ON z.environment_id = e.id
     WHERE s.zone_id = $1 AND s.enabled = true
     ORDER BY s.start_time ASC`,
    [zoneId]
  );

  if (schedules.length === 0) {
    return null;
  }

  // Get current time in the zone's timezone
  const timezone = schedules[0].timezone;
  const now = DateTime.now().setZone(timezone);
  const currentDay = now.weekday % 7; // Luxon uses 1-7 (Mon-Sun), convert to 0-6 (Sun-Sat)
  const currentTime = now.toFormat('HH:mm:ss');

  // Find matching schedule
  for (const schedule of schedules) {
    // Check if today is in the schedule's days_of_week
    if (!schedule.days_of_week.includes(currentDay)) {
      continue;
    }

    // Check if current time is >= start_time
    if (currentTime < schedule.start_time) {
      continue;
    }

    // Check if current time is < end_time (if end_time is set)
    if (schedule.end_time && currentTime >= schedule.end_time) {
      continue;
    }

    // This schedule matches!
    return schedule;
  }

  return null;
}

/**
 * Evaluate all zones and return which schedules should be active
 */
export async function evaluateAllSchedules(): Promise<
  Array<{
    zoneId: string;
    zoneName: string;
    sonosGroupId: string;
    schedule: ScheduleWithTimezone | null;
  }>
> {
  // Get all zones
  const zones = await db.query<{
    id: string;
    name: string;
    sonos_group_id: string;
  }>(
    `SELECT id, name, sonos_group_id FROM ${TABLES.ZONES} ORDER BY name ASC`
  );

  const results = [];

  for (const zone of zones) {
    const schedule = await getActiveSchedule(zone.id);

    results.push({
      zoneId: zone.id,
      zoneName: zone.name,
      sonosGroupId: zone.sonos_group_id,
      schedule,
    });
  }

  return results;
}

/**
 * Check if a schedule should be playing based on current time
 */
export function shouldScheduleBePlaying(
  schedule: ScheduleWithTimezone,
  timezone: string
): boolean {
  const now = DateTime.now().setZone(timezone);
  const currentDay = now.weekday % 7;
  const currentTime = now.toFormat('HH:mm:ss');

  // Check day of week
  if (!schedule.days_of_week.includes(currentDay)) {
    return false;
  }

  // Check time range
  if (currentTime < schedule.start_time) {
    return false;
  }

  if (schedule.end_time && currentTime >= schedule.end_time) {
    return false;
  }

  return true;
}
