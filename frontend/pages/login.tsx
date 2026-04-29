import dynamic from 'next/dynamic';
import { Layout } from '../src/components/Layout';
import { useNextNavigate } from '../src/nextNavigation';

const LoginPage = dynamic(() => import('../src/pages/LoginPage').then(mod => mod.LoginPage), { ssr: false });

export default function Login() {
  const navigate = useNextNavigate();
  return (
    <Layout currentRoute="/login" navigate={navigate}>
      <LoginPage navigate={navigate} />
    </Layout>
  );
}
