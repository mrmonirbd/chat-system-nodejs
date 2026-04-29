import { FormEvent, useState } from 'react';
import { AppLink } from '../components/Link';

type LoginPageProps = {
  navigate: (path: string) => void;
};

type AuthResponse = {
  token: string;
  user: {
    name: string;
    role: 'admin' | 'support';
  };
  error?: string;
};

const API_URL = '/api';

export function LoginPage({ navigate }: LoginPageProps) {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('');
  const [signupRole, setSignupRole] = useState<'admin' | 'support'>('admin');

  function completeAuth(data: AuthResponse) {
    if (data.user.role === 'admin') {
      localStorage.setItem('token', data.token);
      localStorage.setItem('adminName', data.user.name);
      window.location.href = '/admin';
      return;
    }

    localStorage.setItem('supportToken', data.token);
    localStorage.setItem('agentName', data.user.name);
    window.location.href = '/support-panel';
  }

  function showError(error: unknown) {
    setMessage(error instanceof Error ? error.message : 'Something went wrong');
    setMessageType('error');
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    const formData = new FormData(event.currentTarget);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.get('email'),
          password: formData.get('password')
        })
      });
      const data = await res.json() as AuthResponse;
      if (!res.ok) throw new Error(data.error || 'Login failed');
      completeAuth(data);
    } catch (error) {
      showError(error);
    }
  }

  async function submitSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    const formData = new FormData(event.currentTarget);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          password: formData.get('password'),
          role: signupRole,
          siteId: signupRole === 'support' ? formData.get('siteId') : null,
          acceptedTerms: formData.get('terms') === 'on',
          acceptedPrivacy: formData.get('privacy') === 'on'
        })
      });
      const data = await res.json() as AuthResponse;
      if (!res.ok) throw new Error(data.error || 'Signup failed');
      completeAuth(data);
    } catch (error) {
      showError(error);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-head">
          <AppLink className="brand" href="/" navigate={navigate}>
            <span className="brand-mark">C</span>
            <span>Chat System</span>
          </AppLink>
          <p>Login or create an account to continue.</p>
        </div>

        <div className="tabs">
          <button className={`tab ${tab === 'login' ? 'active' : ''}`} type="button" onClick={() => setTab('login')}>Login</button>
          <button className={`tab ${tab === 'signup' ? 'active' : ''}`} type="button" onClick={() => setTab('signup')}>Sign up</button>
        </div>

        {message && <div className={`auth-message ${messageType}`}>{message}</div>}

        {tab === 'login' && (
          <form className="auth-form" onSubmit={submitLogin}>
            <div className="field">
              <label htmlFor="loginEmail">Email</label>
              <input id="loginEmail" name="email" type="email" required placeholder="you@example.com" />
            </div>
            <div className="field">
              <label htmlFor="loginPassword">Password</label>
              <input id="loginPassword" name="password" type="password" required placeholder="Password" />
            </div>
            <button className="auth-btn" type="submit">Login</button>
          </form>
        )}

        {tab === 'signup' && (
          <form className="auth-form" onSubmit={submitSignup}>
            <div className="field">
              <label htmlFor="signupName">Name</label>
              <input id="signupName" name="name" type="text" required placeholder="Your name" />
            </div>
            <div className="field">
              <label htmlFor="signupEmail">Email</label>
              <input id="signupEmail" name="email" type="email" required placeholder="you@example.com" />
            </div>
            <div className="field">
              <label htmlFor="signupPassword">Password</label>
              <input id="signupPassword" name="password" type="password" required minLength={6} placeholder="Minimum 6 characters" />
            </div>
            <div className="field">
              <label htmlFor="signupRole">Account type</label>
              <select id="signupRole" value={signupRole} onChange={(event) => setSignupRole(event.target.value as 'admin' | 'support')}>
                <option value="admin">Admin</option>
                <option value="support">Support agent</option>
              </select>
            </div>
            {signupRole === 'support' && (
              <div className="field">
                <label htmlFor="signupSiteId">Site ID</label>
                <input id="signupSiteId" name="siteId" type="number" required placeholder="Required for support agents" />
              </div>
            )}
            <label className="check">
              <input name="terms" type="checkbox" required />
              <span>I agree to the <AppLink href="/terms" navigate={navigate}>Terms</AppLink>.</span>
            </label>
            <label className="check">
              <input name="privacy" type="checkbox" required />
              <span>I agree to the <AppLink href="/privacy" navigate={navigate}>Privacy Policy</AppLink>.</span>
            </label>
            <button className="auth-btn" type="submit">Create account</button>
          </form>
        )}

        <div className="back"><AppLink href="/" navigate={navigate}>Back to home</AppLink></div>
      </section>
    </main>
  );
}
