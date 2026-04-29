import dynamic from 'next/dynamic';
import { useNextNavigate } from './nextNavigation';

const AdminPage = dynamic(() => import('./pages/AdminPage').then(mod => mod.AdminPage), { ssr: false });
const SupportPanelPage = dynamic(() => import('./pages/SupportPanelPage').then(mod => mod.SupportPanelPage), { ssr: false });

type AdminView = 'dashboard' | 'chat' | 'agentChat' | 'sites' | 'support' | 'apiKeys' | 'users';
type SupportView = 'chat' | 'agentChat';

export function AdminRoute({ view }: { view: AdminView }) {
  const navigate = useNextNavigate();
  return <AdminPage initialView={view} navigate={navigate} />;
}

export function SupportRoute({ view }: { view: SupportView }) {
  const navigate = useNextNavigate();
  return <SupportPanelPage initialView={view} navigate={navigate} />;
}
