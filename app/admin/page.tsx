'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AdminPage() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Check for OAuth success/error messages
    if (searchParams.get('sonos_auth') === 'success') {
      setMessage({ type: 'success', text: 'Sonos authorized successfully!' });
    } else if (searchParams.get('spotify_auth') === 'success') {
      setMessage({ type: 'success', text: 'Spotify authorized successfully!' });
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
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Earwicket Control Panel</p>
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
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Sonos Integration</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <p className="font-medium">
                  {searchParams.get('sonos_auth') === 'success' ? (
                    <span className="text-green-600">✓ Connected</span>
                  ) : (
                    <span className="text-gray-400">Not connected</span>
                  )}
                </p>
              </div>
              <a
                href="/api/sonos/auth"
                className="inline-block px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900 transition text-sm"
              >
                Authorize Sonos
              </a>
            </div>
          </div>

          {/* Spotify Status */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Spotify Integration</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <p className="font-medium">
                  {searchParams.get('spotify_auth') === 'success' ? (
                    <span className="text-green-600">✓ Connected</span>
                  ) : (
                    <span className="text-gray-400">Not connected</span>
                  )}
                </p>
              </div>
              <a
                href="/api/spotify/auth"
                className="inline-block px-4 py-2 bg-green-800 text-white rounded hover:bg-green-900 transition text-sm"
              >
                Authorize Spotify
              </a>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <button
              disabled
              className="px-4 py-3 bg-gray-100 text-gray-400 rounded cursor-not-allowed"
            >
              Manage Zones (Coming Soon)
            </button>
            <button
              disabled
              className="px-4 py-3 bg-gray-100 text-gray-400 rounded cursor-not-allowed"
            >
              Create Schedule (Coming Soon)
            </button>
            <button
              disabled
              className="px-4 py-3 bg-gray-100 text-gray-400 rounded cursor-not-allowed"
            >
              View Requests (Coming Soon)
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
