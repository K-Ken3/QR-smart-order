'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/toast';
import Link from 'next/link';

interface Branch { id: string; name: string; address: string; timezone: string; currency: string; language: string; escalationThresholdMinutes: number; isActive: boolean; createdAt: string; }
interface Subscription { plan: string; maxBranches: number; }

export default function BranchesPage() {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [form, setForm] = useState({ name: '', address: '', timezone: 'UTC', currency: 'USD', language: 'en', escalationThresholdMinutes: '5' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([
        api.get('/branches') as any,
        api.get('/billing/subscription') as any,
      ]);
      setBranches(Array.isArray(b) ? b : b.data ?? []);
      setSubscription(s);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function saveBranch() {
    if (!form.name || !form.address) { showToast('Name and address are required.', 'error'); return; }
    const body = { ...form, escalationThresholdMinutes: parseInt(form.escalationThresholdMinutes) || 5 };
    try {
      if (editBranch) {
        await api.patch(`/branches/${editBranch.id}`, body);
        showToast('Branch updated', 'success');
      } else {
        await api.post('/branches', body);
        showToast('Branch created', 'success');
      }
      setShowCreate(false);
      setEditBranch(null);
      setForm({ name: '', address: '', timezone: 'UTC', currency: 'USD', language: 'en', escalationThresholdMinutes: '5' });
      loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      if (msg.toLowerCase().includes('quota')) {
        showToast('Branch limit reached. Please upgrade your subscription.', 'error');
        router.push('/billing');
      } else {
        showToast(msg, 'error');
      }
    }
  }

  function startEdit(branch: Branch) {
    setEditBranch(branch);
    setForm({ name: branch.name, address: branch.address, timezone: branch.timezone, currency: branch.currency, language: branch.language, escalationThresholdMinutes: String(branch.escalationThresholdMinutes) });
    setShowCreate(true);
  }

  async function deactivateBranch(id: string) {
    if (!confirm('Deactivate this branch? QR codes will be disabled.')) return;
    try {
      await api.delete(`/branches/${id}`);
      showToast('Branch deactivated', 'success');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;

  const atLimit = !!subscription && branches.filter(b => b.isActive).length >= subscription.maxBranches;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">Branches</h1>
          {subscription && (
            <p className="text-sm text-slate-700 mt-1">
              {branches.filter(b => b.isActive).length} of {subscription.maxBranches} branches used ({subscription.plan} plan)
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {atLimit && (
            <Link href="/billing" className="rounded-xl border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100">
              Upgrade Plan
            </Link>
          )}
          <button onClick={() => { setShowCreate(true); setEditBranch(null); setForm({ name: '', address: '', timezone: 'UTC', currency: 'USD', language: 'en', escalationThresholdMinutes: '5' }); }}
            disabled={atLimit}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed">
            + New Branch
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-black mb-4">{editBranch ? 'Edit Branch' : 'Create Branch'}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Branch Name"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Timezone"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="Currency (e.g. USD, KES)"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="Language (e.g. en)"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <input value={form.escalationThresholdMinutes} onChange={(e) => setForm({ ...form, escalationThresholdMinutes: e.target.value })}
              placeholder="Escalation Threshold (minutes)" type="number" min="1"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={saveBranch} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">{editBranch ? 'Update' : 'Create'}</button>
            <button onClick={() => { setShowCreate(false); setEditBranch(null); }} className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-black hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {branches.map((branch) => (
          <div key={branch.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-black">{branch.name}</p>
                <p className="text-sm text-slate-700">{branch.address}</p>
                <p className="text-xs text-slate-600">{branch.currency} &middot; {branch.timezone} &middot; Escalation: {branch.escalationThresholdMinutes} min</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${branch.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                  {branch.isActive ? 'Active' : 'Inactive'}
                </span>
                <button onClick={() => startEdit(branch)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-black hover:bg-slate-50">Edit</button>
                {branch.isActive && (
                  <button onClick={() => deactivateBranch(branch.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50">Deactivate</button>
                )}
              </div>
            </div>
          </div>
        ))}
        {branches.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-700">No branches yet. Create your first branch to get started.</div>}
      </div>
    </div>
  );
}
