import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import { useIdleLogout } from '../hooks/useIdleLogout';

export default function Layout() {
  useIdleLogout();
  return (
    <div className="min-h-screen flex flex-col bg-navy-50">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
