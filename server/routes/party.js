import express from 'express';
import Chat from '../models/Chat.js';
import GameSession from '../models/GameSession.js';
import { auth } from '../middleware/auth.js';
import { broadcastToChatParticipants } from '../utils/messageBroadcast.js';

const router = express.Router();

const PARTY_GAMES = [
  { id: 'tictactoe', name: 'Tic-Tac-Toe', emoji: '⭕', players: '2' },
  { id: 'truthordare', name: 'Truth or Dare', emoji: '🎭', players: '2+' },
  { id: 'trivia', name: 'Trivia Battle', emoji: '🧠', players: '2+' },
  { id: 'rps', name: 'Rock Paper Scissors', emoji: '✊', players: '2' },
  { id: 'wordle', name: 'Party Wordle', emoji: '🔤', players: '2+' }
];

router.get('/games', auth, (req, res) => {
  res.json(PARTY_GAMES);
});

router.get('/lobbies', auth, async (req, res) => {
  const lobbies = await Chat.find({
    partyMode: true,
    participants: req.user.id
  })
    .populate('participants', 'username profilePicture')
    .select('groupName groupImage participants partyMode');
  res.json(lobbies);
});

router.post('/lobby', auth, async (req, res) => {
  const { chatId, gameType } = req.body;
  const chat = await Chat.findById(chatId);
  if (!chat?.isGroupChat) return res.status(400).json({ message: 'Party mode requires a group chat' });
  if (!chat.participants.some((p) => p.toString() === req.user.id)) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  chat.partyMode = true;
  await chat.save();

  await GameSession.updateMany({ chatId, status: { $ne: 'finished' } }, { status: 'finished' });

  const session = new GameSession({
    chatId,
    gameType: gameType || 'truthordare',
    players: chat.participants,
    state: { partyRound: 1, hostId: req.user.id, lobbyOpen: true },
    status: 'pending'
  });
  await session.save();
  await session.populate('players', 'username profilePicture');

  await broadcastToChatParticipants(chatId, req.user.id, 'party-lobby-started', {
    chatId,
    session: session.toObject(),
    gameType
  });

  res.status(201).json({ chat, session, availableGames: PARTY_GAMES });
});

router.post('/lobby/:chatId/join', auth, async (req, res) => {
  const session = await GameSession.findOne({ chatId: req.params.chatId, status: 'pending' });
  if (!session) return res.status(404).json({ message: 'No open party lobby' });

  const uid = req.user.id;
  if (!session.players.some((p) => p.toString() === uid)) {
    session.players.push(uid);
  }
  session.status = 'active';
  await session.save();
  await broadcastToChatParticipants(req.params.chatId, uid, 'party-lobby-joined', session.toObject());
  res.json(session);
});

router.delete('/lobby/:chatId', auth, async (req, res) => {
  const chat = await Chat.findByIdAndUpdate(req.params.chatId, { partyMode: false }, { new: true });
  await GameSession.updateMany({ chatId: req.params.chatId, status: { $ne: 'finished' } }, { status: 'finished' });
  if (chat) {
    await broadcastToChatParticipants(req.params.chatId, req.user.id, 'party-lobby-ended', { chatId: chat._id });
  }
  res.json({ message: 'Party ended' });
});

export default router;
