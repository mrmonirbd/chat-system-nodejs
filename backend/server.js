const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { Sequelize, DataTypes, Op } = require('sequelize');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const server = http.createServer(app);

// Socket.IO with CORS
// Socket.IO with full CORS
const io = socketIO(server, {
  cors: {
    origin: "*",  
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  },
  transports: ['websocket', 'polling'] 
});

app.use(cors({
  origin: "*",
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Express CORS Middleware
app.use(cors({
  origin: "*",
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend/admin-panel'), { index: false }));
app.use('/frontend', express.static(path.join(__dirname, '../frontend')));

const frontendDistPath = path.join(__dirname, '../frontend/dist');
const frontendDistIndex = path.join(frontendDistPath, 'index.html');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
}

function sendFrontendApp(res) {
  if (fs.existsSync(frontendDistIndex)) {
    return res.sendFile(frontendDistIndex);
  }

  return res.sendFile(path.join(__dirname, '../frontend/index.html'));
}

function createMailTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP is not configured');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_PORT) === '465',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    },
    tls: process.env.SMTP_TLS_SERVERNAME
      ? { servername: process.env.SMTP_TLS_SERVERNAME }
      : undefined
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getAppUrl() {
  return (process.env.APP_URL || process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

function getRangeDays(range) {
  const ranges = {
    '1d': 1,
    '7d': 7,
    '30d': 30,
    '6m': 183,
    '1y': 365
  };

  return ranges[range] || 30;
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function buildDailySeries(days, rows) {
  const counts = new Map(rows.map(row => {
    const key = row.date instanceof Date ? formatDateKey(row.date) : String(row.date).slice(0, 10);
    return [key, Number(row.count || 0)];
  }));
  const labels = [];
  const data = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    const key = formatDateKey(date);
    labels.push(key);
    data.push(counts.get(key) || 0);
  }

  return { labels, data };
}

function buildCumulativeDailySeries(days, rows, startingTotal) {
  const series = buildDailySeries(days, rows);
  let runningTotal = Number(startingTotal || 0);

  return {
    labels: series.labels,
    data: series.data.map(count => {
      runningTotal += count;
      return runningTotal;
    })
  };
}

function getConnectedSiteCount() {
  let count = 0;
  for (const [roomName, sockets] of io.sockets.adapter.rooms) {
    if (roomName.startsWith('site-') && sockets.size > 0) count += 1;
  }
  return count;
}

function getConnectedThreadCount() {
  let count = 0;
  for (const [roomName, sockets] of io.sockets.adapter.rooms) {
    if (roomName.startsWith('thread-') && sockets.size > 0) count += 1;
  }
  return count;
}

function getActiveVisitorChatCount() {
  return openChatBoxes.size;
}

function getCpuUsagePercent() {
  const cpuCount = Math.max(os.cpus().length, 1);
  return Math.min(100, Math.round((os.loadavg()[0] / cpuCount) * 100));
}

function getRamUsagePercent() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  if (!totalMemory) return 0;
  return Math.min(100, Math.round(((totalMemory - freeMemory) / totalMemory) * 100));
}

async function emitTotalMessageCount() {
  const totalMessages = await Message.count();
  io.emit('total-message-count', { count: totalMessages });
  return totalMessages;
}

async function findValidPasswordResetToken(token, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!token || !normalizedEmail) return null;

  return PasswordResetToken.findOne({
    where: {
      email: normalizedEmail,
      tokenHash: hashResetToken(token),
      usedAt: null,
      expiresAt: { [Op.gt]: new Date() }
    }
  });
}

async function sendForgotPasswordEmail(user, resetUrl) {
  const transporter = createMailTransport();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const displayName = user.name || String(user.email).split('@')[0];
  const safeName = escapeHtml(displayName);
  const safeResetUrl = escapeHtml(resetUrl);

  await transporter.sendMail({
    from,
    to: user.email,
    subject: 'Reset your Chat System password',
    text: `Hi ${displayName},\n\nWe received a request to reset your Chat System password.\n\nReset your password here:\n${resetUrl}\n\nThis link will expire in 1 hour. If you did not request this, you can ignore this email.`,
    html: `
      <div style="margin:0; padding:0; background:#f3f7f5;">
        <div style="max-width:560px; margin:0 auto; padding:32px 18px; font-family:Arial, sans-serif; color:#1f2937;">
          <div style="background:#ffffff; border:1px solid #dce9e3; border-radius:14px; overflow:hidden;">
            <div style="padding:22px 24px; background:#11998e; color:#ffffff;">
              <div style="font-size:13px; font-weight:700; letter-spacing:.08em; text-transform:uppercase;">Chat System</div>
              <h1 style="margin:8px 0 0; font-size:24px; line-height:1.25;">Reset your password</h1>
            </div>
            <div style="padding:24px;">
              <p style="margin:0 0 14px; font-size:16px;">Hi ${safeName},</p>
              <p style="margin:0 0 18px; line-height:1.6;">We received a request to reset your Chat System password. Use the button below to set a new password.</p>
              <p style="margin:24px 0; text-align:center;">
                <a href="${safeResetUrl}" style="display:inline-block; padding:12px 20px; background:#11998e; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:700;">
                  Reset password
                </a>
              </p>
              <p style="margin:0 0 14px; line-height:1.6;"><strong>This link will expire in 1 hour.</strong></p>
              <p style="margin:0 0 14px; line-height:1.6; color:#526b64;">If the button does not work, open this link:</p>
              <p style="margin:0 0 18px; line-height:1.5; word-break:break-all;">
                <a href="${safeResetUrl}" style="color:#0f766e;">${safeResetUrl}</a>
              </p>
              <p style="margin:0; color:#6b7280; line-height:1.6;">If you did not request this, you can ignore this email.</p>
            </div>
          </div>
        </div>
      </div>
    `
  });
}

// MySQL Connection
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: false
  }
);

sequelize.authenticate()
  .then(() => console.log(' MySQL connected'))
  .catch(err => console.log('MySQL error:', err));

// ========== MODELS ==========
const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'support'), defaultValue: 'support' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  siteId: { type: DataTypes.INTEGER, allowNull: true }
}, { timestamps: true });

