import { FormEvent, useEffect, useState } from 'react';
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
  const resetToken = new URLSearchParams(window.location.search).get('resetToken') || '';
  const resetEmail = new URLSearchParams(window.location.search).get('email') || '';
  const [tab, setTab] = useState<'login' | 'signup' | 'forgot' | 'reset'>(resetToken ? 'reset' : 'login');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success' | ''>('');
  const [resetStatus, setResetStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>(resetToken ? 'checking' : 'idle');
  const [resetExpiresAt, setResetExpiresAt] = useState('');
  const [resetSecondsLeft, setResetSecondsLeft] = useState(0);
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);

  useEffect(() => {
    if (!resetToken) return;

    let active = true;

    async function verifyResetLink() {
      setResetStatus('checking');
      setMessage('');

      try {
        const res = await fetch(`${API_URL}/auth/verify-reset-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken, email: resetEmail })
        });
        const data = await res.json() as { message?: string; error?: string; expiresAt?: string };
        if (!active) return;
        if (!res.ok) throw new Error(data.error || 'Invalid or expired reset link');

        setResetExpiresAt(data.expiresAt || '');
        setResetStatus('valid');
      } catch (error) {
        if (!active) return;
        setResetStatus('invalid');
        showError(error);
      }
    }

    verifyResetLink();

    return () => {
      active = false;
    };
  }, [resetEmail, resetToken]);

  useEffect(() => {
    if (tab !== 'reset' || resetStatus !== 'valid' || !resetExpiresAt) return;

    function updateTimer() {
      const secondsLeft = Math.max(0, Math.ceil((new Date(resetExpiresAt).getTime() - Date.now()) / 1000));
      setResetSecondsLeft(secondsLeft);

      if (secondsLeft <= 0) {
        setResetStatus('invalid');
        setMessage('Reset link expired. Please request a new reset link.');
        setMessageType('error');
      }
    }

    updateTimer();
    const timerId = window.setInterval(updateTimer, 1000);

    return () => window.clearInterval(timerId);
  }, [resetExpiresAt, resetStatus, tab]);

  function formatResetTimer(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

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
          role: 'admin',
          siteId: null,
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

  async function submitForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isForgotSubmitting) return;

    setMessage('');

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '').trim();

    if (!email) {
      setMessage('Please enter your email address.');
      setMessageType('error');
      return;
    }

    setIsForgotSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Email check failed');

      setMessage(data.message || 'Email found. Please contact your admin to reset this account.');
      setMessageType('success');
    } catch (error) {
      showError(error);
    } finally {
      setIsForgotSubmitting(false);
    }
  }

  async function submitResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') || '');
    const confirmPassword = String(formData.get('confirmPassword') || '');

    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.');
      setMessageType('error');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      setMessageType('error');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, email: resetEmail, password })
      });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Password reset failed');

      window.history.replaceState({}, '', '/login');
      setMessage(data.message || 'Password reset successful. You can login now.');
      setMessageType('success');
      setTab('login');
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
          <p>
            {tab === 'login' && 'Login to continue.'}
            {tab === 'signup' && 'Create an account to continue.'}
            {tab === 'forgot' && 'Enter your email to request password help.'}
            {tab === 'reset' && 'Set a new password for your account.'}
          </p>
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
            <p className="auth-switch auth-forgot">
              <button
                type="button"
                onClick={() => {
                  setMessage('');
                  setTab('forgot');
                }}
              >
                Forgot password?
              </button>
            </p>
            <p className="auth-switch">
              Don&apos;t have an account?{' '}
              <button type="button" onClick={() => setTab('signup')}>Sign up here</button>
            </p>
          </form>
        )}

        {tab === 'forgot' && (
          <form className="auth-form" onSubmit={submitForgotPassword}>
            <div className="field">
              <label htmlFor="forgotEmail">Email</label>
              <input id="forgotEmail" name="email" type="email" required placeholder="you@example.com" disabled={isForgotSubmitting} />
            </div>
            <button className="auth-btn auth-btn-content" type="submit" disabled={isForgotSubmitting}>
              {isForgotSubmitting && <span className="auth-spinner" aria-hidden="true"></span>}
              <span>{isForgotSubmitting ? 'Sending...' : 'Submit'}</span>
            </button>
            <p className="auth-switch">
              Remember your password?{' '}
              <button
                type="button"
                onClick={() => {
                  setMessage('');
                  setTab('login');
                }}
              >
                Login here
              </button>
            </p>
          </form>
        )}

        {tab === 'reset' && resetStatus === 'checking' && (
          <div className="auth-form">
            <p className="auth-state">Checking reset link...</p>
          </div>
        )}

        {tab === 'reset' && resetStatus === 'invalid' && (
          <div className="auth-form">
            <p className="auth-switch">
              <button
                type="button"
                onClick={() => {
                  window.history.replaceState({}, '', '/login');
                  setMessage('');
                  setResetStatus('idle');
                  setTab('forgot');
                }}
              >
                Request a new reset link
              </button>
            </p>
          </div>
        )}

        {tab === 'reset' && resetStatus === 'valid' && (
          <form className="auth-form" onSubmit={submitResetPassword}>
            <p className="auth-timer">This link expires in {formatResetTimer(resetSecondsLeft)}</p>
            {resetEmail && (
              <div className="field">
                <label htmlFor="resetEmail">Email</label>
                <input id="resetEmail" type="email" value={resetEmail} readOnly />
              </div>
            )}
            <div className="field">
              <label htmlFor="resetPassword">New password</label>
              <input id="resetPassword" name="password" type="password" required minLength={6} placeholder="Minimum 6 characters" />
            </div>
            <div className="field">
              <label htmlFor="resetConfirmPassword">Confirm password</label>
              <input id="resetConfirmPassword" name="confirmPassword" type="password" required minLength={6} placeholder="Confirm new password" />
            </div>
            <button className="auth-btn" type="submit">Reset password</button>
            <p className="auth-switch">
              Remember your password?{' '}
              <button
                type="button"
                onClick={() => {
                  window.history.replaceState({}, '', '/login');
                  setMessage('');
                  setTab('login');
                }}
              >
                Login here
              </button>
            </p>
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
            <label className="check">
              <input name="terms" type="checkbox" required />
              <span>I agree to the <AppLink href="/terms" navigate={navigate}>Terms</AppLink>.</span>
            </label>
            <label className="check">
              <input name="privacy" type="checkbox" required />
              <span>I agree to the <AppLink href="/privacy" navigate={navigate}>Privacy Policy</AppLink>.</span>
            </label>
            <button className="auth-btn" type="submit">Create account</button>
            <p className="auth-switch">
              Already have an account?{' '}
              <button type="button" onClick={() => setTab('login')}>Login here</button>
            </p>
          </form>
        )}

        <div className="back"><AppLink href="/" navigate={navigate}>Back to home</AppLink></div>
      </section>
    </main>
  );
}
