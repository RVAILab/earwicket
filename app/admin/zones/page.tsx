'use client';

import { useEffect, useState } from 'react';
import { SonosGroup } from '@/types';

interface Environment {
  id: string;
  name: string;
  timezone: string;
}

interface Zone {
  id: string;
  name: string;
  sonos_group_id: string;
  environment_name?: string;
}

export default function ZonesPage() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [sonosGroups, setSonosGroups] = useState<SonosGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEnvForm, setShowEnvForm] = useState(false);
  const [showZoneForm, setShowZoneForm] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [envRes, zonesRes, groupsRes] = await Promise.all([
        fetch('/api/environments'),
        fetch('/api/zones'),
        fetch('/api/sonos/groups'),
      ]);

      const envData = await envRes.json();
      const zonesData = await zonesRes.json();
      const groupsData = await groupsRes.json();

      if (envData.success) setEnvironments(envData.data);
      if (zonesData.success) setZones(zonesData.data);
      if (groupsData.success) setSonosGroups(groupsData.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const createEnvironment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      const response = await fetch('/api/environments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          timezone: formData.get('timezone'),
        }),
      });

      if (response.ok) {
        setShowEnvForm(false);
        fetchData();
      }
    } catch (error) {
      console.error('Error creating environment:', error);
    }
  };

  const createZone = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      const response = await fetch('/api/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environment_id: formData.get('environment_id'),
          name: formData.get('name'),
          sonos_group_id: formData.get('sonos_group_id'),
        }),
      });

      if (response.ok) {
        setShowZoneForm(false);
        fetchData();
      }
    } catch (error) {
      console.error('Error creating zone:', error);
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
            Manage Zones
          </h1>
        </div>

        {/* Environments Section */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">🏠 Environments</h2>
            <button
              onClick={() => setShowEnvForm(!showEnvForm)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition font-semibold"
            >
              + New Environment
            </button>
          </div>

          {showEnvForm && (
            <form onSubmit={createEnvironment} className="bg-white p-6 rounded-xl shadow-lg mb-4">
              <div className="grid gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Name</label>
                  <input
                    name="name"
                    required
                    placeholder="e.g., Home, Office"
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Timezone</label>
                  <select name="timezone" required className="w-full px-4 py-2 border rounded-lg">
                    <option value="America/New_York">Eastern (America/New_York)</option>
                    <option value="America/Chicago">Central (America/Chicago)</option>
                    <option value="America/Denver">Mountain (America/Denver)</option>
                    <option value="America/Los_Angeles">Pacific (America/Los_Angeles)</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEnvForm(false)}
                    className="px-4 py-2 bg-gray-200 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {environments.map((env) => (
              <div key={env.id} className="bg-white p-4 rounded-xl shadow">
                <h3 className="font-bold text-lg">{env.name}</h3>
                <p className="text-sm text-gray-600">{env.timezone}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Zones Section */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">📍 Zones</h2>
            <button
              onClick={() => setShowZoneForm(!showZoneForm)}
              className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-500 transition font-semibold"
            >
              + New Zone
            </button>
          </div>

          {showZoneForm && (
            <form onSubmit={createZone} className="bg-white p-6 rounded-xl shadow-lg mb-4">
              <div className="grid gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Environment</label>
                  <select name="environment_id" required className="w-full px-4 py-2 border rounded-lg">
                    <option value="">Select environment...</option>
                    {environments.map((env) => (
                      <option key={env.id} value={env.id}>
                        {env.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Zone Name</label>
                  <input
                    name="name"
                    required
                    placeholder="e.g., Living Room, Kitchen"
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Sonos Group</label>
                  <select name="sonos_group_id" required className="w-full px-4 py-2 border rounded-lg">
                    <option value="">Select Sonos group...</option>
                    {sonosGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg">
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowZoneForm(false)}
                    className="px-4 py-2 bg-gray-200 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {zones.map((zone) => (
              <div key={zone.id} className="bg-white p-4 rounded-xl shadow">
                <h3 className="font-bold text-lg">{zone.name}</h3>
                <p className="text-sm text-gray-600">{zone.environment_name}</p>
                <p className="text-xs text-gray-400 mt-2">Group: {zone.sonos_group_id.substring(0, 20)}...</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
