'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/toast';
import { formatCurrency, formatDate, elapsed } from '@/lib/utils';
import { getSocket, connectSocket } from '@/lib/socket';
import { playNotificationSound } from '@/lib/sound';

interface RequestItem {
  id: string;
  quantity: number;
  unitPrice: number;
  notes: string | null;
  menuItem: { id: string; name: string } | null;
}

interface Request {
  id: string;
  status: string;
  serviceType: string;
  sourceType: string;
  createdAt: string;
  totalAmount: number | null;
  paymentStatus: string | null;
  receiptNumber: string | null;
  paidAt: string | null;
  location: { id: string; name: string };
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  items: RequestItem[];
}

interface Receipt {
  receiptNumber: string;
  totalAmount: number;
  paymentStatus: string;
  paidAt: string | null;
  createdAt: string;
  branch: { name: string; currency: string; address: string | null };
  location: { name: string };
  items: { name: string; quantity: number; unitPrice: number; subtotal: number; notes: string | null }[];
}

export default function CheckoutPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    if (!branchId) return;
    loadData();
    const socket = connectSocket();
    socket.emit('join', { room: `branch:${branchId}` });
    socket.on('request:checkout', () => loadData());
    socket.on('request:status_changed', () => loadData());
    socket.on('request:created', () => {
      playNotificationSound();
      loadData();
    });
    return () => { socket.off('request:checkout'); socket.off('request:status_changed'); socket.off('request:created'); };
  }, [branchId]);

  async function loadBranches() {
    try {
      const res = await api.get('/branches') as any;
      const branches = Array.isArray(res) ? res : res.data ?? [];
      if (branches.length > 0) setBranchId(branches[0].id);
      setLoading(false);
    } catch { setLoading(false); }
  }

  async function loadData() {
    if (!branchId) return;
    try {
      const res = await api.get(`/requests?branchId=${branchId}`) as any;
      const all = Array.isArray(res) ? res : res.data ?? [];
      setRequests(all);
    } catch { /* ignore */ }
  }

  async function handleCheckout(requestId: string, paymentMethod: string) {
    setCheckoutLoading(true);
    try {
      const res = await api.post(`/requests/${requestId}/checkout`, { paymentMethod }) as any;
      setSelectedRequest(res);
      if (paymentMethod === 'MTN_MOMO') {
        const total = Number(res.totalAmount) || 0;
        const ussdCode = `*182*8*1*${Math.round(total)}#`;
        window.open(`tel:${ussdCode}`, '_self');
      }
      showToast('Checkout completed', 'success');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Checkout failed', 'error');
    } finally { setCheckoutLoading(false); }
  }

  async function handleViewReceipt(requestId: string) {
    try {
      const res = await api.get(`/requests/${requestId}/receipt`) as any;
      setReceipt(res);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load receipt', 'error');
    }
  }

  const readyForCheckout = requests.filter((r) => r.status === 'COMPLETED' && r.paymentStatus !== 'PAID');
  const paidOrders = requests.filter((r) => r.paymentStatus === 'PAID');
  const allFiltered = filter === 'READY' ? readyForCheckout : filter === 'PAID' ? paidOrders : requests;

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Checkout & Receipts</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="w-full sm:w-auto rounded-xl border border-slate-300 px-3 py-2 text-sm text-black/60">
          {['ALL', 'READY', 'PAID'].map((s) => (
            <option key={s} value={s}>{s === 'READY' ? 'Ready to Pay' : s === 'PAID' ? 'Paid' : 'All'}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {allFiltered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-700">No orders found</div>
          ) : allFiltered.map((req) => {
            const total = req.totalAmount ?? req.items.reduce((s: number, i: any) => s + Number(i.unitPrice) * i.quantity, 0);
            return (
              <div key={req.id} className={`rounded-2xl border bg-white p-4 ${req.paymentStatus === 'PAID' ? 'border-emerald-200' : req.status === 'COMPLETED' ? 'border-amber-200' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-black">{req.serviceType.replace(/_/g, ' ')}</p>
                    <p className="text-sm text-slate-700">{req.location.name} &middot; {req.sourceType}</p>
                    <p className="text-xs text-slate-600 mt-1">{elapsed(req.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    {req.paymentStatus === 'PAID' && req.receiptNumber && (
                      <span className="inline-flex rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 text-xs font-medium mb-1">PAID</span>
                    )}
                    {req.status !== 'COMPLETED' && (
                      <span className="inline-flex rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-medium">{req.status}</span>
                    )}
                  </div>
                </div>

                {req.items.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3 space-y-1">
                    {req.items.map((item: any) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-black">{item.menuItem?.name ?? 'Item'} x{item.quantity}</span>
                        <span className="text-black font-medium">{formatCurrency(Number(item.unitPrice) * item.quantity, req.items[0]?.menuItem ? 'RWF' : 'USD')}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-lg font-bold text-black">Total: {formatCurrency(total, 'RWF')}</span>
                  <div className="flex gap-2">
                    {req.status === 'COMPLETED' && req.paymentStatus !== 'PAID' && (
                      <>
                        <button onClick={() => handleCheckout(req.id, 'CASH')}
                          disabled={checkoutLoading}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:opacity-50">
                          Cash
                        </button>
                        <button onClick={() => handleCheckout(req.id, 'MTN_MOMO')}
                          disabled={checkoutLoading}
                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-50">
                          MTN MoMo
                        </button>
                      </>
                    )}
                    {req.paymentStatus === 'PAID' && (
                      <button onClick={() => handleViewReceipt(req.id)}
                        className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50">
                        View Receipt
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-black mb-3">Today&apos;s Summary</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-black">Ready to Pay</span>
                <span className="text-sm font-semibold text-amber-600">{readyForCheckout.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-black">Paid</span>
                <span className="text-sm font-semibold text-emerald-600">{paidOrders.length}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="text-sm font-medium text-black">Revenue</span>
                <span className="text-sm font-bold text-black">
                  {formatCurrency(paidOrders.reduce((s, r) => s + (r.totalAmount ?? 0), 0), 'RWF')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setReceipt(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center border-b border-slate-200 pb-4 mb-4">
              <h2 className="text-lg font-bold text-black">{receipt.branch.name}</h2>
              <p className="text-xs text-slate-600">{receipt.branch.address}</p>
              <p className="text-xs text-slate-600 mt-1">Receipt #{receipt.receiptNumber}</p>
              <p className="text-xs text-slate-600">{formatDate(receipt.createdAt)}</p>
            </div>
            <div className="space-y-1 mb-4">
              {receipt.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-black">{item.name} x{item.quantity}</span>
                  <span className="text-black">{formatCurrency(item.subtotal, 'RWF')}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 pt-3 mb-4">
              <div className="flex justify-between">
                <span className="text-lg font-bold text-black">Total</span>
                <span className="text-lg font-bold text-black">{formatCurrency(receipt.totalAmount, 'RWF')}</span>
              </div>
            </div>
            <div className="text-center mb-4">
              {receipt.paymentStatus === 'PAID' ? (
                <span className="inline-flex rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-sm font-medium">PAID</span>
              ) : (
                <span className="inline-flex rounded-full bg-amber-100 text-amber-700 px-4 py-1 text-sm font-medium">UNPAID</span>
              )}
            </div>
            <button onClick={() => setReceipt(null)} className="w-full rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-black hover:bg-slate-200">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
