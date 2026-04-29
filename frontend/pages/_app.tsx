import type { AppProps } from 'next/app';
import '../public.css';
import '../home.css';
import '../src/styles/pages.css';
import '../src/styles/auth.css';
import '../src/styles/admin.css';
import 'sweetalert2/dist/sweetalert2.min.css';

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
