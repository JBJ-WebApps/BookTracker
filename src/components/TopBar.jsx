import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { monthOptions, todayMonthParam } from '../lib/months';

const MONTH_OPTS = monthOptions(2024, 2027);

export default function TopBar() {
  const { profile, signOut, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get('month') || todayMonthParam();

  const onMonthChange = (e) => {
    const next = new URLSearchParams(searchParams);
    next.set('month', e.target.value);
    setSearchParams(next);
  };

  return (
    <header className="h-16 bg-navy-600 text-white flex items-center px-6 shadow-lg relative z-20">
      <Link to="/" className="flex items-center gap-3">
        <img
          src="/logo3%20185%20x%20100%20PX.jpg"
          alt="JBJ"
          className="h-10 w-auto rounded bg-white px-2 py-1"
        />
        <div className="leading-tight">
          <div className="text-sm font-semibold">BookTracker</div>
          <div className="text-[11px] text-navy-200 uppercase tracking-wider">Johns Benson &amp; Johns</div>
        </div>
      </Link>

      <nav className="ml-10 flex items-center gap-6 text-sm">
        <Link to="/" className="hover:text-teal-200 transition">Dashboard</Link>
        {isAdmin && (
          <Link to="/audit" className="hover:text-teal-200 transition">Audit Log</Link>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-navy-200">Month</span>
          <select
            value={month}
            onChange={onMonthChange}
            className="bg-navy-700 border border-navy-500 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            {MONTH_OPTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <div className="h-8 w-px bg-navy-500" />

        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="text-sm font-medium">{profile?.full_name || profile?.email || 'User'}</div>
            <div className="text-[11px] text-navy-200">{isAdmin ? 'Admin' : 'Employee'}</div>
          </div>
          <button
            onClick={() => signOut()}
            className="text-sm px-3 py-1.5 rounded-md bg-navy-700 hover:bg-navy-800 border border-navy-500 transition"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
