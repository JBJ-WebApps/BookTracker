import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

async function callFn(body) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch('/.netlify/functions/manage-users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

export default function UsersPage() {
  const { isAdmin, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  // After create / reset we surface the temp password once so the admin can hand it off.
  const [reveal, setReveal] = useState(null); // { email, password, label }

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, must_change_password')
      .order('full_name', { ascending: true });
    if (error) setErr(error.message);
    else setUsers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) refresh();
  }, [isAdmin, refresh]);

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="bg-white border border-navy-100 rounded-xl p-10 text-center max-w-md mx-auto">
          <h1 className="text-xl font-bold text-navy-700 mb-2">Admin only</h1>
          <p className="text-sm text-navy-500">User management is restricted to administrators.</p>
        </div>
      </div>
    );
  }

  const changeRole = async (u, role) => {
    setErr('');
    setBusyId(u.id);
    const { error } = await supabase.from('profiles').update({ role }).eq('id', u.id);
    setBusyId(null);
    if (error) setErr(error.message);
    else setUsers((prev) => prev.map((p) => (p.id === u.id ? { ...p, role } : p)));
  };

  const saveName = async (u, full_name) => {
    if (full_name === u.full_name) return;
    setErr('');
    const { error } = await supabase.from('profiles').update({ full_name }).eq('id', u.id);
    if (error) setErr(error.message);
    else setUsers((prev) => prev.map((p) => (p.id === u.id ? { ...p, full_name } : p)));
  };

  const resetPassword = async (u) => {
    if (!confirm(`Generate a new temporary password for ${u.full_name || u.email}?`)) return;
    setErr('');
    setBusyId(u.id);
    try {
      const { password } = await callFn({ action: 'reset-password', userId: u.id });
      setReveal({ email: u.email, password, label: 'New temporary password' });
      setUsers((prev) =>
        prev.map((p) => (p.id === u.id ? { ...p, must_change_password: true } : p))
      );
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const removeUser = async (u) => {
    if (
      !confirm(
        `Permanently delete ${u.full_name || u.email}? Their login is removed and any clients they were responsible for become unassigned. This cannot be undone.`
      )
    )
      return;
    setErr('');
    setBusyId(u.id);
    try {
      await callFn({ action: 'delete', userId: u.id });
      setUsers((prev) => prev.filter((p) => p.id !== u.id));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-navy-400">Administration</div>
          <h1 className="text-3xl font-bold text-navy-700">Users</h1>
          <p className="text-navy-500 mt-1 text-sm">
            Add staff, set who is an admin, reset passwords, and remove people. Admins can do
            everything in the app; employees only see clients they are responsible for.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="px-4 py-2 text-sm rounded-md bg-teal-500 hover:bg-teal-600 text-white font-medium"
        >
          + Add user
        </button>
      </div>

      {err && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {err}
        </div>
      )}

      {reveal && (
        <CredentialBanner reveal={reveal} onClose={() => setReveal(null)} />
      )}

      <div className="bg-white border border-navy-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-navy-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left font-semibold px-4 py-3">Name</th>
              <th className="text-left font-semibold px-4 py-3">Email</th>
              <th className="text-left font-semibold px-4 py-3">Role</th>
              <th className="text-left font-semibold px-4 py-3">Status</th>
              <th className="text-right font-semibold px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-navy-400">Loading…</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-navy-400">No users.</td>
              </tr>
            ) : (
              users.map((u) => {
                const isSelf = u.id === user?.id;
                const busy = busyId === u.id;
                return (
                  <tr key={u.id} className="border-t border-navy-50 hover:bg-navy-50/40">
                    <td className="px-4 py-2">
                      <input
                        defaultValue={u.full_name || ''}
                        onBlur={(e) => saveName(u, e.target.value.trim())}
                        placeholder="—"
                        className="w-full bg-transparent rounded px-2 py-1 text-navy-800 hover:bg-navy-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-300"
                      />
                    </td>
                    <td className="px-4 py-2 text-navy-600">{u.email}</td>
                    <td className="px-4 py-2">
                      <select
                        value={u.role}
                        disabled={isSelf || busy}
                        onChange={(e) => changeRole(u, e.target.value)}
                        title={isSelf ? "You can't change your own role" : ''}
                        className="rounded-md border border-navy-200 px-2 py-1 text-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-60"
                      >
                        <option value="employee">Employee</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      {u.must_change_password ? (
                        <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-medium">
                          Must set password
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-teal-50 text-teal-700 px-2 py-0.5 text-xs font-medium">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => resetPassword(u)}
                          disabled={busy}
                          className="text-xs px-2.5 py-1.5 rounded-md text-navy-600 hover:bg-navy-100 disabled:opacity-50"
                        >
                          Reset password
                        </button>
                        <button
                          onClick={() => removeUser(u)}
                          disabled={busy || isSelf}
                          title={isSelf ? "You can't delete your own account" : ''}
                          className="text-xs px-2.5 py-1.5 rounded-md text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <AddUserModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onCreated={(cred) => {
            setAddOpen(false);
            setReveal({ ...cred, label: 'Temporary password' });
            refresh();
          }}
        />
      )}
    </div>
  );
}

function CredentialBanner({ reveal, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${reveal.email} / ${reveal.password}`);
      setCopied(true);
    } catch {
      /* clipboard may be blocked; the value is visible to copy by hand */
    }
  };
  return (
    <div className="mb-4 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-navy-700">{reveal.label}</div>
          <div className="text-sm text-navy-600 mt-1">
            Share privately with <span className="font-medium">{reveal.email}</span>. They'll be
            asked to set their own password on first login. This is shown only once.
          </div>
          <div className="mt-2 font-mono text-base text-navy-900 bg-white border border-teal-200 rounded-md px-3 py-2 inline-block">
            {reveal.password}
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={copy}
            className="text-xs px-3 py-1.5 rounded-md bg-navy-600 hover:bg-navy-700 text-white"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-md text-navy-600 hover:bg-white"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function AddUserModal({ open, onClose, onCreated }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('employee');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!email.trim()) {
      setErr('Email is required.');
      return;
    }
    setBusy(true);
    try {
      const { email: createdEmail, password } = await callFn({
        action: 'create',
        email: email.trim(),
        fullName: fullName.trim(),
        role,
      });
      onCreated({ email: createdEmail, password });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add user"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md text-navy-600 hover:bg-navy-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-md bg-teal-500 hover:bg-teal-600 text-white font-medium disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create user'}
          </button>
        </>
      }
    >
      {err && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {err}
        </div>
      )}
      <div className="space-y-4">
        <label className="block">
          <div className="text-xs font-semibold text-navy-500 mb-1">Full name</div>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoFocus
            className={inputClass}
            placeholder="e.g. Jane Smith"
          />
        </label>
        <label className="block">
          <div className="text-xs font-semibold text-navy-500 mb-1">Email (their login)</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="jsmith@jbjcpas.com"
          />
        </label>
        <label className="block">
          <div className="text-xs font-semibold text-navy-500 mb-1">Role</div>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
            <option value="employee">Employee — only their assigned clients</option>
            <option value="admin">Admin — full access</option>
          </select>
        </label>
        <p className="text-xs text-navy-400">
          A temporary password is generated automatically. You'll see it once after the user is
          created, to hand off privately.
        </p>
      </div>
    </Modal>
  );
}

const inputClass =
  'w-full rounded-md border border-navy-200 px-3 py-2 text-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400';
