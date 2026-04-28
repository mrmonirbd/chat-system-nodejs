const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../admin-panel')));
app.use('/frontend', express.static(path.join(__dirname, '../frontend')));

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

// Test Connection
sequelize.authenticate()
  .then(() => console.log(' MySQL connected'))
  .catch(err => console.log(' MySQL error:', err));

// ========== MODELS ==========

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'support'), defaultValue: 'support' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
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
  visitorId: { type: DataTypes.STRING, allowNull: false },
  visitorName: { type: DataTypes.STRING, defaultValue: 'Guest' },
  visitorEmail: { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM('open', 'closed', 'pending'), defaultValue: 'pending' },
  lastMessageAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { timestamps: true });

const Message = sequelize.define('Message', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  sender: { type: DataTypes.ENUM('visitor', 'support'), allowNull: false },
  senderId: { type: DataTypes.STRING },
  message: { type: DataTypes.TEXT, allowNull: false },
  read: { type: DataTypes.BOOLEAN, defaultValue: false }
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

// ========== SYNC DATABASE ==========
sequelize.sync({ alter: true }).then(() => {
  console.log('MySQL tables created/updated');
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
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Site (Admin only)
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

// Add Support User
app.post('/api/sites/add-support', authMiddleware, async (req, res) => {
  try {
    // 1. Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only access' });
    }
    
    // 2. Get data from request body
    const { siteId, name, email, password } = req.body;
    
    // 3. Validate all fields are present
    if (!siteId || !name || !email || !password) {
      return res.status(400).json({ 
        error: 'All fields are required',
        missing: {
          siteId: !siteId,
          name: !name,
          email: !email,
          password: !password
        }
      });
    }
    
    // 4. Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // 5. Check if site exists
    const site = await Site.findByPk(siteId);
    if (!site) {
      return res.status(404).json({ error: 'Site not found' });
    }
    
    // 6. Check if user already exists with same email
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    // 7. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 8. Create user
    const user = await User.create({ 
      name, 
      email, 
      password: hashedPassword, 
      role: 'support', 
      siteId,
      isActive: true
    });
    
    // 9. Return success response (without password)
    res.json({ 
      success: true,
      message: 'Support user added successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        siteId: user.siteId
      }
    });
    
  } catch (err) {
    console.error('Add support error:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      message: err.message 
    });
  }
});

// Site Config (for widget)
app.get('/api/sites/config/:apiKey', async (req, res) => {
  try {
    const site = await Site.findOne({ where: { apiKey: req.params.apiKey } });
    if (!site) return res.status(404).json({ error: 'Invalid API key' });
    res.json({ siteId: site.id, settings: site });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Thread
app.post('/api/threads/create', async (req, res) => {
  try {
    const { siteId, visitorId, visitorName, visitorEmail } = req.body;
    let thread = await Thread.findOne({ where: { siteId, visitorId, status: { [Op.ne]: 'closed' } } });
    if (!thread) {
      thread = await Thread.create({ siteId, visitorId, visitorName, visitorEmail });
    }
    res.json({ threadId: thread.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Threads by Site
app.get('/api/threads/site/:siteId', async (req, res) => {
  try {
    const threads = await Thread.findAll({ 
      where: { siteId: req.params.siteId },
      order: [['lastMessageAt', 'DESC']],
      include: [{ model: User, as: 'AssignedSupport' }]
    });
    res.json(threads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Messages by Thread
app.get('/api/threads/:threadId/messages', async (req, res) => {
  try {
    const messages = await Message.findAll({ 
      where: { threadId: req.params.threadId },
      order: [['createdAt', 'ASC']]
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve admin panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin-panel/index.html'));
});
app.get('/support-panel', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin-panel/support-panel.html'));
});
app.get('/widget.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/widget.js'));
});
app.get('/widget.css', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/widget.css'));
});

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('support-auth', (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.supportUser = decoded;
      socket.join(`support-${decoded.id}`);
      console.log(`Support ${decoded.email} connected`);
    } catch (err) {
      console.error('Invalid support token');
    }
  });

  socket.on('join-site', (siteId) => {
    if (socket.supportUser) {
      socket.join(`site-${siteId}`);
    }
  });

  socket.on('join-thread', async (threadId, visitorId) => {
    socket.threadId = threadId;
    socket.join(`thread-${threadId}`);
    const messages = await Message.findAll({ where: { threadId }, order: [['createdAt', 'ASC']] });
    socket.emit('previous-messages', messages);
  });

  socket.on('visitor-message', async (data) => {
    const { threadId, message, visitorId } = data;
    const newMessage = await Message.create({ threadId, sender: 'visitor', senderId: visitorId, message });
    await Thread.update({ lastMessageAt: new Date() }, { where: { id: threadId } });
    const thread = await Thread.findByPk(threadId);
    io.to(`thread-${threadId}`).emit('new-message', newMessage);
    if (thread) {
      io.to(`site-${thread.siteId}`).emit('new-thread-message', { threadId, message: newMessage, thread });
    }
  });

  socket.on('support-message', async (data) => {
    const { threadId, message, supportId } = data;
    const newMessage = await Message.create({ threadId, sender: 'support', senderId: supportId, message });
    await Thread.update({ lastMessageAt: new Date() }, { where: { id: threadId } });
    io.to(`thread-${threadId}`).emit('new-message', newMessage);
    socket.emit('message-sent', newMessage);
  });

  socket.on('pick-thread', async (threadId) => {
    if (!socket.supportUser) return;
    await Thread.update({ assignedTo: socket.supportUser.id, status: 'open' }, { where: { id: threadId } });
    const thread = await Thread.findByPk(threadId);
    io.to(`support-${socket.supportUser.id}`).emit('thread-assigned', thread);
    if (thread) io.to(`site-${thread.siteId}`).emit('thread-updated', thread);
  });

  socket.on('disconnect', () => {
    console.log(' Disconnected:', socket.id);
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(` Server running on http://localhost:${PORT}`);
  console.log(` Admin Panel: http://localhost:${PORT}/admin`);
  console.log(` Support Panel: http://localhost:${PORT}/support-panel`);
});


// Get all support agents (for stats)
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

// Get support agents by site
app.get('/api/sites/:siteId/support-agents', authMiddleware, async (req, res) => {
    try {
        const agents = await User.findAll({
            where: { 
                siteId: req.params.siteId,
                role: 'support'
            },
            attributes: ['id', 'name', 'email', 'isActive']
        });
        res.json(agents);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Verify token and get user info
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

// Get site by ID
app.get('/api/sites/:siteId', authMiddleware, async (req, res) => {
    try {
        const site = await Site.findByPk(req.params.siteId, {
            attributes: ['id', 'name', 'domain', 'apiKey']
        });
        if (!site) return res.status(404).json({ error: 'Site not found' });
        res.json(site);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});