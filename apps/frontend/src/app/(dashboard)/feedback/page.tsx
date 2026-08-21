'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils';

interface Feedback { id: string; rating: number; comment: string | null; isReviewed: boolean; reviewNote: string | null; createdAt: string; request: { id: string; serviceType: string; createdAt: string }; }

export default function FeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  useEffect(() => {
    api.get('/branches').then(async (res: any) => {
      const branches = Array.isArray(res) ? res : res.data ?? [];
      if (branches.length > 0) {
        setBranchId(branches[0].id);
        await loadFeedback(branches[0].id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function loadFeedback(bId: string) {
    try {
      const res = await api.get(`/feedback/branch/${bId}`) as any;
      setFeedbacks(res.data ?? []);
    } catch { /* ignore */ }
  }

  async function submitReview(id: string) {
    try {
      await api.patch(`/feedback/${id}/review`, { reviewNote });
      showToast('Review submitted', 'success');
      setReviewId(null);
      setReviewNote('');
      if (branchId) loadFeedback(branchId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  function renderStars(rating: number) {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={`text-lg ${i < rating ? 'text-amber-400' : 'text-slate-400'}`}>★</span>
    ));
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-black mb-6 break-words">Guest Feedback</h1>
      {feedbacks.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-700">No feedback yet</div>
      ) : (
        <div className="space-y-3">
          {feedbacks.map((fb) => (
            <div key={fb.id} className={`rounded-2xl border bg-white p-4 ${fb.rating <= 2 ? 'border-rose-200' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1">{renderStars(fb.rating)}</div>
                  <p className="text-xs text-slate-600 mt-1">{fb.request.serviceType.replace('_', ' ')} &middot; {formatDate(fb.createdAt)}</p>
                  {fb.comment && <p className="mt-2 text-sm text-slate-700">{fb.comment}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {fb.rating <= 2 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">Low Satisfaction</span>}
                  {fb.isReviewed ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Reviewed</span>
                  ) : (
                    <button onClick={() => { setReviewId(fb.id); setReviewNote(''); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-black hover:bg-slate-50">Review</button>
                  )}
                </div>
              </div>
              {reviewId === fb.id && (
                <div className="mt-3 flex gap-2">
                  <input value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Review note..."
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                  <button onClick={() => submitReview(fb.id)} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs text-black hover:bg-amber-400">Submit</button>
                </div>
              )}
              {fb.reviewNote && <p className="mt-2 text-xs text-slate-700 italic">Review: {fb.reviewNote}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
