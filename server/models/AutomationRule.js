import mongoose from 'mongoose';

const automationRuleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  naturalLanguage: { type: String, required: true, trim: true, maxlength: 500 },
  enabled: { type: Boolean, default: true, index: true },
  trigger: {
    type: { type: String, enum: ['incoming_message'], default: 'incoming_message' },
    senderName: { type: String, default: '' },
    keywords: [{ type: String, trim: true, maxlength: 40 }],
    matchMode: { type: String, enum: ['any', 'all'], default: 'any' }
  },
  action: {
    type: { type: String, enum: ['reminder'], default: 'reminder' },
    delayMinutes: { type: Number, default: 30, min: 1, max: 10080 },
    note: { type: String, default: 'Follow up on this message', maxlength: 240 }
  },
  stats: {
    runCount: { type: Number, default: 0 },
    lastRunAt: Date
  }
}, { timestamps: true });

automationRuleSchema.index({ userId: 1, enabled: 1, 'trigger.type': 1 });

export default mongoose.model('AutomationRule', automationRuleSchema);
