'use client';

import { useEffect, useState } from 'react';
import { SpotifyPlaylist } from '@/types';

interface Zone {
  id: string;
  name: string;
  environment_name: string;
}

interface Schedule {
  id: string;
  name: string;
  playlist_name: string;
  zone_name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string | null;
  enabled: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SchedulesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [zonesRes, schedulesRes, playlistsRes] = await Promise.all([
        fetch('/api/zones'),
        fetch('/api/schedules'),
        fetch('/api/spotify/playlists'),
      ]);

      const zonesData = await zonesRes.json();
      const schedulesData = await schedulesRes.json();
      const playlistsData = await playlistsRes.json();

      if (zonesData.success) setZones(zonesData.data);
      if (schedulesData.success) setSchedules(schedulesData.data);
      if (playlistsData.success) setPlaylists(playlistsData.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
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
  };

  const toggleSchedule = async (id: string, currentEnabled: boolean) => {
    try {
      await fetch(`/api/schedules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      fetchData();
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
        fetchData();
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
    }
  };

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
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <a href="/admin" className="text-blue-600 hover:underline mb-4 inline-block">
            ← Back to Dashboard
          </a>
          <h1 className="text-4xl font-black bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            Manage Schedules
          </h1>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">📅 Playlist Schedules</h2>
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

        {/* Schedules List */}
        <div className="space-y-4">
          {schedules.map((schedule) => (
            <div
              key={schedule.id}
              className="bg-white p-6 rounded-xl shadow-lg flex justify-between items-start"
            >
              <div className="flex-1">
                <h3 className="font-bold text-lg">{schedule.name}</h3>
                <p className="text-sm text-gray-600">
                  🎵 {schedule.playlist_name}
                </p>
                <p className="text-sm text-gray-600">
                  📍 {schedule.zone_name}
                </p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {schedule.days_of_week.map((day) => (
                    <span key={day} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                      {DAYS[day]}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  ⏰ {schedule.start_time.substring(0, 5)}
                  {schedule.end_time && ` - ${schedule.end_time.substring(0, 5)}`}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => toggleSchedule(schedule.id, schedule.enabled)}
                  className={`px-4 py-2 rounded-lg font-semibold transition ${
                    schedule.enabled
                      ? 'bg-green-600 text-white hover:bg-green-500'
                      : 'bg-gray-300 text-gray-600 hover:bg-gray-400'
                  }`}
                >
                  {schedule.enabled ? 'Enabled' : 'Disabled'}
                </button>
                <button
                  onClick={() => startEditing(schedule)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition font-semibold"
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => deleteSchedule(schedule.id)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition font-semibold"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {schedules.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-4">📅</div>
            <p>No schedules yet. Create your first schedule!</p>
          </div>
        )}
      </div>
    </main>
  );
}
