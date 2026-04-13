import { supabase } from './supabase';

export async function logAudit({ action, entityType = null, entityId = null, clientId = null, metadata = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('audit_log').insert({
    actor_id: user.id,
    actor_email: user.email ?? '',
    action,
    entity_type: entityType,
    entity_id: entityId,
    client_id: clientId,
    metadata,
  });
}

export function browserMetadata() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    screen: `${window.screen.width}x${window.screen.height}`,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
