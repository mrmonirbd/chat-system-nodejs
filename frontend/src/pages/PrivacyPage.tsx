import type { RoutePath } from '../App';
import { Layout } from '../components/Layout';

type PageProps = {
  currentRoute: RoutePath;
  navigate: (path: string) => void;
};

export function PrivacyPage({ currentRoute, navigate }: PageProps) {
  return (
    <Layout currentRoute={currentRoute} navigate={navigate}>
      <section className="policy-section">
        <div className="container policy-card">
          <h1>Privacy Policy</h1>
          <p>Chat System stores account, site, conversation, and quick reply data so support teams can manage customer conversations.</p>
          <p>Teams should only collect customer information they need for support and should protect access to admin and agent accounts.</p>
        </div>
      </section>
    </Layout>
  );
}
