'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getSocket, connectSocket } from '@/lib/socket';
import { elapsed, statusColor } from '@/lib/utils';
import { showToast } from '@/components/ui/toast';
import { playNotificationSound } from '@/lib/sound';

interface Order {
  id: string;
  status: string;
  serviceType: string;
  createdAt: string;
  location: { id: string; name: string };
  payload: any;
}

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchId, setBranchId] = useState<string | null>(null);

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    if (!branchId) return;
    loadOrders();
    const socket = connectSocket();
    socket.emit('join', { room: `branch:${branchId}` });
    socket.on('order:new', (data: any) => {
      setOrders((prev) => [data, ...prev]);
      playNotificationSound();
      showToast('New order received!', 'info');
    });
    socket.on('request:status_changed', (data: any) => {
      setOrders((prev) => prev.map((o) => o.id === data.requestId ? { ...o, status: data.newStatus } : o));
    });
    return () => { socket.off('order:new'); socket.off('request:status_changed'); };
  }, [branchId]);

  async function loadBranches() {
    try {
      const res = await api.get('/branches') as any;
      const branches = Array.isArray(res) ? res : res.data ?? [];
      if (branches.length > 0) setBranchId(branches[0].id);
      setLoading(false);
    } catch { setLoading(false); }
  }

  async function loadOrders() {
    if (!branchId) return;
    try {
      const res = await api.get(`/requests?branchId=${branchId}&serviceType=FOOD_AND_BEVERAGE`) as any;
      const all = Array.isArray(res) ? res : res.data ?? [];
      setOrders(all.filter((o: Order) => ['PENDING', 'IN_PROGRESS', 'ASSIGNED'].includes(o.status)));
    } catch { /* ignore */ }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await api.patch(`/requests/${id}/status`, { status });
      showToast(`Order ${status.toLowerCase().replace('_', ' ')}`, 'success');
      loadOrders();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;
  }

  const pending = orders.filter((o) => o.status === 'PENDING' || o.status === 'ASSIGNED');
  const inProgress = orders.filter((o) => o.status === 'IN_PROGRESS');

  return (
    <div>
      <h1 className="text-2xl font-bold text-black mb-6 break-words">Kitchen Dashboard</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold text-black mb-3">Pending Orders ({pending.length})</h2>
          {pending.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-700">No pending orders</div>
          ) : pending.map((order) => (
            <div key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 mb-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs text-slate-600">#{order.id.slice(0, 8)}</p>
                  <p className="text-sm font-medium text-black">{order.location.name}</p>
                  <p className="text-xs text-slate-600">{elapsed(order.createdAt)}</p>
                </div>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusColor(order.status)}`}>{order.status}</span>
              </div>
              {order.payload?.items && (
                <div className="mt-3 space-y-1">
                  {order.payload.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-black">{item.name} x{item.quantity}</span>
                      {item.notes && <span className="text-xs text-slate-600 italic">{item.notes}</span>}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3">
                <button onClick={() => updateStatus(order.id, 'IN_PROGRESS')}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400">
                  Start Preparing
                </button>
              </div>
            </div>
          ))}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-black mb-3">In Progress ({inProgress.length})</h2>
          {inProgress.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-700">No orders in progress</div>
          ) : inProgress.map((order) => (
            <div key={order.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs text-slate-600">#{order.id.slice(0, 8)}</p>
                  <p className="text-sm font-medium text-black">{order.location.name}</p>
                  <p className="text-xs text-slate-600">{elapsed(order.createdAt)}</p>
                </div>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusColor(order.status)}`}>{order.status.replace('_', ' ')}</span>
              </div>
              {order.payload?.items && (
                <div className="mt-3 space-y-1">
                  {order.payload.items.map((item: any, idx: number) => (
                    <div key={idx} className="text-sm text-black">{item.name} x{item.quantity}</div>
                  ))}
                </div>
              )}
              <div className="mt-3">
                <button onClick={() => updateStatus(order.id, 'COMPLETED')}
                  className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400">
                  Mark Complete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
