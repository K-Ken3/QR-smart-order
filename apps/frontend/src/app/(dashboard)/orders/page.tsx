'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { showToast } from '@/components/ui/toast';

interface Order {
  id: string;
  status: string;
  serviceType: string;
  sourceType: string;
  totalAmount: number | null;
  paymentStatus: string | null;
  receiptNumber: string | null;
  confirmedByReceptionist: boolean;
  createdAt: string;
  location: { id: string; name: string };
  assignedTo: { id: string; firstName: string; lastName: string } | null;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    api.get('/branches').then((res: any) => {
      const branches = Array.isArray(res) ? res : res.data ?? [];
      if (branches.length > 0) setBranchId(branches[0].id);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!branchId) return;
    loadOrders();
  }, [branchId]);

  async function loadOrders() {
    if (!branchId) return;
    try {
      const res = await api.get(`/requests?branchId=${branchId}`) as any;
      setOrders(Array.isArray(res) ? res : res.data ?? []);
    } catch { /* ignore */ }
  }

  const filtered = orders.filter((o) => {
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
    if (paymentFilter !== 'ALL' && o.paymentStatus !== paymentFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (o.receiptNumber?.toLowerCase().includes(q) ?? false) ||
        o.location.name.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q);
    }
    return true;
  });

  const totalRevenue = orders.filter((o) => o.paymentStatus === 'PAID').reduce((s, o) => s + (o.totalAmount ?? 0), 0);
  const paidCount = orders.filter((o) => o.paymentStatus === 'PAID').length;
  const pendingCount = orders.filter((o) => o.paymentStatus === 'PENDING').length;

  function exportCSV() {
    const headers = ['ID', 'Date', 'Location', 'Status', 'Total', 'Payment', 'Receipt #'];
    const rows = filtered.map((o) => [
      o.id.slice(0, 8),
      new Date(o.createdAt).toLocaleString(),
      o.location.name,
      o.status,
      o.totalAmount != null ? String(o.totalAmount) : '',
      o.paymentStatus ?? '',
      o.receiptNumber ?? '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${branchId}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported', 'success');
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Order History</h1>
        <button onClick={exportCSV} className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-black hover:bg-slate-50">Export CSV</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-700">Total Orders</p>
          <p className="text-2xl font-bold text-black">{orders.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-700">Paid</p>
          <p className="text-2xl font-bold text-emerald-600">{paidCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-700">Revenue</p>
          <p className="text-2xl font-bold text-black">RWF {totalRevenue.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by receipt #, location..."
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm w-60" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black/60">
          {['ALL', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black/60">
          {['ALL', 'PAID', 'PENDING', 'UNPAID'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">Service</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-700">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">Receipt #</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-600">No orders found</td></tr>
              ) : filtered.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 text-black whitespace-nowrap">{formatDate(o.createdAt)}</td>
                  <td className="px-4 py-3 text-black">{o.location.name}</td>
                  <td className="px-4 py-3 text-slate-700">{o.serviceType.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      o.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                      o.status === 'CANCELLED' ? 'bg-rose-100 text-rose-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>{o.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-black">
                    {o.totalAmount != null ? `RWF ${Number(o.totalAmount).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      o.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                      o.paymentStatus === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{o.paymentStatus ?? 'N/A'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-600">{o.receiptNumber ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
