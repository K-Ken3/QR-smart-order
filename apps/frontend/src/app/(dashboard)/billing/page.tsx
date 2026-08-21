'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils';

interface Plan { name: string; maxBranches: number; maxLocations: number; maxEmployees: number; priceMonthly: number; features: string[]; }
interface Subscription { plan: string; status: string; currentPeriodEnd: string; maxBranches: number; maxLocations: number; maxEmployees: number; }
interface Invoice { id: string; amount: number; status: string; createdAt: string; }

export default function BillingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [p, s, inv] = await Promise.all([
        api.get('/billing/plans') as any,
        api.get('/billing/subscription') as any,
        api.get('/billing/invoices') as any,
      ]);
      setPlans(Array.isArray(p) ? p : []);
      setSubscription(s);
      setInvoices(Array.isArray(inv) ? inv : []);
    } catch { /* ignore */ }
  }, []);

  // Handle Flutterwave redirect callback
  useEffect(() => {
    const txRef = searchParams.get('tx_ref');
    const transactionId = searchParams.get('transaction_id');
    const status = searchParams.get('status');

    if (txRef && transactionId && status === 'successful') {
      setVerifying(true);
      api.post('/billing/verify', { tx_ref: txRef, transaction_id: transactionId })
        .then(() => {
          showToast('Payment successful! Your subscription is now active.', 'success');
          router.replace('/billing');
        })
        .catch(() => {
          showToast('Payment verification failed. Please contact support.', 'error');
        })
        .finally(() => {
          setVerifying(false);
          loadData();
        });
    } else if (txRef && status === 'cancelled') {
      showToast('Payment was cancelled.', 'error');
      router.replace('/billing');
    }
  }, [searchParams, router, loadData]);

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);

  async function subscribeFree(planName: string) {
    try {
      await api.post('/billing/subscribe', { plan: planName });
      showToast(`Subscribed to ${planName}`, 'success');
      const s = await api.get('/billing/subscription') as any;
      setSubscription(s);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  async function startCheckout(planName: string) {
    setCheckoutLoading(planName);
    try {
      const res = await api.post('/billing/checkout', { plan: planName }) as any;
      if (res.url) {
        window.location.href = res.url;
      } else {
        showToast('Failed to create checkout session', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
      setCheckoutLoading(null);
    }
  }

  if (verifying) return <div className="flex h-64 items-center justify-center flex-col gap-4"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /><p className="text-sm text-slate-700">Verifying your payment...</p></div>;

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-black mb-6">Billing & Subscription</h1>

      {subscription && (
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-black mb-2">Current Plan: {subscription.plan}</h2>
          <p className="text-sm text-slate-700">
            Status: <span className={`font-medium ${subscription.status === 'ACTIVE' ? 'text-emerald-600' : 'text-amber-600'}`}>{subscription.status}</span>
            {subscription.status === 'ACTIVE' && <> &middot; Renews: {formatDate(subscription.currentPeriodEnd)}</>}
          </p>
          {subscription.status === 'PENDING' && (
            <p className="text-sm text-amber-700 mt-1">Your payment is being processed. Complete payment to activate your subscription.</p>
          )}
          <p className="text-sm text-slate-700 mt-1">Limits: {subscription.maxBranches} branches, {subscription.maxLocations} locations, {subscription.maxEmployees} employees</p>
        </div>
      )}

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {plans.map((plan) => {
          const isCurrent = subscription?.plan === plan.name;
          const isFree = plan.priceMonthly === 0;
          return (
            <div key={plan.name} className={`rounded-2xl border p-6 ${isCurrent ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
              <h3 className="text-lg font-bold text-black">{plan.name}</h3>
              <p className="text-2xl font-bold text-black mt-2">
                {isFree ? 'Free' : `$${plan.priceMonthly}`}
                {!isFree && <span className="text-sm font-normal text-slate-700">/mo</span>}
              </p>
              <ul className="mt-4 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-black">
                    <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  if (isCurrent) return;
                  if (isFree) {
                    subscribeFree(plan.name);
                  } else {
                    startCheckout(plan.name);
                  }
                }}
                disabled={isCurrent || checkoutLoading === plan.name}
                className={`mt-6 w-full rounded-xl py-2.5 text-sm font-semibold ${isCurrent ? 'bg-slate-200 text-slate-700 cursor-default' : 'bg-amber-500 text-black hover:bg-amber-400'}`}
              >
                {isCurrent ? 'Current Plan' : checkoutLoading === plan.name ? 'Redirecting...' : isFree ? 'Select Free Plan' : 'Subscribe Now'}
              </button>
            </div>
          );
        })}
      </div>

      {invoices.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-black mb-4">Invoice History</h2>
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-black">Invoice #{inv.id.slice(0, 8)}</p>
                  <p className="text-xs text-slate-600">{formatDate(inv.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-black">${inv.amount.toFixed(2)}</p>
                  <p className={`text-xs ${inv.status === 'PAID' ? 'text-emerald-600' : 'text-amber-600'}`}>{inv.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
