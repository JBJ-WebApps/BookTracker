import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { periodMonthString } from '../lib/months';

export function useClientDetail(clientId, year) {
  const [client, setClient] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountMonths, setAccountMonths] = useState([]);
  const [clientMonths, setClientMonths] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const from = periodMonthString(year, 1);
    const to = periodMonthString(year, 12);

    const [c, a, cm] = await Promise.all([
      supabase.from('clients').select('*').eq('id', clientId).maybeSingle(),
      supabase
        .from('accounts')
        .select('*')
        .eq('client_id', clientId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('client_months')
        .select('*')
        .eq('client_id', clientId)
        .gte('period_month', from)
        .lte('period_month', to),
    ]);
    setClient(c.data ?? null);
    setAccounts(a.data ?? []);
    setClientMonths(cm.data ?? []);

    const accountIds = (a.data ?? []).map((r) => r.id);
    if (accountIds.length) {
      const { data: am } = await supabase
        .from('account_months')
        .select('*')
        .in('account_id', accountIds)
        .gte('period_month', from)
        .lte('period_month', to);
      setAccountMonths(am ?? []);
    } else {
      setAccountMonths([]);
    }
    setLoading(false);
  }, [clientId, year]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates: when any team member changes this client's data, re-fetch.
  // (account_months has no client_id column, so we listen broadly and let
  // refresh re-query only this client — a cheap, harmless re-read.)
  useEffect(() => {
    if (!clientId) return;
    let t;
    const ping = () => {
      clearTimeout(t);
      t = setTimeout(refresh, 250); // debounce bursts of edits into one re-fetch
    };
    const channel = supabase
      .channel(`client-detail-${clientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_months' }, ping)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_months', filter: `client_id=eq.${clientId}` },
        ping
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts', filter: `client_id=eq.${clientId}` },
        ping
      )
      .subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(channel);
    };
  }, [clientId, refresh]);

  return { client, accounts, accountMonths, clientMonths, loading, refresh };
}
