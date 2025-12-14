export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 flex items-center justify-center p-8">
      <div className="text-center max-w-3xl w-full">
        {/* Logo/Header */}
        <div className="mb-12 animate-fade-in">
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

        {/* Main Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
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
