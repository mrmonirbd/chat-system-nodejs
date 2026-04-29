import { AppLink } from './Link';

type FooterProps = {
  navigate: (path: string) => void;
};

export function Footer({ navigate }: FooterProps) {
  return (
    <footer className="site-footer">
      <div className="container footer-row">
        <p>© 2026 Chat System. All rights reserved.</p>
        <p>
          <AppLink href="/about" navigate={navigate}>About</AppLink>
          {' · '}
          <AppLink href="/contact" navigate={navigate}>Contact</AppLink>
          {' · '}
          <AppLink href="/login" navigate={navigate}>Login</AppLink>
        </p>
      </div>
    </footer>
  );
}
