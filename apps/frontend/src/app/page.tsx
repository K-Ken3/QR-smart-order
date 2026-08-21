'use client';

import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800 p-8 text-white">
      <div className="max-w-2xl text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="SmartServe" className="mx-auto mb-4 h-16 w-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <h1 className="mb-4 text-5xl font-bold tracking-tight">
          SmartServe <span className="text-amber-400">QR</span>
        </h1>
        <p className="mb-8 text-lg text-slate-300">
          Multi-tenant SaaS hospitality platform. Scan a QR code to access services at your location.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="rounded-lg bg-amber-500 px-6 py-3 font-semibold text-slate-900 transition hover:bg-amber-400"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
