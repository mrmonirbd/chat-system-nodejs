const Message = require('../models/Message');
const Thread = require('../models/Thread');
const jwt = require('jsonwebtoken');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // Support/Admin authentication
    socket.on('support-auth', (token) => {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.supportUser = decoded;

        socket.join(`support-${decoded.id}`);

        if (decoded.siteId) {
          socket.join(`site-${decoded.siteId}`);
          console.log(`Support joined site-${decoded.siteId}`);
        }

        console.log(`Support ${decoded.email} connected`);
      } catch (err) {
        console.error('Invalid support token');
      }
    });

    // Support joins site room
    socket.on('join-site', (siteId) => {
      socket.join(`site-${siteId}`);
      console.log(`✅ Socket ${socket.id} joined site-${siteId}`);
    });

    // Visitor joins their thread
    socket.on('join-thread', async (threadId, visitorId) => {
      socket.threadId = threadId;
      socket.visitorId = visitorId;
      socket.join(`thread-${threadId}`);

      const messages = await Message.find({ threadId }).sort('createdAt');
      socket.emit('previous-messages', messages);
    });

    // New message from visitor
    socket.on('visitor-message', async (data) => {
      const { threadId, message, visitorId } = data;

      const newMessage = new Message({
        threadId,
        sender: 'visitor',
        senderId: visitorId,
        message
      });

      await newMessage.save();

      await Thread.findByIdAndUpdate(threadId, {
        lastMessageAt: new Date()
      });

      const thread = await Thread.findById(threadId).populate('siteId');

      if (thread && thread.siteId) {
        io.to(`site-${thread.siteId._id}`).emit('new-thread-message', {
          threadId,
          message: newMessage,
          thread
        });

        io.to(`site-${thread.siteId._id}`).emit('new-message', newMessage);
      }

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

      await Thread.findByIdAndUpdate(threadId, {
        lastMessageAt: new Date()
      });

      io.to(`thread-${threadId}`).emit('new-message', newMessage);

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

      if (thread && thread.siteId) {
        io.to(`site-${thread.siteId._id}`).emit('thread-updated', thread);
      }
    });

    socket.on('disconnect', () => {
      console.log('Disconnected:', socket.id);
    });
  });
};