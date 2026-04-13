import { useEffect, useState } from 'react';
import Modal from './Modal';
import { supabase } from '../lib/supabase';
import { useStaff } from '../hooks/useClients';
import { useServiceTypes, useClientServices, saveClientServices } from '../hooks/useServices';

const FREQUENCIES = [
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually',  label: 'Annually' },
];

const PLATFORMS = [
  { value: '',           label: '—' },
  { value: 'QBO',        label: 'QuickBooks Online' },
  { value: 'QBD',        label: 'QuickBooks Desktop' },
  { value: 'Teamviewer', label: 'Teamviewer' },
  { value: 'Other',      label: 'Other' },
];

const BLANK = {
  name: '',
  responsible_staff_id: '',
  assistant_staff_id: '',
  frequency: 'monthly',
  complexity: 1,
  monthly_fee: 0,
  hourly_rate: 80,
  due_to_tax_manager_day: '',
  due_to_tax_manager_note: '',
  platform: '',
  notes: '',
  is_archived: false,
};

export default function ClientFormModal({ open, onClose, onSaved, existing = null }) {
  const staff = useStaff();
  const serviceTypes = useServiceTypes();
  const { ids: existingServiceIds } = useClientServices(existing?.id);
  const [serviceIds, setServiceIds] = useState(new Set());
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isEdit = !!existing;

  useEffect(() => {
    setServiceIds(new Set(existingServiceIds));
  }, [existingServiceIds]);

  const toggleService = (id) => {
    setServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name ?? '',
        responsible_staff_id: existing.responsible_staff_id ?? '',
        assistant_staff_id: existing.assistant_staff_id ?? '',
        frequency: existing.frequency ?? 'monthly',
        complexity: existing.complexity ?? 1,
        monthly_fee: existing.monthly_fee ?? 0,
        hourly_rate: existing.hourly_rate ?? 80,
        due_to_tax_manager_day: existing.due_to_tax_manager_day ?? '',
        due_to_tax_manager_note: existing.due_to_tax_manager_note ?? '',
        platform: existing.platform ?? '',
        notes: existing.notes ?? '',
        is_archived: existing.is_archived ?? false,
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
      setErr('Name is required');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      responsible_staff_id: form.responsible_staff_id || null,
      assistant_staff_id: form.assistant_staff_id || null,
      frequency: form.frequency,
      complexity: Number(form.complexity) || 1,
      monthly_fee: Number(form.monthly_fee) || 0,
      hourly_rate: Number(form.hourly_rate) || 80,
      due_to_tax_manager_day: form.due_to_tax_manager_day === '' ? null : Number(form.due_to_tax_manager_day),
      due_to_tax_manager_note: form.due_to_tax_manager_note || null,
      platform: form.platform || null,
      notes: form.notes || null,
      is_archived: !!form.is_archived,
    };
    let clientId = existing?.id;
    if (isEdit) {
      const { error } = await supabase.from('clients').update(payload).eq('id', existing.id);
      if (error) {
        setSaving(false);
        setErr(error.message);
        return;
      }
    } else {
      const { data, error } = await supabase.from('clients').insert(payload).select('id').single();
      if (error) {
        setSaving(false);
        setErr(error.message);
        return;
      }
      clientId = data.id;
    }

    try {
      await saveClientServices(clientId, serviceIds);
    } catch (e) {
      setSaving(false);
      setErr('Saved client, but services failed: ' + e.message);
      return;
    }

    setSaving(false);
    onSaved?.();
  };

  const archive = async () => {
    if (!existing) return;
    if (!confirm('Archive this client? They will be hidden from the sidebar.')) return;
    await supabase.from('clients').update({ is_archived: true }).eq('id', existing.id);
    onSaved?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit client' : 'New client'}
      size="lg"
      footer={
        <>
          {isEdit && !form.is_archived && (
            <button
              onClick={archive}
              className="mr-auto text-sm px-3 py-2 rounded-md text-red-600 hover:bg-red-50"
            >
              Archive
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
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create client'}
          </button>
        </>
      }
    >
      {err && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {err}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Client name" wide>
          <input
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            className={inputClass}
            placeholder="e.g. Coastal Steel Group"
          />
        </Field>

        <Field label="Responsible staff">
          <select
            value={form.responsible_staff_id}
            onChange={(e) => update('responsible_staff_id', e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
            ))}
          </select>
        </Field>

        <Field label="Assistant staff">
          <select
            value={form.assistant_staff_id}
            onChange={(e) => update('assistant_staff_id', e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
            ))}
          </select>
        </Field>

        <Field label="Frequency">
          <select
            value={form.frequency}
            onChange={(e) => update('frequency', e.target.value)}
            className={inputClass}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Complexity (1-3)">
          <select
            value={form.complexity}
            onChange={(e) => update('complexity', e.target.value)}
            className={inputClass}
          >
            <option value={1}>1 — Simple</option>
            <option value={2}>2 — Mid Level</option>
            <option value={3}>3 — Experienced</option>
          </select>
        </Field>

        <Field label="Monthly fee ($)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.monthly_fee}
            onChange={(e) => update('monthly_fee', e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Hourly rate ($/hr)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.hourly_rate}
            onChange={(e) => update('hourly_rate', e.target.value)}
            className={inputClass}
            placeholder="80"
          />
        </Field>

        <Field label="Platform">
          <select
            value={form.platform}
            onChange={(e) => update('platform', e.target.value)}
            className={inputClass}
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Due Date to Tax Manager">
          <select
            value={form.due_to_tax_manager_day}
            onChange={(e) => update('due_to_tax_manager_day', e.target.value)}
            className={`${inputClass} w-28`}
          >
            <option value="">—</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </Field>

        <Field label="Due note" wide>
          <input
            value={form.due_to_tax_manager_note}
            onChange={(e) => update('due_to_tax_manager_note', e.target.value)}
            className={inputClass}
            placeholder="e.g. Due 1 week after client brings statements"
          />
        </Field>

        <div className="col-span-2 border-t border-navy-100 pt-4 mt-1 grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <div className="text-xs font-semibold text-navy-500 mb-2 uppercase tracking-wider">
              Services this client pays for
            </div>
            <div className="grid grid-cols-2 gap-2">
              {serviceTypes
                .filter((s) => s.id !== 'cash' && s.id !== 'accrual')
                .map((s) => {
                  const checked = serviceIds.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition ${
                        checked
                          ? 'border-teal-400 bg-teal-50 text-teal-800'
                          : 'border-navy-200 hover:bg-navy-50 text-navy-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleService(s.id)}
                        className="h-4 w-4 accent-teal-500"
                      />
                      <span className="text-sm">{s.label}</span>
                    </label>
                  );
                })}
            </div>
          </div>

          <div className="col-span-1">
            <div className="text-xs font-semibold text-navy-500 mb-2 uppercase tracking-wider">
              Client's Basis of Accounting
            </div>
            <div className="flex flex-col gap-2">
              {serviceTypes
                .filter((s) => s.id === 'cash' || s.id === 'accrual')
                .map((s) => {
                  const checked = serviceIds.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition ${
                        checked
                          ? 'border-teal-400 bg-teal-50 text-teal-800'
                          : 'border-navy-200 hover:bg-navy-50 text-navy-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="basis_of_accounting"
                        checked={checked}
                        onChange={() => {
                          setServiceIds((prev) => {
                            const next = new Set(prev);
                            next.delete('cash');
                            next.delete('accrual');
                            next.add(s.id);
                            return next;
                          });
                        }}
                        className="h-4 w-4 accent-teal-500"
                      />
                      <span className="text-sm">{s.label}</span>
                    </label>
                  );
                })}
            </div>
          </div>
        </div>

        <Field label="Notes" wide>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            className={inputClass}
            rows={3}
          />
        </Field>
      </div>
    </Modal>
  );
}

const inputClass =
  'w-full rounded-md border border-navy-200 px-3 py-2 text-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400';

function Field({ label, wide, children }) {
  return (
    <label className={`block ${wide ? 'col-span-2' : ''}`}>
      <div className="text-xs font-semibold text-navy-500 mb-1">{label}</div>
      {children}
    </label>
  );
}
