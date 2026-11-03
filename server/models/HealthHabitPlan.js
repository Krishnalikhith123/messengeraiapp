import mongoose from 'mongoose';

const healthHabitPlanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    required: true,
    enum: [
      'gym',
      'walking',
      'water',
      'healthy_food',
      'medication',
      'meditation',
      'sleep',
      'stretching',
      'running',
      'cycling',
      'yoga',
      'screen_break',
      'protein',
      'skincare',
      'journaling'
    ]
  },
  title: { type: String, required: true, trim: true },
  status: { type: String, enum: ['active', 'paused', 'completed'], default: 'active', index: true },
  startsOn: { type: Date, required: true },
  targetDays: { type: Number, default: 30, min: 1, max: 365 },
  restDays: [{ type: Number, min: 0, max: 6 }],
  config: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  currentStreak: { type: Number, default: 0 },
  bestStreak: { type: Number, default: 0 },
  completedDays: { type: Number, default: 0 },
  lastCheckInDate: { type: String, default: '' },
  checkIns: [{
    dateKey: String,
    status: { type: String, enum: ['done', 'rest', 'missed'], default: 'done' },
    value: mongoose.Schema.Types.Mixed,
    note: String,
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

healthHabitPlanSchema.index({ userId: 1, status: 1, startsOn: 1 });

export default mongoose.model('HealthHabitPlan', healthHabitPlanSchema);
