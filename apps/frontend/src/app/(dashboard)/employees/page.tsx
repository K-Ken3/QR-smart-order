'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { showToast } from '@/components/ui/toast';
import { PasswordInput } from '@/components/ui/password-input';

interface Employee { id: string; email: string; firstName: string; lastName: string; role: string; branchId: string; isClockedIn: boolean; isActive: boolean; _count?: { assignedRequests: number }; }
interface Branch { id: string; name: string; }

export default function EmployeesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', password: '', role: 'EMPLOYEE' });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/branches').then((res: any) => {
      const b = Array.isArray(res) ? res : res.data ?? [];
      setBranches(b);
      if (b.length > 0) { setBranchId(b[0].id); loadEmployees(b[0].id); }
      setLoading(false);
    }).catch(() => {
      showToast('Could not load branches. Check your connection.', 'error');
      setLoading(false);
    });
  }, []);

  async function loadEmployees(bId: string) {
    try {
      const res = await api.get(`/branches/${bId}/employees`) as any;
      setEmployees(Array.isArray(res) ? res : res.data ?? []);
    } catch { /* ignore */ }
  }

  async function createEmployee() {
    if (!branchId) { showToast('No branch selected. Please wait for branches to load.', 'error'); return; }
    if (!form.email || !form.firstName || !form.lastName) { showToast('Please fill in all required fields.', 'error'); return; }
    try {
      await api.post(`/branches/${branchId}/employees`, form);
      showToast('Employee created', 'success');
      setShowCreate(false);
      setForm({ email: '', firstName: '', lastName: '', password: '', role: 'EMPLOYEE' });
      loadEmployees(branchId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  }

  async function clockIn(id: string) {
    try { await api.post(`/employees/${id}/clock-in`, {}); loadEmployees(branchId!); } catch (err) { showToast(err instanceof Error ? err.message : 'Failed', 'error'); }
  }

  async function clockOut(id: string) {
    try { await api.post(`/employees/${id}/clock-out`, {}); loadEmployees(branchId!); } catch (err) { showToast(err instanceof Error ? err.message : 'Failed', 'error'); }
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Employee Management</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center w-full sm:w-auto">
          <select value={branchId ?? ''} onChange={(e) => { setBranchId(e.target.value); loadEmployees(e.target.value); }}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-black/60 placeholder:text-black/40 focus:outline-none">
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">
            + New Employee
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-black mb-4">Create Employee</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First Name" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last Name" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none" />
            <PasswordInput value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-black/60 placeholder:text-black/40 focus:outline-none">
              {['EMPLOYEE', 'RECEPTIONIST', 'KITCHEN_STAFF', 'BRANCH_MANAGER'].map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={createEmployee} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400">Create</button>
            <button onClick={() => setShowCreate(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-black hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      {branches.length === 0 && !loading && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No branches found. Please create a branch first before adding employees.
        </div>
      )}

      <div className="space-y-3">
        {employees.map((emp) => (
          <div key={emp.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-black">{emp.firstName} {emp.lastName}</p>
                <p className="text-sm text-slate-700">{emp.email} &middot; {emp.role.replace('_', ' ')}</p>
                <p className="text-xs text-slate-600">Active tasks: {emp._count?.assignedRequests ?? 0}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${emp.isClockedIn ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                  {emp.isClockedIn ? 'Clocked In' : 'Off Duty'}
                </span>
                {emp.isClockedIn ? (
                  <button onClick={() => clockOut(emp.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-black hover:bg-slate-50">Clock Out</button>
                ) : (
                  <button onClick={() => clockIn(emp.id)} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs text-white hover:bg-emerald-400">Clock In</button>
                )}
              </div>
            </div>
          </div>
        ))}
        {employees.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-700">No employees yet</div>}
      </div>
    </div>
  );
}
