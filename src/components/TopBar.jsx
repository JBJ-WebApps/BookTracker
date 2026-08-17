import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function TopBar() {
  const { profile, signOut, isAdmin } = useAuth();

  return (
    <header className="h-16 bg-navy-600 text-white flex items-center px-6 shadow-lg relative z-20 print:hidden">
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
          <Link to="/reports" className="hover:text-teal-200 transition">Reports</Link>
        )}
        {isAdmin && (
          <Link to="/audit" className="hover:text-teal-200 transition">Audit Log</Link>
        )}
        {isAdmin && (
          <Link to="/users" className="hover:text-teal-200 transition">Users</Link>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-4">
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
