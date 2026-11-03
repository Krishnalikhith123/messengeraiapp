import express from 'express';
import { auth } from '../middleware/auth.js';
import GameSession from '../models/GameSession.js';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';
import User from '../models/User.js';
import DailyWordle from '../models/DailyWordle.js';
import { emitToUser } from '../socket.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();

const GAME_CATALOG = {
  59: { id: 'tictactoe', feature: 59, name: 'Tic-Tac-Toe', emoji: '⭕', desc: 'Classic 3×3 strategy duel' },
  60: { id: 'wordguess', feature: 60, name: 'Word Guess', emoji: '🔤', desc: 'Hangman-style letter battles' },
  61: { id: 'truthordare', feature: 61, name: 'Truth or Dare', emoji: '🎭', desc: 'Spin the wheel, curated decks' },
  62: { id: 'rps', feature: 62, name: 'RPS Tournament', emoji: '✊', desc: 'Best of 3 rock-paper-scissors' },
  63: { id: 'trivia', feature: 63, name: 'Trivia Battle', emoji: '🧠', desc: '5-round quiz showdown' },
  64: { id: 'wordle', feature: 64, name: 'Daily Wordle', emoji: '🟩', desc: 'Global daily 5-letter puzzle' },
  65: { id: 'tournament', feature: 65, name: 'Weekly Cup', emoji: '🏆', desc: 'Tournament points & streak rewards' }
};

const TRIVIA_BANK = [
  { q: 'What does MERN stand for?', options: ['Mongo Express React Node', 'Mail Event Router Network', 'Meta Engine Runtime Node', 'Music Editor React Native'], answer: 0 },
  { q: 'Which powers real-time chat?', options: ['HTTP only', 'Socket.IO', 'SMTP', 'FTP'], answer: 1 },
  { q: 'Kane AI uses?', options: ['OpenAI only', 'Google Gemini', 'No AI', 'Local rules'], answer: 1 },
  { q: 'Snap streaks reward?', options: ['KanePay', 'Nothing', 'Ban', 'Ads'], answer: 0 },
  { q: 'Vanish messages last?', options: ['1 minute', '1 hour', 'Forever', '1 day'], answer: 0 }
];

const TRUTH_DECK = [
  'What is your most embarrassing moment?',
  'Who was your first crush?',
  'What is a secret talent you have?'
];

const DARE_DECK = [
  'Send a funny voice note now!',
  'Change your mood status to something silly!',
  'Compliment the next person who messages!'
];

async function recordGameStats(userId, gameType, won) {
  const user = await User.findById(userId);
  if (!user) return;
  user.gameStats = user.gameStats || {};
  user.gameStats.totalGames = (user.gameStats.totalGames || 0) + 1;
  if (won) user.gameStats.totalWins = (user.gameStats.totalWins || 0) + 1;
  if (won) user.gameStats.tournamentPoints = (user.gameStats.tournamentPoints || 0) + 10;
  else user.gameStats.tournamentPoints = (user.gameStats.tournamentPoints || 0) + 2;
  const key = gameType;
  const map = user.gameStatsByType || new Map();
  const cur = map.get(key) || { wins: 0, played: 0, streak: 0 };
  cur.played += 1;
  if (won) { cur.wins += 1; cur.streak += 1; } else cur.streak = 0;
  map.set(key, cur);
  user.gameStatsByType = map;
  user.gameStats.lastPlayedAt = new Date();
  await user.save();
}

async function kaneGameReferee(session, chat) {
  let comment = 'Great match! Who wants a rematch?';
  try {
    if (process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(
        `You are Kane, a hype game referee. One sentence commentary for ${session.gameType} result: ${JSON.stringify(session.state?.winner || session.winner)}. Be fun and short.`
      );
      comment = result.response.text().trim();
    }
  } catch { /* fallback */ }
  if (chat) {
    chat.participants.forEach((p) => {
      emitToUser(p.toString(), 'kane-game-referee', { chatId: session.chatId, comment, gameType: session.gameType });
    });
  }
}

router.get('/catalog', auth, (req, res) => {
  res.json(Object.values(GAME_CATALOG));
});

router.get('/stats/me', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('gameStats gameStatsByType');
  const byType = {};
  if (user.gameStatsByType) {
    for (const [k, v] of user.gameStatsByType.entries()) byType[k] = v;
  }
  res.json({ gameStats: user.gameStats, gameStatsByType: byType, catalog: GAME_CATALOG });
});

