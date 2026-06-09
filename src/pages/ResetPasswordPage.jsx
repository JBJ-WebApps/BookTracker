import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function ResetPasswordPage() {
  const { user, loading, clearRecovering, mustChangePassword, refreshProfile } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setErr('Passwords do not match.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    // Clear the first-login flag so the app stops redirecting back here.
    if (mustChangePassword && user) {
      const { error: flagErr } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', user.id);
      if (flagErr) {
        setBusy(false);
        setErr(flagErr.message);
        return;
      }
      await refreshProfile();
    }
    setBusy(false);
    clearRecovering();
    navigate('/', { replace: true });
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4"
      style={{
        backgroundImage:
          'radial-gradient(circle at 30% 20%, rgba(62,151,156,0.18), transparent 50%), radial-gradient(circle at 80% 80%, rgba(186,163,96,0.10), transparent 60%), linear-gradient(180deg, #1f1c52 0%, #262262 50%, #181640 100%)',
      }}
    >
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl px-8 py-10">
          <div className="flex flex-col items-center mb-6">
            <img
              src="/splash%20logo.jpg"
              alt="Johns Benson & Johns CPAs"
              className="h-24 w-auto mb-4"
            />
            <h1 className="text-2xl font-bold text-navy-600">
              {mustChangePassword ? 'Welcome — set your password' : 'Set a new password'}
            </h1>
            <p className="text-sm text-navy-400 mt-1">
              {user?.email ? `for ${user.email}` : 'Pick something only you know'}
            </p>
          </div>

          {mustChangePassword && (
            <div className="mb-4 text-sm text-navy-600 bg-teal-50 border border-teal-200 rounded-md px-3 py-2">
              Please replace your temporary password with one only you know before continuing.
            </div>
          )}

          {!loading && !user && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              Your reset link is invalid or has expired. Go back to the login page and click
              "Forgot password?" again.
            </div>
          )}

          {err && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {err}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <div className="text-xs font-semibold text-navy-500 mb-1">New password</div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                disabled={!user}
                minLength={8}
                className="w-full rounded-md border border-navy-200 px-3 py-2.5 text-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 disabled:bg-navy-50"
                placeholder="At least 8 characters"
              />
            </label>
            <label className="block">
              <div className="text-xs font-semibold text-navy-500 mb-1">Confirm new password</div>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={!user}
                minLength={8}
                className="w-full rounded-md border border-navy-200 px-3 py-2.5 text-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 disabled:bg-navy-50"
              />
            </label>

            <button
              type="submit"
              disabled={busy || !user}
              className="w-full bg-navy-600 hover:bg-navy-700 text-white font-semibold py-2.5 rounded-md transition disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-navy-200 mt-5">
          Johns Benson &amp; Johns CPAs · Bookkeeping Tracker
        </p>
      </div>
    </div>
  );
}
