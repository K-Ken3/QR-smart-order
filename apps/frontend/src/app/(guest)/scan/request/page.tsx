interface GuestRequestPageProps {
  params: { token: string };
}

export default function GuestRequestPage({ params }: GuestRequestPageProps) {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
        <h1 className="text-3xl font-semibold text-slate-900">Request Status</h1>
        <p className="mt-2 text-slate-500">Real-time request tracking is coming soon for token: {params.token}</p>
      </div>
    </main>
  );
}