router.get('/wordle/daily', auth, async (req, res) => {
  const dateKey = new Date().toISOString().slice(0, 10);
  const words = ['KANE', 'MUSIC', 'PARTY', 'GLASS', 'CHATS', 'STORY', 'REACT', 'DAILY'];
  let daily = await DailyWordle.findOne({ dateKey });
  if (!daily) {
    daily = await DailyWordle.create({ dateKey, word: words[dateKey.charCodeAt(8) % words.length] });
  }
  const myResult = daily.results?.find((r) => r.userId.toString() === req.user.id);
  res.json({
    dateKey,
    wordLength: 5,
    maxGuesses: 6,
    alreadyPlayed: !!myResult,
    myResult: myResult ? { won: myResult.won, attempts: myResult.attempts } : null,
    playersToday: daily.results?.length || 0
  });
});

router.post('/wordle/daily/guess', auth, async (req, res) => {
  const { guess } = req.body;
  const g = (guess || '').toUpperCase().slice(0, 5);
  if (g.length !== 5) return res.status(400).json({ message: 'Guess must be 5 letters' });

  const dateKey = new Date().toISOString().slice(0, 10);
  let daily = await DailyWordle.findOne({ dateKey });
  if (!daily) return res.status(404).json({ message: 'No daily puzzle' });

  let entry = daily.results?.find((r) => r.userId.toString() === req.user.id);
  if (entry?.won || (entry?.guesses?.length || 0) >= 6) {
    return res.status(400).json({ message: 'Already played today' });
  }

  if (!entry) {
    entry = { userId: req.user.id, guesses: [], won: false, attempts: 0 };
    daily.results.push(entry);
  }

  const feedback = g.split('').map((letter, i) => {
    if (daily.word[i] === letter) return 'correct';
    if (daily.word.includes(letter)) return 'present';
    return 'absent';
  });

  entry.guesses.push(g);
  entry.attempts = entry.guesses.length;
  const won = g === daily.word;
  if (won) entry.won = true;

  const finished = won || entry.guesses.length >= 6;
  await daily.save();

  if (finished && won) await recordGameStats(req.user.id, 'wordle', true);
  else if (finished) await recordGameStats(req.user.id, 'wordle', false);

  res.json({
    feedback,
    won,
    finished,
    attempts: entry.attempts,
    guesses: entry.guesses,
    reveal: finished && !won ? daily.word : undefined
  });
});

router.get('/tournament', auth, async (req, res) => {
  const top = await User.find({ isBot: { $ne: true } })
    .select('username profilePicture gameStats')
    .sort({ 'gameStats.tournamentPoints': -1 })
    .limit(20);
  const me = await User.findById(req.user.id).select('gameStats');
  res.json({
    weekLabel: `Week of ${new Date().toISOString().slice(0, 10)}`,
    leaderboard: top,
    myPoints: me?.gameStats?.tournamentPoints || 0,
    prizes: ['🥇 500 KanePay pts', '🥈 300 pts', '🥉 150 pts']
  });
});

