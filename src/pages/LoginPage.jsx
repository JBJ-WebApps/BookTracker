import { useState, useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const { user, signIn, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user && !loading) {
      const dest = location.state?.from?.pathname || '/';
      navigate(dest, { replace: true });
    }
  }, [user, loading, navigate, location]);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setResetMsg('');
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setErr(e.message || 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  const onForgot = async () => {
    setErr('');
    setResetMsg('');
    if (!email.trim()) {
      setErr('Enter your email above first, then click "Forgot password?"');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) setErr(error.message);
    else setResetMsg('Check your email for a reset link.');
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
            <h1 className="text-2xl font-bold text-navy-600">Welcome back</h1>
            <p className="text-sm text-navy-400 mt-1">Sign in to BookTracker</p>
          </div>

          {err && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {err}
            </div>
          )}
          {resetMsg && (
            <div className="mb-4 text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-md px-3 py-2">
              {resetMsg}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <div className="text-xs font-semibold text-navy-500 mb-1">Email</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full rounded-md border border-navy-200 px-3 py-2.5 text-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
                placeholder="you@firm.com"
              />
            </label>
            <label className="block">
              <div className="text-xs font-semibold text-navy-500 mb-1">Password</div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-md border border-navy-200 px-3 py-2.5 text-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-navy-600 hover:bg-navy-700 text-white font-semibold py-2.5 rounded-md transition disabled:opacity-50"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={onForgot}
              className="w-full text-center text-xs text-teal-600 hover:text-teal-700"
            >
              Forgot password?
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
