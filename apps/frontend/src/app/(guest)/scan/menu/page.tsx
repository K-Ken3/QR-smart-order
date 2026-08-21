import Link from 'next/link';

interface GuestMenuPageProps {
  params: { token: string };
}

export default async function GuestMenuPage({ params }: GuestMenuPageProps) {
  const { token } = params;

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
        <h1 className="text-3xl font-semibold text-slate-900">Guest Menu</h1>
        <p className="mt-2 text-slate-500">
          Load menu for token <span className="font-mono">{token}</span> and place your order.
        </p>
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl bg-slate-100 p-4 text-slate-800">
            <p className="font-semibold">Service catalog and menu pages are ready.</p>
            <p className="text-sm text-slate-600">This page will fetch QR validation and show guest options.</p>
          </div>
          <Link
            href="/"
            className="inline-flex rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
          >
            Return to home
          </Link>
        </div>
      </div>
    </main>
  );
}
