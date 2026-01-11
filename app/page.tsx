'use client';

import { useState, useEffect } from 'react';
import { SpotifyTrack } from '@/types';

interface Zone {
  id: string;
  name: string;
  environment_name: string;
  sonos_group_id?: string;
}

interface NowPlaying {
  zone: string;
  activity: string;
  schedule: { name: string; playlist_name: string } | null;
  playbackStatus: any;
  metadata: any; // Sonos playback metadata
  queue: Array<{ id: string; track_name: string; artist_name: string; requested_by: string | null; status: string }>;
}

export default function Home() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [isLoadingZoneChange, setIsLoadingZoneChange] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false); // TODO: Implement real auth check
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Song Request Modal State
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestedBy, setRequestedBy] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Volume Control State
  const [currentVolume, setCurrentVolume] = useState<number>(5); // UI scale 0-10
  const [isVolumeLoading, setIsVolumeLoading] = useState(false);

  useEffect(() => {
    // Fetch zones
    fetch('/api/zones/public')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data.length > 0) {
          setZones(data.data);

          // Try to restore last viewed zone from localStorage
          const savedZoneId = localStorage.getItem('selectedZone');
          const savedZoneExists = savedZoneId && data.data.some((z: Zone) => z.id === savedZoneId);

          // Use saved zone if it exists, otherwise use first zone
          setSelectedZone(savedZoneExists ? savedZoneId : data.data[0].id);
        }
      });
  }, []);

  // Save selected zone to localStorage whenever it changes
  useEffect(() => {
    if (selectedZone) {
      localStorage.setItem('selectedZone', selectedZone);
    }
  }, [selectedZone]);

  useEffect(() => {
    if (!selectedZone) return;

    // Create AbortController for this zone to cancel stale requests
    const abortController = new AbortController();
    setIsLoadingZoneChange(true);

    // Fetch now playing info
    const fetchNowPlaying = () => {
      fetch(`/api/now-playing?zone_id=${selectedZone}`, {
        cache: 'no-store', // Prevent browser caching
        headers: {
          'Cache-Control': 'no-cache',
        },
        signal: abortController.signal,
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setNowPlaying(data.data);
            setIsLoadingZoneChange(false);
          }
        })
        .catch((err) => {
          if (err.name === 'AbortError') return; // Ignore cancelled requests
          console.error('Error fetching now playing:', err);
          setIsLoadingZoneChange(false);
        });
    };

    fetchNowPlaying();
    // Refresh every 3 seconds for more real-time updates
    const interval = setInterval(fetchNowPlaying, 3000);
    return () => {
      clearInterval(interval);
      abortController.abort();
    };
  }, [selectedZone]);

  // Fetch volume when zone changes
  useEffect(() => {
    if (!selectedZone) return;

    const fetchVolume = async () => {
      try {
        const response = await fetch(`/api/playback/volume?zone_id=${selectedZone}`);
        const data = await response.json();

        if (data.success) {
          setCurrentVolume(data.data.volumeUI);
        }
      } catch (error) {
        console.error('Failed to fetch volume:', error);
      }
    };

    fetchVolume();
  }, [selectedZone]);

  // Song Request Modal Handlers
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();

      if (data.success) {
        setSearchResults(data.data);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Search failed' });
    } finally {
      setSearching(false);
    }
  };

  const requestSong = async (track: SpotifyTrack) => {
    if (!selectedZone) {
      setMessage({ type: 'error', text: 'Please select a zone from the menu' });
      return;
    }

    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone_id: selectedZone,
          track_uri: track.uri,
          track_name: track.name,
          artist_name: track.artists.map((a) => a.name).join(', '),
          requested_by: requestedBy || null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({
          type: 'success',
          text: `"${track.name}" added to queue!`,
        });
        // Close modal immediately after successful request
        setTimeout(() => {
          setIsRequestModalOpen(false);
          setSearchResults([]);
          setSearchQuery('');
          setMessage(null);
        }, 1500);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add song' });
    }
  };

  // Volume control handlers
  const handleVolumeChange = async (volumeUI: number) => {
    const zone = zones.find(z => z.id === selectedZone);
    if (!zone) return;

    // Optimistic update
    setCurrentVolume(volumeUI);
    setIsVolumeLoading(true);

    try {
      const response = await fetch('/api/playback/volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone_id: selectedZone,
          volumeUI: volumeUI
        }),
      });

      const data = await response.json();

      if (!data.success) {
        // Revert on error
        console.error('Volume change failed:', data.error);
        // Re-fetch current volume
        const currentResponse = await fetch(`/api/playback/volume?zone_id=${selectedZone}`);
        const currentData = await currentResponse.json();
        if (currentData.success) {
          setCurrentVolume(currentData.data.volumeUI);
        }
      }
    } catch (error) {
      console.error('Volume change error:', error);
    } finally {
      setIsVolumeLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Top-right Menu */}
        <div className="fixed top-6 right-6 z-50">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="bg-white/90 backdrop-blur-sm p-4 rounded-2xl shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-6 h-6 text-gray-700"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"}
              />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {isMenuOpen && (
            <div className="absolute top-20 right-0 w-80 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
              {/* Zone Selector */}
              {zones.length > 0 && (
                <div className="p-4 border-b border-gray-200">
                  <label className="block text-sm font-bold mb-2 text-gray-700">🏠 Select Zone</label>
                  <select
                    value={selectedZone}
                    onChange={(e) => setSelectedZone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border-2 border-purple-200 rounded-xl font-semibold focus:border-purple-500 focus:outline-none"
                  >
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.environment_name} - {zone.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Admin Section */}
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-sm font-bold mb-3 text-gray-700">⚙️ Administration</h3>
                <a
                  href="/admin"
                  className="block w-full px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-semibold transition-all duration-200 text-center"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Admin Dashboard
                </a>
              </div>

              {/* Setup Section */}
              <div className="p-4">
                <h3 className="text-sm font-bold mb-3 text-gray-700">🔗 Setup & Authorization</h3>
                <div className="space-y-2">
                  <a
                    href="/api/sonos/auth"
                    className="block w-full px-4 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-semibold text-center"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    🔊 Connect Sonos
                  </a>
                  <a
                    href="/api/spotify/auth"
                    className="block w-full px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-500 transition-all font-semibold text-center"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    🎵 Connect Spotify
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Logo/Header */}
        <div className="text-center mb-12 animate-fade-in">
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

        {/* Now Playing & Full Queue */}
        {nowPlaying && (
          <div className="mb-12">
            <div className="bg-white/90 backdrop-blur-sm p-8 rounded-2xl shadow-lg border border-gray-100 relative">
              {/* Loading overlay during zone transitions */}
              {isLoadingZoneChange && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-sm rounded-2xl flex items-center justify-center z-10">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mb-2"></div>
                    <p className="text-sm text-gray-600 font-semibold">Loading zone...</p>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold flex items-center gap-2">
                  <span>🎵</span>
                  <span>Now Playing</span>
                </h2>
                {/* Admin Controls - Always show for now */}
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      const zone = zones.find(z => z.id === selectedZone);
                      if (!zone) return;

                      try {
                        const response = await fetch('/api/playback/skip', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ group_id: zone.sonos_group_id }),
                        });

                        if (response.ok) {
                          // Refresh immediately
                          setTimeout(() => window.location.reload(), 500);
                        }
                      } catch (error) {
                        console.error('Skip failed:', error);
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition font-semibold shadow-lg"
                  >
                    ⏭️ Skip
                  </button>
                  {nowPlaying.playbackStatus?.playbackState === 'PLAYBACK_STATE_PLAYING' ? (
                    <button
                      onClick={async () => {
                        const zone = zones.find(z => z.id === selectedZone);
                        if (!zone) return;

                        await fetch('/api/playback/pause', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ group_id: zone.sonos_group_id }),
                        });
                      }}
                      className="px-4 py-2 bg-gray-600 text-white rounded-xl hover:bg-gray-500 transition font-semibold shadow-lg"
                    >
                      ⏸️ Pause
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        const zone = zones.find(z => z.id === selectedZone);
                        if (!zone) return;

                        await fetch('/api/playback/play', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ group_id: zone.sonos_group_id }),
                        });
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-500 transition font-semibold shadow-lg"
                    >
                      ▶️ Play
                    </button>
                  )}

                  {/* Volume Control - Elevator Style */}
                  <div className="flex items-center gap-6 ml-6 pl-6 border-l-2 border-gray-200">
                    {/* Elevator-Style Volume Buttons */}
                    <div className="flex flex-col gap-1.5">
                      <div className="text-xs font-bold text-gray-500 mb-1 text-center">
                        Volume: {currentVolume}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((level) => (
                          <button
                            key={level}
                            onClick={() => handleVolumeChange(level)}
                            disabled={isVolumeLoading}
                            className={`
                              w-12 h-10 rounded-lg font-bold text-sm
                              transition-all duration-200 shadow-md hover:shadow-lg
                              disabled:opacity-50 disabled:cursor-not-allowed
                              ${
                                currentVolume === level
                                  ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white scale-105 shadow-xl'
                                  : 'bg-white text-gray-700 hover:bg-gradient-to-br hover:from-purple-100 hover:to-pink-100 hover:scale-105'
                              }
                            `}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {nowPlaying.metadata?.currentItem ? (
                <div>
                  {/* Current Track - Big Display */}
                  <div className="flex gap-6 mb-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-purple-200">
                    {nowPlaying.metadata.currentItem.track?.imageUrl && (
                      <img
                        key={nowPlaying.metadata.currentItem.track.imageUrl}
                        src={nowPlaying.metadata.currentItem.track.imageUrl}
                        alt="Album art"
                        className="w-32 h-32 object-cover rounded-lg shadow-lg"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="128"%3E%3Crect fill="%23ddd" width="128" height="128"/%3E%3C/svg%3E';
                        }}
                      />
                    )}
                    <div className="flex-1">
                      <p className="text-2xl font-black bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-1">
                        {nowPlaying.metadata.currentItem.track?.name ||
                         nowPlaying.metadata.container?.name ||
                         'Loading...'}
                      </p>
                      <p className="text-xl text-gray-700 mb-1">
                        {nowPlaying.metadata.currentItem.track?.artist?.name ||
                         'Loading artist...'}
                      </p>
                      <p className="text-sm text-gray-500 mb-2">
                        {nowPlaying.metadata.currentItem.track?.album?.name || ''}
                      </p>
                      {/* Debug - show what we're getting */}
                      {(!nowPlaying.metadata.currentItem.track?.name) && (
                        <details className="text-xs text-gray-400 mt-2">
                          <summary className="cursor-pointer hover:text-gray-600">Debug metadata</summary>
                          <pre className="text-xs overflow-auto max-h-32 mt-1 p-2 bg-gray-100 rounded">
                            {JSON.stringify(nowPlaying.metadata?.currentItem, null, 2)}
                          </pre>
                        </details>
                      )}

                      {nowPlaying.metadata.container && (
                        <div className="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                          📀 {nowPlaying.metadata.container.name}
                        </div>
                      )}

                      {nowPlaying.playbackStatus?.playbackState === 'PLAYBACK_STATE_PLAYING' && (
                        <div className="mt-2 flex items-center gap-2 text-green-600">
                          <div className="w-3 h-3 bg-green-600 rounded-full animate-pulse"></div>
                          <span className="font-semibold">Playing Now</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Combined Queue - Shows visitor requests first, then playlist */}
                  <div>
                    <h3 className="text-xl font-bold mb-3">📋 Up Next</h3>
                    <div className="space-y-2">
                      {/* Visitor Requests */}
                      {nowPlaying.queue.map((song, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg border-2 border-pink-200"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <div className="text-lg font-bold text-pink-600">#{idx + 1}</div>
                            <div className="flex-1">
                              <p className="font-bold text-purple-900">{song.track_name}</p>
                              <p className="text-sm text-gray-600">{song.artist_name}</p>
                              {song.requested_by && (
                                <p className="text-xs text-pink-600 font-semibold">🎤 Requested by {song.requested_by}</p>
                              )}
                            </div>
                          </div>
                          {/* Admin only - TODO: Add auth check */}
                          <button
                            onClick={async () => {
                              if (confirm('Remove this song?')) {
                                await fetch(`/api/requests/${song.id}`, { method: 'DELETE' });
                              }
                            }}
                            className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-500 transition text-sm font-semibold"
                          >
                            🗑️
                          </button>
                        </div>
                      ))}

                      {/* Playlist Next Track */}
                      {nowPlaying.metadata.nextItem?.track && nowPlaying.queue.length === 0 && (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          <div className="text-lg font-bold text-gray-400">#{1}</div>
                          <div className="flex-1">
                            <p className="font-bold">{nowPlaying.metadata.nextItem.track.name}</p>
                            <p className="text-sm text-gray-600">{nowPlaying.metadata.nextItem.track.artist?.name}</p>
                            <p className="text-xs text-gray-400">From playlist</p>
                          </div>
                        </div>
                      )}

                      {nowPlaying.queue.length === 0 && !nowPlaying.metadata.nextItem?.track && (
                        <div className="text-center py-4 text-gray-400">
                          <p className="text-sm">No upcoming tracks</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">😴</div>
                  <p className="text-lg font-bold text-gray-400">Nothing Playing</p>
                  <p className="text-sm text-gray-500 mt-2">No active playback</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Request a Song - Prominent CTA */}
        <div className="max-w-2xl mx-auto mb-12">
          <button
            onClick={() => setIsRequestModalOpen(true)}
            className="group relative overflow-hidden bg-gradient-to-br from-green-500 to-emerald-600 text-white p-12 rounded-3xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-2 transition-all duration-300 block text-center w-full"
          >
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
            <div className="text-7xl mb-4">🎤</div>
            <h2 className="text-4xl font-black mb-3">Request a Song</h2>
            <p className="text-green-100 text-lg font-medium">Search for your favorite track and add it to the queue</p>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 text-sm text-gray-400">
          <p>Named after the March Hare&apos;s full name: Earwicket</p>
        </div>
      </div>

      {/* Song Request Modal */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-gradient-to-r from-pink-50 via-purple-50 to-blue-50 p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-black bg-gradient-to-r from-pink-600 via-purple-600 to-blue-600 bg-clip-text text-transparent">
                  🎤 Request a Song
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Playing to: <span className="font-bold">{zones.find(z => z.id === selectedZone)?.name || 'Select a zone'}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setIsRequestModalOpen(false);
                  setSearchResults([]);
                  setSearchQuery('');
                  setMessage(null);
                }}
                className="text-gray-500 hover:text-gray-700 transition"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-8 h-8"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {/* Message Alert */}
              {message && (
                <div
                  className={`mb-6 p-4 rounded-xl font-semibold ${
                    message.type === 'success'
                      ? 'bg-green-100 text-green-800 border-2 border-green-300'
                      : 'bg-red-100 text-red-800 border-2 border-red-300'
                  }`}
                >
                  {message.text}
                </div>
              )}

              {/* Your Name (Optional) */}
              <div className="mb-6">
                <label className="block text-sm font-bold mb-2 text-gray-700">👤 Your Name (Optional)</label>
                <input
                  type="text"
                  value={requestedBy}
                  onChange={(e) => setRequestedBy(e.target.value)}
                  placeholder="Let us know who requested this!"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
                />
              </div>

              {/* Search */}
              <form onSubmit={handleSearch} className="mb-6">
                <label className="block text-sm font-bold mb-2 text-gray-700">🔍 Search for a Song</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Song name, artist, or album..."
                    className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={searching || !searchQuery.trim()}
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed font-bold transition-all duration-300 shadow-lg hover:shadow-xl"
                  >
                    {searching ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </form>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-3">
                  {searchResults.map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center justify-between p-4 bg-gradient-to-r from-white to-purple-50 rounded-xl border-2 border-purple-100 hover:border-purple-300 transition-all group"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        {track.album.images[0] && (
                          <img
                            src={track.album.images[0].url}
                            alt={track.album.name}
                            className="w-16 h-16 rounded-lg shadow-md"
                          />
                        )}
                        <div className="flex-1">
                          <h3 className="font-bold text-lg group-hover:text-purple-600 transition">
                            {track.name}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {track.artists.map((a) => a.name).join(', ')}
                          </p>
                          <p className="text-xs text-gray-400">{track.album.name}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => requestSong(track)}
                        className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-500 hover:to-emerald-500 font-bold transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                      >
                        + Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