const Site = sequelize.define('Site', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  domain: { type: DataTypes.STRING, allowNull: false, unique: true },
  apiKey: { type: DataTypes.STRING, allowNull: false, unique: true, defaultValue: () => uuidv4() },
  widgetColor: { type: DataTypes.STRING, defaultValue: '#3B82F6' },
  widgetPosition: { type: DataTypes.STRING, defaultValue: 'bottom-right' },
  greetingMessage: { type: DataTypes.STRING, defaultValue: 'Hello! How can we help you?' }
}, { timestamps: true });

const Thread = sequelize.define('Thread', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  siteId: { type: DataTypes.INTEGER, allowNull: false },
  visitorId: { type: DataTypes.STRING, allowNull: false },
  visitorName: { type: DataTypes.STRING, defaultValue: 'Guest' },
  visitorEmail: { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM('open', 'closed', 'pending'), defaultValue: 'pending' },
  assignedTo: { type: DataTypes.INTEGER, allowNull: true },
  lastMessageAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { timestamps: true });

const Message = sequelize.define('Message', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  threadId: { type: DataTypes.INTEGER, allowNull: false },
  sender: { type: DataTypes.ENUM('visitor', 'support'), allowNull: false },
  senderId: { type: DataTypes.STRING },
  message: { type: DataTypes.TEXT, allowNull: false },
  read: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { timestamps: true });

const QuickReply = sequelize.define('QuickReply', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  supportId: { type: DataTypes.INTEGER, allowNull: false },
  text: { type: DataTypes.TEXT, allowNull: false }
}, { timestamps: true });

const PasswordResetToken = sequelize.define('PasswordResetToken', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  usedAt: { type: DataTypes.DATE, allowNull: true }
}, { timestamps: true });

const InternalChatMessage = sequelize.define('InternalChatMessage', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  senderId: { type: DataTypes.INTEGER, allowNull: false },
  receiverId: { type: DataTypes.INTEGER, allowNull: false },
  senderRole: { type: DataTypes.ENUM('admin', 'support'), allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  readAt: { type: DataTypes.DATE, allowNull: true }
}, { timestamps: true });

// ========== RELATIONSHIPS ==========
Site.hasMany(User, { foreignKey: 'siteId' });
User.belongsTo(Site, { foreignKey: 'siteId' });

Site.hasMany(Thread, { foreignKey: 'siteId' });
Thread.belongsTo(Site, { foreignKey: 'siteId' });

Thread.hasMany(Message, { foreignKey: 'threadId' });
Message.belongsTo(Thread, { foreignKey: 'threadId' });

User.hasMany(Thread, { as: 'AssignedThreads', foreignKey: 'assignedTo' });
Thread.belongsTo(User, { as: 'AssignedSupport', foreignKey: 'assignedTo' });

User.hasMany(QuickReply, { foreignKey: 'supportId' });
QuickReply.belongsTo(User, { foreignKey: 'supportId' });

User.hasMany(PasswordResetToken, { foreignKey: 'userId' });
PasswordResetToken.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(InternalChatMessage, { as: 'SentInternalMessages', foreignKey: 'senderId' });
User.hasMany(InternalChatMessage, { as: 'ReceivedInternalMessages', foreignKey: 'receiverId' });
InternalChatMessage.belongsTo(User, { as: 'Sender', foreignKey: 'senderId' });
InternalChatMessage.belongsTo(User, { as: 'Receiver', foreignKey: 'receiverId' });

// ========== SYNC DATABASE ==========
// sequelize.sync({ alter: false }).then(() => {
//   console.log(' MySQL tables ready');
// }).catch(err => {
//   console.error(' Sync error:', err);
// });

PasswordResetToken.sync().then(() => {
  console.log(' Password reset token table ready');
}).catch(err => {
  console.error(' Password reset token table sync error:', err);
});

InternalChatMessage.sync().then(() => {
  console.log(' Internal chat message table ready');
}).catch(err => {
  console.error(' Internal chat message table sync error:', err);
});

// ========== MIDDLEWARE ==========
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const onlineSupportBySite = new Map();
const openChatBoxes = new Map();
const SUPPORT_OFFLINE_GRACE_MS = 60000;

