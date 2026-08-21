'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/toast';
import { statusColor } from '@/lib/utils';

interface Branch { id: string; name: string; }
interface Location { id: string; name: string; locationType: string; status: string; branchId: string; floor?: string; }
interface QrCode { id: string; token: string; pngUrl: string; scanUrl: string; validityPeriod: string; isActive: boolean; createdAt: string; }

export default function LocationsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [qrLocationId, setQrLocationId] = useState<string | null>(null);
  const [qrCodes, setQrCodes] = useState<Record<string, QrCode>>({});
  const [newLoc, setNewLoc] = useState({ name: '', locationType: 'DINING_TABLE', floor: '', zone: '' });
  const [validity, setValidity] = useState('HOURS_24');

  useEffect(() => {
    api.get('/branches').then((res: any) => {
      const b = Array.isArray(res) ? res : res.data ?? [];
      setBranches(b);
      if (b.length > 0) { setBranchId(b[0].id); loadLocations(b[0].id); }
    });
  }, []);

  async function loadLocations(bId: string) {
    try {
      const res = await api.get(`/branches/${bId}/locations`) as any;
      setLocations(Array.isArray(res) ? res : res.data ?? []);
    } catch { /* ignore */ }
  }

  async function createLocation() {
    if (!branchId) return;
    try {
      await api.post(`/branches/${branchId}/locations`, newLoc);
      showToast('Location created', 'success');
      setShowCreate(false);
      setNewLoc({ name: '', locationType: 'DINING_TABLE', floor: '', zone: '' });
      loadLocations(branchId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  async function deleteLocation(id: string) {
    if (!confirm('Delete this location?')) return;
    try {
      await api.delete(`/locations/${id}`);
      showToast('Location deleted', 'success');
      if (branchId) loadLocations(branchId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  async function generateQr(locationId: string) {
    try {
      const res = await api.post(`/locations/${locationId}/qr/generate`, { validityPeriod: validity }) as any;
      setQrCodes((prev) => ({ ...prev, [locationId]: res }));
      showToast('QR code generated', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  function downloadQr(locationId: string) {
    const qr = qrCodes[locationId];
    if (!qr?.pngUrl) return;
    const a = document.createElement('a');
    a.href = qr.pngUrl;
    a.download = `qr-${locationId}.png`;
    a.click();
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Locations & QR Codes</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center w-full sm:w-auto">
          <select value={branchId ?? ''} onChange={(e) => { setBranchId(e.target.value); loadLocations(e.target.value); }}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">
            + New Location
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-black mb-4">Create Location</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <input value={newLoc.name} onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })} placeholder="Name"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <select value={newLoc.locationType} onChange={(e) => setNewLoc({ ...newLoc, locationType: e.target.value })}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none">
              {['DINING_TABLE', 'HOTEL_ROOM', 'LOUNGE_SEAT', 'HOSPITAL_BED', 'MEETING_ROOM', 'POOLSIDE'].map((t) => (
                <option key={t} value={t}>{t.replace('_', ' ')}</option>
              ))}
            </select>
            <input value={newLoc.floor} onChange={(e) => setNewLoc({ ...newLoc, floor: e.target.value })} placeholder="Floor (optional)"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <input value={newLoc.zone} onChange={(e) => setNewLoc({ ...newLoc, zone: e.target.value })} placeholder="Zone (optional)"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={createLocation} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">Create</button>
            <button onClick={() => setShowCreate(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-black hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {locations.map((loc) => (
          <div key={loc.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-black">{loc.name}</p>
                <p className="text-sm text-slate-700">{loc.locationType.replace('_', ' ')} {loc.floor ? `· Floor ${loc.floor}` : ''}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusColor(loc.status)}`}>{loc.status}</span>
                <div className="flex flex-wrap items-center gap-1">
                  <select value={validity} onChange={(e) => setValidity(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
                    <option value="HOURS_24">24 Hours</option>
                    <option value="DAYS_7">7 Days</option>
                    <option value="DAYS_30">30 Days</option>
                    <option value="NON_EXPIRING">Non-Expiring</option>
                  </select>
                  <button onClick={() => generateQr(loc.id)} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs text-black hover:bg-amber-400">Generate QR</button>
                  {qrCodes[loc.id]?.pngUrl && (
                    <button onClick={() => downloadQr(loc.id)} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50">Download</button>
                  )}
                  <button onClick={() => deleteLocation(loc.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50">Delete</button>
                </div>
              </div>
            </div>
            {qrCodes[loc.id]?.pngUrl && (
              <div className="mt-3 flex justify-center">
                <img src={qrCodes[loc.id].pngUrl} alt={`QR for ${loc.name}`} className="h-40 w-40 rounded-xl border border-slate-200" />
              </div>
            )}
          </div>
        ))}
        {locations.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-700">No locations yet</div>}
      </div>
    </div>
  );
}
