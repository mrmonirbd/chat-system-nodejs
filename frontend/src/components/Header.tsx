import { useState } from 'react';
import type { RoutePath } from '../routes';
import { AppLink } from './Link';

type HeaderProps = {
  currentRoute: RoutePath;
  navigate: (path: string) => void;
};

export function Header({ currentRoute, navigate }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const featuresHref = currentRoute === '/' ? '#features' : '/#features';
  const pricingHref = currentRoute === '/' ? '#pricing' : '/#pricing';

  function go(path: string) {
    setMenuOpen(false);
    if (path === '/#features' || path === '/#pricing') {
      navigate('/');
      window.setTimeout(() => navigate(path.replace('/', '')), 0);
      return;
    }
    navigate(path);
  }

  return (
    <header className="site-header">
      <nav className="container nav">
        <AppLink className="brand" href="/" navigate={go}>
          <span className="brand-mark">C</span>
          <span>Chat System</span>
        </AppLink>

        <div className="nav-links">
          <AppLink className={currentRoute === '/' ? 'nav-link-active' : ''} href="/" navigate={go}>Home</AppLink>
          <AppLink className={currentRoute === '/about' ? 'nav-link-active' : ''} href="/about" navigate={go}>About</AppLink>
          <AppLink href={featuresHref} navigate={go}>Features</AppLink>
          <AppLink href={pricingHref} navigate={go}>Pricing</AppLink>
          <AppLink className={currentRoute === '/contact' ? 'nav-link-active' : ''} href="/contact" navigate={go}>Contact</AppLink>
        </div>

        <div className="nav-actions">
          <AppLink className="btn btn-primary" href="/login" navigate={go}>Login</AppLink>
        </div>

        <button type="button" className="hamburger-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu">
          <span>☰</span>
        </button>
      </nav>

      <div className={`container mobile-menu ${menuOpen ? '' : 'is-hidden'}`}>
        <div className="mobile-menu-panel">
          <AppLink className={`mobile-menu-link ${currentRoute === '/' ? 'mobile-menu-link-active' : ''}`} href="/" navigate={go}>Home</AppLink>
          <AppLink className={`mobile-menu-link ${currentRoute === '/about' ? 'mobile-menu-link-active' : ''}`} href="/about" navigate={go}>About</AppLink>
          <AppLink className="mobile-menu-link" href={featuresHref} navigate={go}>Features</AppLink>
          <AppLink className="mobile-menu-link" href={pricingHref} navigate={go}>Pricing</AppLink>
          <AppLink className={`mobile-menu-link ${currentRoute === '/contact' ? 'mobile-menu-link-active' : ''}`} href="/contact" navigate={go}>Contact</AppLink>
          <AppLink className="mobile-login-link" href="/login" navigate={go}>Login</AppLink>
        </div>
      </div>
    </header>
  );
}
