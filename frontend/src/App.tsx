import { useEffect, useState } from 'react';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';

export type RoutePath = '/' | '/about' | '/contact' | '/login' | '/reset-password' | '/terms' | '/privacy';

const pageTitles: Record<RoutePath, string> = {
  '/': 'Chat System | Live Support for Growing Teams',
  '/about': 'About Us | Chat System',
  '/contact': 'Contact Us | Chat System',
  '/login': 'Login | Chat System',
  '/reset-password': 'Reset Password | Chat System',
  '/terms': 'Terms | Chat System',
  '/privacy': 'Privacy Policy | Chat System'
};

function getRoutePath(): RoutePath {
  const path = window.location.pathname;
  if (path === '/about' || path === '/contact' || path === '/login' || path === '/reset-password' || path === '/terms' || path === '/privacy') {
    return path;
  }
  return '/';
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

    const nextRoute = (['/', '/about', '/contact', '/login', '/reset-password', '/terms', '/privacy'].includes(path) ? path : '/') as RoutePath;
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
      return <LoginPage navigate={navigate} />;
    case '/reset-password':
      return <LoginPage navigate={navigate} />;
    case '/terms':
      return <TermsPage navigate={navigate} currentRoute={route} />;
    case '/privacy':
      return <PrivacyPage navigate={navigate} currentRoute={route} />;
    default:
      return <HomePage navigate={navigate} currentRoute={route} />;
  }
}
