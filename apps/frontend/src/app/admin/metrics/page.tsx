'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function AdminMetricsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/tenants').then((res: any) => {
      setTenants(Array.isArray(res) ? res : res.data ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;

  const activeTenants = tenants.filter((t) => t.isActive).length;
  const totalBranches = tenants.reduce((sum, t) => sum + (t._count?.branches ?? 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-black mb-6">Platform Metrics</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-700">Total Tenants</p>
          <p className="text-2xl font-bold text-slate-900">{tenants.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-700">Active Tenants</p>
          <p className="text-2xl font-bold text-emerald-600">{activeTenants}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-700">Total Branches</p>
          <p className="text-2xl font-bold text-slate-900">{totalBranches}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-700">Suspended</p>
          <p className="text-2xl font-bold text-rose-600">{tenants.length - activeTenants}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Tenants by Plan</h2>
        {['STARTER', 'PROFESSIONAL', 'ENTERPRISE'].map((plan) => {
          const count = tenants.filter((t) => t.subscription?.plan === plan).length;
          return (
            <div key={plan} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
              <span className="text-sm text-slate-800">{plan}</span>
              <span className="text-sm font-medium text-slate-900">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
