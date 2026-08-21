'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth.store';
import { PasswordInput } from '@/components/ui/password-input';

export default function RegisterPage() {
  const router = useRouter();
  const { register, verifyOtp, resendOtp } = useAuthStore();
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await register(businessName, email, password);
      setSuccess(result.message);
      setStep('otp');
      setCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newValues = [...otpValues];
    newValues[index] = value.slice(-1);
    setOtpValues(newValues);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    if (newValues.every((v) => v.length === 1)) {
      handleVerifyOtp(newValues.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtpValues(pasted.split(''));
      handleVerifyOtp(pasted);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    setOtpError(null);
    setIsSubmitting(true);
    try {
      await verifyOtp(email, code);
      setTimeout(() => router.push('/login'), 1500);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Verification failed');
      setOtpValues(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    setOtpError(null);
    try {
      await resendOtp(email);
      setCountdown(60);
      setSuccess('A new verification code has been sent to your email.');
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Failed to resend code');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-8">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="SmartServe" className="h-10 w-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <h1 className="text-3xl font-bold text-black">
            {step === 'form' ? 'Register Your Business' : 'Verify Your Email'}
          </h1>
        </div>

        {step === 'form' ? (
          <>
            <p className="mt-3 text-slate-700">Create a new SmartServe QR tenant and business-owner account.</p>

            <form className="mt-8 space-y-5" onSubmit={handleRegister}>
              <div>
                <label className="block text-sm font-medium text-black">Business Name</label>
                <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required
                  className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-black">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-black">Password</label>
                <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                <p className="mt-1 text-xs text-slate-600">Min 8 characters, 1 uppercase, 1 number</p>
              </div>
              {error && <p className="rounded-2xl bg-rose-100 px-4 py-3 text-sm text-rose-700">{error}</p>}
              {success && <p className="rounded-2xl bg-emerald-100 px-4 py-3 text-sm text-emerald-700">{success}</p>}
              <button type="submit" disabled={isSubmitting}
                className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70">
                {isSubmitting ? 'Registering...' : 'Register'}
              </button>
            </form>
          </>
        ) : (
          <div className="mt-8 text-center">
            <p className="text-slate-700 mb-2">
              We sent a 6-digit code to <span className="font-semibold text-black">{email}</span>
            </p>

            <div className="flex justify-center gap-3 mt-6" onPaste={handlePaste}>
              {otpValues.map((val, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={val}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  disabled={isSubmitting}
                  className="h-14 w-12 rounded-xl border border-slate-300 text-center text-xl font-bold text-black outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:opacity-50"
                />
              ))}
            </div>

            {otpError && <p className="mt-4 rounded-2xl bg-rose-100 px-4 py-3 text-sm text-rose-700">{otpError}</p>}
            {success && !otpError && <p className="mt-4 rounded-2xl bg-emerald-100 px-4 py-3 text-sm text-emerald-700">{success}</p>}

            {isSubmitting && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                <span className="text-sm text-slate-700">Verifying...</span>
              </div>
            )}

            <button
              onClick={handleResendOtp}
              disabled={countdown > 0}
              className="mt-6 text-sm font-medium text-amber-600 hover:text-amber-500 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              {countdown > 0 ? `Resend code in ${countdown}s` : 'Resend code'}
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-amber-600 hover:text-amber-500">Sign In</Link>
        </p>
      </section>
    </main>
  );
}
