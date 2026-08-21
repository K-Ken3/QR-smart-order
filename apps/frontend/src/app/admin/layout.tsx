'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { ToastContainer } from '@/components/ui/toast';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, loadUser } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { loadUser(); }, [loadUser]);
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || user?.role !== 'SUPER_ADMIN')) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading) return <div className="flex h-screen items-center justify-center"><div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;

  const navItems = [
    { name: 'Dashboard', href: '/admin/tenants' },
    { name: 'Audit Logs', href: '/admin/audit' },
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm md:hidden"
        aria-label="Open menu"
      >
        <svg className="h-5 w-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white p-4
        transition-transform duration-200 ease-in-out
        md:relative md:translate-x-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between mb-6 px-3">
          <Link href="/" className="text-lg font-bold text-black" onClick={() => setMobileOpen(false)}>
            SmartServe <span className="text-amber-500">Admin</span>
          </Link>
          <button onClick={() => setMobileOpen(false)} className="md:hidden text-slate-400 hover:text-black">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
              className={`block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                pathname === item.href
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-slate-800 hover:bg-slate-50'
              }`}>
              {item.name}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 pt-16 md:p-6 md:pt-6">{children}</main>
      <ToastContainer />
    </div>
  );
}
