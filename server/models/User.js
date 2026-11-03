import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  profilePicture: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['online', 'offline'],
    default: 'offline'
  },
  moodStatus: {
    emoji: { type: String, default: '😊' },
    text: { type: String, default: 'Available on ChatFlow' },
    expiresAt: { type: Date }
  },
  chatTheme: {
    preset: { type: String, default: 'midnight' },
    bubbleSent: { type: String, default: '#667eea' },
    bubbleReceived: { type: String, default: '#1e293b' },
    fontFamily: { type: String, default: 'Outfit' }
  },
  inboxPrefs: {
    pinnedChatIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }],
    archivedChatIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }],
    mutedChatIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }]
  },
  stickerFavorites: [{
    id: String,
    label: String,
    emoji: String,
    category: String
  }],
  phone: {
    type: String,
    default: ''
  },
  location: {
    type: String,
    default: ''
  },
  contacts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isBot: {
    type: Boolean,
    default: false
  },
  ghostModeActive: {
    type: Boolean,
    default: false
  },
  ghostModeReason: {
    type: String,
    default: ''
  },
  ghostModeReturnTime: {
    type: String,
    default: ''
  },
  kanePay: {
    isSetup: { type: Boolean, default: false },
    bankName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    upiId: { type: String, default: '' },
    city: { type: String, default: '' },
    balanceINR: { type: Number, default: 0 },
    transactions: [{
      type: { type: String, enum: ['credit', 'debit'], required: true },
      description: { type: String },
      amount: { type: Number },
      counterpartyName: { type: String, default: '' },
      date: { type: Date, default: Date.now }
    }]
  },
  snapScore: {
    type: Number,
    default: 0
  },
  nowPlaying: {
    song: { type: String, default: '' },
    artist: { type: String, default: '' },
    albumArt: { type: String, default: '' },
    previewUrl: { type: String, default: '' },
    youtubeVideoId: { type: String, default: '' },
    source: { type: String, default: 'itunes' },
    active: { type: Boolean, default: false }
  },
  musicFavorites: [{
    trackId: { type: String, required: true },
    title: { type: String, default: '' },
    artist: { type: String, default: '' },
    artwork: { type: String, default: '' },
    previewUrl: { type: String, default: '' },
    youtubeVideoId: { type: String, default: '' },
    source: { type: String, enum: ['itunes', 'youtube'], default: 'itunes' },
    addedAt: { type: Date, default: Date.now }
  }],
  recentlyPlayed: [{
    trackId: String,
    title: String,
    artist: String,
    artwork: String,
    previewUrl: String,
    youtubeVideoId: String,
    source: String,
    playedAt: { type: Date, default: Date.now }
  }],
  aiCompanion: {
    nickname: { type: String, default: 'Kane' },
    vibe: { type: String, enum: ['chill', 'hype', 'mentor', 'bestie'], default: 'bestie' },
    bondLevel: { type: Number, default: 1 },
    memories: [{
      text: String,
      createdAt: { type: Date, default: Date.now }
    }],
    lastChatAt: { type: Date },
    chatHistory: [{
      role: { type: String, enum: ['user', 'assistant'] },
      content: String,
      createdAt: { type: Date, default: Date.now }
    }]
  },
  gameStats: {
    totalWins: { type: Number, default: 0 },
    totalGames: { type: Number, default: 0 },
    arcadeHighScore: { type: Number, default: 0 },
    streakDays: { type: Number, default: 0 },
    lastPlayedAt: { type: Date },
    tournamentPoints: { type: Number, default: 0 }
  },
  gameStatsByType: {
    type: Map,
    of: {
      wins: { type: Number, default: 0 },
      played: { type: Number, default: 0 },
      streak: { type: Number, default: 0 }
    },
    default: new Map()
  },
  xp: {
    type: Number,
    default: 0
  },
  level: {
    type: String,
    default: 'Newbie'
  },
  completedChallenges: [{
    challengeId: { type: String },
    date: { type: Date, default: Date.now }
  }],
  wellnessHub: {
    waterCups: { type: Number, default: 0 },
    gymDone: { type: Boolean, default: false },
    mood: { type: String, default: '' },
    moodEmoji: { type: String, default: '😊' },
    streakDays: { type: Number, default: 0 },
    lastWellnessDate: { type: String, default: '' },
    customHabits: [{ id: Number, name: String, done: Boolean }],
    checklist: [{ id: Number, text: String, done: Boolean }]
  },
  arcadeHub: {
    spaceHighScore: { type: Number, default: 0 },
    rewardsClaimedToday: { type: Number, default: 0 },
    lastRewardDate: { type: String, default: '' },
    tictactoeWins: { type: Number, default: 0 }
  },
  // Advanced Features: Health Integration
  healthConnections: [{
    provider: { type: String, enum: ['apple_health', 'google_fit', 'fitbit'], required: true },
    accessToken: String,
    refreshToken: String,
    lastSync: { type: Date, default: Date.now },
    isConnected: { type: Boolean, default: true }
  }],
  healthData: {
    dailySteps: [{ date: Date, steps: Number }],
    sleepHours: [{ date: Date, hours: Number, quality: String }],
    heartRate: [{ date: Date, bpm: Number }],
    activities: [{ date: Date, activity: String, duration: Number, calories: Number }],
    waterIntake: [{ date: Date, cups: Number }],
    mood: [{ date: Date, emoji: String, text: String }],
    lastUpdated: Date
  },
  healthGoals: [String], // ['10000_steps', '8_hours_sleep', 'daily_meditation']
  // Advanced Features: Project Management Integration
  integrationConnections: [{
    provider: { type: String, enum: ['github', 'jira', 'trello', 'asana', 'notion'], required: true },
    token: String,
    config: mongoose.Schema.Types.Mixed,
    linkedRepos: [String],
    lastSync: Date,
    isActive: { type: Boolean, default: true }
  }],
  // Advanced Features: Preferences & Settings
  preferences: {
    tonePreference: { type: String, default: 'friendly' },
    briefingTime: { type: String, default: '08:00' }, // HH:MM format
    newsInterests: { type: [String], default: ['tech', 'health'] },
    budgetLimit: { type: Number, default: 0 },
    budgetCurrency: { type: String, default: 'USD' },
    enableBriefing: { type: Boolean, default: true },
    enableHealthReminders: { type: Boolean, default: true },
    enableNewsDigest: { type: Boolean, default: true }
  },
  // Advanced Features: Wellness Tracking
  wellness: {
    currentMood: { type: String, default: '😊' },
    moodHistory: [{ date: Date, mood: String }],
    streaks: {
      exercise: { type: Number, default: 0 },
      meditation: { type: Number, default: 0 },
      waterIntake: { type: Number, default: 0 },
      lastExerciseDate: Date,
      lastMeditationDate: Date,
      lastWaterDate: Date
    },
    lastBriefingTime: Date,
    productivityScore: { type: Number, default: 0 }
  },
  // Advanced Features: Expense Tracking
  expenses: [{
    date: { type: Date, default: Date.now },
    category: String,
    amount: Number,
    description: String,
    receiptUrl: String,
    tags: [String],
    splitWith: [mongoose.Schema.Types.ObjectId],
    currency: { type: String, default: 'USD' }
  }],
  expenseSettings: {
    budgetPerMonth: { type: Number, default: 0 },
    trackingEnabled: { type: Boolean, default: false },
    recurringExpenses: [{
      name: String,
      amount: Number,
      frequency: String, // 'daily', 'weekly', 'monthly'
      nextDueDate: Date
    }]
  },
  // Advanced Features: Tone Preferences by Contact
  tonePreferencesByContact: {
    type: Map,
    of: { type: String },
    default: new Map()
  },
  // Code Analysis & Project History
  codeSnippets: [{
    id: String,
    language: String,
    code: String,
    analysis: mongoose.Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('User', userSchema);