function markSupportOnline(socket, user) {
  if (!user?.siteId) return;

  const siteKey = String(user.siteId);
  const supportKey = String(user.id);
  let siteSupport = onlineSupportBySite.get(siteKey);

  if (!siteSupport) {
    siteSupport = new Map();
    onlineSupportBySite.set(siteKey, siteSupport);
  }

  const supportInfo = siteSupport.get(supportKey) || {
    id: user.id,
    name: user.name || user.email || 'Support',
    sockets: new Set(),
    offlineTimer: null
  };

  if (supportInfo.offlineTimer) {
    clearTimeout(supportInfo.offlineTimer);
    supportInfo.offlineTimer = null;
  }

  supportInfo.sockets.add(socket.id);
  siteSupport.set(supportKey, supportInfo);

  socket.supportUser = user;
  socket.supportSiteId = user.siteId;

  io.to(`site-${user.siteId}`).emit('support-availability', getAvailableSupport(user.siteId));
}

function markSupportOffline(socket) {
  if (!socket.supportUser?.id || !socket.supportSiteId) return;

  const siteKey = String(socket.supportSiteId);
  const supportKey = String(socket.supportUser.id);
  const siteSupport = onlineSupportBySite.get(siteKey);
  if (!siteSupport) return;

  const supportInfo = siteSupport.get(supportKey);
  if (!supportInfo) return;

  supportInfo.sockets.delete(socket.id);
  if (supportInfo.sockets.size > 0 || supportInfo.offlineTimer) return;

  supportInfo.offlineTimer = setTimeout(() => {
    const latestSiteSupport = onlineSupportBySite.get(siteKey);
    const latestSupportInfo = latestSiteSupport?.get(supportKey);

    if (!latestSupportInfo || latestSupportInfo.sockets.size > 0) return;

    latestSiteSupport.delete(supportKey);
    if (latestSiteSupport.size === 0) onlineSupportBySite.delete(siteKey);

    io.to(`site-${socket.supportSiteId}`).emit('support-availability', getAvailableSupport(socket.supportSiteId));
  }, SUPPORT_OFFLINE_GRACE_MS);
}

function getAvailableSupport(siteId) {
  const siteSupport = onlineSupportBySite.get(String(siteId));
  if (!siteSupport || siteSupport.size === 0) {
    return { available: false, agentName: null };
  }

  const [supportInfo] = siteSupport.values();
  return { available: true, agentName: supportInfo.name };
}

// ========== ROUTES ==========

