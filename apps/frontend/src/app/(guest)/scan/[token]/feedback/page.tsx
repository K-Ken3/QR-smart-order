'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/toast';

export default function GuestFeedbackPage({ params }: { params: { token: string } }) {
  const [requestId, setRequestId] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestId || rating === 0) {
      showToast('Please enter a request ID and select a rating', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/feedback', { requestId, rating, comment: comment || undefined });
      setSubmitted(true);
      showToast('Thank you for your feedback!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to submit feedback', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-black">Thank You!</h1>
          <p className="mt-2 text-slate-700">Your feedback has been submitted successfully.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-black">Rate Your Experience</h1>
        <p className="mt-2 text-slate-700">We value your feedback to improve our service.</p>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-black mb-2">Request ID</label>
            <input type="text" value={requestId} onChange={(e) => setRequestId(e.target.value)} required
              placeholder="Enter your request ID"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-3">Rating</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button" onClick={() => setRating(star)}
                  className={`h-12 w-12 rounded-xl text-2xl transition ${star <= rating ? 'bg-amber-400 text-amber-900' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                  ★
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-2">Comment (optional)</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none" />
          </div>

          <button type="submit" disabled={submitting || rating === 0}
            className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
            {submitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </form>
      </div>
    </main>
  );
}
