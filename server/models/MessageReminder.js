import mongoose from 'mongoose';

const messageReminderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' },
  note: { type: String, default: '' },
  originalSnippet: { type: String, default: '' },
  remindAt: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'sent', 'cancelled'], default: 'pending' },
  createdViaVoice: { type: Boolean, default: false }
}, { timestamps: true });

messageReminderSchema.index({ userId: 1, status: 1, remindAt: 1 });

export default mongoose.model('MessageReminder', messageReminderSchema);
