import type { RoutePath } from '../App';
import { Layout } from '../components/Layout';

type PageProps = {
  currentRoute: RoutePath;
  navigate: (path: string) => void;
};

export function AboutPage({ currentRoute, navigate }: PageProps) {
  return (
    <Layout currentRoute={currentRoute} navigate={navigate}>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow page-eyebrow">About us</span>
          <h1>Built for practical customer support.</h1>
          <p className="lead">Chat System brings live chat, support assignment, saved quick replies, visitor history, and widget branding into one simple workspace.</p>
        </div>
      </section>

      <section>
        <div className="container story">
          <div className="stat">
            <strong>One</strong>
            dashboard for sites, agents, conversations, and widget settings.
          </div>
          <div>
            <h2>Why we built it</h2>
            <p>Support teams need speed, context, and consistency. This platform is designed around everyday workflows: seeing new conversations quickly, replying with reusable text, tracking agent availability, and customizing each website widget without touching code every time.</p>
            <p className="mt-14">The goal is simple: make visitor support feel immediate for customers and calm for agents.</p>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="info-grid">
            <article className="card">
              <h3>Fast setup</h3>
              <p>Create a site, copy the widget script, and start receiving customer messages.</p>
            </article>
            <article className="card">
              <h3>Agent friendly</h3>
              <p>Typing indicators, quick replies, and restored conversations keep support focused.</p>
            </article>
            <article className="card">
              <h3>Brand aware</h3>
              <p>Each site can control widget colors and greeting messages from the dashboard.</p>
            </article>
          </div>
        </div>
      </section>
    </Layout>
  );
}
