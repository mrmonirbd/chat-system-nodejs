const Message = require('../models/Message');
const Thread = require('../models/Thread');
const jwt = require('jsonwebtoken');

module.exports = (io) => {
  // Store active connections
  const supportRooms = new Map(); // supportId -> siteId
  const visitorRooms = new Map(); // threadId -> socketId

  io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // Support/Admin authentication
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

    // Visitor joins their thread
    socket.on('join-thread', async (threadId, visitorId) => {
      socket.threadId = threadId;
      socket.visitorId = visitorId;
      socket.join(`thread-${threadId}`);
      
      // Send previous messages
      const messages = await Message.find({ threadId }).sort('createdAt');
      socket.emit('previous-messages', messages);
    });

    // New message from visitor
    socket.on('visitor-message', async (data) => {
      const { threadId, message, visitorId, visitorName } = data;
      
      // Save message
      const newMessage = new Message({
        threadId,
        sender: 'visitor',
        senderId: visitorId,
        message
      });
      await newMessage.save();
      
      // Update thread last message time
      await Thread.findByIdAndUpdate(threadId, { lastMessageAt: new Date() });
      
      // Broadcast to support users of this site
      const thread = await Thread.findById(threadId).populate('siteId');
      io.to(`site-${thread.siteId._id}`).emit('new-thread-message', {
        threadId,
        message: newMessage,
        thread
      });
      
      // Also send back to visitor
      io.to(`thread-${threadId}`).emit('new-message', newMessage);
    });

    // New message from support
    socket.on('support-message', async (data) => {
      const { threadId, message, supportId } = data;
      
      const newMessage = new Message({
        threadId,
        sender: 'support',
        senderId: supportId,
        message
      });
      await newMessage.save();
      
      // Update thread
      await Thread.findByIdAndUpdate(threadId, { lastMessageAt: new Date() });
      
      // Send to visitor
      io.to(`thread-${threadId}`).emit('new-message', newMessage);
      
      // Also send back to support panel
      socket.emit('message-sent', newMessage);
    });

    // Support picks a thread
    socket.on('pick-thread', async (threadId) => {
      if (!socket.supportUser) return;
      
      await Thread.findByIdAndUpdate(threadId, {
        assignedTo: socket.supportUser.id,
        status: 'open'
      });
      
      const thread = await Thread.findById(threadId).populate('siteId');
      io.to(`support-${socket.supportUser.id}`).emit('thread-assigned', thread);
      io.to(`site-${thread.siteId._id}`).emit('thread-updated', thread);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected:', socket.id);
    });
  });
};