interface GuestFeedbackPageProps {
  params: { token: string };
}

export default function GuestFeedbackPage({ params }: GuestFeedbackPageProps) {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
        <h1 className="text-3xl font-semibold text-slate-900">Feedback</h1>
        <p className="mt-2 text-slate-500">Submit your rating after request completion for token: {params.token}</p>
      </div>
    </main>
  );
}
