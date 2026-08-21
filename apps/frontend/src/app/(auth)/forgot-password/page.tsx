'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { PasswordInput } from '@/components/ui/password-input';

type Step = 'email' | 'otp' | 'newPassword' | 'done';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post<{ message: string }>('/auth/forgot-password', { email }) as any;
      setSuccess('A reset code has been sent to your email.');
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset code');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (otp.length !== 6) { setError('Enter the 6-digit code'); return; }
    setStep('newPassword');
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    setIsSubmitting(true);
    try {
      await api.post('/auth/reset-password', { email, otpCode: otp, newPassword });
      setSuccess('Password reset successful! You can now sign in.');
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-8">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="SmartServe" className="h-10 w-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <h1 className="text-3xl font-bold text-black">
            {step === 'email' && 'Reset Password'}
            {step === 'otp' && 'Enter Code'}
            {step === 'newPassword' && 'New Password'}
            {step === 'done' && 'Done'}
          </h1>
        </div>

        {step === 'email' && (
          <>
            <p className="mt-3 text-slate-700">Enter your email to receive a reset code.</p>
            <form className="mt-8 space-y-5" onSubmit={handleRequestReset}>
              <div>
                <label className="block text-sm font-medium text-black">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
              </div>
              {error && <p className="rounded-2xl bg-rose-100 px-4 py-3 text-sm text-rose-700">{error}</p>}
              <button type="submit" disabled={isSubmitting}
                className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70">
                {isSubmitting ? 'Sending...' : 'Send Reset Code'}
              </button>
            </form>
          </>
        )}

        {step === 'otp' && (
          <form className="mt-8 space-y-5" onSubmit={handleVerifyOtp}>
            {success && <p className="rounded-2xl bg-emerald-100 px-4 py-3 text-sm text-emerald-700">{success}</p>}
            <div>
              <label className="block text-sm font-medium text-black">6-Digit Code</label>
              <input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-center text-xl font-bold tracking-[0.5em] text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            {error && <p className="rounded-2xl bg-rose-100 px-4 py-3 text-sm text-rose-700">{error}</p>}
            <button type="submit" disabled={isSubmitting}
              className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70">
              Continue
            </button>
          </form>
        )}

        {step === 'newPassword' && (
          <form className="mt-8 space-y-5" onSubmit={handleResetPassword}>
            <div>
              <label className="block text-sm font-medium text-black">New Password</label>
              <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
              <p className="mt-1 text-xs text-slate-600">Min 8 characters, 1 uppercase, 1 number</p>
            </div>
            {error && <p className="rounded-2xl bg-rose-100 px-4 py-3 text-sm text-rose-700">{error}</p>}
            <button type="submit" disabled={isSubmitting}
              className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70">
              {isSubmitting ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="mt-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="mt-4 text-slate-700">{success}</p>
            <Link href="/login" className="mt-6 inline-flex rounded-2xl bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-400">
              Go to Sign In
            </Link>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="font-medium text-amber-600 hover:text-amber-500">Back to Sign In</Link>
        </p>
      </section>
    </main>
  );
}
