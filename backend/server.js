const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatsystem', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Models
const Site = require('./models/Site');
const Thread = require('./models/Thread');
const Message = require('./models/Message');
const User = require('./models/User');

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/threads', require('./routes/threads'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/sites', require('./routes/sites'));

// Socket.io logic
require('./socket')(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});