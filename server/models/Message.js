import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  content: {
    type: String,
    default: ''
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  reactions: [{
    emoji: String,
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  messageType: {
    type: String,
    enum: ['text', 'image', 'voice', 'call', 'snap', 'poll', 'location', 'giftcard', 'document', 'gif'],
    default: 'text'
  },
  fileName: { type: String, default: '' },
  fileSize: { type: Number, default: 0 },
  isPinned: { type: Boolean, default: false },
  pinnedAt: { type: Date },
  starredBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  scheduledFor: { type: Date },
  isScheduled: { type: Boolean, default: false },
  wasScheduled: { type: Boolean, default: false },
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  linkPreview: {
    url: String,
    title: String,
    description: String,
    image: String
  },
  deliveryStatus: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  forwardFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  forwardFromChat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat'
  },
  messageEffect: {
    type: String,
    enum: ['none', 'confetti', 'hearts', 'fireworks', 'balloons'],
    default: 'none'
  },
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  mediaUrl: {
    type: String
  },
  mediaSize: {
    type: Number
  },
  duration: {
    type: Number
  },
  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isRead: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  deletedAt: {
    type: Date
  },
  isVanish: {
    type: Boolean,
    default: false
  },
  viewedAt: {
    type: Date
  },
  transcription: {
    type: String,
    default: ''
  },
  isWorkspaceMessage: {
    type: Boolean,
    default: false
  },
  isSticker: {
    type: Boolean,
    default: false
  },
  stickerSvg: {
    type: String,
    default: ''
  },
  isAdHocBill: {
    type: Boolean,
    default: false
  },
  billDescription: {
    type: String,
    default: ''
  },
  billTotal: {
    type: Number,
    default: 0
  },
  billSplits: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    share: { type: Number },
    paid: { type: Boolean, default: false }
  }],
  isSnap: {
    type: Boolean,
    default: false
  },
  snapOpenedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Poll fields
  pollQuestion: { type: String, default: '' },
  pollOptions: [{
    label: { type: String },
    votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],
  pollExpiresAt: { type: Date },
  pollAnonymous: { type: Boolean, default: false },
  // Location fields
  latitude:  { type: Number },
  longitude: { type: Number },
  locationLabel: { type: String, default: '' },
  locationExpiry: { type: Date },
  // Gift Card fields
  giftAmount:  { type: Number, default: 0 },
  giftMessage: { type: String, default: '' },
  giftRedeemed: { type: Boolean, default: false },
  giftRedeemedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Encryption
  isEncrypted: { type: Boolean, default: false },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

export default mongoose.model('Message', messageSchema);