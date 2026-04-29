import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { AboutPage } from './pages/AboutPage';
import { AdminPage } from './pages/AdminPage';
import { ContactPage } from './pages/ContactPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';

export type RoutePath =
  | '/'
  | '/about'
  | '/contact'
  | '/login'
  | '/reset-password'
  | '/admin'
  | '/admin/analytics'
  | '/admin/chat'
  | '/admin/agent-chat'
  | '/admin/sites'
  | '/admin/support-agents'
  | '/admin/api-keys'
  | '/admin/users'
  | '/terms'
  | '/privacy';

const pageTitles: Record<RoutePath, string> = {
  '/': 'Chat System | Live Support for Growing Teams',
  '/about': 'About Us | Chat System',
  '/contact': 'Contact Us | Chat System',
  '/login': 'Login | Chat System',
  '/reset-password': 'Reset Password | Chat System',
  '/admin': 'Admin Panel | Chat System',
  '/admin/analytics': 'Analytics | Chat System',
  '/admin/chat': 'Admin Chat | Chat System',
  '/admin/agent-chat': 'Agent Chat | Chat System',
  '/admin/sites': 'Sites | Chat System',
  '/admin/support-agents': 'Support Agents | Chat System',
  '/admin/api-keys': 'API Keys | Chat System',
  '/admin/users': 'Users | Chat System',
  '/terms': 'Terms | Chat System',
  '/privacy': 'Privacy Policy | Chat System'
};

const validRoutes: RoutePath[] = [
  '/',
  '/about',
  '/contact',
  '/login',
  '/reset-password',
  '/admin',
  '/admin/analytics',
  '/admin/chat',
  '/admin/agent-chat',
  '/admin/sites',
  '/admin/support-agents',
  '/admin/api-keys',
  '/admin/users',
  '/terms',
  '/privacy'
];

function getRoutePath(): RoutePath {
  const path = window.location.pathname;
  if (validRoutes.includes(path as RoutePath)) {
    return path as RoutePath;
  }
  return '/';
}

function getAdminView(route: RoutePath) {
  if (route === '/admin/chat') return 'chat' as const;
  if (route === '/admin/agent-chat') return 'agentChat' as const;
  if (route === '/admin/sites') return 'sites' as const;
  if (route === '/admin/support-agents') return 'support' as const;
  if (route === '/admin/api-keys') return 'apiKeys' as const;
  if (route === '/admin/users') return 'users' as const;
  return 'dashboard' as const;
}

export default function App() {
  const [route, setRoute] = useState<RoutePath>(getRoutePath);

  useEffect(() => {
    const handlePopState = () => setRoute(getRoutePath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    document.title = pageTitles[route];
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [route]);

  function navigate(path: string) {
    if (path.startsWith('#')) {
      document.querySelector(path)?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const nextRoute = (validRoutes.includes(path as RoutePath) ? path : '/') as RoutePath;
    if (window.location.pathname !== nextRoute) {
      window.history.pushState({}, '', nextRoute);
    }
    setRoute(nextRoute);
  }

  switch (route) {
    case '/about':
      return <AboutPage navigate={navigate} currentRoute={route} />;
    case '/contact':
      return <ContactPage navigate={navigate} currentRoute={route} />;
    case '/login':
      return <Layout navigate={navigate} currentRoute={route}><LoginPage navigate={navigate} /></Layout>;
    case '/reset-password':
      return <Layout navigate={navigate} currentRoute={route}><LoginPage navigate={navigate} /></Layout>;
    case '/admin':
    case '/admin/analytics':
    case '/admin/chat':
    case '/admin/agent-chat':
    case '/admin/sites':
    case '/admin/support-agents':
    case '/admin/api-keys':
    case '/admin/users':
      return <AdminPage initialView={getAdminView(route)} navigate={navigate} />;
    case '/terms':
      return <TermsPage navigate={navigate} currentRoute={route} />;
    case '/privacy':
      return <PrivacyPage navigate={navigate} currentRoute={route} />;
    default:
      return <HomePage navigate={navigate} currentRoute={route} />;
  }
}
