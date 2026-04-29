import type { RoutePath } from '../App';
import { Layout } from '../components/Layout';

type PageProps = {
  currentRoute: RoutePath;
  navigate: (path: string) => void;
};

export function TermsPage({ currentRoute, navigate }: PageProps) {
  return (
    <Layout currentRoute={currentRoute} navigate={navigate}>
      <section className="policy-section">
        <div className="container policy-card">
          <h1>Terms</h1>
          <p>By using Chat System, you agree to use the platform responsibly, protect your login credentials, and follow applicable customer support and data handling rules.</p>
          <p>Service terms, pricing, account access, and acceptable use can be updated as the product evolves.</p>
        </div>
      </section>
    </Layout>
  );
}
