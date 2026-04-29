import type { ReactNode } from 'react';
import type { RoutePath } from '../routes';
import { Footer } from './Footer';
import { Header } from './Header';

type LayoutProps = {
  children: ReactNode;
  currentRoute: RoutePath;
  navigate: (path: string) => void;
};

export function Layout({ children, currentRoute, navigate }: LayoutProps) {
  return (
    <>
      <Header currentRoute={currentRoute} navigate={navigate} />
      <main>{children}</main>
      <Footer navigate={navigate} />
    </>
  );
}
