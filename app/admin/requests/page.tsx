'use client';

import { useEffect, useState } from 'react';

interface Zone {
  id: string;
  name: string;
  environment_name: string;
}

interface Request {
  id: string;
  track_name: string;
  artist_name: string;
  requested_by: string | null;
  status: string;
  created_at: string;
  zone_name?: string;
}

export default function RequestsPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchZones();
  }, []);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 3000); // Auto-refresh every 3 seconds
    return () => clearInterval(interval);
  }, [selectedZone]);

  const fetchZones = async () => {
    try {
      const response = await fetch('/api/zones');
      const data = await response.json();
      if (data.success) {
        setZones(data.data);
      }
    } catch (error) {
      console.error('Error fetching zones:', error);
    }
  };

  const fetchRequests = async () => {
    try {
      const url = selectedZone === 'all'
        ? '/api/requests/all'
        : `/api/requests?zone_id=${selectedZone}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setRequests(data.data);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteRequest = async (id: string) => {
    if (!confirm('Remove this song from the queue?')) {
      return;
    }

    try {
      const response = await fetch(`/api/requests/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchRequests();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete request');
      }
    } catch (error) {
      console.error('Error deleting request:', error);
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
            Song Requests
          </h1>
        </div>

        {/* Zone Filter */}
        <div className="mb-6">
          <label className="block text-sm font-bold mb-2">Filter by Zone</label>
          <select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="px-4 py-2 border-2 border-gray-200 rounded-xl font-semibold focus:border-purple-500 focus:outline-none"
          >
            <option value="all">All Zones</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.environment_name} - {zone.name}
              </option>
            ))}
          </select>
        </div>

        {/* Requests List */}
        <div className="space-y-4">
          {requests.map((request) => (
            <div
              key={request.id}
              className={`bg-white p-6 rounded-xl shadow-lg flex justify-between items-center ${
                request.status === 'playing'
                  ? 'border-2 border-green-300 bg-green-50'
                  : request.status === 'completed'
                  ? 'opacity-60'
                  : ''
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-2xl ${
                    request.status === 'playing' ? '▶️' :
                    request.status === 'completed' ? '✅' :
                    request.status === 'failed' ? '❌' : '⏸️'
                  }`}></span>
                  <div>
                    <h3 className="font-bold text-lg">{request.track_name}</h3>
                    <p className="text-sm text-gray-600">{request.artist_name}</p>
                  </div>
                </div>

                <div className="flex gap-4 text-xs text-gray-500">
                  {request.requested_by && (
                    <span>👤 {request.requested_by}</span>
                  )}
                  <span className={`font-semibold ${
                    request.status === 'playing' ? 'text-green-600' :
                    request.status === 'pending' ? 'text-yellow-600' :
                    request.status === 'completed' ? 'text-gray-400' :
                    'text-red-600'
                  }`}>
                    {request.status.toUpperCase()}
                  </span>
                  <span>{new Date(request.created_at).toLocaleTimeString()}</span>
                </div>
              </div>

              {request.status === 'pending' && (
                <button
                  onClick={() => deleteRequest(request.id)}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-500 transition font-semibold"
                >
                  🗑️ Remove
                </button>
              )}
            </div>
          ))}

          {requests.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-4">📋</div>
              <p>No song requests</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
