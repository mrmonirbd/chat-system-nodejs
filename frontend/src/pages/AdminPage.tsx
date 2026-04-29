import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';

type AdminView = 'dashboard' | 'chat' | 'agentChat' | 'sites' | 'support' | 'apiKeys' | 'users';
type AnalyticsRange = '1d' | '7d' | '30d' | '6m' | '1y';
type AdminIconName = 'dashboard' | 'chat' | 'sites' | 'key' | 'support' | 'users' | 'logout';

declare global {
  interface Window {
    io?: (options?: Record<string, unknown>) => AdminSocket;
  }
}

type AdminSocket = {
  on: (event: string, handler: (payload: unknown) => void) => void;
  emit: (event: string, payload?: unknown) => void;
  off?: (event: string) => void;
  disconnect: () => void;
};

type Analytics = {
  totals: {
    cpuUsage: number;
    ramUsage: number;
    connectedSites: number;
    activeChats: number;
    totalMessages: number;
    totalSites: number;
    supportAgents: number;
  };
  charts?: {
    messages?: ChartSeries;
    sites?: ChartSeries;
    supportAgents?: ChartSeries;
  };
};

type ChartSeries = {
  labels: string[];
  data: number[];
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

type AgentChatMessage = {
  id: number;
  sender: 'admin' | 'agent';
  message: string;
  createdAt: string;
};

type InternalChatMessage = {
  id: number;
  senderRole: 'admin' | 'support';
  sender: 'me' | 'other';
  message: string;
  createdAt: string;
};

type AgentChatSession = {
  agent: User;
  draft: string;
  messages: AgentChatMessage[];
  open: boolean;
  unread: number;
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
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [onlineChats, setOnlineChats] = useState<Thread[]>([]);
  const [onlineAgents, setOnlineAgents] = useState<OnlineAgent[]>([]);
  const [adminSocket, setAdminSocket] = useState<AdminSocket | null>(null);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [floatingChatOpen, setFloatingChatOpen] = useState(false);
  const [agentChats, setAgentChats] = useState<AgentChatSession[]>([]);
  const [agentUnreadCounts, setAgentUnreadCounts] = useState<Record<number, number>>({});
  const [activeAgentId, setActiveAgentId] = useState<number | null>(null);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [adminDraft, setAdminDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const viewRef = useRef(view);
  const activeAgentIdRef = useRef(activeAgentId);

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
      const [analyticsData, siteData, userData, threadData, agentData, onlineChatData] = await Promise.all([
        fetchJson<Analytics>(`${API_URL}/admin/analytics?range=${range}`),
        fetchJson<Site[]>(`${API_URL}/sites/list`),
        fetchJson<User[]>(`${API_URL}/users/list`),
        fetchJson<Thread[]>(`${API_URL}/admin/threads`),
        fetchJson<OnlineAgent[]>(`${API_URL}/admin/online-agents`),
        fetchJson<Thread[]>(`${API_URL}/admin/online-chats`)
      ]);
      const unreadData = await fetchJson<Record<number, number>>(`${API_URL}/internal-chat/unread-counts`);

      setAnalytics(analyticsData);
      setSites(siteData);
      setUsers(userData);
      setThreads(threadData);
      setOnlineAgents(agentData);
      setOnlineChats(onlineChatData);
      setAgentUnreadCounts(unreadData);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    }
  }

  useEffect(() => {
    loadAll();
    const interval = window.setInterval(loadAll, 30000);
    return () => window.clearInterval(interval);
  }, [token, range]);

  useEffect(() => {
    viewRef.current = view;
    activeAgentIdRef.current = activeAgentId;
  }, [view, activeAgentId]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let socket: AdminSocket | null = null;

    const connectSocket = () => {
      if (cancelled || !window.io) return;
      socket = window.io({ transports: ['websocket', 'polling'] });
      socket.emit('admin-auth', token);
      setAdminSocket(socket);
      socket.on('active-chat-count', payload => {
        const data = payload as { count?: number };
        setAnalytics(prev => prev ? {
          ...prev,
          totals: { ...prev.totals, activeChats: Number(data.count || 0) }
        } : prev);
        fetchJson<Thread[]>(`${API_URL}/admin/online-chats`).then(setOnlineChats).catch(() => {});
      });
      socket.on('total-message-count', payload => {
        const data = payload as { count?: number };
        setAnalytics(prev => prev ? {
          ...prev,
          totals: { ...prev.totals, totalMessages: Number(data.count || 0) }
        } : prev);
      });
      socket.on('new-thread', () => loadAll());
      socket.on('new-thread-message', () => loadAll());
      socket.on('agent-admin-message', payload => {
        const data = payload as { id: number; fromSupportId: number; fromSupportName: string; fromSupportEmail?: string; siteId?: number | null; message: string; unreadCount?: number; createdAt: string };
        setAgentChats(prev => {
          const existing = prev.find(chat => chat.agent.id === data.fromSupportId);
          if (!existing) {
            return [...prev, {
              agent: {
                id: data.fromSupportId,
                name: data.fromSupportName || 'Support Agent',
                email: data.fromSupportEmail || '',
                role: 'support',
                siteId: data.siteId || null,
                isActive: true
              },
              draft: '',
              open: true,
            unread: activeAgentIdRef.current === data.fromSupportId && viewRef.current === 'agentChat' ? 0 : Number(data.unreadCount || 1),
              messages: [{ id: data.id, sender: 'agent', message: data.message, createdAt: data.createdAt }]
            }];
          }

          return prev.map(chat => chat.agent.id === data.fromSupportId ? {
            ...chat,
            open: true,
            unread: activeAgentIdRef.current === data.fromSupportId && viewRef.current === 'agentChat' ? 0 : Number(data.unreadCount || chat.unread + 1),
            messages: [...chat.messages, { id: data.id, sender: 'agent', message: data.message, createdAt: data.createdAt }]
          } : chat);
        });
        setAgentUnreadCounts(prev => ({
          ...prev,
          [data.fromSupportId]: activeAgentIdRef.current === data.fromSupportId && viewRef.current === 'agentChat' ? 0 : Number(data.unreadCount || (prev[data.fromSupportId] || 0) + 1)
        }));
        if (activeAgentIdRef.current === data.fromSupportId && viewRef.current === 'agentChat') {
          fetchJson(`${API_URL}/internal-chat/${data.fromSupportId}/read`, { method: 'POST' }).catch(() => {});
        }
        showNotice(`New message from ${data.fromSupportName || 'Support Agent'}`);
      });
    };

    if (window.io) {
      connectSocket();
    } else {
      const script = document.createElement('script');
      script.src = '/socket.io/socket.io.js';
      script.async = true;
      script.onload = connectSocket;
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
      setAdminSocket(null);
      socket?.disconnect();
    };
  }, [token, range]);

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

  async function openThreadFromOnline(thread: Thread) {
    setOnlineOpen(false);
    await openThread(thread);
    setFloatingChatOpen(true);
  }

  async function openAgentChat(agent: User) {
    setOnlineOpen(false);
    setFloatingChatOpen(false);
    setActiveAgentId(agent.id);
    goTo('/admin/agent-chat', 'agentChat');
    setAgentUnreadCounts(prev => ({ ...prev, [agent.id]: 0 }));
    setAgentChats(prev => {
      const existing = prev.find(chat => chat.agent.id === agent.id);
      if (existing) {
        return prev.map(chat => chat.agent.id === agent.id ? { ...chat, open: true, unread: 0 } : chat);
      }

      return [...prev, {
        agent,
        draft: '',
        open: true,
        unread: 0,
        messages: []
      }];
    });

    try {
      const history = await fetchJson<InternalChatMessage[]>(`${API_URL}/internal-chat/${agent.id}/messages`);
      const messages = history.map(message => ({
        id: message.id,
        sender: message.senderRole === 'admin' ? 'admin' as const : 'agent' as const,
        message: message.message,
        createdAt: message.createdAt
      }));
      setAgentChats(prev => prev.map(chat => chat.agent.id === agent.id ? { ...chat, messages, unread: 0 } : chat));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent chat');
    }
  }

  async function sendAdminMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedThread) return;

    const message = adminDraft.trim();
    if (!message) return;

    try {
      const newMessage = await fetchJson<Message>(`${API_URL}/admin/threads/${selectedThread.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      setMessages(prev => [...prev, newMessage]);
      setAdminDraft('');
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  }

  function sendAgentMessage(event: FormEvent<HTMLFormElement>, agentId: number) {
    event.preventDefault();
    const chat = agentChats.find(item => item.agent.id === agentId);
    const message = chat?.draft.trim();
    if (!message) return;

    setAgentChats(prev => prev.map(item => item.agent.id === agentId ? {
      ...item,
      draft: '',
      messages: [...item.messages, {
        id: Date.now(),
        sender: 'admin',
        message,
        createdAt: new Date().toISOString()
      }]
    } : item));
    adminSocket?.emit('admin-agent-message', { toSupportId: agentId, message });
  }

  function updateAgentDraft(agentId: number, draft: string) {
    setAgentChats(prev => prev.map(chat => chat.agent.id === agentId ? { ...chat, draft } : chat));
  }

  function closeAgentChat(agentId: number) {
    setAgentChats(prev => prev.map(chat => chat.agent.id === agentId ? { ...chat, open: false } : chat));
    if (activeAgentId === agentId) setActiveAgentId(null);
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
  const onlineTotal = onlineAgents.length;
  const onlineThreadIds = new Set(onlineChats.map(thread => thread.id));
  const onlineAgentIds = new Set(onlineAgents.map(agent => agent.id));
  function getAgentUnread(agentId: number) {
    const chatUnread = agentChats.find(chat => chat.agent.id === agentId)?.unread || 0;
    return Math.max(chatUnread, Number(agentUnreadCounts[agentId] || 0));
  }
  const quickReplies = [
    'Hello! How can I help you today?',
    'Thanks for reaching out. I am checking this for you.',
    'Could you please share a little more detail?',
    'Please wait a moment while I look into this.',
    'This should be resolved now. Please check and let me know.'
  ];

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2200);
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><span className="admin-brand-icon">▣</span><strong>emilus</strong></div>
        <p className="admin-sidebar-title">Dashboard</p>
        <NavButton icon="dashboard" active={view === 'dashboard'} onClick={() => goTo('/admin', 'dashboard')}>Default</NavButton>
        <NavButton icon="chat" active={view === 'chat'} onClick={() => goTo('/admin/chat', 'chat')}>Chat</NavButton>
        <NavButton icon="support" active={view === 'agentChat'} onClick={() => goTo('/admin/agent-chat', 'agentChat')}>Agent Chat</NavButton>
        <NavButton icon="sites" active={view === 'sites'} onClick={() => goTo('/admin/sites', 'sites')}>Sites</NavButton>
        <NavButton icon="key" active={view === 'apiKeys'} onClick={() => goTo('/admin/api-keys', 'apiKeys')}>API Keys</NavButton>
        <NavButton icon="support" active={view === 'support'} onClick={() => goTo('/admin/support-agents', 'support')}>Support Agents</NavButton>
        <NavButton icon="users" active={view === 'users'} onClick={() => goTo('/admin/users', 'users')}>Users</NavButton>
        <p className="admin-sidebar-title">System</p>
        <NavButton icon="logout" onClick={logout}>Logout</NavButton>
      </aside>

      <main className="admin-main">
        {notice && <div className="admin-toast">{notice}</div>}
        <div className="admin-topbar">
          <div>
            <h1>Admin Panel</h1>
            <p>Manage chats, users, agents, sites, and API keys.</p>
          </div>
          <div className="admin-online-wrap">
            <button className="admin-online" onClick={() => setOnlineOpen(prev => !prev)}>
              <span className="admin-live-dot"></span>
              {onlineTotal} online
            </button>
            {onlineOpen && (
              <div className="admin-online-menu">
                <h3>Online Now</h3>
                <p>Support agents</p>
                {supportUsers.length === 0 && <span className="empty-row">No support agent found.</span>}
                {supportUsers.map(agent => (
                  <button className="online-menu-row" key={agent.id} onClick={() => openAgentChat(agent)}>
                    <strong>
                      {agent.name}
                      {onlineAgentIds.has(agent.id) && <span className="online-menu-mark">Online</span>}
                      {getAgentUnread(agent.id) > 0 && <span className="online-menu-unread">{getAgentUnread(agent.id)}</span>}
                    </strong>
                    <small>{agent.email}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && <div className="admin-alert">{error}</div>}

        {view === 'dashboard' && (
          <>
            <div className="admin-range-tabs">
              <button className={range === '1d' ? 'active' : ''} onClick={() => setRange('1d')}>1 Day</button>
              <button className={range === '7d' ? 'active' : ''} onClick={() => setRange('7d')}>7 Day</button>
              <button className={range === '30d' ? 'active' : ''} onClick={() => setRange('30d')}>30 Day</button>
              <button className={range === '6m' ? 'active' : ''} onClick={() => setRange('6m')}>6 Month</button>
              <button className={range === '1y' ? 'active' : ''} onClick={() => setRange('1y')}>1 Year</button>
            </div>
            <div className="admin-dashboard-top">
              <GaugeCard title="CPU Usage" value={analytics?.totals.cpuUsage || 0} note="Server usage right now" />
              <GaugeCard title="RAM Usage" value={analytics?.totals.ramUsage || 0} note="Memory usage right now" />
              <MetricCard label="Live Chat" value={analytics?.totals.activeChats || 0} delta={`${analytics?.totals.activeChats || 0}`} note="Open chat boxes now" trend="up" />
              <MetricCard label="Total Thread" value={threads.length} delta={`${threads.length}`} note="All client threads" trend="up" />
              <MetricCard label="Total Chat" value={analytics?.totals.totalMessages || 0} delta={`${analytics?.totals.totalMessages || 0}`} note="All messages sent" trend="up" />
              <MetricCard label="Total Member" value={users.length} delta={`${analytics?.totals.supportAgents || 0}`} note="Support agents included" trend="up" />
              <MetricCard label="Total Site" value={analytics?.totals.totalSites || 0} delta={`${analytics?.totals.connectedSites || 0}`} note="Connected sites now" trend="up" />
            </div>

            <div className="admin-dashboard-charts">
              <MultiWaveChart
                title="Live Message Curve"
                primary={analytics?.charts?.messages}
                secondary={analytics?.charts?.sites}
                primaryLabel="Messages"
                secondaryLabel="Sites"
              />
              <MultiWaveChart
                title="Total Chat"
                primary={analytics?.charts?.messages}
                primaryLabel="Messages"
                total={analytics?.totals.totalMessages || 0}
              />
              <MultiWaveChart
                title="Total Member"
                primary={analytics?.charts?.supportAgents}
                primaryLabel="Members"
                total={users.length}
              />
              <MultiWaveChart
                title="Total Site"
                primary={analytics?.charts?.sites}
                primaryLabel="Sites"
                total={analytics?.totals.totalSites || 0}
              />
            </div>

            <div className="admin-dashboard-bottom">
              <div className="admin-panel-card">
                <h2>New Join Member</h2>
                <div className="admin-list">
                  {supportUsers.slice(0, 5).map(user => (
                    <div className="admin-list-row compact" key={user.id}>
                      <span><strong>{user.name}</strong><small>{user.email}</small></span>
                      <span className="status-pill">Add</span>
                    </div>
                  ))}
                  {supportUsers.length === 0 && <p className="muted">No support agents yet.</p>}
                </div>
              </div>
              <DataTable
                headers={['Customer', 'Date', 'Site', 'Status']}
                rows={threads.slice(0, 5).map(thread => [
                  thread.visitorName || 'Guest',
                  formatShortDate(thread.lastMessageAt),
                  thread.Site?.name || 'Unknown site',
                  thread.status
                ])}
              />
            </div>
          </>
        )}

        {view === 'chat' && (
          <div className="admin-chat-grid">
            <div className="admin-chat-list-card">
              <div className="admin-chat-panel-head">
                <div>
                  <h2><span className="chat-head-icon">☰</span>Active Conversations</h2>
                  <p>{threads.length} recent threads</p>
                </div>
              </div>
              <div className="admin-thread-list">
                {threads.length === 0 && <div className="admin-chat-empty">No conversations yet</div>}
                {threads.map(thread => (
                  <button className={`admin-thread-item ${selectedThread?.id === thread.id ? 'active' : ''} ${onlineThreadIds.has(thread.id) ? 'online' : ''}`} key={thread.id} onClick={() => openThread(thread)}>
                    <div className="admin-thread-title">
                      <span className="thread-avatar">●</span>
                      <strong>{thread.visitorName || 'Guest'}</strong>
                      {onlineThreadIds.has(thread.id) && <span className="thread-online-mark">Online</span>}
                      <span className="thread-status">{thread.status}</span>
                    </div>
                    <p>{formatShortDate(thread.lastMessageAt)} · {thread.Site?.name || 'Unknown site'}</p>
                    <small>{thread.AssignedSupport?.name ? `Assigned to ${thread.AssignedSupport.name}` : 'Unassigned'}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="admin-chat-room-card">
              <div className="admin-chat-panel-head chat-room-head">
                <div>
                  <h2><span className="chat-head-icon">●</span>{selectedThread ? `Chatting with ${selectedThread.visitorName || 'Guest'}` : 'Select a conversation'}</h2>
                  <p>{selectedThread ? `${selectedThread.Site?.name || 'Unknown site'} · Active conversation` : 'Please select chat from head to start the chat'}</p>
                </div>
              </div>
              <div className="admin-messages">
                {!selectedThread && (
                  <div className="admin-chat-placeholder">
                    <span>□</span>
                    <p>Please select chat from head to start the chat</p>
                  </div>
                )}
                {selectedThread && messages.length === 0 && (
                  <div className="admin-chat-placeholder">
                    <span>○</span>
                    <p>No messages yet</p>
                  </div>
                )}
                {selectedThread && messages.map(message => (
                  <div className={`admin-message-row ${message.sender === 'support' ? 'sent' : 'received'}`} key={message.id}>
                    <div className="admin-message">
                      <div>{message.message}</div>
                      <time>{formatMessageTime(message.createdAt)}</time>
                    </div>
                  </div>
                ))}
              </div>
              <form className="admin-chat-composer" onSubmit={sendAdminMessage}>
                <div className="admin-quick-replies">
                  {quickReplies.map(reply => (
                    <button type="button" key={reply} disabled={!selectedThread} onClick={() => setAdminDraft(reply)}>
                      {reply.split(' ').slice(0, 2).join(' ')}
                    </button>
                  ))}
                </div>
                <div className="admin-send">
                  <input
                    value={adminDraft}
                    onChange={event => setAdminDraft(event.target.value)}
                    placeholder="Type your message..."
                    disabled={!selectedThread}
                  />
                  <button disabled={!selectedThread || !adminDraft.trim()}>Send</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {view === 'agentChat' && (
          <div className="admin-chat-grid">
            <div className="admin-chat-list-card">
              <div className="admin-chat-panel-head">
                <div>
                  <h2><span className="chat-head-icon">●</span>Support Agents</h2>
                  <p>{supportUsers.length} agents</p>
                </div>
              </div>
              <div className="admin-thread-list">
                {supportUsers.length === 0 && <div className="admin-chat-empty">No support agent found.</div>}
                {supportUsers.map(agent => (
                  <button className={`admin-thread-item ${activeAgentId === agent.id ? 'active' : ''} ${onlineAgentIds.has(agent.id) ? 'online' : ''}`} key={agent.id} onClick={() => openAgentChat(agent)}>
                    <div className="admin-thread-title">
                      <span className="thread-avatar">●</span>
                      <strong>{agent.name}</strong>
                      <span className="thread-status">{agent.role}</span>
                      {onlineAgentIds.has(agent.id) && <span className="thread-online-mark">Online</span>}
                      {getAgentUnread(agent.id) > 0 && <span className="online-menu-unread">{getAgentUnread(agent.id)}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <AgentChatRoom
              activeChat={agentChats.find(chat => chat.agent.id === activeAgentId)}
              onlineAgentIds={onlineAgentIds}
              onDraftChange={updateAgentDraft}
              onSend={sendAgentMessage}
            />
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
            <DataTable headers={['Site', 'Domain', 'API Key', 'Embed Tag']} rows={sites.map(site => [site.name, site.domain, site.apiKey, <EmbedCode apiKey={site.apiKey} onCopied={() => showNotice('Embed code copied')} />])} />
          </div>
        )}

        {view === 'apiKeys' && <DataTable headers={['Site', 'Domain', 'API Key', 'Embed Tag']} rows={sites.map(site => [site.name, site.domain, site.apiKey, <EmbedCode apiKey={site.apiKey} onCopied={() => showNotice('Embed code copied')} />])} />}

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

        {floatingChatOpen && selectedThread && (
          <div className="admin-floating-chat">
            <div className="admin-floating-chat-head">
              <div>
                <strong>{selectedThread.visitorName || 'Guest'}</strong>
                <span>{selectedThread.Site?.name || 'Unknown site'}</span>
              </div>
              <button type="button" onClick={() => setFloatingChatOpen(false)}>×</button>
            </div>
            <div className="admin-floating-messages">
              {messages.length === 0 && <div className="admin-chat-empty">No messages yet</div>}
              {messages.map(message => (
                <div className={`admin-message-row ${message.sender === 'support' ? 'sent' : 'received'}`} key={message.id}>
                  <div className="admin-message">
                    <div>{message.message}</div>
                    <time>{formatMessageTime(message.createdAt)}</time>
                  </div>
                </div>
              ))}
            </div>
            <form className="admin-floating-composer" onSubmit={sendAdminMessage}>
              <input
                value={adminDraft}
                onChange={event => setAdminDraft(event.target.value)}
                placeholder="Type your message..."
              />
              <button disabled={!adminDraft.trim()}>Send</button>
            </form>
          </div>
        )}

      </main>
    </div>
  );
}

function AgentChatRoom({ activeChat, onlineAgentIds, onDraftChange, onSend }: { activeChat?: AgentChatSession; onlineAgentIds: Set<number>; onDraftChange: (agentId: number, draft: string) => void; onSend: (event: FormEvent<HTMLFormElement>, agentId: number) => void }) {
  return (
    <div className="admin-chat-room-card">
      <div className="admin-chat-panel-head chat-room-head">
        <div>
          <h2><span className="chat-head-icon">●</span>{activeChat ? `Chatting with ${activeChat.agent.name}` : 'Select an agent'}</h2>
          <p>{activeChat ? (onlineAgentIds.has(activeChat.agent.id) ? 'Online now' : 'Offline') : 'Please select agent to start the chat'}</p>
        </div>
      </div>
      <div className="admin-messages">
        {!activeChat && (
          <div className="admin-chat-placeholder">
            <span>□</span>
            <p>Please select agent to start the chat</p>
          </div>
        )}
        {activeChat?.messages.map(message => (
          <div className={`admin-message-row ${message.sender === 'admin' ? 'sent' : 'received'}`} key={message.id}>
            <div className="admin-message">
              <div>{message.message}</div>
              <time>{formatMessageTime(message.createdAt)}</time>
            </div>
          </div>
        ))}
      </div>
      <form className="admin-chat-composer" onSubmit={event => activeChat && onSend(event, activeChat.agent.id)}>
        <div className="admin-send">
          <input value={activeChat?.draft || ''} onChange={event => activeChat && onDraftChange(activeChat.agent.id, event.target.value)} placeholder="Type your message..." disabled={!activeChat} />
          <button disabled={!activeChat || !activeChat.draft.trim()}>Send</button>
        </div>
      </form>
    </div>
  );
}

function NavButton({ icon, active = false, onClick, children }: { icon: AdminIconName; active?: boolean; onClick: () => void; children: string }) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      <AdminIcon name={icon} />
      <span>{children}</span>
    </button>
  );
}

function AdminIcon({ name }: { name: AdminIconName }) {
  const paths: Record<AdminIconName, string[]> = {
    dashboard: ['M3 13h8V3H3v10Z', 'M13 21h8V11h-8v10Z', 'M3 21h8v-6H3v6Z', 'M13 9h8V3h-8v6Z'],
    chat: ['M21 12a8 8 0 0 1-8 8H7l-4 3v-5a8 8 0 1 1 18-6Z'],
    sites: ['M4 5h16v12H4V5Z', 'M8 21h8', 'M12 17v4'],
    key: ['M21 7a5 5 0 0 1-7.8 4.1L5 19H2v-3l7.9-7.9A5 5 0 1 1 21 7Z', 'M15 7h.01'],
    support: ['M12 3a7 7 0 0 0-7 7v4', 'M19 14v-4a7 7 0 0 0-7-7', 'M5 14h3v5H5v-5Z', 'M16 14h3v5h-3v-5Z', 'M9 21h3a4 4 0 0 0 4-4'],
    users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
    logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9']
  };

  return (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name].map(path => <path key={path} d={path} />)}
    </svg>
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

function MetricCard({ label, value, delta, note, trend }: { label: string; value: string | number; delta: string; note: string; trend: 'up' | 'down' }) {
  return (
    <div className="admin-metric-card">
      <p>{label}</p>
      <div className="admin-metric-value">
        <strong>{value}</strong>
        <span className={trend === 'up' ? 'positive' : 'negative'}>{delta}{trend === 'up' ? '↗' : '↘'}</span>
      </div>
      <small>{note}</small>
    </div>
  );
}

function GaugeCard({ title, value, note }: { title: string; value: number; note: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const circumference = 2 * Math.PI * 46;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="admin-gauge-card">
      <h2>{title}</h2>
      <svg className="admin-gauge" viewBox="0 0 120 120" role="img" aria-label={`${title} ${clamped}%`}>
        <circle cx="60" cy="60" r="46" />
        <circle className="progress" cx="60" cy="60" r="46" strokeDasharray={circumference} strokeDashoffset={offset} />
        <text x="60" y="66" textAnchor="middle">{clamped}%</text>
      </svg>
      <p>{note}</p>
    </div>
  );
}

function MultiWaveChart({ title, primary, secondary, primaryLabel, secondaryLabel, total }: { title: string; primary?: ChartSeries; secondary?: ChartSeries; primaryLabel: string; secondaryLabel?: string; total?: string | number }) {
  const first = primary?.data?.length ? primary.data : [0];
  const second = secondary?.data?.length ? secondary.data : [0];
  const labels = primary?.labels?.length ? primary.labels : secondary?.labels || [];
  const max = Math.max(...first, ...second, 1);
  const primaryPath = buildSeriesPath(first, max);
  const secondaryPath = buildSeriesPath(second, max);
  const tickLabels = labels.length > 12 ? labels.filter((_, index) => index % Math.ceil(labels.length / 12) === 0) : labels;

  return (
    <div className="admin-wide-chart">
      <div className="admin-chart-title-row">
        <h2>{title}</h2>
        <div className="admin-chart-legend">
          <span><i className="blue"></i>{primaryLabel}</span>
          {secondaryLabel && <span><i className="green"></i>{secondaryLabel}</span>}
        </div>
      </div>
      <svg className="admin-wide-wave" viewBox="0 0 100 100" preserveAspectRatio="none">
        {[20, 40, 60, 80].map(y => <line key={y} x1="0" y1={y} x2="100" y2={y} />)}
        <path d={primaryPath} className="blue-line" />
        {secondaryLabel && <path d={secondaryPath} className="green-line" />}
      </svg>
      {total !== undefined && <strong className="admin-chart-total">{total}</strong>}
      <div className="admin-chart-labels">
        {tickLabels.slice(0, 12).map(label => <span key={label}>{formatTinyDate(label)}</span>)}
      </div>
    </div>
  );
}

function MiniWaveMetric({ title, value, series, color }: { title: string; value: string | number; series?: ChartSeries; color: string }) {
  const data = series?.data?.length ? series.data : [0];
  const max = Math.max(...data, 1);
  const path = buildSeriesPath(data, max);

  return (
    <div className="admin-mini-wave-card">
      <svg viewBox="0 0 100 52" preserveAspectRatio="none">
        <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
      </svg>
      <strong>{value}</strong>
      <p>{title}</p>
    </div>
  );
}

function CurveChart({ title, series, color, large = false }: { title: string; series?: ChartSeries; color: string; large?: boolean }) {
  const data = series?.data?.length ? series.data : [0];
  const labels = series?.labels || [];
  const max = Math.max(...data, 1);
  const chartPoints = data.map((value, index) => {
    const x = data.length === 1 ? 0 : (index / (data.length - 1)) * 100;
    const y = 92 - (value / max) * 78;
    return { x, y };
  });
  const smoothPath = buildSmoothPath(chartPoints);
  const areaPath = `${smoothPath} L 100 100 L 0 100 Z`;
  const current = data[data.length - 1] || 0;
  const firstLabel = labels[0] || '';
  const lastLabel = labels[labels.length - 1] || '';

  return (
    <div className={`admin-chart-card ${large ? 'large' : ''}`}>
      <div className="admin-chart-head">
        <div>
          <h2>{title}</h2>
          <p>{firstLabel && lastLabel ? `${firstLabel} - ${lastLabel}` : 'Live analytics'}</p>
        </div>
        <strong>{current}</strong>
      </div>
      <svg className="admin-curve-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={title}>
        <path d={areaPath} fill={`${color}20`} />
        <path d={smoothPath} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return 'M 0 92';
  if (points.length === 1) return `M 0 ${points[0].y} C 28 ${points[0].y - 10}, 72 ${points[0].y + 10}, 100 ${points[0].y}`;

  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;

    const previous = points[index - 1];
    const controlDistance = (point.x - previous.x) * 0.48;
    const waveLift = index % 2 === 0 ? -3 : 3;
    const c1x = previous.x + controlDistance;
    const c1y = previous.y + waveLift;
    const c2x = point.x - controlDistance;
    const c2y = point.y - waveLift;

    return `${path} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${point.x} ${point.y}`;
  }, '');
}

function buildSeriesPath(data: number[], max: number) {
  const points = data.map((value, index) => {
    const x = data.length === 1 ? 0 : (index / (data.length - 1)) * 100;
    const y = 88 - (value / max) * 72;
    return { x, y };
  });

  return buildSmoothPath(points);
}

function formatShortDate(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function formatTinyDate(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
}

function formatMessageTime(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function EmbedCode({ apiKey, onCopied }: { apiKey: string; onCopied: () => void }) {
  const code = `<script src="${window.location.origin}/widget.js" data-chat-widget data-api-key="${apiKey}"></script>`;
  const [copied, setCopied] = useState(false);

  async function copyEmbedCode() {
    await navigator.clipboard?.writeText(code);
    setCopied(true);
    onCopied();
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div
      className={`embed-code-cell ${copied ? 'copied' : ''}`}
      data-tooltip={copied ? 'Copied' : 'Click to copy'}
      onClick={copyEmbedCode}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') copyEmbedCode();
      }}
      role="button"
      tabIndex={0}
    >
      <code>{code}</code>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
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
