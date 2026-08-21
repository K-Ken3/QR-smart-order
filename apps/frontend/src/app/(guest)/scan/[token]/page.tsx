'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface LocationContext {
  location: { id: string; name: string; locationType: string };
  serviceCatalog: { id: string; name: string; category: string; displayOrder: number }[];
}

export default function ScanPage({ params }: { params: { token: string } }) {
  const [context, setContext] = useState<LocationContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.post('/qr/validate', { token: params.token })
      .then((res: any) => {
        setContext(res);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message ?? 'Invalid or expired QR code');
        setLoading(false);
      });
  }, [params.token]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
      </main>
    );
  }

  if (error || !context) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100">
            <svg className="h-8 w-8 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-black">Invalid QR Code</h1>
          <p className="mt-2 text-slate-600">{error ?? 'This QR code is invalid or has expired.'}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
          <h1 className="text-2xl sm:text-3xl font-semibold text-black">{context.location.name}</h1>
          <p className="mt-1 text-sm text-slate-600">{context.location.locationType.replace('_', ' ')}</p>

          <div className="mt-8">
            <h2 className="text-lg font-semibold text-black mb-4">Available Services</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {context.serviceCatalog.map((service) => (
                <div key={service.id} className="rounded-2xl border border-slate-200 p-4 hover:border-amber-300 transition">
                  <p className="font-medium text-slate-900">{service.name}</p>
                  <p className="text-xs text-slate-600 mt-1">{service.category.replace('_', ' ')}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/scan/${params.token}/menu`}
              className="rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
            >
              View Menu & Order
            </Link>
            <Link
              href={`/scan/${params.token}/request`}
              className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Track Request
            </Link>
            <Link
              href={`/scan/${params.token}/feedback`}
              className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Leave Feedback
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
