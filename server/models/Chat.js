import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastMessageTime: {
    type: Date,
    default: Date.now
  },
  isGroupChat: {
    type: Boolean,
    default: false
  },
  groupName: {
    type: String
  },
  groupImage: {
    type: String
  },
  groupDescription: {
    type: String
  },
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: new Map()
  },
  isSplitGroup: {
    type: Boolean,
    default: false
  },
  isSecretChat: {
    type: Boolean,
    default: false
  },
  fixedSplits: [{
    title: { type: String, required: true },
    amount: { type: Number, required: true }
  }],
  splitDueDate: {
    type: Number,
    default: 5
  },
  payments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    month: { type: String }, // e.g. "2026-05"
    paid: { type: Boolean, default: false },
    date: { type: Date }
  }],
  snapStreakCount: {
    type: Number,
    default: 0
  },
  lastStreakUpdate: {
    type: Date
  },
  snapScoreDetails: {
    type: Map,
    of: {
      score: { type: Number, default: 0 },
      lastSnapSent: { type: Date },
      warningActive: { type: Boolean, default: false },
      status: { type: String, default: 'active' } // active, warning, decayed, reset
    },
    default: new Map()
  },
  pinnedMessageIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }],
  wallpaperUrl: {
    type: String,
    default: ''
  },
  chatTheme: {
    preset: { type: String, default: '' },
    bubbleSent: { type: String, default: '' },
    bubbleReceived: { type: String, default: '' }
  },
  watchParty: {
    active: { type: Boolean, default: false },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    videoUrl: { type: String, default: '' },
    title: { type: String, default: '' },
    currentTime: { type: Number, default: 0 },
    isPlaying: { type: Boolean, default: false }
  },
  voiceLoungeActive: { type: Boolean, default: false },
  partyMode: { type: Boolean, default: false },
  memberRoles: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['moderator', 'member', 'readonly'], default: 'member' }
  }],
  inviteLinks: [{
    code: { type: String },
    expiresAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    maxUses: { type: Number, default: 50 },
    uses: { type: Number, default: 0 }
  }],
  isPublic: { type: Boolean, default: false },
  topics: [{ type: String }],
  groupRules: { type: String, default: 'Be respectful. No spam. Stay on topic.' },
  welcomeBotEnabled: { type: Boolean, default: true },
  slowModeSeconds: { type: Number, default: 0 },
  slowModeLastSent: {
    type: Map,
    of: Date,
    default: new Map()
  },
  auditLog: [{
    action: { type: String },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    details: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

export default mongoose.model('Chat', chatSchema);