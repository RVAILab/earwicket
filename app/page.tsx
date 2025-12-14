export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Earwicket</h1>
        <p className="text-xl text-gray-600 mb-8">
          Sonos Control System
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/admin"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Admin
          </a>
          <a
            href="/visitor"
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Request a Song
          </a>
        </div>
      </div>
    </main>
  )
}
