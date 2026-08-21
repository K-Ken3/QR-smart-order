'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/toast';
import { statusColor } from '@/lib/utils';

interface MenuItem { id: string; name: string; description: string | null; category: string; price: number; status: string; stockQty: number | null; displayOrder: number; sectionName: string | null; imageUrl: string | null; }
interface Branch { id: string; name: string; }

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
const API_ROOT = API_BASE.replace(/\/api$/, '');

export default function MenuManagementPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState({ name: '', description: '', category: 'FOOD', price: '', stockQty: '', sectionName: '', displayOrder: '0' });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/branches').then((res: any) => {
      const b = Array.isArray(res) ? res : res.data ?? [];
      setBranches(b);
      if (b.length > 0) { setBranchId(b[0].id); loadMenu(b[0].id); }
      setLoading(false);
    }).catch(() => {
      showToast('Could not load branches. Check your connection.', 'error');
      setLoading(false);
    });
  }, []);

  async function loadMenu(bId: string) {
    try {
      const res = await api.get(`/branches/${bId}/menu`) as any;
      setItems(res.menuItems ?? []);
    } catch { setItems([]); }
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/menu/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setPhotoUrl(data.url);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    }
    setUploading(false);
  }

  async function saveItem() {
    if (!branchId) { showToast('No branch selected. Please wait for branches to load.', 'error'); return; }
    if (!form.name || !form.price) { showToast('Name and price are required.', 'error'); return; }
    const body = { ...form, price: parseFloat(form.price), stockQty: form.stockQty ? parseInt(form.stockQty) : undefined, displayOrder: parseInt(form.displayOrder) || 0, imageUrl: photoUrl ?? undefined };
    try {
      if (editItem) {
        await api.patch(`/menu/items/${editItem.id}`, body);
        showToast('Item updated', 'success');
      } else {
        await api.post(`/branches/${branchId}/menu/items`, body);
        showToast('Item created', 'success');
      }
      setShowCreate(false);
      setEditItem(null);
      setForm({ name: '', description: '', category: 'FOOD', price: '', stockQty: '', sectionName: '', displayOrder: '0' });
      setPhotoUrl(null);
      loadMenu(branchId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  async function toggleStatus(item: MenuItem) {
    const newStatus = item.status === 'AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE';
    try {
      await api.patch(`/menu/items/${item.id}`, { status: newStatus });
      loadMenu(branchId!);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this item?')) return;
    try {
      await api.delete(`/menu/items/${id}`);
      showToast('Item deleted', 'success');
      if (branchId) loadMenu(branchId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  function startEdit(item: MenuItem) {
    setEditItem(item);
    setForm({ name: item.name, description: item.description ?? '', category: item.category, price: String(item.price), stockQty: item.stockQty?.toString() ?? '', sectionName: item.sectionName ?? '', displayOrder: String(item.displayOrder) });
    setPhotoUrl(item.imageUrl ?? null);
    setShowCreate(true);
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Menu Management</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center w-full sm:w-auto">
          <select value={branchId ?? ''} onChange={(e) => { setBranchId(e.target.value); loadMenu(e.target.value); }}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black/60 placeholder:text-black/40 focus:outline-none">
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={() => { setShowCreate(true); setEditItem(null); setPhotoUrl(null); setForm({ name: '', description: '', category: 'FOOD', price: '', stockQty: '', sectionName: '', displayOrder: '0' }); }}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">
            + New Item
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-black mb-4">{editItem ? 'Edit Item' : 'Create Menu Item'}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none">
              {['FOOD', 'BEVERAGE', 'DESSERT', 'AMENITY', 'CUSTOM'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Price" type="number" step="0.01"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <input value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: e.target.value })} placeholder="Stock Qty (optional)" type="number"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <input value={form.sectionName} onChange={(e) => setForm({ ...form, sectionName: e.target.value })} placeholder="Section Name"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <input value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} placeholder="Display Order" type="number"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-black mb-1">Photo</label>
              <div className="flex items-center gap-4">
                {photoUrl ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl.startsWith('http') ? photoUrl : `${API_ROOT}${photoUrl}`} alt="Preview" className="h-24 w-24 rounded-xl object-cover" />
                    <button onClick={() => setPhotoUrl(null)} className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs text-white hover:bg-rose-400">&times;</button>
                  </div>
                ) : (
                  <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-amber-400 hover:bg-amber-50 transition">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
                    {uploading ? (
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                    ) : (
                      <div className="text-center">
                        <svg className="mx-auto h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="mt-1 text-xs text-slate-500">Upload</p>
                      </div>
                    )}
                  </label>
                )}
                <p className="text-xs text-slate-600">{photoUrl ? 'Photo uploaded. Click the × to remove.' : 'Click to upload a photo (max 5 MB)'}</p>
              </div>
            </div>
            <div className="sm:col-span-2">
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm" rows={2} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={saveItem} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">{editItem ? 'Update' : 'Create'}</button>
            <button onClick={() => { setShowCreate(false); setEditItem(null); }} className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-black hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      {branches.length === 0 && !loading && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No branches found. Please create a branch first before adding menu items.
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-4">
              {item.imageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={item.imageUrl.startsWith('http') ? item.imageUrl : `${API_ROOT}${item.imageUrl}`} alt={item.name} className="h-14 w-14 rounded-xl object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-black truncate">{item.name}</p>
                <p className="text-sm text-slate-700">{item.category} &middot; ${item.price.toFixed(2)} {item.stockQty !== null ? `&middot; Stock: ${item.stockQty}` : ''}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusColor(item.status)}`}>{item.status}</span>
                <button onClick={() => toggleStatus(item)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-black hover:bg-slate-50">
                  {item.status === 'AVAILABLE' ? 'Mark Unavailable' : 'Mark Available'}
                </button>
                <button onClick={() => startEdit(item)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-black hover:bg-slate-50">Edit</button>
                <button onClick={() => deleteItem(item.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50">Delete</button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-700">No menu items yet</div>}
      </div>
    </div>
  );
}