// GET /api/games/session/:chatId - returns the active game session in a chat
router.get('/session/:chatId', auth, async (req, res) => {
  try {
    const session = await GameSession.findOne({ chatId: req.params.chatId, status: { $ne: 'finished' } })
      .populate('players', 'username profilePicture')
      .populate('winner', 'username');
    res.json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/games/start - create/start a game session
router.post('/start', auth, async (req, res) => {
  try {
    const { chatId, gameType, recipientId } = req.body;
    if (!chatId || !gameType) {
      return res.status(400).json({ message: 'chatId and gameType are required' });
    }

    // Deactivate any existing active game session in this chat
    await GameSession.updateMany({ chatId, status: { $ne: 'finished' } }, { status: 'finished' });

    let players = [req.user.id];
    if (recipientId) players.push(recipientId);

    let initialState = {};
    if (gameType === 'tictactoe') {
      initialState = {
        board: Array(9).fill(null),
        nextTurn: req.user.id,
        symbols: {
          [req.user.id]: 'X',
          [recipientId || 'bot']: 'O'
        }
      };
    } else if (gameType === 'wordguess') {
      const words = ['MERN', 'SOCKET', 'REACT', 'EXPRESS', 'NODE', 'MONGODB', 'KANE', 'GLASSMORPHISM'];
      const word = words[Math.floor(Math.random() * words.length)];
      initialState = {
        word,
        guesses: [],
        maxAttempts: 6,
        nextTurn: req.user.id
      };
    } else if (gameType === 'truthordare') {
      initialState = {
        currentTurn: req.user.id,
        prompt: 'Spin Truth or Dare!',
        type: null,
        truthDeck: TRUTH_DECK,
        dareDeck: DARE_DECK,
        round: 1
      };
    } else if (gameType === 'rps') {
      initialState = {
        player1Choice: null,
        player2Choice: null,
        roundWins: {},
        round: 1,
        bestOf: 3,
        nextTurn: req.user.id
      };
    } else if (gameType === 'trivia') {
      const shuffled = [...TRIVIA_BANK].sort(() => Math.random() - 0.5).slice(0, 5);
      initialState = {
        questions: shuffled,
        round: 0,
        totalRounds: 5,
        scores: {},
        ...shuffled[0],
        nextTurn: req.user.id
      };
    } else if (gameType === 'wordle') {
      const words = ['KANE', 'CHAT', 'GLASS', 'REACT', 'MUSIC', 'STORY'];
      initialState = {
        word: words[Math.floor(Math.random() * words.length)],
        guesses: [],
        maxGuesses: 6,
        nextTurn: req.user.id
      };
    } else if (gameType === 'connect4') {
      initialState = {
        board: Array(6).fill(null).map(() => Array(7).fill(null)),
        nextTurn: req.user.id,
        symbols: { [req.user.id]: 'R', [recipientId || 'bot']: 'Y' }
      };
    } else if (gameType === 'numberguess') {
      initialState = {
        secret: Math.floor(Math.random() * 100) + 1,
        guesses: [],
        maxAttempts: 7,
        nextTurn: req.user.id,
        hint: 'Between 1 and 100'
      };
    }

    const session = new GameSession({
      chatId,
      gameType,
      players,
      state: initialState,
      status: 'active'
    });

    await session.save();
    await session.populate('players', 'username profilePicture');

    // Send a message to chat announcing the game
    const message = new Message({
      chatId,
      senderId: req.user.id,
      recipientId,
      content: `🎮 Started a game of ${gameType.toUpperCase()}!`,
      messageType: 'text'
    });
    await message.save();
    await message.populate('senderId', 'username profilePicture');

    const chat = await Chat.findById(chatId);
    if (chat) {
      chat.participants.forEach(p => {
        emitToUser(p.toString(), 'game-started', session.toObject());
        emitToUser(p.toString(), 'receive-message', message.toObject());
      });
    }

    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/games/move - post a move / action to the game session
router.post('/move', auth, async (req, res) => {
  try {
    const { sessionId, moveData } = req.body;
    const session = await GameSession.findById(sessionId);
    if (!session || session.status === 'finished') {
      return res.status(404).json({ message: 'Game session not found or finished' });
    }

    const userId = req.user.id;
    const state = { ...session.state };

    if (session.gameType === 'tictactoe') {
      const { cellIndex } = moveData;
      if (state.board[cellIndex] !== null || state.nextTurn !== userId) {
        return res.status(400).json({ message: 'Invalid move' });
      }

      const symbol = state.symbols[userId];
      state.board[cellIndex] = symbol;

      // Check win condition
      const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
        [0, 4, 8], [2, 4, 6]             // Diag
      ];

      let isWin = false;
      for (const pattern of winPatterns) {
        if (state.board[pattern[0]] === symbol && state.board[pattern[1]] === symbol && state.board[pattern[2]] === symbol) {
          isWin = true;
          break;
        }
      }

      if (isWin) {
        session.status = 'finished';
        session.winner = userId;
        state.winner = userId;
      } else if (state.board.every(cell => cell !== null)) {
        session.status = 'finished';
        state.winner = 'draw';
      } else {
        // Toggle turn
        const otherPlayer = session.players.find(p => p.toString() !== userId);
        state.nextTurn = otherPlayer ? otherPlayer.toString() : userId;
      }
    } else if (session.gameType === 'wordguess') {
      const { letter } = moveData;
      const cleanLetter = letter.toUpperCase();
      if (state.guesses.includes(cleanLetter)) {
        return res.status(400).json({ message: 'Letter already guessed' });
      }

      state.guesses.push(cleanLetter);
      const uniqueLetters = [...new Set(state.word.split(''))];
      const correctGuesses = state.guesses.filter(g => uniqueLetters.includes(g));

      const wrongGuessesCount = state.guesses.length - correctGuesses.length;

      if (uniqueLetters.every(l => state.guesses.includes(l))) {
        session.status = 'finished';
        session.winner = userId;
        state.winner = userId;
      } else if (wrongGuessesCount >= state.maxAttempts) {
        session.status = 'finished';
        state.winner = 'lost';
      }
    } else if (session.gameType === 'truthordare') {
      const { type, prompt } = moveData;
      state.type = type;
      state.prompt = prompt;
      const otherPlayer = session.players.find(p => p.toString() !== userId);
      state.currentTurn = otherPlayer ? otherPlayer.toString() : userId;
    } else if (session.gameType === 'rps') {
      const { choice } = moveData;
      const otherPlayer = session.players.find(p => p.toString() !== userId)?.toString();
      if (!state.player1Choice) state.player1Choice = { userId, choice };
      else if (!state.player2Choice) state.player2Choice = { userId, choice };
      if (state.player1Choice && state.player2Choice) {
        const c1 = state.player1Choice.choice;
        const c2 = state.player2Choice.choice;
        const wins = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
        let roundWinner = null;
        if (c1 === c2) roundWinner = 'draw';
        else if (wins[c1] === c2) roundWinner = state.player1Choice.userId;
        else roundWinner = state.player2Choice.userId;

        if (roundWinner && roundWinner !== 'draw') {
          state.roundWins[roundWinner] = (state.roundWins[roundWinner] || 0) + 1;
        }
        const need = 2;
        const p1w = state.roundWins[state.player1Choice.userId] || 0;
        const p2w = state.roundWins[state.player2Choice.userId] || 0;
        if (p1w >= need || p2w >= need) {
          session.status = 'finished';
          state.winner = p1w >= need ? state.player1Choice.userId : state.player2Choice.userId;
          session.winner = state.winner;
        } else {
          state.player1Choice = null;
          state.player2Choice = null;
          state.round = (state.round || 1) + 1;
        }
      }
    } else if (session.gameType === 'trivia') {
      const { answerIndex } = moveData;
      const correct = answerIndex === state.answer;
      if (correct) state.scores[userId] = (state.scores[userId] || 0) + 1;
      state.round = (state.round || 0) + 1;
      if (state.round >= state.totalRounds) {
        const scores = state.scores || {};
        const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
        session.status = 'finished';
        if (best) {
          state.winner = best[0];
          session.winner = best[0];
        } else {
          state.winner = correct ? userId : 'lost';
          session.winner = correct ? userId : null;
        }
      } else {
        const nextQ = state.questions[state.round];
        state.q = nextQ.q;
        state.options = nextQ.options;
        state.answer = nextQ.answer;
      }
    } else if (session.gameType === 'wordle') {
      const { guess } = moveData;
      const g = (guess || '').toUpperCase().slice(0, 5).padEnd(5, ' ');
      state.guesses.push(g);
      if (g === state.word) {
        session.status = 'finished';
        session.winner = userId;
        state.winner = userId;
      } else if (state.guesses.length >= state.maxGuesses) {
        session.status = 'finished';
        state.winner = 'lost';
        state.reveal = state.word;
      }
    } else if (session.gameType === 'numberguess') {
      const { number } = moveData;
      state.guesses.push(number);
      if (number === state.secret) {
        session.status = 'finished';
        session.winner = userId;
        state.winner = userId;
      } else if (state.guesses.length >= state.maxAttempts) {
        session.status = 'finished';
        state.winner = 'lost';
        state.reveal = state.secret;
      } else {
        state.hint = number < state.secret ? 'Higher!' : 'Lower!';
      }
    }

    session.state = state;
    await session.save();
    await session.populate('players', 'username profilePicture');
    if (session.winner) await session.populate('winner', 'username');

    // Broadcast move to other players
    const chat = await Chat.findById(session.chatId);
    if (chat) {
      chat.participants.forEach(p => {
        emitToUser(p.toString(), 'game-move', session.toObject());
      });

      if (session.status === 'finished') {
        let content = '';
        if (session.winner) {
          content = `🏆 Game Finished: ${session.winner.username} won the ${session.gameType} match!`;
        } else if (state.winner === 'draw') {
          content = `🤝 Game Finished: The ${session.gameType} match ended in a draw!`;
        } else {
          content = `💀 Game Finished: The ${session.gameType} match was lost (Word was: ${state.word})`;
        }

        const systemMessage = new Message({
          chatId: session.chatId,
          senderId: userId,
          content,
          messageType: 'text'
        });
        await systemMessage.save();
        await systemMessage.populate('senderId', 'username profilePicture');

        chat.participants.forEach(p => {
          emitToUser(p.toString(), 'receive-message', systemMessage.toObject());
        });

        const winnerId = session.winner?._id?.toString() || session.winner?.toString();
        if (winnerId) await recordGameStats(winnerId, session.gameType, true);
        await recordGameStats(userId, session.gameType, winnerId === userId);
        await kaneGameReferee(session, chat);
      }
    }

    res.json(session);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/leaderboard', auth, async (req, res) => {
  try {
    const top = await User.find({ isBot: { $ne: true } })
      .select('username profilePicture gameStats snapScore')
      .sort({ 'gameStats.totalWins': -1, snapScore: -1 })
      .limit(15);
    res.json(top);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
