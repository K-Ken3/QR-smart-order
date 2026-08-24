'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getSocket, connectSocket } from '@/lib/socket';
import { elapsed, statusColor } from '@/lib/utils';
import { showToast } from '@/components/ui/toast';
import { playNotificationSound } from '@/lib/sound';

interface Request {
  id: string;
  status: string;
  serviceType: string;
  sourceType: string;
  createdAt: string;
  totalAmount: number | null;
  paymentStatus: string | null;
  receiptNumber: string | null;
  confirmedByReceptionist: boolean;
  location: { id: string; name: string };
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  notes: string | null;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  isClockedIn: boolean;
  _count?: { assignedRequests: number };
}

export default function ReceptionPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [noteRequestId, setNoteRequestId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    if (!branchId) return;
    loadData();
    const socket = connectSocket();
    socket.emit('join', { room: `branch:${branchId}` });
    socket.on('request:created', (data: any) => {
      setRequests((prev) => [{ ...data, location: { id: data.locationId, name: data.locationName }, assignedTo: null }, ...prev]);
      playNotificationSound();
      showToast(`New ${data.serviceType.replace(/_/g, ' ')} request`, 'info');
    });
    socket.on('request:assigned', (data: any) => {
      setRequests((prev) => prev.map((r) => r.id === data.requestId ? { ...r, status: data.status, assignedTo: { id: data.employeeId, firstName: data.employeeName.split(' ')[0], lastName: data.employeeName.split(' ')[1] ?? '' } } : r));
    });
    socket.on('request:status_changed', (data: any) => {
      setRequests((prev) => prev.map((r) => r.id === data.requestId ? { ...r, status: data.newStatus } : r));
    });
    socket.on('request:cancelled', (data: any) => {
      setRequests((prev) => prev.map((r) => r.id === data.requestId ? { ...r, status: 'CANCELLED' } : r));
    });
    socket.on('request:checkout', () => loadData());
    socket.on('request:payment_confirmed', () => loadData());
    return () => { socket.off('request:created'); socket.off('request:assigned'); socket.off('request:status_changed'); socket.off('request:cancelled'); socket.off('request:checkout'); socket.off('request:payment_confirmed'); };
  }, [branchId]);

  async function loadBranches() {
    try {
      const res = await api.get('/branches') as any;
      const branches = Array.isArray(res) ? res : res.data ?? [];
      if (branches.length > 0) {
        setBranchId(branches[0].id);
      }
      setLoading(false);
    } catch { setLoading(false); }
  }

  async function loadData() {
    if (!branchId) return;
    try {
      const [reqs, emps] = await Promise.all([
        api.get(`/requests?branchId=${branchId}`) as any,
        api.get(`/branches/${branchId}/employees`) as any,
      ]);
      setRequests(Array.isArray(reqs) ? reqs : reqs.data ?? []);
      setEmployees(Array.isArray(emps) ? emps : emps.data ?? []);
    } catch { /* ignore */ }
  }

  async function handleAssign(requestId: string, employeeId: string) {
    setAssigningId(null);
    try {
      await api.patch(`/requests/${requestId}/assign`, { employeeId });
      showToast('Request assigned', 'success');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to assign', 'error');
    }
  }

  async function handleNote(requestId: string) {
    if (!noteText.trim()) return;
    try {
      await api.post(`/requests/${requestId}/notes`, { note: noteText });
      setNoteRequestId(null);
      setNoteText('');
      showToast('Note added', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add note', 'error');
    }
  }

  async function handleCheckout(requestId: string, method: string) {
    try {
      await api.post(`/requests/${requestId}/checkout`, { paymentMethod: method });
      showToast('Checkout completed', 'success');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Checkout failed', 'error');
    }
  }

  async function handleConfirmPayment(requestId: string) {
    setConfirmingId(requestId);
    try {
      await api.post(`/requests/${requestId}/confirm-payment`, {});
      showToast('Payment confirmed — client notified!', 'success');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to confirm', 'error');
    } finally { setConfirmingId(null); }
  }

  const filtered = requests.filter((r) => filter === 'ALL' || r.status === filter);
  const activeEmployees = employees.filter((e) => e.isClockedIn && !['SUPER_ADMIN', 'BUSINESS_OWNER', 'GUEST'].includes(e.role));
  const pendingPayments = requests.filter((r) => r.paymentStatus === 'PENDING' && r.status === 'COMPLETED');

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Reception Dashboard</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="w-full sm:w-auto rounded-xl border border-slate-300 px-3 py-2 text-sm text-black/60">
          {['ALL', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      {pendingPayments.length > 0 && (
        <div className="mb-6 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-bold text-amber-800 mb-3">⏳ Awaiting Payment Approval ({pendingPayments.length})</h2>
          <div className="space-y-2">
            {pendingPayments.map((req) => (
              <div key={req.id} className="flex items-center justify-between rounded-xl bg-white p-3 border border-amber-200">
                <div>
                  <p className="text-sm font-medium text-black">{req.location.name} &middot; #{req.receiptNumber ?? req.id.slice(0, 8)}</p>
                  <p className="text-xs text-slate-600">{req.totalAmount != null ? `RWF ${Number(req.totalAmount).toFixed(2)}` : 'No amount'} &middot; {elapsed(req.createdAt)}</p>
                </div>
                <button onClick={() => handleConfirmPayment(req.id)} disabled={confirmingId === req.id}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-400 disabled:opacity-50">
                  {confirmingId === req.id ? 'Confirming...' : '✓ Confirm Paid'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-700">No requests found</div>
          ) : filtered.map((req) => {
            const hasItems = (req as any).items && (req as any).items.length > 0;
            return (
              <div key={req.id} className={`rounded-2xl border bg-white p-4 ${req.paymentStatus === 'PAID' ? 'border-emerald-200' : req.paymentStatus === 'PENDING' ? 'border-amber-300' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-black">{req.serviceType.replace(/_/g, ' ')}</p>
                    <p className="text-sm text-slate-700">{req.location.name} &middot; {req.sourceType}</p>
                    <p className="text-xs text-slate-600 mt-1">{elapsed(req.createdAt)}</p>
                    {req.totalAmount != null && (
                      <p className="text-xs font-medium text-amber-700 mt-1">RWF {Number(req.totalAmount).toFixed(2)}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusColor(req.status)}`}>{req.status}</span>
                    {req.paymentStatus && (
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${req.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-700' : req.paymentStatus === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {req.paymentStatus}{req.confirmedByReceptionist ? ' ✓' : ''}
                      </span>
                    )}
                  </div>
                </div>
                {req.assignedTo && (
                  <p className="mt-2 text-xs text-slate-700">Assigned: {req.assignedTo.firstName} {req.assignedTo.lastName}</p>
                )}
                {req.notes && <p className="mt-2 text-xs text-slate-700 italic">&quot;{req.notes}&quot;</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {req.status === 'PENDING' && (
                    <div className="relative">
                      <button onClick={() => setAssigningId(assigningId === req.id ? null : req.id)}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400">
                        Assign
                      </button>
                      {assigningId === req.id && (
                        <div className="absolute top-full left-0 z-10 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                          {activeEmployees.length === 0 ? (
                            <p className="px-2 py-1 text-xs text-slate-600">No available employees</p>
                          ) : activeEmployees.map((emp) => (
                            <button key={emp.id} onClick={() => handleAssign(req.id, emp.id)}
                              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                              <span>{emp.firstName} {emp.lastName}</span>
                              <span className="text-xs text-slate-600">{emp._count?.assignedRequests ?? 0} tasks</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <button onClick={() => { setNoteRequestId(req.id); setNoteText(req.notes ?? ''); }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-black hover:bg-slate-50">
                    Note
                  </button>
                  {req.status === 'COMPLETED' && req.paymentStatus !== 'PAID' && !req.paymentStatus && (
                    <>
                      <button onClick={() => handleCheckout(req.id, 'CASH')}
                        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400">
                        Cash
                      </button>
                      <button onClick={() => handleCheckout(req.id, 'MTN_MOMO')}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400">
                        MoMo
                      </button>
                    </>
                  )}
                  {req.status === 'COMPLETED' && req.paymentStatus === 'PENDING' && !req.confirmedByReceptionist && (
                    <button onClick={() => handleConfirmPayment(req.id)} disabled={confirmingId === req.id}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-400 disabled:opacity-50">
                      {confirmingId === req.id ? 'Confirming...' : '✓ Confirm Payment'}
                    </button>
                  )}
                </div>
                {noteRequestId === req.id && (
                  <div className="mt-3 flex gap-2">
                    <input value={noteText} onChange={(e) => setNoteText(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" placeholder="Internal note..." />
                    <button onClick={() => handleNote(req.id)} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs text-black hover:bg-amber-400">Save</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-black mb-3">Active Employees</h2>
            {activeEmployees.length === 0 ? (
              <p className="text-xs text-slate-600">No clocked-in employees</p>
            ) : activeEmployees.map((emp) => (
              <div key={emp.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-black">{emp.firstName} {emp.lastName}</p>
                  <p className="text-xs text-slate-600">{emp.role}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-black">{emp._count?.assignedRequests ?? 0}</span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-black mb-3">Summary</h2>
            <div className="space-y-2">
              {['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].map((status) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm text-black">{status.replace('_', ' ')}</span>
                  <span className="text-sm font-semibold text-black">{requests.filter((r) => r.status === status).length}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                <span className="text-sm font-medium text-black">Paid Today</span>
                <span className="text-sm font-bold text-emerald-600">{requests.filter((r) => r.paymentStatus === 'PAID').length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
