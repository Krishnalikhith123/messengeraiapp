import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FiGrid, FiHelpCircle, FiInfo } from 'react-icons/fi';
import '../styles/Games.css';

function GameMessage({ chatId, currentUserId, socket }) {
  const [session, setSession] = useState(null);
  const [wordLetter, setWordLetter] = useState('');

  const fetchSession = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/games/session/${chatId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSession(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSession();
  }, [chatId]);

  useEffect(() => {
    if (!socket) return;

    const handleGameStarted = (newSession) => {
      if (newSession.chatId === chatId) {
        setSession(newSession);
      }
    };

    const handleGameMove = (updatedSession) => {
      if (updatedSession.chatId === chatId) {
        setSession(updatedSession);
      }
    };

    const onReferee = (data) => {
      if (data.chatId === chatId) toast(`🤖 Kane (#52): ${data.comment}`, { duration: 4500 });
    };

    socket.on('game-started', handleGameStarted);
    socket.on('game-move', handleGameMove);
    socket.on('kane-game-referee', onReferee);

    return () => {
      socket.off('game-started', handleGameStarted);
      socket.off('game-move', handleGameMove);
      socket.off('kane-game-referee', onReferee);
    };
  }, [socket, chatId]);

  const handleStartGame = async (gameType) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/games/start', {
        chatId,
        gameType
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSession(res.data);
      toast.success(`Started a new game of ${gameType}!`);
    } catch (err) {
      toast.error('Failed to start game');
    }
  };

  const handleCellClick = async (cellIndex) => {
    if (!session || session.status !== 'active') return;
    if (session.state.nextTurn !== currentUserId) {
      toast.error("It's not your turn!");
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/games/move', {
        sessionId: session._id,
        moveData: { cellIndex }
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSession(res.data);
      if (socket) {
        socket.emit('game-move', res.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid move');
    }
  };

  const handleWordGuessSubmit = async (e) => {
    e.preventDefault();
    if (!wordLetter || !session) return;
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/games/move', {
        sessionId: session._id,
        moveData: { letter: wordLetter }
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSession(res.data);
      setWordLetter('');
      if (socket) {
        socket.emit('game-move', res.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid guess');
    }
  };

  const handleTruthOrDare = async (type) => {
    const truths = session?.state?.truthDeck || [
      'What is your biggest fear?',
      'Who was your first crush?'
    ];
    const dares = session?.state?.dareDeck || [
      'Send a funny voice message to this chat right now!',
      'Change your mood status to something silly!'
    ];

    const pool = type === 'truth' ? truths : dares;
    const prompt = pool[Math.floor(Math.random() * pool.length)];

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/games/move', {
        sessionId: session._id,
        moveData: { type, prompt }
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setSession(res.data);
      if (socket) {
        socket.emit('game-move', res.data);
      }
    } catch (err) {
      toast.error('Failed to update game state');
    }
  };

  if (!session) {
    return (
      <div className="game-select-card">
        <h4>🎮 In-Chat Mini Games</h4>
        <p>Challenge your friend to a quick match!</p>
        <div className="game-buttons">
          <button onClick={() => handleStartGame('tictactoe')}><FiGrid /> #59 Tic-Tac-Toe</button>
          <button onClick={() => handleStartGame('wordguess')}><FiHelpCircle /> #60 Word Guess</button>
          <button onClick={() => handleStartGame('truthordare')}><FiInfo /> #61 Truth/Dare</button>
          <button onClick={() => handleStartGame('rps')}>✊ #62 RPS Bo3</button>
          <button onClick={() => handleStartGame('trivia')}>🧠 #63 Trivia×5</button>
          <button onClick={() => handleStartGame('wordle')}>🔤 Wordle</button>
        </div>
        <p className="fun-zone-link"><a href="/fun-zone">Open full Fun Zone →</a></p>
      </div>
    );
  }

  return (
    <div className="game-active-card">
      <div className="game-card-header">
        <h4>🎮 {session.gameType.toUpperCase()}</h4>
        <span className={`status-badge ${session.status}`}>{session.status.toUpperCase()}</span>
      </div>

      <div className="game-card-body">
        {session.gameType === 'tictactoe' && (
          <div className="tictactoe-container">
            <div className="tictactoe-board">
              {session.state.board.map((cell, idx) => (
                <button
                  key={idx}
                  className={`tictactoe-cell ${cell || ''}`}
                  disabled={cell !== null || session.status !== 'active'}
                  onClick={() => handleCellClick(idx)}
                >
                  {cell}
                </button>
              ))}
            </div>
            {session.status === 'active' && (
              <p className="game-turn-info">
                {session.state.nextTurn === currentUserId ? "🔴 Your Turn! (X)" : "⏳ Waiting for opponent..."}
              </p>
            )}
          </div>
        )}

        {session.gameType === 'wordguess' && (
          <div className="wordguess-container">
            <div className="word-blanks">
              {session.state.word.split('').map((char, idx) => {
                const guessed = session.state.guesses.includes(char.toUpperCase());
                return (
                  <span key={idx} className="blank-char">
                    {guessed ? char : '_'}
                  </span>
                );
              })}
            </div>
            <p className="guessed-list">Guesses: {session.state.guesses.join(', ') || 'None'}</p>
            <p className="attempts-left">
              Remaining Attempts: {session.state.maxAttempts - (session.state.guesses.length - session.state.guesses.filter(g => session.state.word.toUpperCase().includes(g)).length)}
            </p>

            {session.status === 'active' && (
              <form onSubmit={handleWordGuessSubmit} className="guess-input-form">
                <input
                  type="text"
                  maxLength="1"
                  placeholder="Letter..."
                  value={wordLetter}
                  onChange={(e) => setWordLetter(e.target.value)}
                  required
                />
                <button type="submit">Guess</button>
              </form>
            )}
          </div>
        )}

        {session.gameType === 'rps' && session.status === 'active' && (
          <div className="rps-container">
            <p className="rps-score">
              Round {session.state.round || 1} · Best of {session.state.bestOf || 3}
              {session.state.roundWins && (
                <> · Wins: {JSON.stringify(session.state.roundWins)}</>
              )}
            </p>
            {['rock', 'paper', 'scissors'].map((c) => (
              <button key={c} type="button" onClick={async () => {
                try {
                  const token = localStorage.getItem('token');
                  const res = await axios.post('/api/games/move', { sessionId: session._id, moveData: { choice: c } }, { headers: { Authorization: `Bearer ${token}` } });
                  setSession(res.data);
                  if (socket) socket.emit('game-move', res.data);
                } catch { toast.error('Invalid move'); }
              }}>{c}</button>
            ))}
          </div>
        )}

        {session.gameType === 'trivia' && session.status === 'active' && (
          <div className="trivia-container">
            <p className="trivia-round">
              Round {(session.state.round || 0) + 1} / {session.state.totalRounds || 5}
              {session.state.scores && Object.keys(session.state.scores).length > 0 && (
                <> · Score: {JSON.stringify(session.state.scores)}</>
              )}
            </p>
            <p>{session.state.q}</p>
            {session.state.options?.map((opt, i) => (
              <button key={i} type="button" onClick={async () => {
                try {
                  const token = localStorage.getItem('token');
                  const res = await axios.post('/api/games/move', { sessionId: session._id, moveData: { answerIndex: i } }, { headers: { Authorization: `Bearer ${token}` } });
                  setSession(res.data);
                } catch { toast.error('Wrong!'); }
              }}>{opt}</button>
            ))}
          </div>
        )}

        {session.gameType === 'wordle' && session.status === 'active' && (
          <div className="wordle-container">
            {session.state.guesses?.map((g, i) => <p key={i}>{g}</p>)}
            <form onSubmit={async (e) => {
              e.preventDefault();
              const guess = e.target.guess.value;
              try {
                const token = localStorage.getItem('token');
                const res = await axios.post('/api/games/move', { sessionId: session._id, moveData: { guess } }, { headers: { Authorization: `Bearer ${token}` } });
                setSession(res.data);
                e.target.reset();
              } catch { toast.error('Invalid'); }
            }}>
              <input name="guess" maxLength={5} placeholder="5 letters" required />
              <button type="submit">Guess</button>
            </form>
          </div>
        )}

        {session.gameType === 'numberguess' && session.status === 'active' && (
          <div className="numberguess-container">
            <p>{session.state.hint}</p>
            <p>Guesses: {session.state.guesses?.join(', ')}</p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const number = Number(e.target.num.value);
              try {
                const token = localStorage.getItem('token');
                const res = await axios.post('/api/games/move', { sessionId: session._id, moveData: { number } }, { headers: { Authorization: `Bearer ${token}` } });
                setSession(res.data);
              } catch { toast.error('Invalid'); }
            }}>
              <input name="num" type="number" min={1} max={100} required />
              <button type="submit">Guess</button>
            </form>
          </div>
        )}

        {session.gameType === 'truthordare' && (
          <div className="truthordare-container">
            {session.state.type && (
              <div className="prompt-display">
                <span className={`type-tag ${session.state.type}`}>{session.state.type.toUpperCase()}</span>
                <p className="prompt-text">"{session.state.prompt}"</p>
              </div>
            )}

            {session.status === 'active' && (
              <div className="tod-buttons">
                <button className="truth-btn" onClick={() => handleTruthOrDare('truth')}>Truth</button>
                <button className="dare-btn" onClick={() => handleTruthOrDare('dare')}>Dare</button>
              </div>
            )}
          </div>
        )}

        {session.status === 'finished' && (
          <div className="game-over-section">
            <p className="game-result">
              {session.winner
                ? `🏆 Winner: ${session.winner.username || 'Opponent'}`
                : session.state.winner === 'draw'
                ? "🤝 It's a draw!"
                : "💀 Game Over!"}
            </p>
            <button className="play-again-btn" onClick={() => handleStartGame(session.gameType)}>Play Again</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default GameMessage;
