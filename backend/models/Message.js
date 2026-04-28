const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  threadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Thread',
    required: true
  },
  sender: {
    type: String,
    enum: ['visitor', 'support'],
    required: true
  },
  senderId: {
    type: String  // visitorId or userId
  },
  message: {
    type: String,
    required: true
  },
  attachments: [{
    type: String
  }],
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Message', MessageSchema);