'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/toast';
import { statusColor } from '@/lib/utils';

interface Tenant {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  emailVerified: boolean;
  subscription: { plan: string; status: string; currentPeriodEnd: string } | null;
  _count: { branches: number };
}

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ businessName: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [viewTenant, setViewTenant] = useState<Tenant | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => { loadTenants(); }, []);

  async function loadTenants() {
    try {
      const res = await api.get('/tenants') as any;
      setTenants(Array.isArray(res) ? res : res.data ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/tenants/create', form) as any;
      showToast('Business created successfully', 'success');
      setShowForm(false);
      setForm({ businessName: '', email: '', password: '' });
      loadTenants();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create business', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function suspendTenant(id: string, name: string) {
    if (!confirm(`Suspend "${name}"? This will deactivate all branches and QR codes.`)) return;
    try {
      await api.patch(`/tenants/${id}/suspend`, {});
      showToast(`"${name}" suspended`, 'success');
      loadTenants();
      setViewTenant(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  async function clearAll() {
    if (!confirm('Delete ALL businesses and data? This cannot be undone.')) return;
    setClearing(true);
    try {
      await api.post('/tenants/clear-all', {});
      showToast('All data cleared', 'success');
      setTenants([]);
      setViewTenant(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    } finally {
      setClearing(false);
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black">Businesses</h1>
          <p className="text-sm text-slate-600 mt-1">{tenants.length} total</p>
        </div>
        <div className="flex gap-2">
          {tenants.length > 0 && (
            <button onClick={clearAll} disabled={clearing}
              className="rounded-xl border border-rose-200 px-4 py-2.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-70">
              {clearing ? 'Clearing...' : 'Clear All Data'}
            </button>
          )}
          <button onClick={() => setShowForm(!showForm)}
            className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400">
            {showForm ? 'Cancel' : '+ Add Business'}
          </button>
        </div>
      </div>

      {/* Create Business Form */}
      {showForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-black mb-4">Create New Business</h2>
          <form onSubmit={handleCreate} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-black">Business Name</label>
              <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} required
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/80 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-black">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/80 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-black">Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/80 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
              <p className="text-xs text-slate-500 mt-1">Min 8 characters, 1 uppercase, 1 number</p>
            </div>
            <button type="submit" disabled={submitting}
              className="rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:opacity-70">
              {submitting ? 'Creating...' : 'Create Business'}
            </button>
          </form>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: tenants.length, color: 'text-black' },
          { label: 'Active', value: tenants.filter(t => t.isActive).length, color: 'text-emerald-600' },
          { label: 'Suspended', value: tenants.filter(t => !t.isActive).length, color: 'text-rose-600' },
          { label: 'Pro+', value: tenants.filter(t => t.subscription?.plan !== 'STARTER').length, color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tenant List */}
      <div className="space-y-3">
        {tenants.map((t) => (
          <div key={t.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:shadow-md cursor-pointer"
            onClick={() => setViewTenant(viewTenant?.id === t.id ? null : t)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 text-sm font-bold">
                  {t.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{t.name}</p>
                  <p className="text-xs text-slate-600 truncate">{t.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(t.isActive ? 'ACTIVE' : 'SUSPENDED')}`}>
                  {t.isActive ? 'Active' : 'Suspended'}
                </span>
                <span className="hidden sm:inline text-xs text-slate-600">
                  {t._count.branches} branch{t._count.branches !== 1 ? 'es' : ''}
                </span>
                <svg className={`h-4 w-4 text-slate-400 transition-transform ${viewTenant?.id === t.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Expanded detail */}
            {viewTenant?.id === t.id && (
              <div className="mt-4 border-t border-slate-100 pt-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">Plan</p>
                    <p className="font-medium text-black">{t.subscription?.plan ?? 'None'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Subscription</p>
                    <p className="font-medium text-black">{t.subscription?.status ?? 'None'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Verified</p>
                    <p className={`font-medium ${t.emailVerified ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {t.emailVerified ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Expires</p>
                    <p className="font-medium text-black">
                      {t.subscription?.currentPeriodEnd
                        ? new Date(t.subscription.currentPeriodEnd).toLocaleDateString()
                        : 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  {t.isActive && (
                    <button onClick={() => suspendTenant(t.id, t.name)}
                      className="rounded-xl border border-rose-200 px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition">
                      Suspend
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {tenants.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            No businesses yet. Create one above.
          </div>
        )}
      </div>
    </div>
  );
}
