import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Earwicket - Sonos Control',
  description: 'Schedule playlists and manage song requests across your Sonos system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
