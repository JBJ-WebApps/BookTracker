// Secure admin-only user management.
//
// The Supabase *service-role* key can create/delete auth users and set
// passwords. It must NEVER ship to the browser, so those operations live here
// in a serverless function. Every request is authenticated (who is calling?)
// and authorized (are they an admin?) before anything happens.
//
// Required Netlify environment variables (Site settings → Environment):
//   SUPABASE_URL                (or VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY   (Supabase → Project Settings → API → service_role)
//
// Actions (POST JSON body):
//   { action: 'create',         email, fullName, role }   → returns temp password
//   { action: 'reset-password', userId }                  → returns temp password
//   { action: 'delete',         userId }

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function genPassword() {
  const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const symbols = '!@#$%^&*';
  let pw = '';
  for (let i = 0; i < 14; i++) pw += chars[crypto.randomInt(chars.length)];
  pw += symbols[crypto.randomInt(symbols.length)];
  pw += crypto.randomInt(10);
  return pw;
}

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, {
      error: 'Server not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify.',
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Authenticate: who is making this request? ---
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Not signed in.' });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json(401, { error: 'Your session is invalid or expired.' });
  const callerId = userData.user.id;

  // --- Authorize: are they an admin? ---
  const { data: caller, error: cErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  if (cErr) return json(500, { error: cErr.message });
  if (caller?.role !== 'admin') return json(403, { error: 'Administrators only.' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Malformed request body.' });
  }

  switch (payload.action) {
    case 'create': {
      const email = String(payload.email || '').trim().toLowerCase();
      const fullName = String(payload.fullName || '').trim();
      const role = payload.role === 'admin' ? 'admin' : 'employee';
      if (!email) return json(400, { error: 'Email is required.' });

      const password = genPassword();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error) return json(400, { error: error.message });

      // handle_new_user creates the profile row; force name/role/flag.
      const { error: pErr } = await admin
        .from('profiles')
        .update({ full_name: fullName, email, role, must_change_password: true })
        .eq('id', data.user.id);
      if (pErr) return json(500, { error: 'User created, but profile setup failed: ' + pErr.message });

      return json(200, { ok: true, userId: data.user.id, email, password });
    }

    case 'reset-password': {
      const userId = String(payload.userId || '');
      if (!userId) return json(400, { error: 'Missing user.' });

      const password = genPassword();
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json(400, { error: error.message });
      await admin.from('profiles').update({ must_change_password: true }).eq('id', userId);

      return json(200, { ok: true, password });
    }

    case 'delete': {
      const userId = String(payload.userId || '');
      if (!userId) return json(400, { error: 'Missing user.' });
      if (userId === callerId) return json(400, { error: 'You cannot delete your own account.' });

      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }

    default:
      return json(400, { error: 'Unknown action.' });
  }
};
