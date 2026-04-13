import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useServiceTypes() {
  const [types, setTypes] = useState([]);
  useEffect(() => {
    supabase
      .from('service_types')
      .select('*')
      .order('sort_order', { ascending: true })
      .then(({ data }) => setTypes(data ?? []));
  }, []);
  return types;
}

export function useClientServices(clientId) {
  const [ids, setIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) {
      setIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from('client_services')
      .select('service_id')
      .eq('client_id', clientId)
      .then(({ data }) => {
        setIds(new Set((data ?? []).map((r) => r.service_id)));
        setLoading(false);
      });
  }, [clientId]);

  return { ids, setIds, loading };
}

// Replace the full set of a client's services with `nextIds` (Set<string>).
// Returns nothing; throws on DB error.
export async function saveClientServices(clientId, nextIds) {
  const next = Array.from(nextIds);

  const { data: existing } = await supabase
    .from('client_services')
    .select('service_id')
    .eq('client_id', clientId);

  const existingSet = new Set((existing ?? []).map((r) => r.service_id));
  const toAdd = next.filter((id) => !existingSet.has(id));
  const toRemove = [...existingSet].filter((id) => !nextIds.has(id));

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('client_services')
      .insert(toAdd.map((service_id) => ({ client_id: clientId, service_id })));
    if (error) throw error;
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('client_services')
      .delete()
      .eq('client_id', clientId)
      .in('service_id', toRemove);
    if (error) throw error;
  }
}
