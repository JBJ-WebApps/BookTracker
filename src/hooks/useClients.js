import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useClients({ includeArchived = false } = {}) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('clients')
      .select('id, name, responsible_staff_id, assistant_staff_id, frequency, complexity, monthly_fee, platform, due_to_tax_manager_day, due_to_tax_manager_note, is_archived, notes')
      .order('name', { ascending: true });
    if (!includeArchived) q = q.eq('is_archived', false);
    const { data, error } = await q;
    if (error) setError(error);
    else setClients(data ?? []);
    setLoading(false);
  }, [includeArchived]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { clients, loading, error, refresh };
}

export function useStaff() {
  const [staff, setStaff] = useState([]);
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .order('full_name', { ascending: true })
      .then(({ data }) => setStaff(data ?? []));
  }, []);
  return staff;
}
