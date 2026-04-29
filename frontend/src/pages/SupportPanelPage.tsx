import { FormEvent, useEffect, useRef, useState } from 'react';

type SupportView = 'chat' | 'agentChat' | 'profile' | 'password';
type SupportIconName = 'chat' | 'support' | 'users' | 'logout' | 'key';

type SupportSocket = {
  on: (event: string, handler: (payload: unknown) => void) => void;
  emit: (event: string, ...payload: unknown[]) => void;
  disconnect: () => void;
};

type SupportUser = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'support' | 'super_admin';
  siteId: number | null;
};

type Thread = {
  id: number;
  visitorName: string;
  visitorEmail?: string;
  status: string;
  lastMsg: string;
  lastMsgTime: string;
  siteId: number;
};

type Message = {
  id: number;
  sender: 'visitor' | 'support';
  message: string;
  createdAt: string;
  threadId: number;
};

type InternalUser = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'support' | 'super_admin';
  siteId: number | null;
};

type InternalMessage = {
  id: number;
  senderRole: 'admin' | 'support';
  sender: 'me' | 'other';
  message: string;
  createdAt: string;
};

const API_URL = '/api';

type SupportPanelPageProps = {
  initialView: SupportView;
  navigate: (path: string) => void;
};

export function SupportPanelPage({ initialView, navigate }: SupportPanelPageProps) {
  const [token] = useState(() => localStorage.getItem('supportToken') || '');
  const [agent, setAgent] = useState<SupportUser | null>(null);
  const [view, setView] = useState<SupportView>(initialView);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [customerUnread, setCustomerUnread] = useState<Record<number, number>>({});
  const [teamUsers, setTeamUsers] = useState<InternalUser[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  const [internalUnread, setInternalUnread] = useState<Record<number, number>>({});
  const [selectedInternalId, setSelectedInternalId] = useState<number | null>(null);
  const [internalMessages, setInternalMessages] = useState<Record<number, InternalMessage[]>>({});
  const [internalDraft, setInternalDraft] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [socket, setSocket] = useState<SupportSocket | null>(null);
  const [notice, setNotice] = useState<{ message: string; kind: 'customer' | 'team'; id: number } | null>(null);
  const [noticeClosing, setNoticeClosing] = useState(false);
  const [error, setError] = useState('');
  const selectedThreadRef = useRef<number | null>(null);
  const selectedInternalRef = useRef<number | null>(null);
  const viewRef = useRef(view);

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

  function unreadStorageKey(user = agent) {
    return `supportCustomerUnread:${user?.id || 'guest'}:${user?.siteId || 'all'}`;
  }

  function saveCustomerUnread(next: Record<number, number>, user = agent) {
    const clean = Object.fromEntries(Object.entries(next).filter(([, count]) => Number(count || 0) > 0));
    localStorage.setItem(unreadStorageKey(user), JSON.stringify(clean));
    setCustomerUnread(clean as Record<number, number>);
  }

  function loadCustomerUnread(user: SupportUser) {
    try {
      const saved = JSON.parse(localStorage.getItem(unreadStorageKey(user)) || '{}');
      setCustomerUnread(Object.fromEntries(Object.entries(saved).filter(([, count]) => Number(count || 0) > 0)) as Record<number, number>);
    } catch {
      setCustomerUnread({});
    }
  }

  async function loadThreads() {
    try {
      const data = await fetchJson<Thread[]>(`${API_URL}/threads/all?days=7&limit=200`);
      setThreads(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chats');
    }
  }

  async function loadTeam() {
    try {
      const [users, unread, online] = await Promise.all([
        fetchJson<InternalUser[]>(`${API_URL}/support/admins`),
        fetchJson<Record<number, number>>(`${API_URL}/internal-chat/unread-counts`),
        fetchJson<number[]>(`${API_URL}/internal-chat/online-users`)
      ]);
      setTeamUsers(users);
      setInternalUnread(unread);
      setOnlineUserIds(new Set(online));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admins and agents');
    }
  }

  useEffect(() => {
    if (!token) {
      window.location.href = '/login';
      return;
    }

    fetchJson<{ user: SupportUser }>(`${API_URL}/auth/verify`)
      .then(data => {
        if (data.user.role !== 'support') {
          window.location.href = '/login';
          return;
        }
        setAgent(data.user);
        localStorage.setItem('agentName', data.user.name);
        loadCustomerUnread(data.user);
        loadThreads();
        loadTeam();
      })
      .catch(() => {
        localStorage.removeItem('supportToken');
        window.location.href = '/login';
      });
  }, [token]);

  useEffect(() => {
    viewRef.current = view;
    selectedThreadRef.current = selectedThreadId;
    selectedInternalRef.current = selectedInternalId;
  }, [view, selectedThreadId, selectedInternalId]);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    if (!token || !agent) return;

    let cancelled = false;
    let liveSocket: SupportSocket | null = null;

    const connect = () => {
      if (cancelled || !window.io) return;
      liveSocket = window.io({ transports: ['websocket', 'polling'] });
      setSocket(liveSocket);

      liveSocket.emit('support-auth', token);
      if (agent.siteId) liveSocket.emit('join-site', agent.siteId);

      liveSocket.on('new-message', payload => {
        const msg = payload as Message;
        if (msg.sender !== 'visitor') return;
        if (selectedThreadRef.current === Number(msg.threadId) && viewRef.current === 'chat') {
          setMessages(prev => prev.some(item => item.id === msg.id) ? prev : [...prev, msg]);
        } else {
          setCustomerUnread(prev => {
            const next = { ...prev, [msg.threadId]: Number(prev[msg.threadId] || 0) + 1 };
            localStorage.setItem(unreadStorageKey(agent), JSON.stringify(next));
            return next;
          });
          const thread = threads.find(item => Number(item.id) === Number(msg.threadId));
          showNotice(`You got message from ${thread?.visitorName || 'Guest'}`, 'customer', msg.threadId);
          playNotificationSound();
        }
        loadThreads();
      });

      liveSocket.on('new-thread-message', payload => {
        const data = payload as { threadId: number; thread?: Thread; message?: Message };
        if (data.message?.sender !== 'visitor') return;
        if (selectedThreadRef.current !== Number(data.threadId) || viewRef.current !== 'chat') {
          setCustomerUnread(prev => {
            const next = { ...prev, [data.threadId]: Number(prev[data.threadId] || 0) + 1 };
            localStorage.setItem(unreadStorageKey(agent), JSON.stringify(next));
            return next;
          });
          showNotice(`You got message from ${data.thread?.visitorName || 'Guest'}`, 'customer', data.threadId);
          playNotificationSound();
        }
        loadThreads();
      });

      liveSocket.on('new-thread', () => loadThreads());
      liveSocket.on('thread-updated', () => loadThreads());

      liveSocket.on('admin-agent-message', payload => {
        const msg = payload as { id: number; fromAdminId: number; fromAdminName: string; fromAdminEmail?: string; fromRole?: 'admin' | 'support'; message: string; unreadCount?: number; createdAt: string };
        const senderId = Number(msg.fromAdminId);
        const opened = viewRef.current === 'agentChat' && selectedInternalRef.current === senderId;
        setInternalMessages(prev => ({
          ...prev,
          [senderId]: [...(prev[senderId] || []), {
            id: msg.id,
            sender: 'other',
            senderRole: msg.fromRole === 'support' ? 'support' : 'admin',
            message: msg.message,
            createdAt: msg.createdAt
          }]
        }));

        if (opened) {
          fetchJson(`${API_URL}/internal-chat/${senderId}/read`, { method: 'POST' }).catch(() => {});
          setInternalUnread(prev => ({ ...prev, [senderId]: 0 }));
        } else {
          setInternalUnread(prev => ({ ...prev, [senderId]: Number(msg.unreadCount || (prev[senderId] || 0) + 1) }));
          showNotice(`You got message from ${msg.fromAdminName || 'Team member'}`, 'team', senderId);
          playNotificationSound();
        }
      });
    };

    if (window.io) {
      connect();
    } else {
      const script = document.createElement('script');
      script.src = '/socket.io/socket.io.js';
      script.async = true;
      script.onload = connect;
      document.body.appendChild(script);
    }

    return () => {
      cancelled = true;
      setSocket(null);
      liveSocket?.disconnect();
    };
  }, [token, agent]);

  function goTo(path: string, nextView: SupportView) {
    setView(nextView);
    navigate(path);
  }

  async function openThread(thread: Thread) {
    setSelectedThreadId(thread.id);
    const nextUnread = { ...customerUnread };
    delete nextUnread[thread.id];
    saveCustomerUnread(nextUnread);
    socket?.emit('join-thread', thread.id, agent?.id);
    try {
      setMessages(await fetchJson<Message[]>(`${API_URL}/threads/${thread.id}/messages`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    }
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = messageDraft.trim();
    if (!selectedThreadId || !message || !socket) return;
    socket.emit('support-message', {
      threadId: selectedThreadId,
      message,
      supportId: agent?.id
    });
    setMessageDraft('');
  }

  async function openInternalChat(user: InternalUser) {
    setSelectedInternalId(user.id);
    setInternalUnread(prev => ({ ...prev, [user.id]: 0 }));
    try {
      const history = await fetchJson<InternalMessage[]>(`${API_URL}/internal-chat/${user.id}/messages`);
      setInternalMessages(prev => ({ ...prev, [user.id]: history }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load internal chat');
    }
  }

  function sendInternalMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = internalDraft.trim();
    if (!selectedInternalId || !message || !socket) return;
    const tempMessage: InternalMessage = {
      id: Date.now(),
      sender: 'me',
      senderRole: 'support',
      message,
      createdAt: new Date().toISOString()
    };
    setInternalMessages(prev => ({ ...prev, [selectedInternalId]: [...(prev[selectedInternalId] || []), tempMessage] }));
    socket.emit('agent-admin-message', { toAdminId: selectedInternalId, message });
    setInternalDraft('');
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const currentPassword = String(formData.get('currentPassword') || '');
    const newPassword = String(formData.get('newPassword') || '');
    const confirmPassword = String(formData.get('confirmPassword') || '');

    if (newPassword !== confirmPassword) {
      setPasswordMessage('New password and confirm password do not match.');
      return;
    }

    try {
      const data = await fetchJson<{ message: string }>(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      event.currentTarget.reset();
      setPasswordMessage(data.message || 'Password changed successfully.');
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : 'Failed to change password');
    }
  }

  function logout() {
    localStorage.removeItem('supportToken');
    localStorage.removeItem('agentName');
    window.location.href = '/login';
  }

  function totalCustomerUnread() {
    return Object.values(customerUnread).reduce((total, count) => total + Number(count || 0), 0);
  }

  function totalInternalUnread() {
    return Object.values(internalUnread).reduce((total, count) => total + Number(count || 0), 0);
  }

  function showNotice(message: string, kind: 'customer' | 'team', id: number) {
    setNoticeClosing(false);
    setNotice({ message, kind, id });
  }

  function closeNotice(event?: React.MouseEvent) {
    event?.stopPropagation();
    setNoticeClosing(true);
    window.setTimeout(() => {
      setNotice(null);
      setNoticeClosing(false);
    }, 260);
  }

  function openNotice() {
    if (!notice) return;
    if (notice.kind === 'customer') {
      const thread = threads.find(item => Number(item.id) === notice.id);
      goTo('/support-panel', 'chat');
      if (thread) openThread(thread);
    } else {
      const user = teamUsers.find(item => Number(item.id) === notice.id);
      goTo('/support-panel/agent-chat', 'agentChat');
      if (user) openInternalChat(user);
    }
    closeNotice();
  }

  function playNotificationSound() {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=');
      audio.play().catch(() => {});
    } catch {
      // Browsers may block notification audio until user interaction.
    }
  }

  const selectedThread = threads.find(thread => thread.id === selectedThreadId);
  const selectedInternal = teamUsers.find(user => user.id === selectedInternalId);
  const selectedInternalMessages = selectedInternalId ? internalMessages[selectedInternalId] || [] : [];

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><span className="admin-brand-icon">▣</span><strong>emilus</strong></div>
        <p className="admin-sidebar-title">Workspace</p>
        <SupportNavButton icon="chat" active={view === 'chat'} badge={totalCustomerUnread()} onClick={() => goTo('/support-panel', 'chat')}>Chat</SupportNavButton>
        <SupportNavButton icon="support" active={view === 'agentChat'} badge={totalInternalUnread()} onClick={() => goTo('/support-panel/agent-chat', 'agentChat')}>Agent Chat</SupportNavButton>
        <SupportNavButton icon="users" active={view === 'profile'} onClick={() => setView('profile')}>Profile</SupportNavButton>
        <SupportNavButton icon="key" active={view === 'password'} onClick={() => setView('password')}>Change Password</SupportNavButton>
        <p className="admin-sidebar-title">System</p>
        <SupportNavButton icon="logout" onClick={logout}>Logout</SupportNavButton>
      </aside>

      <main className="admin-main">
        {notice && (
          <button type="button" className={`admin-toast ${notice.kind === 'customer' ? 'customer-toast' : ''} ${noticeClosing ? 'closing' : ''}`} onClick={openNotice}>
            <span>{notice.message}</span>
            <span className="admin-toast-close" onClick={closeNotice}>×</span>
          </button>
        )}

        <div className="admin-topbar">
          <div>
            <h1>{view === 'agentChat' ? 'Admins & Agents' : 'Support Panel'}</h1>
            <p>{agent ? `${agent.name} · ${agent.email}` : 'Loading support workspace...'}</p>
          </div>
          <span className="admin-online"><span className="admin-live-dot"></span>{agent?.role || 'support'}</span>
        </div>

        {error && <div className="admin-alert">{error}</div>}

        {view === 'chat' && (
          <div className="admin-chat-grid">
            <div className="admin-chat-list-card">
              <div className="admin-chat-panel-head">
                <div>
                  <h2><span className="chat-head-icon">●</span>Customer Chats</h2>
                  <p>{threads.length} recent threads</p>
                </div>
              </div>
              <div className="admin-thread-list">
                {threads.length === 0 && <div className="admin-chat-empty">No conversations yet</div>}
                {threads.map(thread => (
                  <button className={`admin-thread-item ${selectedThreadId === thread.id ? 'active' : ''} ${Number(customerUnread[thread.id] || 0) > 0 ? 'has-customer-unread' : ''}`} key={thread.id} onClick={() => openThread(thread)}>
                    <div className="admin-thread-title">
                      <span className="thread-avatar">●</span>
                      <strong>{thread.visitorName || 'Guest'}</strong>
                      {Number(customerUnread[thread.id] || 0) > 0 && <span className="online-menu-unread customer">NEW {customerUnread[thread.id]}</span>}
                    </div>
                    <small>{formatDateTime(thread.lastMsgTime)} · {thread.status}</small>
                    <p>{thread.lastMsg}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="admin-chat-room-card">
              <div className="admin-chat-panel-head chat-room-head">
                <div>
                  <h2><span className="chat-head-icon">●</span>{selectedThread ? `Chatting with ${selectedThread.visitorName || 'Guest'}` : 'Select a conversation'}</h2>
                  <p>{selectedThread ? selectedThread.visitorEmail || 'Active conversation' : 'Please select chat from head to start the chat'}</p>
                </div>
              </div>
              <div className="admin-messages">
                {!selectedThread && <div className="admin-chat-placeholder"><span>□</span><p>Please select chat from head to start the chat</p></div>}
                {messages.map(message => (
                  <div className={`admin-message-row ${message.sender === 'support' ? 'sent' : 'received'}`} key={message.id}>
                    <div className="admin-message">
                      <div>{message.message}</div>
                      <time>{formatMessageTime(message.createdAt)}</time>
                    </div>
                  </div>
                ))}
              </div>
              <form className="admin-chat-composer" onSubmit={sendMessage}>
                <div className="admin-send">
                  <input value={messageDraft} onChange={event => setMessageDraft(event.target.value)} placeholder="Type your message..." disabled={!selectedThread} />
                  <button disabled={!selectedThread || !messageDraft.trim()}>Send</button>
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
                  <h2><span className="chat-head-icon">●</span>Admins & Agents</h2>
                  <p>{teamUsers.length} team members</p>
                </div>
              </div>
              <div className="admin-thread-list">
                {teamUsers.length === 0 && <div className="admin-chat-empty">No team member found.</div>}
                {teamUsers.map(user => (
                  <button className={`admin-thread-item ${selectedInternalId === user.id ? 'active' : ''} ${onlineUserIds.has(user.id) ? 'online' : ''} ${Number(internalUnread[user.id] || 0) > 0 ? 'has-unread' : ''}`} key={user.id} onClick={() => openInternalChat(user)}>
                    <div className="admin-thread-title">
                      <span className="thread-avatar">●</span>
                      <strong>{user.name || 'Team member'}</strong>
                      <span className="thread-status">{user.role}</span>
                      {onlineUserIds.has(user.id) && <span className="thread-online-mark">Online</span>}
                      {Number(internalUnread[user.id] || 0) > 0 && <span className="online-menu-unread">NEW {internalUnread[user.id]}</span>}
                    </div>
                    <small>{user.email}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="admin-chat-room-card">
              <div className="admin-chat-panel-head chat-room-head">
                <div>
                  <h2><span className="chat-head-icon">●</span>{selectedInternal ? `Chatting with ${selectedInternal.name}` : 'Select admin or agent'}</h2>
                  <p>{selectedInternal ? (onlineUserIds.has(selectedInternal.id) ? 'Online now' : selectedInternal.email) : 'Please select agent to start the chat'}</p>
                </div>
              </div>
              <div className="admin-messages">
                {!selectedInternal && <div className="admin-chat-placeholder"><span>□</span><p>Please select agent to start the chat</p></div>}
                {selectedInternalMessages.map(message => (
                  <div className={`admin-message-row ${message.sender === 'me' ? 'sent' : 'received'}`} key={message.id}>
                    <div className="admin-message">
                      <div>{message.message}</div>
                      <time>{formatMessageTime(message.createdAt)}</time>
                    </div>
                  </div>
                ))}
              </div>
              <form className="admin-chat-composer" onSubmit={sendInternalMessage}>
                <div className="admin-send">
                  <input value={internalDraft} onChange={event => setInternalDraft(event.target.value)} placeholder="Type your message..." disabled={!selectedInternal} />
                  <button disabled={!selectedInternal || !internalDraft.trim()}>Send</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {view === 'profile' && (
          <div className="admin-panel-card support-info-card">
            <h2>Profile</h2>
            <p><strong>Name:</strong> {agent?.name}</p>
            <p><strong>Email:</strong> {agent?.email}</p>
            <p><strong>Role:</strong> {agent?.role}</p>
            <p><strong>Site:</strong> {agent?.siteId || 'Not assigned'}</p>
          </div>
        )}

        {view === 'password' && (
          <div className="admin-panel-card support-info-card">
            <h2>Change Password</h2>
            <form className="admin-form" onSubmit={changePassword}>
              <input name="currentPassword" type="password" placeholder="Current password" required />
              <input name="newPassword" type="password" placeholder="New password" required />
              <input name="confirmPassword" type="password" placeholder="Confirm new password" required />
              <button>Update Password</button>
            </form>
            {passwordMessage && <p>{passwordMessage}</p>}
          </div>
        )}
      </main>
    </div>
  );
}

function SupportNavButton({ icon, active = false, badge = 0, onClick, children }: { icon: SupportIconName; active?: boolean; badge?: number; onClick: () => void; children: string }) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      <SupportIcon name={icon} />
      <span>{children}</span>
      {badge > 0 && <span className="admin-nav-badge">{badge}</span>}
    </button>
  );
}

function SupportIcon({ name }: { name: SupportIconName }) {
  const paths: Record<SupportIconName, string[]> = {
    chat: ['M21 12a8 8 0 0 1-8 8H7l-4 3v-5a8 8 0 1 1 18-6Z'],
    support: ['M12 3a7 7 0 0 0-7 7v4', 'M19 14v-4a7 7 0 0 0-7-7', 'M5 14h3v5H5v-5Z', 'M16 14h3v5h-3v-5Z', 'M9 21h3a4 4 0 0 0 4-4'],
    users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M22 21v-2a4 4 0 0 0-3-3.87'],
    key: ['M21 7a5 5 0 0 1-7.8 4.1L5 19H2v-3l7.9-7.9A5 5 0 1 1 21 7Z', 'M15 7h.01'],
    logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9']
  };

  return (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name].map(path => <path key={path} d={path} />)}
    </svg>
  );
}

function formatMessageTime(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
