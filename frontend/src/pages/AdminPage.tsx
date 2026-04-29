import { FormEvent, useEffect, useState } from 'react';

type AdminView = 'dashboard' | 'chat' | 'sites' | 'support' | 'apiKeys' | 'users';

type Analytics = {
  totals: {
    cpuUsage: number;
    connectedSites: number;
    activeChats: number;
    totalMessages: number;
    totalSites: number;
    supportAgents: number;
  };
};

type Site = {
  id: number;
  name: string;
  domain: string;
  apiKey: string;
};

type User = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'support';
  siteId: number | null;
  isActive: boolean;
};

type Thread = {
  id: number;
  visitorName: string;
  status: string;
  lastMessageAt: string;
  Site?: { name: string; domain: string };
  AssignedSupport?: { name: string; email: string };
};

type Message = {
  id: number;
  sender: 'visitor' | 'support';
  message: string;
  createdAt: string;
};

type OnlineAgent = {
  id: number;
  name: string;
  siteId: string;
  socketCount: number;
};

const API_URL = '/api';

type AdminPageProps = {
  initialView: AdminView;
  navigate: (path: string) => void;
};

export function AdminPage({ initialView, navigate }: AdminPageProps) {
  const [view, setView] = useState<AdminView>(initialView);
  const [token] = useState(() => localStorage.getItem('token') || '');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [onlineAgents, setOnlineAgents] = useState<OnlineAgent[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');

  function authHeaders() {
    return { Authorization: `Bearer ${token}` };
  }

  async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...authHeaders()
      }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data as T;
  }

  async function loadAll() {
    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      const [analyticsData, siteData, userData, threadData, agentData] = await Promise.all([
        fetchJson<Analytics>(`${API_URL}/admin/analytics?range=30d`),
        fetchJson<Site[]>(`${API_URL}/sites/list`),
        fetchJson<User[]>(`${API_URL}/users/list`),
        fetchJson<Thread[]>(`${API_URL}/admin/threads`),
        fetchJson<OnlineAgent[]>(`${API_URL}/admin/online-agents`)
      ]);

      setAnalytics(analyticsData);
      setSites(siteData);
      setUsers(userData);
      setThreads(threadData);
      setOnlineAgents(agentData);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    }
  }

  useEffect(() => {
    loadAll();
    const interval = window.setInterval(loadAll, 30000);
    return () => window.clearInterval(interval);
  }, [token]);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  function goTo(path: string, nextView: AdminView) {
    setView(nextView);
    navigate(path);
  }

  async function openThread(thread: Thread) {
    setSelectedThread(thread);
    try {
      setMessages(await fetchJson<Message[]>(`${API_URL}/threads/${thread.id}/messages`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    }
  }

  async function sendAdminMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedThread) return;

    const formData = new FormData(event.currentTarget);
    const message = String(formData.get('message') || '').trim();
    if (!message) return;

    try {
      const newMessage = await fetchJson<Message>(`${API_URL}/admin/threads/${selectedThread.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      setMessages(prev => [...prev, newMessage]);
      event.currentTarget.reset();
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  }

  async function createSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await fetchJson(`${API_URL}/sites/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.get('name'),
        domain: formData.get('domain')
      })
    });
    event.currentTarget.reset();
    loadAll();
  }

  async function createSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await fetchJson(`${API_URL}/sites/add-support`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: formData.get('siteId'),
        name: formData.get('name'),
        email: formData.get('email'),
        password: formData.get('password')
      })
    });
    event.currentTarget.reset();
    loadAll();
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('adminName');
    window.location.href = '/login';
  }

  const supportUsers = users.filter(user => user.role === 'support');

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><span className="admin-brand-icon">▣</span><strong>emilus</strong></div>
        <p className="admin-sidebar-title">Dashboard</p>
        <button className={view === 'dashboard' ? 'active' : ''} onClick={() => goTo('/admin', 'dashboard')}>Default</button>
        <button className={view === 'analytics' ? 'active' : ''} onClick={() => goTo('/admin/analytics', 'analytics')}>Analytic</button>
        <button className={view === 'chat' ? 'active' : ''} onClick={() => goTo('/admin/chat', 'chat')}>Chat</button>
        <button className={view === 'sites' ? 'active' : ''} onClick={() => goTo('/admin/sites', 'sites')}>Sites</button>
        <button className={view === 'apiKeys' ? 'active' : ''} onClick={() => goTo('/admin/api-keys', 'apiKeys')}>API Keys</button>
        <button className={view === 'support' ? 'active' : ''} onClick={() => goTo('/admin/support-agents', 'support')}>Support Agents</button>
        <button className={view === 'users' ? 'active' : ''} onClick={() => goTo('/admin/users', 'users')}>Users</button>
        <p className="admin-sidebar-title">System</p>
        <button onClick={logout}>Logout</button>
      </aside>

      <main className="admin-main">
        <div className="admin-topbar">
          <div>
            <h1>Admin Panel</h1>
            <p>Manage chats, users, agents, sites, and API keys.</p>
          </div>
          <div className="admin-online">
            <span className="admin-live-dot"></span>
            {onlineAgents.length} agents online
          </div>
        </div>

        {error && <div className="admin-alert">{error}</div>}

        {view === 'dashboard' && (
          <>
            <div className="admin-card-grid">
              <Metric label="CPU Usage" value={`${analytics?.totals.cpuUsage || 0}%`} />
              <Metric label="Connected Sites" value={analytics?.totals.connectedSites || 0} />
              <Metric label="Active Chat" value={analytics?.totals.activeChats || 0} live />
              <Metric label="Total Messages" value={analytics?.totals.totalMessages || 0} />
              <Metric label="Total Sites" value={analytics?.totals.totalSites || 0} />
              <Metric label="Support Agents" value={analytics?.totals.supportAgents || 0} />
            </div>
            <div className="admin-panel-card">
              <h2>Online Support Agents</h2>
              <div className="admin-list">
                {onlineAgents.length === 0 && <p className="muted">No agents online.</p>}
                {onlineAgents.map(agent => (
                  <div className="admin-list-row" key={`${agent.siteId}-${agent.id}`}>
                    <span><strong>{agent.name}</strong><small>Site #{agent.siteId}</small></span>
                    <span className="status-pill">Online</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {view === 'chat' && (
          <div className="admin-chat-grid">
            <div className="admin-panel-card">
              <h2>Client Chats</h2>
              {threads.map(thread => (
                <button className="thread-row" key={thread.id} onClick={() => openThread(thread)}>
                  <strong>{thread.visitorName || 'Guest'}</strong>
                  <span>{thread.Site?.name || 'Unknown site'} · {thread.status}</span>
                </button>
              ))}
            </div>
            <div className="admin-panel-card chat-box">
              <h2>{selectedThread ? `Chat with ${selectedThread.visitorName || 'Guest'}` : 'Select a chat'}</h2>
              <div className="admin-messages">
                {messages.map(message => (
                  <div className={`admin-message ${message.sender === 'support' ? 'sent' : 'received'}`} key={message.id}>
                    {message.message}
                  </div>
                ))}
              </div>
              {selectedThread && (
                <form className="admin-send" onSubmit={sendAdminMessage}>
                  <input name="message" placeholder="Write message as admin..." />
                  <button>Send</button>
                </form>
              )}
            </div>
          </div>
        )}

        {view === 'sites' && (
          <div className="admin-two-col">
            <div className="admin-panel-card">
              <h2>Create Site</h2>
              <form className="admin-form" onSubmit={createSite}>
                <input name="name" placeholder="Site name" required />
                <input name="domain" placeholder="Domain" required />
                <button>Create Site</button>
              </form>
            </div>
            <DataTable headers={['Site', 'Domain', 'API Key']} rows={sites.map(site => [site.name, site.domain, site.apiKey])} />
          </div>
        )}

        {view === 'apiKeys' && <DataTable headers={['Site', 'Domain', 'API Key']} rows={sites.map(site => [site.name, site.domain, site.apiKey])} />}

        {view === 'support' && (
          <div className="admin-two-col">
            <div className="admin-panel-card">
              <h2>Add Support Agent</h2>
              <form className="admin-form" onSubmit={createSupport}>
                <select name="siteId" required>
                  <option value="">Select site</option>
                  {sites.map(site => <option value={site.id} key={site.id}>{site.name}</option>)}
                </select>
                <input name="name" placeholder="Name" required />
                <input name="email" type="email" placeholder="Email" required />
                <input name="password" type="password" placeholder="Password" required />
                <button>Add Agent</button>
              </form>
            </div>
            <DataTable headers={['Name', 'Email', 'Site']} rows={supportUsers.map(user => [user.name, user.email, user.siteId || '-'])} />
          </div>
        )}

        {view === 'users' && <DataTable headers={['Name', 'Email', 'Role', 'Site', 'Status']} rows={users.map(user => [user.name, user.email, user.role, user.siteId || '-', user.isActive ? 'Active' : 'Inactive'])} />}
      </main>
    </div>
  );
}

function Metric({ label, value, live = false }: { label: string; value: string | number; live?: boolean }) {
  return (
    <div className="admin-metric">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{live ? 'LIVE' : 'Updated'}</span>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="admin-panel-card table-card">
      <table>
        <thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
