'use client';

import { useEffect, useState, useMemo } from 'react';
import { SpotifyPlaylist } from '@/types';

interface Zone {
  id: string;
  name: string;
  environment_name: string;
}

interface Schedule {
  id: string;
  name: string;
  playlist_uri: string;
  playlist_name: string;
  zone_name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string | null;
  enabled: boolean;
}

interface ScheduleWithDuration extends Schedule {
  duration_ms?: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const CACHE_KEY_SCHEDULES = 'earwicket_schedules';
const CACHE_KEY_PLAYLISTS = 'earwicket_playlists';
const CACHE_KEY_DURATIONS = 'earwicket_durations';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CacheData<T> {
  data: T;
  timestamp: number;
}

function getFromCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const { data, timestamp }: CacheData<T> = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_DURATION) {
      localStorage.removeItem(key);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function setToCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    const cacheData: CacheData<T> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(cacheData));
  } catch (error) {
    console.error('Error setting cache:', error);
  }
}

export default function SchedulesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [schedules, setSchedules] = useState<ScheduleWithDuration[]>([]);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Try to get from cache first
      const cachedSchedules = getFromCache<Schedule[]>(CACHE_KEY_SCHEDULES);
      const cachedPlaylists = getFromCache<SpotifyPlaylist[]>(CACHE_KEY_PLAYLISTS);
      const cachedDurations = getFromCache<Record<string, number>>(CACHE_KEY_DURATIONS);

      if (cachedSchedules && cachedPlaylists && cachedDurations) {
        setSchedules(cachedSchedules.map(s => ({
          ...s,
          duration_ms: cachedDurations[extractPlaylistId(s.playlist_uri)],
        })));
        setPlaylists(cachedPlaylists);
        setDurations(cachedDurations);
        setLoading(false);

        // Fetch fresh data in background
        fetchFreshData();
        return;
      }

      await fetchFreshData();
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const fetchFreshData = async () => {
    const [zonesRes, schedulesRes, playlistsRes] = await Promise.all([
      fetch('/api/zones'),
      fetch('/api/schedules'),
      fetch('/api/spotify/playlists'),
    ]);

    const zonesData = await zonesRes.json();
    const schedulesData = await schedulesRes.json();
    const playlistsData = await playlistsRes.json();

    if (zonesData.success) setZones(zonesData.data);

    if (schedulesData.success) {
      setToCache(CACHE_KEY_SCHEDULES, schedulesData.data);

      // Extract unique playlist IDs
      const playlistIds = [...new Set(
        schedulesData.data.map((s: Schedule) => extractPlaylistId(s.playlist_uri))
      )];

      // Fetch durations
      const durationsRes = await fetch('/api/spotify/playlist-durations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistIds }),
      });

      const durationsData = await durationsRes.json();
      if (durationsData.success) {
        setDurations(durationsData.data);
        setToCache(CACHE_KEY_DURATIONS, durationsData.data);

        setSchedules(schedulesData.data.map((s: Schedule) => ({
          ...s,
          duration_ms: durationsData.data[extractPlaylistId(s.playlist_uri)],
        })));
      } else {
        setSchedules(schedulesData.data);
      }
    }

    if (playlistsData.success) {
      setPlaylists(playlistsData.data);
      setToCache(CACHE_KEY_PLAYLISTS, playlistsData.data);
    }

    setLoading(false);
  };

  const extractPlaylistId = (uri: string): string => {
    return uri.split(':').pop() || uri;
  };

  const formatDuration = (ms: number | undefined): string => {
    if (!ms) return '~';
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day].sort());
    }
  };

  const createSchedule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const selectedPlaylist = playlists.find((p) => p.uri === formData.get('playlist_uri'));

    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone_id: formData.get('zone_id'),
          name: formData.get('name'),
          playlist_uri: formData.get('playlist_uri'),
          playlist_name: selectedPlaylist?.name || '',
          playlist_source: 'spotify',
          days_of_week: selectedDays,
          start_time: formData.get('start_time'),
          end_time: formData.get('end_time') || null,
          enabled: true,
        }),
      });

      if (response.ok) {
        setShowForm(false);
        setSelectedDays([]);
        // Clear cache to force refresh
        localStorage.removeItem(CACHE_KEY_SCHEDULES);
        localStorage.removeItem(CACHE_KEY_DURATIONS);
        fetchData();
      }
    } catch (error) {
      console.error('Error creating schedule:', error);
    }
  };

  const updateSchedule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingSchedule) return;

    const formData = new FormData(e.currentTarget);
    const selectedPlaylist = playlists.find((p) => p.uri === formData.get('playlist_uri'));

    try {
      const response = await fetch(`/api/schedules/${editingSchedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          playlist_uri: formData.get('playlist_uri'),
          playlist_name: selectedPlaylist?.name || editingSchedule.playlist_name,
          days_of_week: selectedDays,
          start_time: formData.get('start_time'),
          end_time: formData.get('end_time') || null,
        }),
      });

      if (response.ok) {
        setEditingSchedule(null);
        setSelectedDays([]);
        localStorage.removeItem(CACHE_KEY_SCHEDULES);
        localStorage.removeItem(CACHE_KEY_DURATIONS);
        fetchData();
      }
    } catch (error) {
      console.error('Error updating schedule:', error);
    }
  };

  const startEditing = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setSelectedDays(schedule.days_of_week);
    setShowForm(false);
    setActiveMenu(null);
  };

  const toggleSchedule = async (id: string, currentEnabled: boolean) => {
    try {
      await fetch(`/api/schedules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      localStorage.removeItem(CACHE_KEY_SCHEDULES);
      fetchData();
      setActiveMenu(null);
    } catch (error) {
      console.error('Error toggling schedule:', error);
    }
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm('Delete this schedule? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/schedules/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        localStorage.removeItem(CACHE_KEY_SCHEDULES);
        localStorage.removeItem(CACHE_KEY_DURATIONS);
        fetchData();
        setActiveMenu(null);
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
    }
  };

  // Grid data structure
  const gridData = useMemo(() => {
    const grid: Record<number, Record<number, ScheduleWithDuration[]>> = {};

    for (let day = 0; day < 7; day++) {
      grid[day] = {};
      for (let hour = 0; hour < 24; hour++) {
        grid[day][hour] = [];
      }
    }

    schedules.forEach(schedule => {
      schedule.days_of_week.forEach(day => {
        const startHour = parseInt(schedule.start_time.split(':')[0]);
        const endHour = schedule.end_time
          ? parseInt(schedule.end_time.split(':')[0])
          : 23;

        for (let hour = startHour; hour <= endHour; hour++) {
          grid[day][hour].push(schedule);
        }
      });
    });

    return grid;
  }, [schedules]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🐰</div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <a href="/admin" className="text-blue-600 hover:underline mb-4 inline-block">
            ← Back to Dashboard
          </a>
          <h1 className="text-4xl font-black bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            Manage Schedules
          </h1>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">📅 Weekly Schedule Grid</h2>
          <button
            onClick={() => {
              setShowForm(!showForm);
              setEditingSchedule(null);
              setSelectedDays([]);
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-500 transition font-semibold"
          >
            + New Schedule
          </button>
        </div>

        {/* Edit Form */}
        {editingSchedule && (
          <form onSubmit={updateSchedule} className="bg-white p-6 rounded-xl shadow-lg mb-6 border-2 border-blue-500">
            <h3 className="text-xl font-bold mb-4">✏️ Edit Schedule</h3>
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Schedule Name</label>
                <input
                  name="name"
                  required
                  defaultValue={editingSchedule.name}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Spotify Playlist</label>
                <select name="playlist_uri" required defaultValue={editingSchedule.playlist_uri} className="w-full px-4 py-2 border rounded-lg">
                  {playlists.map((playlist) => (
                    <option key={playlist.id} value={playlist.uri}>
                      {playlist.name} ({playlist.tracks.total} tracks)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Days of Week</label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map((day, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => toggleDay(index)}
                      className={`px-4 py-2 rounded-lg font-semibold transition ${
                        selectedDays.includes(index)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Start Time</label>
                  <input
                    name="start_time"
                    type="time"
                    required
                    defaultValue={editingSchedule.start_time}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">End Time (Optional)</label>
                  <input
                    name="end_time"
                    type="time"
                    defaultValue={editingSchedule.end_time || ''}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingSchedule(null);
                    setSelectedDays([]);
                  }}
                  className="px-4 py-2 bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}

        {showForm && (
          <form onSubmit={createSchedule} className="bg-white p-6 rounded-xl shadow-lg mb-6">
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Schedule Name</label>
                <input
                  name="name"
                  required
                  placeholder="e.g., Morning Jazz, Dinner Music"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Zone</label>
                <select name="zone_id" required className="w-full px-4 py-2 border rounded-lg">
                  <option value="">Select zone...</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.environment_name} - {zone.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Spotify Playlist</label>
                <select name="playlist_uri" required className="w-full px-4 py-2 border rounded-lg">
                  <option value="">Select playlist...</option>
                  {playlists.map((playlist) => (
                    <option key={playlist.id} value={playlist.uri}>
                      {playlist.name} ({playlist.tracks.total} tracks)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Days of Week</label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map((day, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => toggleDay(index)}
                      className={`px-4 py-2 rounded-lg font-semibold transition ${
                        selectedDays.includes(index)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Start Time</label>
                  <input
                    name="start_time"
                    type="time"
                    required
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">End Time (Optional)</label>
                  <input
                    name="end_time"
                    type="time"
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg">
                  Create Schedule
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setSelectedDays([]);
                  }}
                  className="px-4 py-2 bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Weekly Grid View */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
                    <th className="sticky left-0 bg-purple-600 px-4 py-3 text-left font-bold z-10">Time</th>
                    {DAYS.map(day => (
                      <th key={day} className="px-4 py-3 text-center font-bold min-w-[140px]">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map(hour => (
                    <tr key={hour} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="sticky left-0 bg-white px-4 py-2 font-semibold text-gray-700 border-r border-gray-200 z-10">
                        {hour.toString().padStart(2, '0')}:00
                      </td>
                      {DAYS.map((_, dayIndex) => (
                        <td key={dayIndex} className="px-2 py-2 align-top border-r border-gray-100">
                          <div className="space-y-1">
                            {gridData[dayIndex]?.[hour]?.map(schedule => (
                              <div
                                key={schedule.id}
                                className={`relative text-xs p-2 rounded-lg shadow-sm ${
                                  schedule.enabled
                                    ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                                    : 'bg-gray-300 text-gray-600'
                                }`}
                              >
                                <div className="font-semibold truncate" title={schedule.playlist_name}>
                                  {schedule.playlist_name}
                                </div>
                                <div className="text-[10px] opacity-90">
                                  {formatDuration(schedule.duration_ms)}
                                </div>

                                {/* Actions Menu */}
                                <div className="absolute top-1 right-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenu(activeMenu === schedule.id ? null : schedule.id);
                                    }}
                                    className="text-white hover:bg-white/20 rounded px-1"
                                  >
                                    ⋮
                                  </button>

                                  {activeMenu === schedule.id && (
                                    <div className="absolute top-6 right-0 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20 min-w-[120px]">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          startEditing(schedule);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600"
                                      >
                                        ✏️ Edit
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleSchedule(schedule.id, schedule.enabled);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-yellow-50 hover:text-yellow-600"
                                      >
                                        {schedule.enabled ? '⏸️ Disable' : '▶️ Enable'}
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteSchedule(schedule.id);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                      >
                                        🗑️ Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {schedules.length === 0 && (
          <div className="text-center py-12 text-gray-500 mt-6">
            <div className="text-4xl mb-4">📅</div>
            <p>No schedules yet. Create your first schedule!</p>
          </div>
        )}
      </div>

      {/* Click outside to close menu */}
      {activeMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setActiveMenu(null)}
        />
      )}
    </main>
  );
}
