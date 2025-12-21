'use client';

import { useEffect, useState } from 'react';
import { SonosPlayer } from '@/types';

interface Environment {
  id: string;
  name: string;
  timezone: string;
  household_id?: string;
}

interface Zone {
  id: string;
  name: string;
  device_player_ids: string[];
  sonos_group_id: string | null;
  environment_name?: string;
}

interface Household {
  id: string;
  swVersion: string;
}

export default function ZonesPage() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [sonosPlayers, setSonosPlayers] = useState<SonosPlayer[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [selectedHouseholdForZone, setSelectedHouseholdForZone] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showEnvForm, setShowEnvForm] = useState(false);
  const [showZoneForm, setShowZoneForm] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [envRes, zonesRes, householdsRes] = await Promise.all([
        fetch('/api/environments'),
        fetch('/api/zones'),
        fetch('/api/sonos/households'),
      ]);

      const envData = await envRes.json();
      const zonesData = await zonesRes.json();
      const householdsData = await householdsRes.json();

      if (envData.success) setEnvironments(envData.data);
      if (zonesData.success) setZones(zonesData.data);
      if (householdsData.success) setHouseholds(householdsData.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch players/devices for selected household when creating zone
  const fetchPlayersForHousehold = async (householdId: string) => {
    setSelectedHouseholdForZone(householdId);
    setSelectedPlayerIds([]);
    try {
      const response = await fetch(`/api/sonos/players/${householdId}`);
      const data = await response.json();
      if (data.success) {
        setSonosPlayers(data.data.players);
      }
    } catch (error) {
      console.error('Error fetching players:', error);
    }
  };

  // Toggle player selection
  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
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
          household_id: formData.get('household_id'),
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

    if (selectedPlayerIds.length === 0) {
      alert('Please select at least one device for this zone');
      return;
    }

    try {
      const response = await fetch('/api/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environment_id: formData.get('environment_id'),
          name: formData.get('name'),
          device_player_ids: selectedPlayerIds,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setShowZoneForm(false);
        setSonosPlayers([]);
        setSelectedPlayerIds([]);
        setSelectedHouseholdForZone('');
        fetchData();
      } else {
        alert(`Error creating zone: ${data.error}`);
      }
    } catch (error) {
      console.error('Error creating zone:', error);
      alert('Failed to create zone');
    }
  };

  const deleteEnvironment = async (id: string) => {
    if (!confirm('Delete this environment? All associated zones and schedules will be deleted.')) {
      return;
    }

    try {
      const response = await fetch(`/api/environments/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error deleting environment:', error);
    }
  };

  const deleteZone = async (id: string) => {
    if (!confirm('Delete this zone? All associated schedules will be deleted.')) {
      return;
    }

    try {
      const response = await fetch(`/api/zones/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error deleting zone:', error);
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
                  <label className="block text-sm font-semibold mb-2">Environment Name</label>
                  <input
                    name="name"
                    required
                    placeholder="e.g., Home, Office, Clubhouse"
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Sonos Household (System)</label>
                  <select name="household_id" required className="w-full px-4 py-2 border rounded-lg">
                    <option value="">Select Sonos system...</option>
                    {households.map((household, idx) => (
                      <option key={household.id} value={household.id}>
                        Household {idx + 1} (v{household.swVersion})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Each Sonos system is a separate household
                  </p>
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
                    Create Environment
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
              <div key={env.id} className="bg-white p-4 rounded-xl shadow flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg">{env.name}</h3>
                  <p className="text-sm text-gray-600">🌍 {env.timezone}</p>
                  {env.household_id && (
                    <p className="text-xs text-gray-400 mt-1">
                      Sonos: {env.household_id.substring(0, 30)}...
                    </p>
                  )}
                </div>
                <button
                  onClick={() => deleteEnvironment(env.id)}
                  className="text-red-600 hover:text-red-800 text-sm"
                  title="Delete environment"
                >
                  🗑️
                </button>
              </div>
            ))}
            {environments.length === 0 && (
              <div className="col-span-2 text-center py-8 text-gray-500">
                <p>No environments yet. Create one for each Sonos system!</p>
              </div>
            )}
          </div>
        </div>

        {/* Zones Section */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">📍 Zones (Device-Based)</h2>
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
                  <label className="block text-sm font-semibold mb-2">Environment (Household)</label>
                  <select
                    name="environment_id"
                    required
                    className="w-full px-4 py-2 border rounded-lg"
                    onChange={(e) => {
                      const env = environments.find((env) => env.id === e.target.value);
                      if (env?.household_id) {
                        fetchPlayersForHousehold(env.household_id);
                      }
                    }}
                  >
                    <option value="">Select environment...</option>
                    {environments.map((env) => (
                      <option key={env.id} value={env.id}>
                        {env.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Select an environment to see its Sonos devices
                  </p>
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
                  <label className="block text-sm font-semibold mb-2">
                    Sonos Devices (Select 1 or more)
                  </label>
                  {!selectedHouseholdForZone && (
                    <p className="text-sm text-gray-500 py-4 px-4 bg-gray-50 rounded-lg">
                      Select an environment first to see available devices
                    </p>
                  )}
                  {selectedHouseholdForZone && sonosPlayers.length === 0 && (
                    <p className="text-sm text-gray-500 py-4 px-4 bg-gray-50 rounded-lg">
                      Loading devices...
                    </p>
                  )}
                  {selectedHouseholdForZone && sonosPlayers.length > 0 && (
                    <div className="border rounded-lg p-3 max-h-64 overflow-y-auto space-y-2">
                      {sonosPlayers.map((player) => (
                        <label
                          key={player.id}
                          className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPlayerIds.includes(player.id)}
                            onChange={() => togglePlayerSelection(player.id)}
                            className="w-5 h-5 text-green-600 rounded"
                          />
                          <div className="flex-1">
                            <div className="font-medium">{player.name}</div>
                            <div className="text-xs text-gray-400">{player.id}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    {selectedPlayerIds.length > 0 ? (
                      <span className="text-green-600 font-medium">
                        ✓ {selectedPlayerIds.length} device{selectedPlayerIds.length !== 1 ? 's' : ''} selected
                      </span>
                    ) : (
                      'Select the devices that should play together in this zone'
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={selectedPlayerIds.length === 0}
                  >
                    Create Zone
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowZoneForm(false);
                      setSonosPlayers([]);
                      setSelectedPlayerIds([]);
                      setSelectedHouseholdForZone('');
                    }}
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
              <div key={zone.id} className="bg-white p-4 rounded-xl shadow flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-bold text-lg">{zone.name}</h3>
                  <p className="text-sm text-gray-600">{zone.environment_name}</p>
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-gray-500 mb-1">
                      {zone.device_player_ids?.length || 0} Device{(zone.device_player_ids?.length || 0) !== 1 ? 's' : ''}:
                    </p>
                    {zone.device_player_ids && zone.device_player_ids.length > 0 ? (
                      <div className="text-xs text-gray-400 space-y-0.5">
                        {zone.device_player_ids.map((id, idx) => (
                          <div key={idx} className="truncate">• {id.substring(0, 30)}...</div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-orange-500">⚠️ Legacy zone - needs migration</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteZone(zone.id)}
                  className="text-red-600 hover:text-red-800 text-sm ml-2"
                  title="Delete zone"
                >
                  🗑️
                </button>
              </div>
            ))}
            {zones.length === 0 && (
              <div className="col-span-3 text-center py-8 text-gray-500">
                <p>No zones yet. Create zones by selecting Sonos devices!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
