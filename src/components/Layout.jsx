import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import { useIdleLogout } from '../hooks/useIdleLogout';
import { MentionAlertsProvider } from '../context/MentionAlertsContext';

export default function Layout() {
  useIdleLogout();
  return (
    <MentionAlertsProvider>
      <div className="min-h-screen flex flex-col bg-navy-50 print:block print:h-auto print:bg-white">
        <TopBar />
        <div className="flex flex-1 min-h-0 print:block">
          <Sidebar />
          <main className="flex-1 overflow-auto print:overflow-visible print:h-auto print:w-full">
            <Outlet />
          </main>
        </div>
      </div>
    </MentionAlertsProvider>
  );
}
