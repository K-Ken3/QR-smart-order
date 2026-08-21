'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface BranchAnalytics {
  totalRequests: number;
  requestsByStatus: { status: string; count: number }[];
  requestsByServiceType: { serviceType: string; count: number }[];
  busiestLocations: { locationId: string; locationName: string; count: number }[];
}

interface Employee {
  employeeId: string;
  firstName: string;
  lastName: string;
  role: string;
  completedTasks: number;
  totalAssigned: number;
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<BranchAnalytics | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/branches').then(async (res: any) => {
      const branches = Array.isArray(res) ? res : res.data ?? [];
      if (branches.length > 0) {
        setBranchId(branches[0].id);
        await loadAnalytics(branches[0].id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function loadAnalytics(bId?: string, fromDate?: string, toDate?: string) {
    const id = bId ?? branchId;
    if (!id) return;
    const params = new URLSearchParams({ branchId: id });
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    try {
      const [a, e] = await Promise.all([
        api.get(`/analytics/branches/${id}?${params}`) as any,
        api.get(`/analytics/branches/${id}/employees?${params}`) as any,
      ]);
      setAnalytics(a);
      setEmployees(Array.isArray(e) ? e : []);
    } catch { /* ignore */ }
  }

  function handleFilter() {
    loadAnalytics(undefined, from || undefined, to || undefined);
  }

  function handleExport() {
    if (!analytics) return;
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 20;

      doc.setFontSize(18);
      doc.text('SmartServe QR - Analytics Report', pageWidth / 2, y, { align: 'center' });
      y += 10;
      doc.setFontSize(10);
      doc.setTextColor(120);
      const dateRange = from && to ? `${from} to ${to}` : from ? `From ${from}` : to ? `Until ${to}` : 'All time';
      doc.text(`Branch: ${branchId}  |  Period: ${dateRange}  |  Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, y, { align: 'center' });
      doc.setTextColor(0);
      y += 14;

      doc.setFontSize(13);
      doc.text('Overview', 14, y);
      y += 8;
      doc.setFontSize(11);
      doc.text(`Total Requests: ${analytics.totalRequests}`, 14, y);
      y += 7;
      analytics.requestsByStatus.forEach((s) => {
        doc.text(`  ${s.status.replace('_', ' ')}: ${s.count}`, 14, y);
        y += 6;
      });
      y += 6;

      doc.setFontSize(13);
      doc.text('By Service Type', 14, y);
      y += 8;
      doc.setFontSize(11);
      if (analytics.requestsByServiceType.length === 0) {
        doc.text('  No data', 14, y);
        y += 6;
      }
      analytics.requestsByServiceType.forEach((s) => {
        doc.text(`  ${s.serviceType.replace('_', ' ')}: ${s.count}`, 14, y);
        y += 6;
      });
      y += 6;

      doc.setFontSize(13);
      doc.text('Busiest Locations', 14, y);
      y += 8;
      doc.setFontSize(11);
      if (analytics.busiestLocations.length === 0) {
        doc.text('  No data', 14, y);
        y += 6;
      }
      analytics.busiestLocations.forEach((l) => {
        doc.text(`  ${l.locationName}: ${l.count}`, 14, y);
        y += 6;
      });
      y += 6;

      if (employees.length > 0) {
        doc.setFontSize(13);
        doc.text('Employee Performance', 14, y);
        y += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Employee', 14, y);
        doc.text('Role', 80, y);
        doc.text('Completed', 130, y);
        doc.text('Assigned', 160, y);
        doc.setFont('helvetica', 'normal');
        y += 6;
        doc.line(14, y, pageWidth - 14, y);
        y += 4;

        employees.forEach((emp) => {
          doc.text(`${emp.firstName} ${emp.lastName}`, 14, y);
          doc.text(emp.role, 80, y);
          doc.text(String(emp.completedTasks), 130, y);
          doc.text(String(emp.totalAssigned), 160, y);
          y += 6;
        });
      }

      doc.save(`analytics-report-${branchId}.pdf`);
    });
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Analytics Dashboard</h1>
        <div className="flex flex-wrap items-center gap-3">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black/50" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black/50" />
          <button onClick={handleFilter} className="rounded-xl bg-amber-500 px-4 py-2 text-sm text-black hover:bg-amber-400">Filter</button>
          <button onClick={handleExport} className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-black hover:bg-slate-50">Export PDF</button>
        </div>
      </div>

      {analytics && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-700">Total Requests</p>
              <p className="text-2xl font-bold text-black">{analytics.totalRequests}</p>
            </div>
            {analytics.requestsByStatus.slice(0, 3).map((s) => (
              <div key={s.status} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-700">{s.status.replace('_', ' ')}</p>
                <p className="text-2xl font-bold text-black">{s.count}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-black mb-3">By Service Type</h2>
              {analytics.requestsByServiceType.map((s) => (
                <div key={s.serviceType} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-black">{s.serviceType.replace('_', ' ')}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 rounded-full bg-amber-400" style={{ width: `${Math.max(8, (s.count / Math.max(...analytics.requestsByServiceType.map((x) => x.count), 1)) * 120)}px` }} />
                    <span className="text-sm font-medium text-black w-8 text-right">{s.count}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-black mb-3">Busiest Locations</h2>
              {analytics.busiestLocations.length === 0 ? (
                <p className="text-sm text-slate-600">No data</p>
              ) : analytics.busiestLocations.map((l) => (
                <div key={l.locationId} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-black">{l.locationName}</span>
                  <span className="text-sm font-medium text-black">{l.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-black mb-3">Employee Performance</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Employee</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Role</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-700">Completed</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-700">Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.employeeId} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 text-black">{emp.firstName} {emp.lastName}</td>
                      <td className="px-3 py-2 text-slate-700">{emp.role}</td>
                      <td className="px-3 py-2 text-right font-medium text-black">{emp.completedTasks}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{emp.totalAssigned}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
