import mongoose from 'mongoose';

const gameSessionSchema = new mongoose.Schema({
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  gameType: {
    type: String,
    enum: ['tictactoe', 'wordguess', 'truthordare', 'rps', 'trivia', 'wordle', 'connect4', 'numberguess'],
    required: true
  },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  state: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: { type: String, enum: ['pending', 'active', 'finished'], default: 'pending' },
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export default mongoose.model('GameSession', gameSessionSchema);
