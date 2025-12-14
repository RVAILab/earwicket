export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl font-bold mb-4">Earwicket</h1>
        <p className="text-xl text-gray-600 mb-8">
          Sonos Control System
        </p>

        <div className="flex gap-4 justify-center mb-12">
          <a
            href="/admin"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Admin Dashboard
          </a>
          <a
            href="/visitor"
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            Request a Song
          </a>
        </div>

        <div className="border-t pt-8">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Setup & Authorization</h2>
          <div className="flex gap-4 justify-center flex-wrap">
            <a
              href="/api/sonos/auth"
              className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900 transition text-sm"
            >
              Authorize Sonos
            </a>
            <a
              href="/api/spotify/auth"
              className="px-4 py-2 bg-green-800 text-white rounded hover:bg-green-900 transition text-sm"
            >
              Authorize Spotify
            </a>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Click these links to connect your Sonos and Spotify accounts
          </p>
        </div>
      </div>
    </main>
  )
}
