import type { RoutePath } from '../routes';
import { ChatPreview } from '../components/ChatPreview';
import { Layout } from '../components/Layout';
import { AppLink } from '../components/Link';

type PageProps = {
  currentRoute: RoutePath;
  navigate: (path: string) => void;
};

const features = [
  ['Realtime chat', 'Visitors and support agents see new messages instantly with socket-powered updates.'],
  ['Multi-site control', 'Manage multiple websites, API keys, widget colors, and greeting text from the admin dashboard.'],
  ['Agent productivity', 'Saved quick replies and conversation restore make repeat support work faster.']
];

const plans = [
  ['Starter', '$19', 'For one site and a small support team.'],
  ['Growth', '$49', 'For multiple sites, more agents, and higher chat volume.'],
  ['Custom', 'Talk', 'For teams that need custom setup, hosting, or integration support.']
];

export function HomePage({ currentRoute, navigate }: PageProps) {
  return (
    <Layout currentRoute={currentRoute} navigate={navigate}>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">Live chat, built for focused support teams</span>
            <h1>Chat System</h1>
            <p className="hero-copy">Manage customer conversations, support agents, quick replies, availability, and widget branding from one simple dashboard.</p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="/admin">Login to Dashboard</a>
              <AppLink className="btn btn-secondary" href="/contact" navigate={navigate}>Contact Us</AppLink>
            </div>
          </div>
          <ChatPreview />
        </div>
      </section>

      <section id="about">
        <div className="container">
          <div className="section-heading">
            <h2>About us</h2>
            <p>Chat System helps small teams deliver fast customer support without juggling scattered tools. Add sites, invite support agents, and embed a branded chat widget in minutes.</p>
          </div>
          <AppLink className="btn btn-secondary" href="/about" navigate={navigate}>Learn more</AppLink>
        </div>
      </section>

      <section id="features">
        <div className="container">
          <div className="section-heading">
            <h2>Everything needed for daily support</h2>
            <p>Realtime conversations, agent availability, typing indicators, quick replies, and per-site widget customization are built in.</p>
          </div>
          <div className="feature-grid">
            {features.map(([title, text]) => (
              <article className="card" key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing">
        <div className="container">
          <div className="section-heading">
            <h2>Pricing</h2>
            <p>Pick a simple plan and scale when your support volume grows.</p>
          </div>
          <div className="pricing-grid">
            {plans.map(([name, price, text]) => (
              <article className="card" key={name}>
                <h3>{name}</h3>
                <div className="price">{price}</div>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="contact">
        <div className="container">
          <div className="contact-band">
            <div>
              <h2>Contact us</h2>
              <p>Need help setting up your first site or support team? Reach out and we will help you get running.</p>
            </div>
            <AppLink className="btn btn-primary" href="/contact" navigate={navigate}>Open Contact Form</AppLink>
          </div>
        </div>
      </section>
    </Layout>
  );
}