// Auth Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, siteId: user.siteId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, siteId: user.siteId } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role = 'admin', siteId, acceptedTerms, acceptedPrivacy } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    if (!acceptedTerms || !acceptedPrivacy) {
      return res.status(400).json({ error: 'Terms and privacy policy must be accepted' });
    }

    if (!['admin', 'support'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (role === 'support' && !siteId) {
      return res.status(400).json({ error: 'Site ID is required for support agents' });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    if (role === 'support') {
      const site = await Site.findByPk(siteId);
      if (!site) return res.status(404).json({ error: 'Site not found' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      siteId: role === 'support' ? siteId : null,
      isActive: true
    });

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, siteId: user.siteId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, siteId: user.siteId }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'No account found with this email' });
    }

    const existingToken = await PasswordResetToken.findOne({
      where: {
        userId: user.id,
        email,
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() }
      }
    });

    if (existingToken) {
      return res.status(409).json({
        error: 'A password reset link was already sent. Please check your email or wait until it expires.'
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const resetUrl = `${getAppUrl()}/reset-password?resetToken=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

    await PasswordResetToken.create({
      userId: user.id,
      email,
      tokenHash: hashResetToken(token),
      expiresAt
    });

    await sendForgotPasswordEmail(user, resetUrl);

    res.json({ message: 'Password reset email sent. Please check your inbox.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/verify-reset-token', async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();

    const resetToken = await findValidPasswordResetToken(token, email);
    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const user = await User.findByPk(resetToken.userId, {
      attributes: ['id', 'email']
    });

    if (!user || String(user.email).toLowerCase() !== email) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    res.json({
      message: 'Reset link is valid',
      expiresAt: resetToken.expiresAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!token || !email || !password) {
      return res.status(400).json({ error: 'Email, token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const resetToken = await findValidPasswordResetToken(token, email);
    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const user = await User.findByPk(resetToken.userId);
    if (!user || String(user.email).toLowerCase() !== email) {
      return res.status(400).json({ error: 'Invalid reset link' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await user.update({ password: hashedPassword });
    await resetToken.destroy();

    res.json({ message: 'Password reset successful. You can login now.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify token
app.get('/api/auth/verify', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'email', 'role', 'siteId']
    });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user info
app.get('/api/users/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'email', 'role', 'siteId']
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/list', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'role', 'siteId', 'isActive', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/support/admins', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'support') return res.status(403).json({ error: 'Support only' });

    const users = await User.findAll({
      where: {
        id: { [Op.ne]: req.user.id },
        role: { [Op.in]: ['admin', 'support'] },
        isActive: true
      },
      attributes: ['id', 'name', 'email', 'role', 'siteId'],
      order: [
        ['role', 'ASC'],
        ['name', 'ASC']
      ]
    });

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/internal-chat/unread-counts', authMiddleware, async (req, res) => {
  try {
    const rows = await InternalChatMessage.findAll({
      where: {
        receiverId: req.user.id,
        readAt: null
      },
      attributes: [
        'senderId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['senderId']
    });

    res.json(rows.reduce((counts, row) => {
      counts[row.senderId] = Number(row.get('count') || 0);
      return counts;
    }, {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/internal-chat/online-users', authMiddleware, async (req, res) => {
  try {
    const ids = new Set();

    for (const roomName of io.sockets.adapter.rooms.keys()) {
      if (roomName.startsWith('admin-') || roomName.startsWith('support-')) {
        const id = Number(roomName.split('-')[1]);
        if (id && id !== req.user.id) ids.add(id);
      }
    }

    res.json(Array.from(ids));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/internal-chat/:otherUserId/messages', authMiddleware, async (req, res) => {
  try {
    const otherUserId = parseInt(req.params.otherUserId, 10);
    if (!otherUserId) return res.status(400).json({ error: 'User is required' });

    const otherUser = await User.findByPk(otherUserId, {
      attributes: ['id', 'name', 'email', 'role']
    });
    if (!otherUser) return res.status(404).json({ error: 'User not found' });

    if (req.user.role === 'admin' && otherUser.role !== 'support') {
      return res.status(403).json({ error: 'Admin can chat with support agents only' });
    }
    if (req.user.role === 'support' && otherUser.role !== 'admin' && otherUser.role !== 'support') {
      return res.status(403).json({ error: 'Support can chat with admins and agents only' });
    }

    const messages = await InternalChatMessage.findAll({
      where: {
        [Op.or]: [
          { senderId: req.user.id, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: req.user.id }
        ]
      },
      order: [['createdAt', 'ASC']]
    });

    await InternalChatMessage.update(
      { readAt: new Date() },
      {
        where: {
          senderId: otherUserId,
          receiverId: req.user.id,
          readAt: null
        }
      }
    );

    res.json(messages.map(message => ({
      id: message.id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      senderRole: message.senderRole,
      sender: message.senderId === req.user.id ? 'me' : 'other',
      message: message.message,
      readAt: message.readAt,
      createdAt: message.createdAt
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/internal-chat/:otherUserId/read', authMiddleware, async (req, res) => {
  try {
    const otherUserId = parseInt(req.params.otherUserId, 10);
    if (!otherUserId) return res.status(400).json({ error: 'User is required' });

    await InternalChatMessage.update(
      { readAt: new Date() },
      {
        where: {
          senderId: otherUserId,
          receiverId: req.user.id,
          readAt: null
        }
      }
    );

    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    await PasswordResetToken.destroy({ where: { userId: user.id } });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Site
app.post('/api/sites/create', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { name, domain } = req.body;
    const site = await Site.create({ name, domain, apiKey: uuidv4() });
    res.json({ site, apiKey: site.apiKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List Sites
app.get('/api/sites/list', authMiddleware, async (req, res) => {
  try {
    const sites = await Site.findAll();
    res.json(sites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get site by ID
app.get('/api/sites/:siteId', authMiddleware, async (req, res) => {
  try {
    const site = await Site.findByPk(req.params.siteId, {
      attributes: ['id', 'name', 'domain', 'apiKey', 'widgetColor', 'greetingMessage']
    });
    if (!site) return res.status(404).json({ error: 'Site not found' });
    res.json(site);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/sites/:siteId/widget-settings', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { widgetColor, greetingMessage } = req.body;
    const site = await Site.findByPk(req.params.siteId);
    if (!site) return res.status(404).json({ error: 'Site not found' });

    if (widgetColor !== undefined) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(widgetColor)) {
        return res.status(400).json({ error: 'Invalid widget color' });
      }
      site.widgetColor = widgetColor;
    }

    if (greetingMessage !== undefined) {
      site.greetingMessage = greetingMessage.trim() || 'Hello! How can we help you?';
    }

    await site.save();
    res.json(site);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Support Agents Count
app.get('/api/support-agents/count', authMiddleware, async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: 'support' },
      attributes: ['id', 'name', 'email', 'siteId']
    });
    res.json({ count: agents.length, agents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/analytics', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const range = String(req.query.range || '30d');
    const days = getRangeDays(range);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const dateExpr = sequelize.fn('DATE', sequelize.col('createdAt'));
    const countExpr = sequelize.fn('COUNT', sequelize.col('id'));

    const [totalSites, supportAgents, totalMessages, siteBaseline, supportBaseline, messageRows, siteRows, supportRows] = await Promise.all([
      Site.count(),
      User.count({ where: { role: 'support' } }),
      Message.count(),
      Site.count({ where: { createdAt: { [Op.lt]: since } } }),
      User.count({ where: { role: 'support', createdAt: { [Op.lt]: since } } }),
      Message.findAll({
        attributes: [[dateExpr, 'date'], [countExpr, 'count']],
        where: { createdAt: { [Op.gte]: since } },
        group: [dateExpr],
        order: [[dateExpr, 'ASC']],
        raw: true
      }),
      Site.findAll({
        attributes: [[dateExpr, 'date'], [countExpr, 'count']],
        where: { createdAt: { [Op.gte]: since } },
        group: [dateExpr],
        order: [[dateExpr, 'ASC']],
        raw: true
      }),
      User.findAll({
        attributes: [[dateExpr, 'date'], [countExpr, 'count']],
        where: {
          role: 'support',
          createdAt: { [Op.gte]: since }
        },
        group: [dateExpr],
        order: [[dateExpr, 'ASC']],
        raw: true
      })
    ]);

    res.json({
      range,
      days,
      totals: {
        cpuUsage: getCpuUsagePercent(),
        ramUsage: getRamUsagePercent(),
        connectedSites: getConnectedSiteCount(),
        connectedThreads: getConnectedThreadCount(),
        totalSites,
        supportAgents,
        activeChats: getActiveVisitorChatCount(),
        totalMessages
      },
      charts: {
        messages: buildDailySeries(days, messageRows),
        sites: buildCumulativeDailySeries(days, siteRows, siteBaseline),
        supportAgents: buildCumulativeDailySeries(days, supportRows, supportBaseline)
      }
    });
  } catch (err) {
    console.error('Admin analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Support quick replies
app.get('/api/quick-replies', authMiddleware, async (req, res) => {
  try {
    const replies = await QuickReply.findAll({
      where: { supportId: req.user.id },
      order: [['createdAt', 'ASC']]
    });
    res.json(replies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quick-replies', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    const trimmedText = text?.trim();

    if (!trimmedText) {
      return res.status(400).json({ error: 'Reply text is required' });
    }

    const reply = await QuickReply.create({
      supportId: req.user.id,
      text: trimmedText
    });

    res.json(reply);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/quick-replies/:id', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    const trimmedText = text?.trim();

    if (!trimmedText) {
      return res.status(400).json({ error: 'Reply text is required' });
    }

    const reply = await QuickReply.findOne({
      where: { id: req.params.id, supportId: req.user.id }
    });

    if (!reply) return res.status(404).json({ error: 'Quick reply not found' });

    reply.text = trimmedText;
    await reply.save();

    res.json(reply);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/quick-replies/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await QuickReply.destroy({
      where: { id: req.params.id, supportId: req.user.id }
    });

    if (!deleted) return res.status(404).json({ error: 'Quick reply not found' });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Support User
app.post('/api/sites/add-support', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only access' });
    }
    
    const { siteId, name, email, password } = req.body;
    
    if (!siteId || !name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    const site = await Site.findByPk(siteId);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashedPassword, role: 'support', siteId, isActive: true });
    
    res.json({ success: true, message: 'Support user added', user: { id: user.id, name: user.name, email: user.email, role: user.role, siteId: user.siteId } });
  } catch (err) {
    console.error('Add support error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Site Config (for widget)
app.get('/api/sites/config/:apiKey', async (req, res) => {
  try {
    const site = await Site.findOne({ where: { apiKey: req.params.apiKey } });
    if (!site) return res.status(404).json({ error: 'Invalid API key' });
    res.json({
      siteId: site.id,
      settings: site,
      supportAvailability: getAvailableSupport(site.id)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get existing visitor thread without creating a new one
app.get('/api/threads/existing', async (req, res) => {
  try {
    const { siteId, visitorId } = req.query;
    if (!siteId || !visitorId) {
      return res.status(400).json({ error: 'siteId and visitorId are required' });
    }

    const thread = await Thread.findOne({
      where: { siteId, visitorId, status: ['open', 'pending'] },
      order: [['lastMessageAt', 'DESC']]
    });

    if (!thread) return res.json({ thread: null, messages: [] });

    const messages = await Message.findAll({
      where: { threadId: thread.id },
      order: [['createdAt', 'ASC']]
    });

    res.json({ thread, messages });
  } catch (err) {
    console.error('Get existing thread error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create Thread
app.post('/api/threads/create', async (req, res) => {
  try {
    const { siteId, visitorId, visitorName, visitorEmail } = req.body;
    
    let thread = await Thread.findOne({ where: { siteId, visitorId, status: ['open', 'pending'] } });
    let isNewThread = false;
    
    if (!thread) {
      thread = await Thread.create({ siteId, visitorId, visitorName: visitorName || 'Guest', visitorEmail, status: 'pending', lastMessageAt: new Date() });
      isNewThread = true;
      console.log('New thread created:', thread.id);
    }

    if (isNewThread) {
      io.to(`site-${thread.siteId}`).emit('new-thread', thread);
    }
    
    res.json({ threadId: thread.id });
  } catch (err) {
    console.error('Create thread error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get Threads by Site
app.get('/api/threads/site/:siteId', authMiddleware, async (req, res) => {
  try {
    const threads = await Thread.findAll({ where: { siteId: req.params.siteId }, order: [['lastMessageAt', 'DESC']] });
    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/threads', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const threads = await Thread.findAll({
      include: [
        { model: Site, attributes: ['id', 'name', 'domain'] },
        { model: User, as: 'AssignedSupport', attributes: ['id', 'name', 'email'] }
      ],
      order: [['lastMessageAt', 'DESC']],
      limit: 300
    });

    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/online-chats', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const chatFilters = Array.from(openChatBoxes.keys()).map(key => {
      const [siteId, visitorId] = key.split(':');
      return siteId && visitorId ? { siteId, visitorId } : null;
    }).filter(Boolean);

    if (chatFilters.length === 0) return res.json([]);

    const threads = await Thread.findAll({
      where: {
        [Op.or]: chatFilters,
        status: ['open', 'pending']
      },
      include: [
        { model: Site, attributes: ['id', 'name', 'domain'] },
        { model: User, as: 'AssignedSupport', attributes: ['id', 'name', 'email'] }
      ],
      order: [['lastMessageAt', 'DESC']]
    });

    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/threads/:threadId/messages', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const threadIdNum = parseInt(req.params.threadId, 10);
    const message = String(req.body.message || '').trim();
    if (!threadIdNum || !message) return res.status(400).json({ error: 'Thread and message are required' });

    const thread = await Thread.findByPk(threadIdNum);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    const newMessage = await Message.create({
      threadId: threadIdNum,
      sender: 'support',
      senderId: String(req.user.id),
      message
    });

    await Thread.update({ lastMessageAt: new Date(), status: 'open' }, { where: { id: threadIdNum } });
    await emitTotalMessageCount();

    const messageData = {
      id: newMessage.id,
      threadId: newMessage.threadId,
      sender: newMessage.sender,
      senderId: newMessage.senderId,
      message: newMessage.message,
      createdAt: newMessage.createdAt
    };

    io.to(`thread-${threadIdNum}`).emit('new-message', messageData);
    if (thread.siteId) io.to(`site-${thread.siteId}`).emit('new-thread-message', { threadId: threadIdNum, message: messageData, thread });

    res.json(messageData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/online-agents', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const agents = [];
    for (const [siteId, siteSupport] of onlineSupportBySite.entries()) {
      for (const supportInfo of siteSupport.values()) {
        agents.push({
          id: supportInfo.id,
          name: supportInfo.name,
          siteId,
          socketCount: supportInfo.sockets.size
        });
      }
    }

    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Messages by Thread
app.get('/api/threads/:threadId/messages', async (req, res) => {
  try {
    const messages = await Message.findAll({ where: { threadId: req.params.threadId }, order: [['createdAt', 'ASC']] });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static files
app.get('/', (req, res) => {
  sendFrontendApp(res);
});
app.get('/about', (req, res) => {
  sendFrontendApp(res);
});
app.get('/contact', (req, res) => {
  sendFrontendApp(res);
});
app.get('/login', (req, res) => {
  sendFrontendApp(res);
});
app.get('/reset-password', (req, res) => {
  sendFrontendApp(res);
});
app.get('/terms', (req, res) => {
  sendFrontendApp(res);
});
app.get('/privacy', (req, res) => {
  sendFrontendApp(res);
});
app.get('/admin', (req, res) => {
  sendFrontendApp(res);
});
app.get('/admin/analytics', (req, res) => {
  sendFrontendApp(res);
});
app.get('/admin/chat', (req, res) => {
  sendFrontendApp(res);
});
app.get('/admin/agent-chat', (req, res) => {
  sendFrontendApp(res);
});
app.get('/admin/sites', (req, res) => {
  sendFrontendApp(res);
});
app.get('/admin/support-agents', (req, res) => {
  sendFrontendApp(res);
});
app.get('/admin/api-keys', (req, res) => {
  sendFrontendApp(res);
});
app.get('/admin/users', (req, res) => {
  sendFrontendApp(res);
});
app.get('/dashboard', (req, res) => {
  res.redirect('/admin');
});
app.get('/support-panel', (req, res) => {
  sendFrontendApp(res);
});
app.get('/support-panel/agent-chat', (req, res) => {
  sendFrontendApp(res);
});
app.get('/widget.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/widget.js'));
});
app.get('/widget.css', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/widget.css'));
});


// Get all threads for all sites of this support agent
app.get('/api/threads/all', authMiddleware, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (user.role !== 'support') {
            return res.status(403).json({ error: 'Support only' });
        }

        const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 30);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        
        const threads = await Thread.findAll({
            where: { 
                siteId: user.siteId,
                lastMessageAt: { [Op.gte]: since }
            },
            order: [['lastMessageAt', 'DESC']],
            limit
        });

        const threadIds = threads.map(thread => thread.id);
        const latestMessagesByThreadId = new Map();

        if (threadIds.length > 0) {
            const latestMessages = await Message.findAll({
                where: { threadId: { [Op.in]: threadIds } },
                order: [['createdAt', 'DESC']]
            });

            for (const message of latestMessages) {
                if (!latestMessagesByThreadId.has(message.threadId)) {
                    latestMessagesByThreadId.set(message.threadId, message);
                }
            }
        }

        const responseThreads = threads.map(thread => {
            const data = thread.toJSON();
            const lastMessage = latestMessagesByThreadId.get(thread.id);

            data.lastMsg = lastMessage?.message || 'No messages';
            data.lastMsgTime = lastMessage?.createdAt || data.lastMessageAt;
            data.lastMsgId = lastMessage?.id || null;

            return data;
        });
        
        res.json(responseThreads);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== SOCKET.IO (ONLY ONCE) ==========

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
  console.log('🔌 New connection:', socket.id);

  socket.on('admin-auth', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const adminUser = await User.findByPk(decoded.id, {
        attributes: ['id', 'name', 'email', 'role']
      });

      if (!adminUser || adminUser.role !== 'admin') return;

      socket.adminUser = adminUser.toJSON();
      socket.join('admins');
      socket.join(`admin-${adminUser.id}`);
      console.log(`Admin ${adminUser.email} connected`);
    } catch (err) {
      console.error('Invalid admin token');
    }
  });

  // Support authentication
  socket.on('support-auth', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      let supportUser = decoded;

      if (!supportUser.siteId || !supportUser.name) {
        const user = await User.findByPk(decoded.id, {
          attributes: ['id', 'name', 'email', 'role', 'siteId']
        });
        if (user) supportUser = user.toJSON();
      }

      if (supportUser.siteId) {
        socket.join(`site-${supportUser.siteId}`);
        markSupportOnline(socket, supportUser);
        console.log(`Support joined site-${supportUser.siteId}`);
      }

      socket.supportUser = supportUser;
      socket.join(`support-${supportUser.id}`);
      console.log(`Support ${supportUser.email} connected`);
    } catch (err) {
      console.error('Invalid support token');
    }
  });

  // Join site room
  socket.on('join-site', (siteId) => {
    if (socket.supportUser) {
      socket.join(`site-${siteId}`);
      console.log(`Support joined site-${siteId}`);
    }
  });

  socket.on('visitor-join-site', (siteId) => {
    socket.join(`site-${siteId}`);
    socket.emit('support-availability', getAvailableSupport(siteId));
    console.log(`Visitor joined site availability room: ${siteId}`);
  });

  socket.on('chat-box-open', (data = {}) => {
    const siteId = data.siteId ? String(data.siteId) : null;
    const visitorId = data.visitorId ? String(data.visitorId) : socket.id;
    if (!siteId) return;

    const chatBoxKey = `${siteId}:${visitorId}`;
    openChatBoxes.set(chatBoxKey, socket.id);
    socket.openChatBoxKey = chatBoxKey;

    io.emit('active-chat-count', { count: getActiveVisitorChatCount() });
  });

  socket.on('chat-box-close', () => {
    if (socket.openChatBoxKey) {
      openChatBoxes.delete(socket.openChatBoxKey);
      socket.openChatBoxKey = null;
      io.emit('active-chat-count', { count: getActiveVisitorChatCount() });
    }
  });

  socket.on('admin-agent-message', async (data = {}) => {
    if (!socket.adminUser) return;

    const toSupportId = parseInt(data.toSupportId, 10);
    const message = String(data.message || '').trim();
    if (!toSupportId || !message) return;

    const savedMessage = await InternalChatMessage.create({
      senderId: socket.adminUser.id,
      receiverId: toSupportId,
      senderRole: 'admin',
      message
    });
    const unreadCount = await InternalChatMessage.count({
      where: {
        senderId: socket.adminUser.id,
        receiverId: toSupportId,
        readAt: null
      }
    });

    const messageData = {
      id: savedMessage.id,
      fromAdminId: socket.adminUser.id,
      fromAdminName: socket.adminUser.name || 'Admin',
      toSupportId,
      sender: 'admin',
      message,
      unreadCount,
      createdAt: savedMessage.createdAt
    };

    io.to(`support-${toSupportId}`).emit('admin-agent-message', messageData);
    socket.emit('admin-agent-message-sent', messageData);
  });

  socket.on('agent-admin-message', async (data = {}) => {
    if (!socket.supportUser) return;

    const toAdminId = parseInt(data.toAdminId, 10);
    const message = String(data.message || '').trim();
    if (!toAdminId || !message) return;

    const receiver = await User.findByPk(toAdminId, {
      attributes: ['id', 'name', 'email', 'role']
    });
    if (!receiver || (receiver.role !== 'admin' && receiver.role !== 'support')) return;

    const savedMessage = await InternalChatMessage.create({
      senderId: socket.supportUser.id,
      receiverId: toAdminId,
      senderRole: 'support',
      message
    });
    const unreadCount = await InternalChatMessage.count({
      where: {
        senderId: socket.supportUser.id,
        receiverId: toAdminId,
        readAt: null
      }
    });

    const messageData = {
      id: savedMessage.id,
      fromSupportId: socket.supportUser.id,
      fromSupportName: socket.supportUser.name || 'Support Agent',
      fromSupportEmail: socket.supportUser.email || '',
      siteId: socket.supportUser.siteId || null,
      toAdminId,
      sender: 'agent',
      message,
      unreadCount,
      createdAt: savedMessage.createdAt
    };

    if (receiver.role === 'admin') {
      io.to(`admin-${toAdminId}`).emit('agent-admin-message', messageData);
    } else {
      io.to(`support-${toAdminId}`).emit('admin-agent-message', {
        id: savedMessage.id,
        fromAdminId: socket.supportUser.id,
        fromAdminName: socket.supportUser.name || 'Support Agent',
        fromAdminEmail: socket.supportUser.email || '',
        fromRole: 'support',
        toSupportId: toAdminId,
        sender: 'support',
        message,
        unreadCount,
        createdAt: savedMessage.createdAt
      });
    }
    socket.emit('agent-admin-message-sent', messageData);
  });

  // Visitor joins thread
  socket.on('join-thread', async (threadId, visitorId) => {
    try {
      const threadIdNum = parseInt(threadId);

      if (socket.supportUser && socket.currentSupportThreadId && socket.currentSupportThreadId !== threadIdNum) {
        socket.leave(`thread-${socket.currentSupportThreadId}`);
      }

      if (socket.supportUser) {
        socket.currentSupportThreadId = threadIdNum;
      } else {
        socket.visitorThreadId = threadIdNum;
      }

      socket.threadId = threadIdNum;
      socket.join(`thread-${threadIdNum}`);

      console.log(`${socket.supportUser ? 'Support' : 'User'} joined thread: ${threadIdNum}`);

      if (socket.supportUser) return;
      
      const messages = await Message.findAll({ 
        where: { threadId: threadIdNum }, 
        order: [['createdAt', 'ASC']] 
      });
      socket.emit('previous-messages', messages);
      console.log(`Sent ${messages.length} previous messages to thread ${threadIdNum}`);
    } catch (err) {
      console.error('Join thread error:', err);
    }
  });

// ========== VISITOR MESSAGE ==========
socket.on('visitor-message', async (data) => {
    try {
        const { threadId, message, visitorId } = data;
        const threadIdNum = parseInt(threadId);

        const roomName = `thread-${threadIdNum}`;
        const roomSize = io.sockets.adapter.rooms.get(roomName)?.size || 0;
        console.log(`📊 Room "${roomName}" has ${roomSize} clients`);
        console.log(`Visitor message in thread ${threadIdNum}: ${message}`);
        
        // Save message to database
        const newMessage = await Message.create({ 
            threadId: threadIdNum, 
            sender: 'visitor', 
            senderId: visitorId, 
            message 
        });
        
        console.log(`Visitor message saved, ID: ${newMessage.id}`);
        await emitTotalMessageCount();
        
        // Update thread last message time
        await Thread.update({ lastMessageAt: new Date() }, { where: { id: threadIdNum } });
        
        // Prepare message data
        const messageData = {
            id: newMessage.id,
            threadId: newMessage.threadId,
            sender: newMessage.sender,
            senderId: newMessage.senderId,
            message: newMessage.message,
            createdAt: newMessage.createdAt
        };

        const thread = await Thread.findByPk(threadIdNum);
        
        // Debug: Room clients before broadcast
        console.log(`📤 Emitting to room: thread-${threadIdNum}`);
        console.log(`📤 Room clients: ${roomSize}`);
        
        // Broadcast to ALL clients in this thread (visitor + support)
        io.to(`thread-${threadIdNum}`).emit('new-message', messageData);
        console.log(`✅ Broadcasted visitor message to thread ${threadIdNum}`);

        if (thread) {
          io.to(`site-${thread.siteId}`).emit('new-thread-message', {
            threadId: threadIdNum,
            message: messageData,
            thread
          });
        }
        
    } catch (err) {
        console.error('Visitor message error:', err);
    }
});


  // ========== SUPPORT MESSAGE ==========
  socket.on('support-message', async (data) => {
    try {
      const { threadId, message, supportId } = data;
      const threadIdNum = parseInt(threadId);
      
      console.log(`Support message in thread ${threadIdNum}: ${message}`);
      console.log(`Support ID: ${supportId}, Current User: ${socket.supportUser?.id}`);
      
      // Save message to database
      const newMessage = await Message.create({ 
        threadId: threadIdNum, 
        sender: 'support', 
        senderId: supportId || socket.supportUser?.id, 
        message 
      });
      
      console.log(`Support message saved, ID: ${newMessage.id}`);
      await emitTotalMessageCount();
      
      // Update thread last message time
      await Thread.update({ lastMessageAt: new Date() }, { where: { id: threadIdNum } });
      
      // Prepare message data
      const messageData = {
        id: newMessage.id,
        threadId: newMessage.threadId,
        sender: newMessage.sender,
        senderId: newMessage.senderId,
        message: newMessage.message,
        createdAt: newMessage.createdAt
      };
      console.log('Prepared support message data:', messageData);
      // Broadcast to ALL clients in this thread (visitor + support)
      io.to(`thread-${threadIdNum}`).emit('new-message', messageData);
      console.log(`Broadcasted support message to thread ${threadIdNum}`);
      
      // Send confirmation to sender
      socket.emit('message-sent', messageData);
      
    } catch (err) {
      console.error('Support message error:', err);
    }
  });

  // Pick thread
  socket.on('pick-thread', async (threadId) => {
    if (!socket.supportUser) return;
    
    try {
      const threadIdNum = parseInt(threadId);
      await Thread.update({ 
        assignedTo: socket.supportUser.id, 
        status: 'open' 
      }, { where: { id: threadIdNum } });
      
      const thread = await Thread.findByPk(threadIdNum);
      io.to(`support-${socket.supportUser.id}`).emit('thread-assigned', thread);
      if (thread) io.to(`site-${thread.siteId}`).emit('thread-updated', thread);
      
      console.log(`Thread ${threadIdNum} assigned to support ${socket.supportUser.id}`);
    } catch (err) {
      console.error('Pick thread error:', err);
    }
  });

  // Typing indicators
  socket.on('support-typing', (data) => {
    const { threadId, isTyping } = data;
    socket.to(`thread-${threadId}`).emit('visitor-typing', { isTyping });
    console.log(`Support typing in thread ${threadId}: ${isTyping}`);
  });

  socket.on('visitor-typing', (data) => {
    const { threadId, isTyping } = data;
    socket.to(`thread-${threadId}`).emit('support-typing', { isTyping });
    console.log(`Visitor typing in thread ${threadId}: ${isTyping}`);
  });

  socket.on('disconnect', () => {
    markSupportOffline(socket);
    if (socket.openChatBoxKey) {
      openChatBoxes.delete(socket.openChatBoxKey);
      io.emit('active-chat-count', { count: getActiveVisitorChatCount() });
    }
    console.log('🔌 Disconnected:', socket.id);
  });
});


// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`Support Panel: http://localhost:${PORT}/support-panel`);
});
