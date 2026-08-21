'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import { getSocket, connectSocket } from '@/lib/socket';
import { api } from '@/lib/api';

interface RequestData {
  id: string;
  status: string;
  serviceType: string;
  createdAt: string;
  location: { name: string };
  assignedTo: { firstName: string; lastName: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-rose-100 text-rose-700',
};

export default function GuestRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.post('/qr/validate', { token })
      .then(async (res: any) => {
        const lid = res.location?.id;
        if (lid) {
          setLocationId(lid);
          try {
            const data = await api.get(`/requests/location/${lid}`) as any;
            setRequests(Array.isArray(data) ? data : data.data ?? []);
          } catch { /* ignore */ }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!locationId) return;
    const socket = connectSocket();

    socket.on('request:status_changed', (data: any) => {
      setRequests((prev) =>
        prev.map((r) => r.id === data.requestId ? { ...r, status: data.newStatus } : r)
      );
    });

    socket.on('request:created', (data: any) => {
      if (data.locationId === locationId || data.location?.id === locationId) {
        setRequests((prev) => [data, ...prev]);
      }
    });

    return () => {
      socket.off('request:status_changed');
      socket.off('request:created');
    };
  }, [locationId]);

  const elapsed = (date: string) => {
    const ms = Date.now() - new Date(date).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-black mb-6">Your Requests</h1>
        {requests.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-slate-700">No requests yet for this location.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div key={req.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{req.serviceType.replace('_', ' ')}</p>
                    <p className="text-sm text-slate-700">{req.location?.name}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[req.status] ?? 'bg-slate-100 text-slate-700'}`}>
                      {req.status.replace('_', ' ')}
                    </span>
                    <p className="mt-1 text-xs text-slate-600">{elapsed(req.createdAt)} ago</p>
                  </div>
                </div>
                {req.assignedTo && (
                  <p className="mt-2 text-xs text-slate-700">
                    Assigned to: {req.assignedTo.firstName} {req.assignedTo.lastName}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
