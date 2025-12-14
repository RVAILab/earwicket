'use client';

import { useState, useEffect } from 'react';
import { SpotifyTrack } from '@/types';

interface Zone {
  id: string;
  name: string;
  environment_name: string;
}

interface QueuedSong {
  track_name: string;
  artist_name: string;
  requested_by: string | null;
}

export default function VisitorPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [queue, setQueue] = useState<QueuedSong[]>([]);
  const [requestedBy, setRequestedBy] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rateLimitRemaining, setRateLimitRemaining] = useState<number | null>(null);

  useEffect(() => {
    // Fetch available zones
    fetch('/api/zones/public')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setZones(data.data);
          if (data.data.length > 0) {
            setSelectedZone(data.data[0].id);
          }
        }
      });
  }, []);

  useEffect(() => {
    // Fetch queue when zone changes
    if (selectedZone) {
      fetchQueue();
    }
  }, [selectedZone]);

  const fetchQueue = async () => {
    if (!selectedZone) return;

    try {
      const response = await fetch(`/api/requests?zone_id=${selectedZone}`);
      const data = await response.json();
      if (data.success) {
        setQueue(data.data);
      }
    } catch (error) {
      console.error('Error fetching queue:', error);
    }
  };

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
      setMessage({ type: 'error', text: 'Please select a zone' });
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
          text: `"${track.name}" added to queue! ${data.rateLimit.remaining} requests remaining.`,
        });
        setRateLimitRemaining(data.rateLimit.remaining);
        setSearchResults([]);
        setSearchQuery('');
        fetchQueue();
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add song' });
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🎤✨</div>
          <h1 className="text-5xl font-black bg-gradient-to-r from-pink-600 via-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
            Request a Song
          </h1>
          <p className="text-lg text-gray-600">
            Search and add your favorite tracks to the queue
          </p>
        </div>

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

        {/* Zone Selector */}
        <div className="bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-lg mb-6">
          <label className="block text-sm font-bold mb-3 text-gray-700">🏠 Select Zone</label>
          <select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl font-semibold text-lg focus:border-purple-500 focus:outline-none"
          >
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.environment_name} - {zone.name}
              </option>
            ))}
          </select>
        </div>

        {/* Your Name (Optional) */}
        <div className="bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-lg mb-6">
          <label className="block text-sm font-bold mb-3 text-gray-700">👤 Your Name (Optional)</label>
          <input
            type="text"
            value={requestedBy}
            onChange={(e) => setRequestedBy(e.target.value)}
            placeholder="Let us know who requested this!"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
          />
        </div>

        {/* Search */}
        <div className="bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-lg mb-6">
          <form onSubmit={handleSearch} className="mb-4">
            <label className="block text-sm font-bold mb-3 text-gray-700">🔍 Search for a Song</label>
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
            <div className="space-y-3 max-h-96 overflow-y-auto">
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
                    + Add to Queue
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Current Queue */}
        {queue.length > 0 && (
          <div className="bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-lg">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>🎵</span>
              <span>Up Next</span>
              <span className="text-sm font-normal text-gray-500">({queue.length} songs)</span>
            </h2>
            <div className="space-y-2">
              {queue.map((song, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg"
                >
                  <div className="text-2xl font-bold text-purple-400">#{idx + 1}</div>
                  <div className="flex-1">
                    <p className="font-bold">{song.track_name}</p>
                    <p className="text-sm text-gray-600">{song.artist_name}</p>
                    {song.requested_by && (
                      <p className="text-xs text-gray-400">Requested by {song.requested_by}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rate Limit Info */}
        {rateLimitRemaining !== null && (
          <div className="mt-6 text-center text-sm text-gray-500">
            You can request {rateLimitRemaining} more songs in the next 5 minutes
          </div>
        )}

        {/* Back Link */}
        <div className="mt-8 text-center">
          <a href="/" className="text-purple-600 hover:underline font-semibold">
            ← Back to Home
          </a>
        </div>
      </div>
    </main>
  );
}
