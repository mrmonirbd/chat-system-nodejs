import type { MouseEvent, ReactNode } from 'react';

type AppLinkProps = {
  href: string;
  navigate: (path: string) => void;
  className?: string;
  children: ReactNode;
  target?: string;
};

export function AppLink({ href, navigate, className, children, target }: AppLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (target || href.startsWith('http') || href === '/admin' || href === '/support-panel') return;

    event.preventDefault();
    navigate(href);
  }

  return (
    <a className={className} href={href} target={target} onClick={handleClick}>
      {children}
    </a>
  );
}
