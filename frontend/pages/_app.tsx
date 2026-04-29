import type { AppProps } from 'next/app';
import '../public.css';
import '../home.css';
import '../src/styles/pages.css';
import '../src/styles/auth.css';
import '../src/styles/admin.css';

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
