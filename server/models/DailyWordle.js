import mongoose from 'mongoose';

const dailyWordleSchema = new mongoose.Schema({
  dateKey: { type: String, required: true, unique: true },
  word: { type: String, required: true },
  results: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    guesses: [String],
    won: Boolean,
    attempts: Number
  }]
}, { timestamps: true });

export default mongoose.model('DailyWordle', dailyWordleSchema);
