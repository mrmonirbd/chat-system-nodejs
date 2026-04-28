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
// sequelize.sync({ alter: false }).then(() => {
//   console.log(' MySQL tables ready');
// }).catch(err => {
//   console.error(' Sync error:', err);
// });

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
      attributes: ['id', 'name', 'domain', 'apiKey']
    });
    if (!site) return res.status(404).json({ error: 'Site not found' });
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
    res.json({ siteId: site.id, settings: site });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Thread
app.post('/api/threads/create', async (req, res) => {
  try {
    const { siteId, visitorId, visitorName, visitorEmail } = req.body;
    
    let thread = await Thread.findOne({ where: { siteId, visitorId, status: ['open', 'pending'] } });
    
    if (!thread) {
      thread = await Thread.create({ siteId, visitorId, visitorName: visitorName || 'Guest', visitorEmail, status: 'pending', lastMessageAt: new Date() });
      console.log('New thread created:', thread.id);
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

// ========== SOCKET.IO (ONLY ONCE) ==========

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
  console.log('🔌 New connection:', socket.id);

  // Support authentication
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

  // Join site room
  socket.on('join-site', (siteId) => {
    if (socket.supportUser) {
      socket.join(`site-${siteId}`);
      console.log(`Support joined site-${siteId}`);
    }
  });

  // Visitor joins thread
  socket.on('join-thread', async (threadId, visitorId) => {
    try {
      const threadIdNum = parseInt(threadId);
      socket.threadId = threadIdNum;
      socket.join(`thread-${threadIdNum}`);
      console.log(`User joined thread: ${threadIdNum}`);
      
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
        
        // Debug: Room clients before broadcast
        console.log(`📤 Emitting to room: thread-${threadIdNum}`);
        console.log(`📤 Room clients: ${roomSize}`);
        
        // Broadcast to ALL clients in this thread (visitor + support)
        io.to(`thread-${threadIdNum}`).emit('new-message', messageData);
        console.log(`✅ Broadcasted visitor message to thread ${threadIdNum}`);
        
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