import { useEffect, useState } from 'react';
import Modal from './Modal';
import { supabase } from '../lib/supabase';

const KINDS = [
  { value: 'bank',        label: 'Bank' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'loan',        label: 'Loan' },
  { value: 'investment',  label: 'Investment' },
  { value: 'trust',       label: 'Trust' },
  { value: 'payroll',     label: 'Payroll' },
  { value: 'other',       label: 'Other' },
];

const BLANK = {
  name: '',
  kind: 'bank',
  group_label: '',
  sort_order: 0,
  is_active: true,
};

export default function AccountFormModal({ open, onClose, onSaved, clientId, existing = null }) {
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isEdit = !!existing;

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name ?? '',
        kind: existing.kind ?? 'bank',
        group_label: existing.group_label ?? '',
        sort_order: existing.sort_order ?? 0,
        is_active: existing.is_active ?? true,
      });
    } else {
      setForm(BLANK);
    }
    setErr('');
  }, [existing, open]);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setErr('');
    if (!form.name.trim()) {
      setErr('Account name is required');
      return;
    }
    setSaving(true);
    const payload = {
      client_id: clientId,
      name: form.name.trim(),
      kind: form.kind,
      group_label: form.group_label || null,
      sort_order: Number(form.sort_order) || 0,
      is_active: !!form.is_active,
    };
    const q = isEdit
      ? supabase.from('accounts').update(payload).eq('id', existing.id)
      : supabase.from('accounts').insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onSaved?.();
  };

  const del = async () => {
    if (!existing) return;
    if (!confirm('Delete this account and all its month records? This cannot be undone.')) return;
    await supabase.from('accounts').delete().eq('id', existing.id);
    onSaved?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit account' : 'Add account'}
      footer={
        <>
          {isEdit && (
            <button onClick={del} className="mr-auto text-sm px-3 py-2 rounded-md text-red-600 hover:bg-red-50">
              Delete
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md text-navy-600 hover:bg-navy-50">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-teal-500 hover:bg-teal-600 text-white font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add account'}
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
        <Field label="Account name">
          <input
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            className={inputClass}
            placeholder="e.g. CCU Checking, Seacoast X2701"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kind">
            <select
              value={form.kind}
              onChange={(e) => update('kind', e.target.value)}
              className={inputClass}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Group (optional)">
            <input
              value={form.group_label}
              onChange={(e) => update('group_label', e.target.value)}
              className={inputClass}
              placeholder="Operating, Trust, Credit Cards…"
            />
          </Field>
          <Field label="Sort order">
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => update('sort_order', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Status">
            <label className="flex items-center gap-2 text-sm text-navy-700 mt-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => update('is_active', e.target.checked)}
                className="h-4 w-4 accent-teal-500"
              />
              Active (uncheck to mark closed)
            </label>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

const inputClass =
  'w-full rounded-md border border-navy-200 px-3 py-2 text-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400';

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-navy-500 mb-1">{label}</div>
      {children}
    </label>
  );
}
