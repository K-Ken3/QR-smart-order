'use client';

import { useEffect, useState, use, useRef } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { getSocket, connectSocket } from '@/lib/socket';

interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes: string | null;
}

interface OrderData {
  receiptNumber: string | null;
  totalAmount: number;
  paymentStatus: string | null;
  confirmedByReceptionist: boolean;
  paidAt: string | null;
  createdAt: string;
  branch: { name: string; currency: string; address: string | null };
  location: { name: string };
  items: OrderItem[];
}

interface RequestData {
  id: string;
  status: string;
  serviceType: string;
  createdAt: string;
  location: { name: string };
  assignedTo: { firstName: string; lastName: string } | null;
  totalAmount: number | null;
  paymentStatus: string | null;
  receiptNumber: string | null;
  confirmedByReceptionist: boolean;
  paidAt: string | null;
  items: { id: string; quantity: number; unitPrice: number; menuItem: { name: string } | null }[];
}

const STATUS_FLOW = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'];

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Order Received',
  ASSIGNED: 'Being Prepared',
  IN_PROGRESS: 'Preparing Your Order',
  COMPLETED: 'Ready for Payment',
};

export default function GuestOrderPage({ params }: { params: Promise<{ token: string; requestId: string }> }) {
  const { token, requestId } = use(params);
  const [order, setOrder] = useState<RequestData | null>(null);
  const [receipt, setReceipt] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReceipt, setShowReceipt] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadOrder();
  }, [requestId]);

  useEffect(() => {
    const socket = connectSocket();
    socket.on('request:status_changed', (data: any) => {
      if (data.requestId === requestId) loadOrder();
    });
    socket.on('request:checkout', (data: any) => {
      if (data.requestId === requestId) loadOrder();
    });
    socket.on('request:payment_confirmed', (data: any) => {
      if (data.requestId === requestId) {
        loadOrder();
        loadReceipt();
      }
    });
    return () => {
      socket.off('request:status_changed');
      socket.off('request:checkout');
      socket.off('request:payment_confirmed');
    };
  }, [requestId]);

  async function loadOrder() {
    try {
      const data = await api.get(`/requests/${requestId}`) as any;
      setOrder(data);
      if (data.paymentStatus === 'PAID' && data.confirmedByReceptionist) {
        loadReceipt();
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function loadReceipt() {
    try {
      const data = await api.get(`/requests/${requestId}/public-receipt`) as any;
      setReceipt(data);
    } catch { /* ignore */ }
  }

  function printReceipt() {
    const printContent = receiptRef.current;
    if (!printContent) return;
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;
    win.document.write(`
      <html><head><title>Receipt #${receipt?.receiptNumber}</title>
      <style>
        body { font-family: 'Courier New', monospace; padding: 20px; max-width: 380px; margin: 0 auto; }
        .center { text-align: center; }
        .line { border-top: 1px dashed #000; margin: 10px 0; }
        .row { display: flex; justify-content: space-between; margin: 4px 0; }
        .bold { font-weight: bold; }
        .large { font-size: 18px; }
      </style></head><body>${printContent.innerHTML}</body></html>
    `);
    win.document.close();
    win.print();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg text-center">
          <h1 className="text-2xl font-bold text-black">Order Not Found</h1>
          <p className="mt-2 text-slate-600">This order could not be found.</p>
          <Link href={`/scan/${token}`} className="mt-6 inline-block rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-black hover:bg-amber-400">
            Back to Menu
          </Link>
        </div>
      </main>
    );
  }

  const currentStep = STATUS_FLOW.indexOf(order.status);
  const isPaid = order.paymentStatus === 'PAID' && order.confirmedByReceptionist;
  const total = order.totalAmount ?? order.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-lg">

        {/* Thank you screen after payment confirmed */}
        {isPaid && (
          <div className="rounded-3xl border-2 border-emerald-200 bg-white p-8 shadow-lg text-center mb-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mb-4">
              <svg className="h-10 w-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-black">Thank You!</h1>
            <p className="mt-3 text-lg text-slate-700">Your payment has been confirmed.</p>
            <p className="mt-1 text-sm text-slate-600">We appreciate your visit. Enjoy your day!</p>
            {receipt && (
              <p className="mt-4 text-xs text-slate-500">Receipt #{receipt.receiptNumber}</p>
            )}
            <div className="mt-6 flex flex-col gap-3">
              {receipt && (
                <button onClick={() => setShowReceipt(true)}
                  className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-400">
                  View & Print Receipt
                </button>
              )}
              <Link href={`/scan/${token}/feedback`}
                className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 text-center">
                Leave Feedback
              </Link>
            </div>
          </div>
        )}

        {/* Order tracking card */}
        <div className={`rounded-3xl border bg-white p-6 shadow-lg ${isPaid ? 'border-emerald-200' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-black">Order Status</h1>
              <p className="text-sm text-slate-600">{order.location.name}</p>
            </div>
            {order.receiptNumber && (
              <span className="text-xs text-slate-500">#{order.receiptNumber}</span>
            )}
          </div>

          {/* Status stepper */}
          {!isPaid && (
            <div className="mb-6">
              {STATUS_FLOW.map((step, idx) => {
                const isDone = idx <= currentStep;
                const isCurrent = idx === currentStep;
                return (
                  <div key={step} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${isDone ? 'bg-amber-500 text-black' : 'bg-slate-200 text-slate-500'}`}>
                        {isDone ? (isCurrent ? '●' : '✓') : idx + 1}
                      </div>
                      {idx < STATUS_FLOW.length - 1 && (
                        <div className={`w-0.5 h-6 ${idx < currentStep ? 'bg-amber-500' : 'bg-slate-200'}`} />
                      )}
                    </div>
                    <div className="pt-1">
                      <p className={`text-sm font-medium ${isCurrent ? 'text-amber-600' : isDone ? 'text-black' : 'text-slate-400'}`}>
                        {STATUS_LABELS[step]}
                      </p>
                      {isCurrent && <p className="text-xs text-slate-500 mt-0.5">Current</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isPaid && (
            <div className="mb-6 flex items-center gap-3 rounded-xl bg-emerald-50 p-4">
              <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold">✓</div>
              <div>
                <p className="text-sm font-medium text-emerald-700">Payment Confirmed</p>
                <p className="text-xs text-slate-500">{order.paidAt ? new Date(order.paidAt).toLocaleString() : ''}</p>
              </div>
            </div>
          )}

          {/* Items */}
          {order.items.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-black mb-2">Items Ordered</h3>
              <div className="space-y-2">
                {order.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-black">{item.menuItem?.name ?? 'Item'} x{item.quantity}</span>
                    <span className="text-black font-medium">RWF {(Number(item.unitPrice) * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3 flex justify-between">
                <span className="text-lg font-bold text-black">Total</span>
                <span className="text-lg font-bold text-black">RWF {total.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {order.status === 'COMPLETED' && !isPaid && (
            <div className="mt-6 rounded-xl bg-amber-50 p-4 text-center">
              <p className="text-sm text-amber-700 font-medium">Your order is ready!</p>
              <p className="text-xs text-slate-600 mt-1">Please proceed to the reception desk for payment.</p>
            </div>
          )}

          {!isPaid && order.status !== 'COMPLETED' && (
            <div className="mt-4 text-center">
              <p className="text-xs text-slate-500">This page updates automatically in real-time.</p>
            </div>
          )}
        </div>

        {/* Receipt view button */}
        {receipt && !isPaid && (
          <button onClick={() => setShowReceipt(true)}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-black hover:bg-slate-50">
            View Receipt
          </button>
        )}

        <Link href={`/scan/${token}`}
          className="mt-4 block text-center text-sm text-amber-600 hover:text-amber-500">
          ← Back to {order.location.name}
        </Link>
      </div>

      {/* Receipt modal */}
      {showReceipt && receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowReceipt(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div ref={receiptRef}>
              <div className="text-center border-b border-slate-200 pb-4 mb-4">
                <h2 className="text-lg font-bold text-black">{receipt.branch.name}</h2>
                <p className="text-xs text-slate-600">{receipt.branch.address}</p>
                <p className="text-xs text-slate-600 mt-1">Receipt #{receipt.receiptNumber}</p>
                <p className="text-xs text-slate-600">{new Date(receipt.createdAt).toLocaleString()}</p>
              </div>
              <div className="space-y-1 mb-4">
                {receipt.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-black">{item.name} x{item.quantity}</span>
                    <span className="text-black">RWF {item.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 pt-3 mb-4">
                <div className="flex justify-between">
                  <span className="text-lg font-bold text-black">Total</span>
                  <span className="text-lg font-bold text-black">RWF {receipt.totalAmount.toFixed(2)}</span>
                </div>
              </div>
              <div className="text-center mb-4">
                {receipt.paymentStatus === 'PAID' ? (
                  <span className="inline-flex rounded-full bg-emerald-100 text-emerald-700 px-4 py-1 text-sm font-medium">PAID ✓</span>
                ) : (
                  <span className="inline-flex rounded-full bg-amber-100 text-amber-700 px-4 py-1 text-sm font-medium">AWAITING PAYMENT</span>
                )}
              </div>
              <p className="text-center text-xs text-slate-500">Thank you for your visit!</p>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={printReceipt}
                className="flex-1 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">
                Print
              </button>
              <button onClick={() => setShowReceipt(false)}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-black hover:bg-slate-200">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
