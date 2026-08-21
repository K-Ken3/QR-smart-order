'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface AuditLog { id: string; tenantId: string | null; actorId: string | null; actorRole: string | null; actionType: string; entityType: string; entityId: string; ipAddress: string | null; createdAt: string; }

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionType, setActionType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadLogs(); }, [page]);

  async function loadLogs() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (actionType) params.set('actionType', actionType);
    if (entityType) params.set('entityType', entityType);
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    try {
      const res = await api.get(`/audit-logs?${params}`) as any;
      setLogs(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
    } catch { /* ignore */ }
    setLoading(false);
  }

  function exportPdf() {
    const rows = logs.length > 0 ? logs : [];
    const tableRows = rows.map((log) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;">${formatDate(log.createdAt)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;">${log.actionType}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;">${log.entityType}: ${log.entityId.slice(0, 8)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;">${log.actorId?.slice(0, 8) ?? 'System'} (${log.actorRole ?? '-'})</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;">${log.ipAddress ?? '-'}</td>
      </tr>`).join('');

    const dateRange = [fromDate ? `From: ${fromDate}` : '', toDate ? `To: ${toDate}` : ''].filter(Boolean).join(' | ');
    const filters = [actionType ? `Action: ${actionType}` : '', entityType ? `Entity: ${entityType}` : '', dateRange].filter(Boolean).join(' | ');

    const html = `<!DOCTYPE html><html><head><title>Audit Logs</title>
      <style>body{font-family:Arial,sans-serif;margin:24px;color:#1e293b;}
      h1{font-size:20px;margin:0 0 4px;} h2{font-size:12px;color:#64748b;margin:0 0 16px;font-weight:normal;}
      table{width:100%;border-collapse:collapse;} th{text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb;font-size:11px;color:#64748b;}
      .footer{margin-top:16px;font-size:10px;color:#94a3b8;}</style></head><body>
      <h1>Audit Logs</h1>
      ${filters ? `<h2>${filters}</h2>` : ''}
      <p style="font-size:12px;color:#64748b;margin:0 0 12px;">${total} total entries</p>
      <table><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Actor</th><th>IP</th></tr></thead>
      <tbody>${tableRows}</tbody></table>
      <div class="footer">Generated ${new Date().toLocaleString()}</div></body></html>`;

    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 300);
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /></div>;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Audit Logs</h1>
        <button onClick={exportPdf} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400">Export PDF</button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <input value={actionType} onChange={(e) => setActionType(e.target.value)} placeholder="Action type" className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black" />
        <input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="Entity type" className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black" />
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black" />
        <button onClick={() => { setPage(1); loadLogs(); }} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400">Search</button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-black">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-black">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-black">Entity</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-black">Actor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-black">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 text-xs text-slate-700">{formatDate(log.createdAt)}</td>
                <td className="px-4 py-2"><span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{log.actionType}</span></td>
                <td className="px-4 py-2 text-xs text-slate-800">{log.entityType}: {log.entityId.slice(0, 8)}</td>
                <td className="px-4 py-2 text-xs text-slate-800">{log.actorId?.slice(0, 8) ?? 'System'} ({log.actorRole ?? '-'})</td>
                <td className="px-4 py-2 text-xs text-slate-700">{log.ipAddress ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <div className="p-8 text-center text-slate-700">No audit logs</div>}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-700">{total} total entries</p>
        <div className="flex gap-2">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-black disabled:opacity-50">Previous</button>
          <span className="px-3 py-1.5 text-sm text-black">Page {page}</span>
          <button onClick={() => setPage(page + 1)} disabled={logs.length < 50}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-black disabled:opacity-50">Next</button>
        </div>
      </div>
    </div>
  );
}
