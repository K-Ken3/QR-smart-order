'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';

const navigation = [
  { name: 'Reception', href: '/reception', roles: ['BUSINESS_OWNER', 'BRANCH_MANAGER', 'RECEPTIONIST'] },
  { name: 'Kitchen', href: '/kitchen', roles: ['BUSINESS_OWNER', 'BRANCH_MANAGER', 'KITCHEN_STAFF'] },
  { name: 'Analytics', href: '/analytics', roles: ['BUSINESS_OWNER', 'BRANCH_MANAGER'] },
  { name: 'Branches', href: '/branches', roles: ['BUSINESS_OWNER'] },
  { name: 'Locations', href: '/locations', roles: ['BUSINESS_OWNER', 'BRANCH_MANAGER'] },
  { name: 'Menu', href: '/menu', roles: ['BUSINESS_OWNER', 'BRANCH_MANAGER'] },
  { name: 'Employees', href: '/employees', roles: ['BUSINESS_OWNER', 'BRANCH_MANAGER'] },
  { name: 'Feedback', href: '/feedback', roles: ['BUSINESS_OWNER', 'BRANCH_MANAGER'] },
  { name: 'Billing', href: '/billing', roles: ['BUSINESS_OWNER'] },
  { name: 'Audit Logs', href: '/audit', roles: ['BUSINESS_OWNER', 'BRANCH_MANAGER'] },
];

const adminNav = [
  { name: 'Tenants', href: '/admin/tenants' },
  { name: 'Metrics', href: '/admin/metrics' },
  { name: 'Audit Logs', href: '/admin/audit' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = user?.role === 'SUPER_ADMIN' ? adminNav : navigation.filter(
    (item) => !item.roles || item.roles.includes(user?.role ?? '')
  );

  function handleLogout() {
    if (confirmLogout) {
      logout();
    } else {
      setConfirmLogout(true);
      setTimeout(() => setConfirmLogout(false), 5000);
    }
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <>
      {/* Mobile hamburger button */}
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
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar - desktop: always visible, mobile: slide-in drawer */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white
          transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-slate-200">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-black" onClick={closeMobile}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="SmartServe" className="h-8 w-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            SmartServe <span className="text-amber-500">QR</span>
          </Link>
          <button onClick={closeMobile} className="md:hidden text-slate-400 hover:text-black" aria-label="Close menu">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeMobile}
              className={`flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                pathname === item.href
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-slate-800 hover:bg-slate-50 hover:text-black'
              }`}
            >
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <div className="text-sm text-slate-800 mb-2 truncate">{user?.email}</div>
          <div className="text-xs text-slate-600 mb-3">{user?.role?.replace('_', ' ')}</div>
          {confirmLogout ? (
            <div className="space-y-2">
              <p className="text-xs text-center text-black font-medium">Are you sure you want to logout?</p>
              <div className="flex gap-2">
                <button onClick={handleLogout}
                  className="flex-1 rounded-xl bg-rose-500 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-400">
                  Yes, Logout
                </button>
                <button onClick={() => setConfirmLogout(false)}
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={handleLogout}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
              Sign Out
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
