import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { fetchUnreadMentionSummary, markClientMentionsRead } from '../lib/notes';

const MentionAlertsContext = createContext(null);

// Mounted once (in Layout) so the top-bar badge and every client page's badge
// share one live subscription instead of each opening their own channel.
export function MentionAlertsProvider({ children }) {
  const { profile } = useAuth();
  const [unreadByClient, setUnreadByClient] = useState([]);

  const refresh = useCallback(async () => {
    if (!profile?.id) {
      setUnreadByClient([]);
      return;
    }
    try {
      setUnreadByClient(await fetchUnreadMentionSummary(profile.id));
    } catch (e) {
      console.error('fetchUnreadMentionSummary error', e);
    }
  }, [profile?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!profile?.id) return;
    let t;
    const ping = () => {
      clearTimeout(t);
      t = setTimeout(refresh, 250);
    };
    const channel = supabase
      .channel(`mention-alerts-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'note_mentions', filter: `mentioned_user_id=eq.${profile.id}` },
        ping
      )
      .subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(channel);
    };
  }, [profile?.id, refresh]);

  const markRead = useCallback(
    async (clientId) => {
      if (!profile?.id || !clientId) return;
      await markClientMentionsRead(clientId, profile.id);
      await refresh();
    },
    [profile?.id, refresh]
  );

  const totalUnread = unreadByClient.reduce((sum, c) => sum + c.count, 0);

  const value = { unreadByClient, totalUnread, refresh, markRead };
  return <MentionAlertsContext.Provider value={value}>{children}</MentionAlertsContext.Provider>;
}

export function useMentionAlerts() {
  const ctx = useContext(MentionAlertsContext);
  if (!ctx) throw new Error('useMentionAlerts must be used within <MentionAlertsProvider>');
  return ctx;
}
