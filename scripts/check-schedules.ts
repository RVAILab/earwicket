import db from '../lib/db/client';
import { TABLES } from '../lib/db/tables';
import { DateTime } from 'luxon';

async function checkSchedules() {
  try {
    console.log('=== ZONES ===');
    const zones = await db.query<{ id: string; name: string; env: string; timezone: string }>(
      `SELECT z.id, z.name, e.name as env, e.timezone
       FROM ${TABLES.ZONES} z
       JOIN ${TABLES.ENVIRONMENTS} e ON z.environment_id = e.id`
    );

    zones.forEach(z => {
      console.log(`  ${z.id.substring(0, 8)}... - ${z.env} / ${z.name} (TZ: ${z.timezone})`);
    });

    console.log('\n=== SCHEDULES ===');
    const schedules = await db.query<{
      id: string;
      name: string;
      enabled: boolean;
      days_of_week: number[];
      start_time: string;
      end_time: string | null;
      zone_name: string;
      zone_id: string;
      playlist_name: string;
      timezone: string;
    }>(
      `SELECT s.id, s.name, s.enabled, s.days_of_week, s.start_time, s.end_time,
              z.name as zone_name, z.id as zone_id, s.playlist_name, e.timezone
       FROM ${TABLES.SCHEDULES} s
       JOIN ${TABLES.ZONES} z ON s.zone_id = z.id
       JOIN ${TABLES.ENVIRONMENTS} e ON z.environment_id = e.id
       ORDER BY s.start_time`
    );

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    schedules.forEach(s => {
      const days = s.days_of_week.map(d => dayNames[d]).join(',');
      const status = s.enabled ? '✅' : '❌';

      // Check if this schedule should be active NOW
      const now = DateTime.now().setZone(s.timezone);
      const currentDay = now.weekday % 7;
      const currentTime = now.toFormat('HH:mm:ss');

      const isActiveDay = s.days_of_week.includes(currentDay);
      const isAfterStart = currentTime >= s.start_time;
      const isBeforeEnd = !s.end_time || currentTime < s.end_time;
      const shouldBeActive = s.enabled && isActiveDay && isAfterStart && isBeforeEnd;

      console.log(`  ${status} ${s.name} ${shouldBeActive ? '🔊 SHOULD BE ACTIVE NOW' : ''}`);
      console.log(`     Zone: ${s.zone_name} (${s.zone_id.substring(0, 8)}...)`);
      console.log(`     Days: ${days}`);
      console.log(`     Time: ${s.start_time.substring(0, 5)} - ${s.end_time ? s.end_time.substring(0, 5) : 'end of day'}`);
      console.log(`     Playlist: ${s.playlist_name}`);
      console.log(`     Current: ${now.toFormat('EEE HH:mm:ss')} (day=${currentDay}, time=${currentTime})`);
      console.log(`     Match: day=${isActiveDay}, after_start=${isAfterStart}, before_end=${isBeforeEnd}`);
      console.log('');
    });

    console.log('\n=== PLAYBACK STATE ===');
    const states = await db.query<{
      zone_id: string;
      zone_name: string;
      current_activity: string;
      interrupted_schedule_id: string | null;
    }>(
      `SELECT p.zone_id, z.name as zone_name, p.current_activity, p.interrupted_schedule_id
       FROM ${TABLES.PLAYBACK_STATE} p
       JOIN ${TABLES.ZONES} z ON p.zone_id = z.id`
    );

    states.forEach(s => {
      console.log(`  ${s.zone_name}: ${s.current_activity}${s.interrupted_schedule_id ? ' (interrupted)' : ''}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSchedules();
