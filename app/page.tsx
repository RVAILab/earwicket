'use client';

import { useState, useEffect } from 'react';

interface Zone {
  id: string;
  name: string;
  environment_name: string;
}

interface NowPlaying {
  zone: string;
  activity: string;
  schedule: { name: string; playlist_name: string } | null;
  playbackStatus: any;
  queue: Array<{ track_name: string; artist_name: string; requested_by: string | null; status: string }>;
}

export default function Home() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);

  useEffect(() => {
    // Fetch zones
    fetch('/api/zones/public')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data.length > 0) {
          setZones(data.data);
          setSelectedZone(data.data[0].id);
        }
      });
  }, []);

  useEffect(() => {
    if (!selectedZone) return;

    // Fetch now playing info
    const fetchNowPlaying = () => {
      fetch(`/api/now-playing?zone_id=${selectedZone}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setNowPlaying(data.data);
          }
        })
        .catch((err) => console.error('Error fetching now playing:', err));
    };

    fetchNowPlaying();
    // Refresh every 10 seconds
    const interval = setInterval(fetchNowPlaying, 10000);
    return () => clearInterval(interval);
  }, [selectedZone]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Logo/Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-block mb-4">
            <div className="text-6xl mb-2">🐰🎵</div>
          </div>
          <h1 className="text-6xl font-black mb-3 bg-gradient-to-r from-purple-600 via-blue-600 to-pink-600 bg-clip-text text-transparent">
            Earwicket
          </h1>
          <p className="text-xl text-gray-600 font-medium">
            Your magical Sonos control companion
          </p>
        </div>

        {/* Zone Selector */}
        {zones.length > 0 && (
          <div className="mb-8 max-w-md mx-auto">
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm border-2 border-purple-200 rounded-xl font-semibold text-center focus:border-purple-500 focus:outline-none shadow-lg"
            >
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.environment_name} - {zone.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Now Playing & Queue */}
        {nowPlaying && (
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {/* Now Playing */}
            <div className="bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-100">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <span>🎵</span>
                <span>Now Playing</span>
              </h2>

              {nowPlaying.activity === 'scheduled' && nowPlaying.schedule ? (
                <div>
                  <div className="mb-4">
                    <p className="text-sm text-gray-500 uppercase tracking-wide">Schedule</p>
                    <p className="text-lg font-bold">{nowPlaying.schedule.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 uppercase tracking-wide">Playlist</p>
                    <p className="text-xl font-black bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                      {nowPlaying.schedule.playlist_name}
                    </p>
                  </div>
                  {nowPlaying.playbackStatus?.playbackState === 'PLAYBACK_STATE_PLAYING' && (
                    <div className="mt-4 flex items-center gap-2 text-green-600">
                      <div className="w-3 h-3 bg-green-600 rounded-full animate-pulse"></div>
                      <span className="font-semibold">Playing</span>
                    </div>
                  )}
                </div>
              ) : nowPlaying.activity === 'visitor_request' ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">🎤</div>
                  <p className="text-lg font-bold text-purple-600">Visitor Requests Playing</p>
                  <p className="text-sm text-gray-600 mt-2">Check the queue →</p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">😴</div>
                  <p className="text-lg font-bold text-gray-400">Nothing Playing</p>
                  <p className="text-sm text-gray-500 mt-2">No active schedule right now</p>
                </div>
              )}
            </div>

            {/* Request Queue */}
            <div className="bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-100">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <span>📋</span>
                <span>Request Queue</span>
                {nowPlaying.queue.length > 0 && (
                  <span className="text-sm font-normal text-gray-500">({nowPlaying.queue.length})</span>
                )}
              </h2>

              {nowPlaying.queue.length > 0 ? (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {nowPlaying.queue.map((song, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg ${
                        song.status === 'playing'
                          ? 'bg-gradient-to-r from-green-100 to-emerald-100 border-2 border-green-300'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`font-bold ${song.status === 'playing' ? 'text-green-600' : 'text-gray-400'}`}>
                          {song.status === 'playing' ? '▶' : `#${idx + 1}`}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold">{song.track_name}</p>
                          <p className="text-sm text-gray-600">{song.artist_name}</p>
                          {song.requested_by && (
                            <p className="text-xs text-gray-400 mt-1">by {song.requested_by}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">✨</div>
                  <p className="text-gray-400">No songs in queue</p>
                  <p className="text-sm text-gray-500 mt-2">Be the first to request!</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-12 max-w-3xl mx-auto">
          <a
            href="/admin"
            className="group relative overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 text-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300"
          >
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
            <div className="text-4xl mb-3">⚙️</div>
            <h2 className="text-2xl font-bold mb-2">Admin Dashboard</h2>
            <p className="text-blue-100 text-sm">Manage schedules, zones & playlists</p>
          </a>

          <a
            href="/visitor"
            className="group relative overflow-hidden bg-gradient-to-br from-green-500 to-emerald-600 text-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300"
          >
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
            <div className="text-4xl mb-3">🎤</div>
            <h2 className="text-2xl font-bold mb-2">Request a Song</h2>
            <p className="text-green-100 text-sm">Add your favorite track to the queue</p>
          </a>
        </div>

        {/* Setup Section */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-gray-100">
          <h3 className="text-2xl font-bold mb-6 text-gray-800">
            🔗 Setup & Authorization
          </h3>
          <div className="flex gap-4 justify-center flex-wrap mb-4">
            <a
              href="/api/sonos/auth"
              className="group px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all duration-300 font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center gap-2"
            >
              <span className="text-xl">🔊</span>
              <span>Connect Sonos</span>
            </a>
            <a
              href="/api/spotify/auth"
              className="group px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-500 transition-all duration-300 font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center gap-2"
            >
              <span className="text-xl">🎵</span>
              <span>Connect Spotify</span>
            </a>
          </div>
          <p className="text-sm text-gray-500">
            First time here? Click these to connect your accounts
          </p>
        </div>

        {/* Footer */}
        <div className="mt-8 text-sm text-gray-400">
          <p>Named after the March Hare&apos;s full name: Earwicket</p>
        </div>
      </div>
    </main>
  )
}
