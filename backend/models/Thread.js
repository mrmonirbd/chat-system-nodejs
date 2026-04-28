const mongoose = require('mongoose');

const ThreadSchema = new mongoose.Schema({
  siteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: true
  },
  visitorId: {
    type: String,  // Unique ID from browser/localStorage
    required: true
  },
  visitorName: {
    type: String,
    default: 'Guest'
  },
  visitorEmail: {
    type: String
  },
  status: {
    type: String,
    enum: ['open', 'closed', 'pending'],
    default: 'pending'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Thread', ThreadSchema);