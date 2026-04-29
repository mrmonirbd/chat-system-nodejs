import { FormEvent, useState } from 'react';
import type { RoutePath } from '../routes';
import { Layout } from '../components/Layout';

type PageProps = {
  currentRoute: RoutePath;
  navigate: (path: string) => void;
};

export function ContactPage({ currentRoute, navigate }: PageProps) {
  const [sent, setSent] = useState(false);

  function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
    event.currentTarget.reset();
  }

  return (
    <Layout currentRoute={currentRoute} navigate={navigate}>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow page-eyebrow">Contact us</span>
          <h1>Let us help you set up support.</h1>
          <p className="lead">Send a message about your site, team, or widget setup. We will get back to you with the next step.</p>
        </div>
      </section>

      <section>
        <div className="container contact-grid">
          <aside className="info-card">
            <h2>Reach us</h2>
            <div className="info-item">
              <strong>Email</strong>
              support@example.com
            </div>
            <div className="info-item">
              <strong>Dashboard</strong>
              Manage sites, agents, colors, and conversations from one place.
            </div>
            <div className="info-item">
              <strong>Support panel</strong>
              Agents can reply live, use quick replies, and manage conversations.
            </div>
          </aside>

          <form className="form-card" onSubmit={submitContact}>
            <h2>Send a message</h2>
            <div className="form-grid">
              <div>
                <label htmlFor="name">Name</label>
                <input id="name" name="name" type="text" placeholder="Your name" required />
              </div>
              <div>
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" placeholder="you@example.com" required />
              </div>
              <div className="full">
                <label htmlFor="topic">Topic</label>
                <select id="topic" name="topic">
                  <option>Widget setup</option>
                  <option>Pricing</option>
                  <option>Support team onboarding</option>
                  <option>Technical help</option>
                </select>
              </div>
              <div className="full">
                <label htmlFor="message">Message</label>
                <textarea id="message" name="message" placeholder="Tell us what you need..." required />
              </div>
            </div>
            <button className="btn btn-primary contact-submit" type="submit">Send Message</button>
            {sent && <div className="form-message visible">Thanks. Your message is ready for the team.</div>}
          </form>
        </div>
      </section>
    </Layout>
  );
}
