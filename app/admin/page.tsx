'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

interface AuthStatus {
  sonos: { connected: boolean; expired: boolean };
  spotify: { connected: boolean; expired: boolean };
}

function AdminContent() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch actual auth status from database
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/status');
        const result = await response.json();
        if (result.success) {
          setAuthStatus(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  useEffect(() => {
    // Check for OAuth success/error messages
    if (searchParams.get('sonos_auth') === 'success') {
      setMessage({ type: 'success', text: 'Sonos authorized successfully!' });
      // Refresh status after successful auth
      setTimeout(() => window.location.href = '/admin', 2000);
    } else if (searchParams.get('spotify_auth') === 'success') {
      setMessage({ type: 'success', text: 'Spotify authorized successfully!' });
      // Refresh status after successful auth
      setTimeout(() => window.location.href = '/admin', 2000);
    } else if (searchParams.get('error')) {
      const error = searchParams.get('error');
      const details = searchParams.get('details');
      setMessage({
        type: 'error',
        text: `Error: ${error}${details ? ` - ${details}` : ''}`,
      });
    }
  }, [searchParams]);

  return (
    <main className="min-h-screen p-8 bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 text-center">
          <div className="text-4xl mb-2">⚙️</div>
          <h1 className="text-4xl font-black bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
            Admin Dashboard
          </h1>
          <p className="text-gray-600 font-medium">Earwicket Control Panel</p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-100 text-green-800 border border-green-300'
                : 'bg-red-100 text-red-800 border border-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          {/* Sonos Status */}
          <div className="bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">🔊</span>
              <h2 className="text-xl font-bold">Sonos Integration</h2>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <p className="font-medium">
                  {loading ? (
                    <span className="text-gray-400">Checking...</span>
                  ) : authStatus?.sonos.connected ? (
                    authStatus.sonos.expired ? (
                      <span className="text-yellow-600">⚠️ Token expired</span>
                    ) : (
                      <span className="text-green-600">✓ Connected</span>
                    )
                  ) : (
                    <span className="text-gray-400">Not connected</span>
                  )}
                </p>
              </div>
              <a
                href="/api/sonos/auth"
                className="inline-block px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all duration-300 text-sm font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                Re-authorize Sonos
              </a>
            </div>
          </div>

          {/* Spotify Status */}
          <div className="bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">🎵</span>
              <h2 className="text-xl font-bold">Spotify Integration</h2>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <p className="font-medium">
                  {loading ? (
                    <span className="text-gray-400">Checking...</span>
                  ) : authStatus?.spotify.connected ? (
                    authStatus.spotify.expired ? (
                      <span className="text-yellow-600">⚠️ Token expired</span>
                    ) : (
                      <span className="text-green-600">✓ Connected</span>
                    )
                  ) : (
                    <span className="text-gray-400">Not connected</span>
                  )}
                </p>
              </div>
              <a
                href="/api/spotify/auth"
                className="inline-block px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-500 transition-all duration-300 text-sm font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                Authorize Spotify
              </a>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-100">
          <h2 className="text-xl font-bold mb-4">🚀 Quick Actions</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <a
              href="/admin/zones"
              className="px-4 py-3 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-semibold text-center transform hover:-translate-y-0.5"
            >
              🏠 Manage Zones
            </a>
            <a
              href="/admin/schedules"
              className="px-4 py-3 bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-semibold text-center transform hover:-translate-y-0.5"
            >
              📅 Manage Schedules
            </a>
            <button
              disabled
              className="px-4 py-3 bg-gray-100 text-gray-400 rounded-xl cursor-not-allowed font-medium"
            >
              🎵 View Requests (Phase 3)
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <a href="/" className="text-blue-600 hover:underline">
            ← Back to Home
          </a>
        </div>
      </div>
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🐰</div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <AdminContent />
    </Suspense>
  );
}
