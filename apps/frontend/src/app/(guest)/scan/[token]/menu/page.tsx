'use client';

import { useEffect, useState } from 'react';
import { useCartStore } from '@/stores/cart.store';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/toast';

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  status: string;
  sectionName: string | null;
  displayOrder: number;
}

interface LocationContext {
  location: { id: string; name: string; locationType: string };
  serviceCatalog: any[];
}

export default function GuestMenuPage({ params }: { params: { token: string } }) {
  const [context, setContext] = useState<LocationContext | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { items, addItem, removeItem, updateQuantity, clearCart, getSubtotal } = useCartStore();

  useEffect(() => {
    api.post('/qr/validate', { token: params.token })
      .then(async (res: any) => {
        setContext(res);
        try {
          const menuRes = await api.get(`/qr/scan/${params.token}/menu`) as any;
          const items: MenuItem[] = (menuRes?.menuItems ?? []).map((item: any) => ({
            ...item,
          }));
          setMenuItems(items.filter((i) => i.status === 'AVAILABLE'));
        } catch { /* menu might not exist */ }
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, [params.token]);

  const grouped = menuItems.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const cat = item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const handleOrder = async () => {
    if (items.length === 0 || !context) return;
    setSubmitting(true);
    try {
      await api.post('/requests', {
        source_type: 'QR_SCAN',
        location_id: context.location.id,
        service_type: 'FOOD_AND_BEVERAGE',
        payload: {
          items: items.map((i) => ({ menuItemId: i.menuItemId, name: i.name, quantity: i.quantity, unitPrice: i.price })),
          subtotal: getSubtotal(),
        },
      });
      clearCart();
      showToast('Order placed successfully!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to place order', 'error');
    } finally {
      setSubmitting(false);
    }
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
        <h1 className="text-2xl sm:text-3xl font-bold text-black mb-6">Menu {context ? `- ${context.location.name}` : ''}</h1>

        {Object.entries(grouped).map(([category, catItems]) => (
          <div key={category} className="mb-8">
            <h2 className="text-lg font-semibold text-black mb-3">{category.replace('_', ' ')}</h2>
            <div className="space-y-3">
              {catItems.map((item) => {
                const cartItem = items.find((i) => i.menuItemId === item.id);
                return (
                  <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{item.name}</p>
                      {item.description && <p className="text-sm text-slate-700">{item.description}</p>}
                      <p className="text-sm font-semibold text-amber-600 mt-1">${item.price.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {cartItem ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateQuantity(item.id, cartItem.quantity - 1)}
                            className="h-8 w-8 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100">-</button>
                          <span className="w-8 text-center text-sm font-medium">{cartItem.quantity}</span>
                          <button onClick={() => addItem({ menuItemId: item.id, name: item.name, price: item.price })}
                            className="h-8 w-8 rounded-full bg-amber-500 text-slate-900 hover:bg-amber-400">+</button>
                        </div>
                      ) : (
                        <button onClick={() => addItem({ menuItemId: item.id, name: item.name, price: item.price })}
                          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400">
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {items.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-4 shadow-lg">
            <div className="mx-auto max-w-3xl flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-700">{items.length} item(s)</p>
                <p className="text-lg font-bold text-slate-900">${getSubtotal().toFixed(2)}</p>
              </div>
              <button onClick={handleOrder} disabled={submitting}
                className="rounded-2xl bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50">
                {submitting ? 'Placing Order...' : 'Place Order'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
