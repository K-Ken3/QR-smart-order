'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

function VerifyContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided');
      return;
    }

    api.get(`/auth/verify?token=${token}`)
      .then((res: any) => {
        setStatus('success');
        setMessage(res.message ?? 'Email verified successfully');
      })
      .catch((err: Error) => {
        setStatus('error');
        setMessage(err.message ?? 'Verification failed');
      });
  }, [searchParams]);

  return (
    <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg text-center">
      {status === 'loading' && (
        <div className="py-8">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
          <p className="mt-4 text-slate-700">Verifying your email...</p>
        </div>
      )}
      {status === 'success' && (
        <div className="py-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-black">Email Verified!</h1>
          <p className="mt-2 text-slate-700">{message}</p>
          <Link href="/login" className="mt-6 inline-flex rounded-2xl bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-400">
            Go to Sign In
          </Link>
        </div>
      )}
      {status === 'error' && (
        <div className="py-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100">
            <svg className="h-8 w-8 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-black">Verification Failed</h1>
          <p className="mt-2 text-slate-700">{message}</p>
          <Link href="/login" className="mt-6 inline-flex rounded-2xl bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-400">
            Go to Sign In
          </Link>
        </div>
      )}
    </section>
  );
}

export default function VerifyPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-8">
      <Suspense fallback={
        <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg text-center">
          <div className="py-8">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
            <p className="mt-4 text-slate-700">Loading...</p>
          </div>
        </section>
      }>
        <VerifyContent />
      </Suspense>
    </main>
  );
}
