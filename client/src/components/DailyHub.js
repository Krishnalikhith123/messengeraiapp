import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import './DailyHub.css';

function DailyHub() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('home');
  const [dashboard, setDashboard] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [orderTimeline, setOrderTimeline] = useState([]);
  const [payStats, setPayStats] = useState(null);
  const [feedFilter, setFeedFilter] = useState('All');
  const [bookmarks, setBookmarks] = useState([]);
  const [arcadeStats, setArcadeStats] = useState(null);

  // KanePay States
  const [kanePay, setKanePay] = useState(null);
  const [isKanePaySetupOpen, setIsKanePaySetupOpen] = useState(false);
  const [setupData, setSetupData] = useState({ bankName: '', accountNumber: '', upiId: '', city: '' });
  const [transferTarget, setTransferTarget] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Munchies States
  const [location, setLocation] = useState('');
  const [cart, setCart] = useState([]);
  const [chatsList, setChatsList] = useState([]);
  const [selectedSplitChat, setSelectedSplitChat] = useState('');

  // Daily Scroll Feed
  const [scrollFeed, setScrollFeed] = useState([
    { title: '☀️ Daily Quote', content: '"The only way to do great work is to love what you do." - Steve Jobs', tag: 'Inspiration' }
  ]);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);

  // My Day Wellness States
  const [waterCups, setWaterCups] = useState(() => Number(localStorage.getItem(`water_cups_${user?.id}`)) || 0);
  const [gymDone, setGymDone] = useState(() => localStorage.getItem(`gym_${user?.id}`) === 'true');
  const [customHabits, setCustomHabits] = useState(() => {
    const saved = localStorage.getItem(`custom_habits_${user?.id}`);
    return saved ? JSON.parse(saved) : [{ id: 1, name: 'Meditation', done: false }];
  });
  const [newHabitName, setNewHabitName] = useState('');
  const [userMood, setUserMood] = useState('');
  const [moodAdvice, setMoodAdvice] = useState('');
  const [checklist, setChecklist] = useState([
    { id: 1, text: 'Log water intake', done: false }
  ]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Arcade States
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [arcadeStatus, setArcadeStatus] = useState('Your turn! Play X');
  const [kaneComment, setKaneComment] = useState('Show me what you got.');
  // Space Kane Space Shooter states
  const [isSpaceActive, setIsSpaceActive] = useState(false);
  const [spaceScore, setSpaceScore] = useState(0);
  const [spaceHighScore, setSpaceHighScore] = useState(() => Number(localStorage.getItem(`space_kane_high_${user?.id}`)) || 0);
  const [spaceGameOver, setSpaceGameOver] = useState(false);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [hubWordle] = useState(() => {
    const words = ['KANE', 'PLAY', 'MUSIC', 'CHAT', 'FUN'];
    return words[Math.floor(Math.random() * words.length)];
  });
  const [hubWordleGuesses, setHubWordleGuesses] = useState([]);
  const [hubTrivia] = useState({
    q: 'What powers real-time chat in ChatFlow?',
    options: ['Email', 'Socket.IO', 'FTP', 'SMS'],
    answer: 1
  });

  const loadHubData = async () => {
    try {
      const [dashRes, restRes, wellnessRes, arcadeRes, ordersRes, bmRes] = await Promise.all([
        axios.get('/api/daily-hub/dashboard'),
        axios.get('/api/daily-hub/munchies/restaurants'),
        axios.get('/api/daily-hub/wellness'),
        axios.get('/api/daily-hub/arcade/stats'),
        axios.get('/api/daily-hub/munchies/orders'),
        axios.get('/api/daily-hub/feed/bookmarks')
      ]);
      setDashboard(dashRes.data);
      setRestaurants(restRes.data);
      if (restRes.data?.[0]) {
        setSelectedRestaurant(restRes.data[0]);
        const menuRes = await axios.get(`/api/daily-hub/munchies/menu?restaurantId=${restRes.data[0].id}`);
        setMenuItems(menuRes.data);
      }
      const w = wellnessRes.data;
      if (w.waterCups) setWaterCups(w.waterCups);
      if (w.gymDone) setGymDone(w.gymDone);
      if (w.customHabits?.length) setCustomHabits(w.customHabits);
      if (w.checklist?.length) setChecklist(w.checklist);
      if (w.mood) setUserMood(w.mood);
      setArcadeStats(arcadeRes.data);
      setLeaderboard(arcadeRes.data?.leaderboard || []);
      if (ordersRes.data?.[0]?.status !== 'delivered') setActiveOrder(ordersRes.data[0]);
      setBookmarks(bmRes.data || []);
    } catch (e) {
      console.error('Hub load', e);
    }
  };

  useEffect(() => {
    fetchWallet();
    fetchChats();
    loadHubData();
    axios.get('/api/games/leaderboard').then((r) => setLeaderboard(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeOrder?._id) return;
    const poll = setInterval(async () => {
      try {
        const res = await axios.get(`/api/daily-hub/munchies/orders/${activeOrder._id}/track`);
        setActiveOrder(res.data.order);
        setOrderTimeline(res.data.timeline || []);
        if (res.data.order.status === 'delivered') clearInterval(poll);
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(poll);
  }, [activeOrder?._id]);

  useEffect(() => {
    if (activeTab === 'kanepay' && kanePay?.isSetup) {
      axios.get('/api/daily-hub/kanepay/stats').then((r) => setPayStats(r.data)).catch(() => {});
    }
  }, [activeTab, kanePay?.isSetup]);

  const selectRestaurant = async (r) => {
    setSelectedRestaurant(r);
    const res = await axios.get(`/api/daily-hub/munchies/menu?restaurantId=${r.id}`);
    setMenuItems(res.data);
  };

  const syncWellness = async (patch) => {
    try {
      const res = await axios.put('/api/daily-hub/wellness', {
        waterCups,
        gymDone,
        customHabits,
        checklist,
        mood: userMood,
        moodEmoji: patch?.moodEmoji,
        ...patch
      });
      return res.data;
    } catch { return null; }
  };

  const handleMoodCheckIn = async (emoji, label) => {
    setUserMood(label);
    try {
      const res = await axios.post('/api/daily-hub/wellness/mood-advice', { mood: label, moodEmoji: emoji });
      setMoodAdvice(res.data.advice);
      await syncWellness({ mood: label, moodEmoji: emoji });
      toast.success('Mood logged (#106)');
    } catch {
      toast.error('Could not get mood advice');
    }
  };

  const saveBookmark = async (item) => {
    try {
      const res = await axios.post('/api/daily-hub/feed/bookmarks', item);
      setBookmarks((b) => [res.data, ...b]);
      toast.success('Saved to bookmarks');
    } catch { toast.error('Save failed'); }
  };

  const fetchWallet = async () => {
    try {
      const res = await axios.get('/api/users/kanepay/wallet');
      setKanePay(res.data.kanePay);
    } catch (err) {
      if (err.response?.status !== 404) console.error('Failed to fetch wallet', err);
    }
  };

  const fetchChats = async () => {
    try {
      const res = await axios.get('/api/chats');
      setChatsList(res.data);
    } catch (err) { console.error(err); }
  };

  // --- KANEPAY LOGIC ---
  const handleSetupKanePay = async () => {
    try {
      const res = await axios.post('/api/users/kanepay/setup', setupData);
      setKanePay(res.data.kanePay);
      setIsKanePaySetupOpen(false);
      toast.success(res.data.message);
    } catch (err) { toast.error(err.response?.data?.message || 'Setup failed'); }
  };

  const handleSearchUsers = async (e) => {
    const q = e.target.value;
    setTransferTarget(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await axios.get(`/api/users/kanepay/search/${q}`);
      setSearchResults(res.data);
    } catch (err) { console.error(err); }
  };

  const selectTransferTarget = (username) => {
    setTransferTarget(username);
    setSearchResults([]);
  };

  const handleTransfer = async () => {
    try {
      const res = await axios.post('/api/users/kanepay/transfer', {
        recipientUsername: transferTarget,
        amountINR: transferAmount,
        note: transferNote
      });
      toast.success(res.data.message);
      fetchWallet();
      setTransferTarget(''); setTransferAmount(''); setTransferNote('');
    } catch (err) { toast.error(err.response?.data?.message || 'Transfer failed'); }
  };

  // --- MUNCHIES LOGIC ---
  const addToCart = (item) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === item.id);
      if (ex) return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...item, qty: 1 }];
    });
    toast.success(`${item.name} added!`);
  };

  const getCartTotal = () => cart.reduce((s, i) => s + (i.price * i.qty), 0);

  const handleCheckout = async () => {
    const subtotal = getCartTotal();
    if (subtotal === 0) return;
    if (!kanePay?.isSetup) return toast.error('Setup KanePay first (#103)!');

    try {
      const res = await axios.post('/api/daily-hub/munchies/order', {
        items: cart,
        restaurantName: selectedRestaurant?.name,
        restaurantId: selectedRestaurant?.id,
        deliveryLocation: location,
        splitChatId: selectedSplitChat || undefined
      });
      setKanePay((prev) => ({ ...prev, balanceINR: res.data.newBalance }));
      setActiveOrder(res.data.order);
      const trackRes = await axios.get(`/api/daily-hub/munchies/orders/${res.data.order._id}/track`);
      setOrderTimeline(trackRes.data.timeline || []);
      toast.success(`Order placed! ETA ~${res.data.order.etaMinutes} min (#104)`);
      if (res.data.splitMessage) toast.success('Split bill posted to group chat!');
      setCart([]);
      setSelectedSplitChat('');
      loadHubData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Checkout failed');
    }
  };

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(() => {
        setLocation('HSR Layout, Bangalore (Detected)');
      }, () => toast.error('Location denied'));
    }
  };

  // --- NEWS FEED LOGIC ---
  const handleRefreshFeed = async () => {
    setIsRefreshingFeed(true);
    try {
      const res = await axios.get('/api/messages/daily-feed');
      const feed = res.data.feed;

      if (feed && Array.isArray(feed) && feed.length > 0) {
        setScrollFeed(feed);
        toast.success('📰 Feed refreshed');
      } else {
        setScrollFeed([{ title: 'No items', content: 'No news could be retrieved.', tag: 'Info' }]);
      }
    } catch (e) {
      console.error('Feed fetch/parse error:', e);
      toast.error('Failed to parse news feed. Try again.');
    } finally {
      setIsRefreshingFeed(false);
    }
  };

  // Auto‑fetch the feed the first time the user opens the "scroll" tab
  useEffect(() => {
    if (activeTab === 'scroll' && scrollFeed.length <= 1) {
      handleRefreshFeed();
    }
  }, [activeTab]);

  // --- WELLNESS & VOICE LOGIC ---
  const speak = (text) => {
    const u = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(u);
  };

  const startVoiceCommand = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      return toast.error('Voice not supported in this browser.');
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (e) => {
      const cmd = e.results[0][0].transcript.toLowerCase();
      toast.success(`Heard: "${cmd}"`);
      
      if (cmd.includes('water')) {
        setWaterCups(c => {
          const nc = c + 1;
          localStorage.setItem(`water_cups_${user?.id}`, nc);
          syncWellness({ waterCups: nc });
          return nc;
        });
        speak('Logged one glass of water. Keep hydrating!');
      } else if (cmd.includes('gym') || cmd.includes('workout')) {
        setGymDone(true); localStorage.setItem(`gym_${user?.id}`, 'true');
        speak('Great job crushing that workout!');
      } else if (cmd.includes('add task')) {
        const task = cmd.replace('add task', '').trim();
        if (task) {
          setChecklist(p => [...p, { id: Date.now(), text: task, done: false }]);
          speak(`Added task: ${task}`);
        }
      } else if (cmd.includes('finished')) {
        const taskToFinish = cmd.replace('i finished', '').replace('finished', '').trim();
        setChecklist(p => p.map(item => {
           if(item.text.toLowerCase().includes(taskToFinish)) {
               speak(`Checked off ${item.text}`);
               return {...item, done: true};
           }
           return item;
        }));
      } else {
        speak('I did not understand that command.');
      }
    };
    recognition.start();
  };

  // --- ARCADE LOGIC ---
  const checkWinner = (sq) => {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (let l of lines) {
      if (sq[l[0]] && sq[l[0]] === sq[l[1]] && sq[l[0]] === sq[l[2]]) return sq[l[0]];
    }
    return sq.includes(null) ? null : 'T';
  };

  const handleCellClick = (idx) => {
    if (board[idx] || !isPlayerTurn || checkWinner(board)) return;
    const nb = [...board]; nb[idx] = 'X';
    setBoard(nb); setIsPlayerTurn(false);
    
    const w = checkWinner(nb);
    if (w) {
      setArcadeStatus(w === 'X' ? 'You Won!' : w === 'T' ? 'Draw!' : 'Kane Won!');
      if (w === 'X') axios.post('/api/daily-hub/arcade/score', { game: 'tictactoe', won: true }).catch(() => {});
      return;
    }

    setArcadeStatus('Kane is thinking...');
    setTimeout(() => {
      const empty = nb.map((v, i) => v === null ? i : null).filter(v => v !== null);
      if(empty.length > 0) {
        nb[empty[Math.floor(Math.random()*empty.length)]] = 'O';
        setBoard(nb);
        const nw = checkWinner(nb);
        if(nw) setArcadeStatus(nw==='O'?'Kane Won!':nw==='T'?'Draw!':'Error');
        else { setIsPlayerTurn(true); setArcadeStatus('Your turn! Play X'); setKaneComment('Is that your best move?'); }
      }
    }, 600);
  };
  
  const resetTicTacToe = () => { setBoard(Array(9).fill(null)); setIsPlayerTurn(true); setArcadeStatus('Your turn!'); };

  // Space Kane Canvas Engine
  const canvasRef = useRef(null);

  const claimSpaceKaneReward = async (score) => {
    try {
      const res = await axios.post('/api/daily-hub/arcade/score', { game: 'space', score, won: false });
      if (res.data.rewardGranted) {
        toast.success(`🚀 ₹${res.data.rewardGranted.amount} arcade reward credited! (#107)`, { duration: 6000 });
        fetchWallet();
      }
      setArcadeStats((s) => ({ ...s, myStats: res.data.arcadeHub }));
    } catch (err) {
      console.error(err);
      toast.error('Failed to claim arcade reward.');
    }
  };

  useEffect(() => {
    if (spaceGameOver) {
      if (spaceScore > spaceHighScore) {
        setSpaceHighScore(spaceScore);
        localStorage.setItem(`space_kane_high_${user?.id}`, spaceScore.toString());
      }
      if (spaceScore >= 100 && !rewardClaimed) {
        setRewardClaimed(true);
        claimSpaceKaneReward(spaceScore);
      }
    }
  }, [spaceGameOver]);

  useEffect(() => {
    if (!isSpaceActive || spaceGameOver) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animationId;
    let shipX = canvas.width / 2 - 15;
    const shipY = canvas.height - 30;
    const shipWidth = 30;
    const shipHeight = 20;

    let keys = {};
    let lasers = [];
    let aliens = [];
    let particles = [];
    let localScore = 0;
    let spawnTimer = 0;
    const spawnInterval = 50;

    const handleKeyDownPress = (e) => {
      keys[e.key] = true;
      if (e.key === ' ' || e.key === 'Spacebar') {
        lasers.push({ x: shipX + shipWidth / 2, y: shipY, radius: 3, speed: 7 });
        e.preventDefault();
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault();
      }
    };

    const handleKeyUpPress = (e) => {
      keys[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDownPress);
    window.addEventListener('keyup', handleKeyUpPress);

    let stars = [];
    for (let i = 0; i < 30; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: 0.5 + Math.random() * 1.5,
        size: 1 + Math.random()
      });
    }

    const gameLoop = () => {
      if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
        shipX = Math.max(0, shipX - 5);
      }
      if (keys['ArrowRight'] || keys['d'] || keys['D']) {
        shipX = Math.min(canvas.width - shipWidth, shipX + 5);
      }

      stars.forEach(star => {
        star.y += star.speed;
        if (star.y > canvas.height) {
          star.y = 0;
          star.x = Math.random() * canvas.width;
        }
      });

      lasers.forEach((laser, idx) => {
        laser.y -= laser.speed;
        if (laser.y < 0) lasers.splice(idx, 1);
      });

      spawnTimer++;
      if (spawnTimer >= spawnInterval) {
        spawnTimer = 0;
        aliens.push({
          x: 15 + Math.random() * (canvas.width - 40),
          y: -20,
          width: 24,
          height: 18,
          speed: 1.2 + Math.random() * 1.5
        });
      }

      aliens.forEach((alien, aIdx) => {
        alien.y += alien.speed;

        if (
          alien.y + alien.height >= shipY &&
          alien.x + alien.width >= shipX &&
          alien.x <= shipX + shipWidth
        ) {
          setSpaceGameOver(true);
          setIsSpaceActive(false);
        }

        if (alien.y > canvas.height) {
          setSpaceGameOver(true);
          setIsSpaceActive(false);
        }
      });

      lasers.forEach((laser, lIdx) => {
        aliens.forEach((alien, aIdx) => {
          const dist = Math.hypot(laser.x - (alien.x + alien.width / 2), laser.y - (alien.y + alien.height / 2));
          if (dist < 16) {
            for (let i = 0; i < 8; i++) {
              particles.push({
                x: alien.x + alien.width / 2,
                y: alien.y + alien.height / 2,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                alpha: 1,
                color: '#f43f5e'
              });
            }
            aliens.splice(aIdx, 1);
            lasers.splice(lIdx, 1);
            localScore += 10;
            setSpaceScore(localScore);
          }
        });
      });

      particles.forEach((p, idx) => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.025;
        if (p.alpha <= 0) particles.splice(idx, 1);
      });

      ctx.fillStyle = '#060814';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      stars.forEach(star => {
        ctx.fillRect(star.x, star.y, star.size, star.size);
      });

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(shipX + shipWidth / 2, shipY);
      ctx.lineTo(shipX, shipY + shipHeight);
      ctx.lineTo(shipX + shipWidth, shipY + shipHeight);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f43f5e';
      lasers.forEach(laser => {
        ctx.beginPath();
        ctx.arc(laser.x, laser.y, laser.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.fillStyle = '#c084fc';
      aliens.forEach(alien => {
        ctx.fillRect(alien.x, alien.y, alien.width, alien.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(alien.x + 4, alien.y + 4, 3, 3);
        ctx.fillRect(alien.x + alien.width - 7, alien.y + 4, 3, 3);
        ctx.fillStyle = '#c084fc';
      });

      particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 3, 3);
        ctx.restore();
      });

      animationId = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('keydown', handleKeyDownPress);
      window.removeEventListener('keyup', handleKeyUpPress);
    };
  }, [isSpaceActive, spaceGameOver]);

  const startSpaceGame = () => {
    setSpaceScore(0);
    setSpaceGameOver(false);
    setRewardClaimed(false);
    setIsSpaceActive(true);
  };

  return (
    <div className="daily-hub-container">
      <div className="daily-hub-header">
        <div className="hub-brand">
          <span className="hub-badge-icon">🌟</span>
          <div>
            <h2>Daily Life Companion Hub</h2>
            <p>Food delivery, payments, news, and wellness assistant.</p>
          </div>
        </div>
        <div className="wallet-quick-status" onClick={() => setActiveTab('kanepay')}>
          <span>💳 KanePay Balance</span>
          <strong>₹{kanePay?.balanceINR?.toFixed(2) || '0.00'}</strong>
        </div>
      </div>

      <div className="daily-hub-body">
        <div className="daily-hub-sidebar">
          <button className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}>🏠 Hub Home</button>
          <button className={activeTab === 'munchies' ? 'active' : ''} onClick={() => setActiveTab('munchies')}>🍔 Munchies</button>
          <button className={activeTab === 'kanepay' ? 'active' : ''} onClick={() => setActiveTab('kanepay')}>💳 KanePay</button>
          <button className={activeTab === 'scroll' ? 'active' : ''} onClick={() => setActiveTab('scroll')}>📰 Daily Scroll</button>
          <button className={activeTab === 'myday' ? 'active' : ''} onClick={() => setActiveTab('myday')}>🧘 Wellness</button>
          <button className={activeTab === 'arcade' ? 'active' : ''} onClick={() => setActiveTab('arcade')}>🎮 Arcade</button>
        </div>

        <div className="daily-hub-content-view">

          {activeTab === 'home' && dashboard && (
            <div className="hub-home-pane">
              <div className="pane-header">
                <h3>{dashboard.greeting}, {dashboard.user?.username}!</h3>
                <p>Your Daily Life Companion — food, pay, news, wellness & games in one place.</p>
              </div>
              <div className="hub-home-grid">
                <div className="hub-stat-card"><span>💳 Balance</span><strong>₹{dashboard.balance?.toFixed(0)}</strong></div>
                <div className="hub-stat-card"><span>💧 Water today</span><strong>{dashboard.waterToday}/8</strong></div>
                <div className="hub-stat-card"><span>🔥 Wellness streak</span><strong>{dashboard.wellnessStreak}d</strong></div>
                <div className="hub-stat-card"><span>🚀 Arcade best</span><strong>{dashboard.arcadeHighScore}</strong></div>
                <div className="hub-stat-card"><span>🏆 Game wins</span><strong>{dashboard.gameWins}</strong></div>
                <div className="hub-stat-card"><span>📌 Saved articles</span><strong>{dashboard.feedBookmarks}</strong></div>
              </div>
              <div className="hub-quick-actions">
                {dashboard.quickActions?.map((a) => (
                  <button key={a.tab} type="button" onClick={() => setActiveTab(a.tab)}>{a.icon} {a.label}</button>
                ))}
              </div>
              {dashboard.recentOrders?.length > 0 && (
                <div className="glass-panel" style={{ marginTop: 20 }}>
                  <h4>Recent orders</h4>
                  {dashboard.recentOrders.map((o) => (
                    <p key={o._id}>{o.restaurantName} — ₹{o.total} · {o.status}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MUNCHIES TAB */}
          {activeTab === 'munchies' && (
            <div className="munchies-store-pane">
              <div className="pane-header flex-between">
                <div>
                  <h3>🍔 Munchies Store</h3>
                  <p>Restaurant menus, KanePay checkout & group split bills in chat.</p>
                </div>
                <div className="location-picker">
                  <input type="text" value={location} onChange={e=>setLocation(e.target.value)} placeholder="Enter delivery location..." />
                  <button onClick={handleGetLocation}>📍 GPS</button>
                </div>
              </div>

              <h4>Popular Restaurants Nearby</h4>
              <div className="restaurant-grid">
                {restaurants.map(r => (
                  <div
                    key={r.id}
                    className={`restaurant-card ${selectedRestaurant?.id === r.id ? 'selected' : ''}`}
                    onClick={() => selectRestaurant(r)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && selectRestaurant(r)}
                  >
                    <div className="r-icon">{r.icon}</div>
                    <div className="r-info">
                      <h5>{r.name}</h5>
                      <span>⭐ {r.rating} | {r.time} | ₹{r.min} min · fee ₹{r.deliveryFee}</span>
                    </div>
                  </div>
                ))}
              </div>

              {activeOrder && activeOrder.status !== 'delivered' && (
                <div className="order-track-card glass-panel">
                  <h4>📦 Live order — {activeOrder.restaurantName}</h4>
                  <p>Total ₹{activeOrder.total} · {activeOrder.status.replace(/_/g, ' ')}</p>
                  {orderTimeline.map((step) => (
                    <div key={step.status} className={`track-step ${step.done ? 'done' : ''} ${step.active ? 'active' : ''}`}>
                      <span className="track-dot" />
                      <span>{step.label}</span>
                    </div>
                  ))}
                </div>
              )}

              <h4 style={{marginTop:'20px'}}>Featured Menu Items</h4>
              <div className="menu-grid">
                {menuItems.map(item => (
                  <div key={item.id} className="menu-item-card">
                    <span className="item-art">{item.icon}</span>
                    <span className={item.veg ? 'veg-dot' : 'non-veg-dot'}>●</span>
                    <h4>{item.name}</h4>
                    <div className="item-action-row">
                      <strong>₹{item.price}</strong>
                      <button onClick={() => addToCart(item)}>Add</button>
                    </div>
                  </div>
                ))}
              </div>

              {cart.length > 0 && (
                <div className="cart-checkout-panel glass-panel">
                  <h4>🛒 Subtotal ₹{getCartTotal()} + delivery ₹{selectedRestaurant?.deliveryFee || 29}</h4>
                  <div className="split-config-row">
                    <label>💸 Split bill in group (#104):</label>
                    <select value={selectedSplitChat} onChange={(e) => setSelectedSplitChat(e.target.value)}>
                      <option value="">No split</option>
                      {chatsList.filter((c) => c.isGroupChat).map((c) => (
                        <option key={c._id} value={c._id}>{c.groupName || 'Group'}</option>
                      ))}
                    </select>
                  </div>
                  <button className="cart-checkout-btn" type="button" onClick={handleCheckout}>
                    Pay ₹{getCartTotal() + (selectedRestaurant?.deliveryFee || 29)} via KanePay
                  </button>
                </div>
              )}
            </div>
          )}

          {/* KANEPAY TAB */}
          {activeTab === 'kanepay' && (
            <div className="kanepay-wallet-pane">
              <div className="pane-header">
                <h3>💳 KanePay Digital Wallet</h3>
                <p>Real-time P2P transfers, spending insights & UPI QR.</p>
              </div>

              {!kanePay?.isSetup ? (
                <div className="kanepay-setup-card glass-panel">
                  <h4>Activate KanePay Wallet</h4>
                  <input type="text" placeholder="Bank Name" value={setupData.bankName} onChange={e=>setSetupData({...setupData, bankName: e.target.value})} />
                  <input type="text" placeholder="Account Number" value={setupData.accountNumber} onChange={e=>setSetupData({...setupData, accountNumber: e.target.value})} />
                  <input type="text" placeholder="UPI ID (e.g. name@okbank)" value={setupData.upiId} onChange={e=>setSetupData({...setupData, upiId: e.target.value})} />
                  <button onClick={handleSetupKanePay}>Activate & Get ₹5000 Bonus</button>
                </div>
              ) : (
                <div className="kanepay-dashboard">
                  {payStats && (
                    <div className="kanepay-stats-row">
                      <div className="hub-stat-card"><span>Spent</span><strong>₹{payStats.totalDebits?.toFixed(0)}</strong></div>
                      <div className="hub-stat-card"><span>Received</span><strong>₹{payStats.totalCredits?.toFixed(0)}</strong></div>
                      <div className="hub-stat-card"><span>Txns</span><strong>{payStats.transactionCount}</strong></div>
                      <div className="qr-box" title={payStats.qrPayload}>QR<br />{payStats.upiId?.slice(0, 12)}</div>
                    </div>
                  )}
                  {payStats?.spendingByCategory?.map((cat) => (
                    <div key={cat.name} style={{ marginBottom: 10 }}>
                      <div className="flex-between"><span>{cat.name}</span><span>₹{cat.amount}</span></div>
                      <div className="spend-bar"><div className="spend-bar-fill" style={{ width: `${Math.min(100, (cat.amount / (payStats.totalDebits || 1)) * 100)}%` }} /></div>
                    </div>
                  ))}
                  <div className="wallet-card-grid">
                    <div className="visual-credit-card">
                      <div className="card-top"><span>KanePay UPI</span><span>⚡</span></div>
                      <div className="card-num">{kanePay.upiId}</div>
                      <div className="card-holder">
                        <div><span className="card-lbl">BANK</span><span className="card-val">{kanePay.bankName}</span></div>
                        <div><span className="card-lbl">BALANCE</span><span className="card-val">₹{kanePay.balanceINR.toFixed(2)}</span></div>
                      </div>
                    </div>
                  </div>

                  <div className="send-money-card glass-panel" style={{marginTop:'20px'}}>
                    <h4>💸 Send Money (Real-time DB Transfer)</h4>
                    <div style={{position:'relative'}}>
                      <input type="text" placeholder="Search Username..." value={transferTarget} onChange={handleSearchUsers} />
                      {searchResults.length > 0 && (
                        <div className="search-dropdown">
                          {searchResults.map(u => (
                            <div key={u._id} onClick={() => selectTransferTarget(u.username)}>@{u.username} ({u.kanePay?.upiId || 'Not Set Up'})</div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{display:'flex', gap:'10px', marginTop:'10px'}}>
                      <input type="number" placeholder="Amount ₹" value={transferAmount} onChange={e=>setTransferAmount(e.target.value)} />
                      <input type="text" placeholder="Add a note" value={transferNote} onChange={e=>setTransferNote(e.target.value)} />
                      <button onClick={handleTransfer}>Send</button>
                    </div>
                  </div>

                  <div className="wallet-tx-logs" style={{marginTop:'20px'}}>
                    <h4>🧾 Recent Transactions</h4>
                    <div className="tx-list">
                      {kanePay.transactions.map((tx, idx) => (
                        <div key={idx} className="tx-row">
                          <div><strong>{tx.description}</strong><span className="tx-date">{new Date(tx.date).toLocaleString()}</span></div>
                          <span className={`tx-amt ${tx.type}`}>{tx.type==='credit'?'+':'-'}₹{tx.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DAILY SCROLL #105 */}
          {activeTab === 'scroll' && (
            <div className="scroll-pane">
              <div className="pane-header flex-between">
                <div>
                  <h3>📰 Daily Scroll</h3>
                  <p>AI-powered motivation, world news & sports — save favorites.</p>
                </div>
                <button type="button" onClick={handleRefreshFeed} disabled={isRefreshingFeed}>
                  {isRefreshingFeed ? 'Refreshing…' : '🔄 Refresh feed'}
                </button>
              </div>
              <div className="feed-filters">
                {['All', 'Motivation', 'World News', 'Sports'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={feedFilter === tag ? 'active' : ''}
                    onClick={() => setFeedFilter(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              {scrollFeed
                .filter((item) => feedFilter === 'All' || item.tag === feedFilter)
                .map((item, idx) => (
                  <div key={idx} className="scroll-card glass-panel">
                    <span className="card-tag">{item.tag}</span>
                    <h4>{item.title}</h4>
                    <p>{item.content}</p>
                    <div className="scroll-card-actions">
                      <button type="button" onClick={() => saveBookmark(item)}>📌 Save</button>
                    </div>
                  </div>
                ))}
              {bookmarks.length > 0 && (
                <div className="glass-panel" style={{ marginTop: 24 }}>
                  <h4>📌 Your bookmarks</h4>
                  {bookmarks.slice(0, 8).map((b) => (
                    <p key={b._id}><strong>{b.title}</strong> — {b.tag}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* WELLNESS & VOICE TAB */}
          {activeTab === 'myday' && (
            <div className="myday-pane">
              <div className="pane-header flex-between">
                <div><h3>🧘 Wellness & Voice</h3><p>Mood check-in, habits, voice commands & AI advice.</p></div>
                <button onClick={startVoiceCommand} className={`voice-btn ${isListening ? 'listening' : ''}`}>
                  {isListening ? '🎙️ Listening...' : '🎤 Tap to Speak'}
                </button>
              </div>

              <div className="glass-panel" style={{ marginBottom: 16 }}>
                <h4>How are you feeling?</h4>
                <div className="mood-picker">
                  {[
                    { emoji: '😊', label: 'Great' },
                    { emoji: '😌', label: 'Calm' },
                    { emoji: '😴', label: 'Tired' },
                    { emoji: '😤', label: 'Stressed' },
                    { emoji: '🔥', label: 'Motivated' }
                  ].map((m) => (
                    <button key={m.label} type="button" onClick={() => handleMoodCheckIn(m.emoji, m.label)}>
                      {m.emoji} {m.label}
                    </button>
                  ))}
                </div>
                {moodAdvice && <div className="mood-advice-box">🤖 Kane: {moodAdvice}</div>}
              </div>

              <div className="myday-grid" style={{display:'flex', gap:'20px'}}>
                <div className="wellness-left glass-panel" style={{flex:1}}>
                  <h4>Habit Tracker</h4>
                  <div className="habit-row"><span>💧 Water (8 glasses)</span><strong>{waterCups}/8</strong></div>
                  <div className="habit-row"><span>🏋️ Gym Session</span><strong>{gymDone ? '✅ Done' : '❌ Pending'}</strong></div>
                  {customHabits.map(h => (
                    <div key={h.id} className="habit-row">
                      <span>📌 {h.name}</span>
                      <input type="checkbox" checked={h.done} onChange={() => {
                        const nc = customHabits.map(x => x.id===h.id ? {...x, done:!x.done} : x);
                        setCustomHabits(nc);
                        localStorage.setItem(`custom_habits_${user?.id}`, JSON.stringify(nc));
                      }}/>
                    </div>
                  ))}
                  <div style={{display:'flex', gap:'5px', marginTop:'10px'}}>
                    <input type="text" value={newHabitName} onChange={e=>setNewHabitName(e.target.value)} placeholder="Add fixed habit..." />
                    <button onClick={() => {
                      if(!newHabitName) return;
                      const nh = [...customHabits, {id: Date.now(), name: newHabitName, done: false}];
                      setCustomHabits(nh);
                      localStorage.setItem(`custom_habits_${user?.id}`, JSON.stringify(nh));
                      setNewHabitName('');
                    }}>Add</button>
                  </div>
                </div>

                <div className="planner-right glass-panel" style={{flex:1}}>
                  <h4>📋 To-Do List</h4>
                  <div style={{display:'flex', gap:'6px', marginBottom:'10px'}}>
                    <input type="text" value={newChecklistItem} onChange={e=>setNewChecklistItem(e.target.value)} placeholder="New task..." />
                    <button onClick={() => { if(newChecklistItem.trim()) { setChecklist(p => [...p, {id:Date.now(), text:newChecklistItem, done:false}]); setNewChecklistItem(''); } }}>Add</button>
                  </div>
                  {checklist.map(item => (
                    <div key={item.id} style={{display:'flex', gap:'10px', opacity:item.done?0.5:1}}>
                      <input type="checkbox" checked={item.done} onChange={() => setChecklist(p => p.map(i => i.id===item.id ? {...i, done:!i.done} : i))} />
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{marginTop:'15px', fontSize:'12px', color:'#94a3b8'}}>
                <strong>Voice commands:</strong> "Add task buy milk", "I finished buy milk", "Log water", "I finished gym".
              </div>
            </div>
          )}

          {/* ARCADE TAB */}
          {activeTab === 'arcade' && (
             <div className="arcade-pane" style={{outline:'none'}}>
               <div className="pane-header">
                 <h3>🎮 TimePass Arcade</h3>
                 <p>Games vs Kane, leaderboard & KanePay rewards for high scores.</p>
                 {arcadeStats?.myStats && (
                   <p style={{ fontSize: 13, color: '#94a3b8' }}>
                     Space best: {arcadeStats.myStats.spaceHighScore} · TTT wins: {arcadeStats.myStats.tictactoeWins}
                   </p>
                 )}
               </div>
               
               <div style={{display:'flex', gap:'20px', flexWrap:'wrap'}}>
                 {/* Tic Tac Toe */}
                 <div className="glass-panel" style={{flex:'1 1 300px', minWidth:'280px'}}>
                   <h4>Tic-Tac-Toe vs Kane</h4>
                   <div style={{marginBottom:'10px', color:'#f59e0b'}}>{arcadeStatus}</div>
                   <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'5px', width:'150px', margin:'0 auto'}}>
                     {board.map((c, i) => (
                       <button key={i} onClick={()=>handleCellClick(i)} style={{height:'50px', background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', fontSize:'20px', cursor:'pointer'}}>{c}</button>
                     ))}
                   </div>
                   <div style={{marginTop:'15px', padding:'10px', background:'rgba(0,0,0,0.3)', borderRadius:'8px'}}>
                     <strong>🤖 Kane:</strong> "{kaneComment}"
                   </div>
                   <button onClick={resetTicTacToe} style={{marginTop:'10px', width:'100%', padding:'8px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:'5px'}}>Reset</button>
                 </div>

                 {/* Space Kane */}
                 <div className="glass-panel space-kane-card" style={{flex:'1 1 300px', minWidth:'280px'}}>
                   <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                     <h4>🚀 Space Kane Retro Shooter</h4>
                     <div style={{fontSize:'12px', color:'#94a3b8'}}>High Score: <strong>{spaceHighScore}</strong></div>
                   </div>
                   <div style={{marginBottom:'10px', display:'flex', justifyContent:'space-between', fontSize:'13px'}}>
                     <span>Score: <strong style={{color:'#f43f5e'}}>{spaceScore}</strong></span>
                     <span style={{color: '#a855f7'}}>Milestone: <strong>100 pts (₹250 Cash)</strong></span>
                   </div>
                   <div style={{position:'relative', width:'300px', height:'300px', margin:'0 auto', overflow:'hidden', borderRadius:'12px', border:'2px solid rgba(255,255,255,0.1)'}}>
                     <canvas
                       ref={canvasRef}
                       width={300}
                       height={300}
                       style={{ display: 'block', background: '#060814' }}
                     />
                     {!isSpaceActive && (
                       <div className="space-kane-overlay" style={{position:'absolute', top:0, left:0, width:'100%', height:'100%', background:'rgba(6, 8, 20, 0.85)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'12px', zIndex:10}}>
                         <span style={{fontSize:'28px'}}>🚀</span>
                         <h5 style={{margin:0, fontSize:'16px', fontWeight:800}}>SPACE KANE INVASION</h5>
                         {spaceGameOver && (
                           <div style={{textAlign:'center', color:'#f43f5e'}}>
                             <p style={{margin:0, fontWeight:700}}>GAME OVER</p>
                             <p style={{margin:'4px 0 0 0', fontSize:'12px', color:'#94a3b8'}}>Final Score: {spaceScore}</p>
                           </div>
                         )}
                         <button 
                           onClick={startSpaceGame} 
                           style={{padding:'10px 24px', background:'linear-gradient(135deg, #06b6d4, #3b82f6)', color:'#fff', border:'none', borderRadius:'24px', cursor:'pointer', fontWeight:'700', boxShadow:'0 4px 15px rgba(6, 182, 212, 0.4)'}}
                         >
                           {spaceGameOver ? 'Try Again' : 'Launch Ship'}
                         </button>
                       </div>
                     )}
                   </div>
                   <p style={{fontSize:'11px', textAlign:'center', marginTop:'10px', color:'#94a3b8'}}>Use <strong>A/D</strong> or <strong>Arrows</strong> to move, <strong>Space</strong> to fire lasers!</p>
                </div>

                <div className="glass-panel" style={{flex:'1 1 280px', minWidth:'260px'}}>
                  <h4>🔤 Hub Wordle</h4>
                  {hubWordleGuesses.map((g, i) => <p key={i} style={{letterSpacing:4}}>{g}</p>)}
                  {hubWordleGuesses.length < 6 && !hubWordleGuesses.includes(hubWordle) && (
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const g = e.target.w.value.toUpperCase().slice(0, 5);
                      setHubWordleGuesses([...hubWordleGuesses, g]);
                      if (g === hubWordle) toast.success('Wordle solved!');
                      e.target.reset();
                    }}>
                      <input name="w" maxLength={5} placeholder="5 letters" required style={{width:'100%', marginBottom:8, padding:8}} />
                      <button type="submit" style={{width:'100%'}}>Guess</button>
                    </form>
                  )}
                </div>

                <div className="glass-panel" style={{flex:'1 1 280px', minWidth:'260px'}}>
                  <h4>🧠 Quick Trivia</h4>
                  <p>{hubTrivia.q}</p>
                  {hubTrivia.options.map((opt, i) => (
                    <button key={i} type="button" style={{display:'block', width:'100%', marginTop:6, padding:8}}
                      onClick={() => toast[i === hubTrivia.answer ? 'success' : 'error'](i === hubTrivia.answer ? 'Correct!' : 'Wrong!')}>
                      {opt}
                    </button>
                  ))}
                </div>

                <div className="glass-panel" style={{flex:'1 1 100%', minWidth:'100%'}}>
                  <h4>🏆 Game Leaderboard</h4>
                  <div className="leaderboard-list">
                    {leaderboard.slice(0, 8).map((u, i) => (
                      <div key={u._id} className="lb-row">
                        <span>#{i + 1} {u.username}</span>
                        <span>🏆 {u.gameStats?.totalWins || 0} wins · 🔥 {u.snapScore || 0} snap</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
             </div>
           )}

        </div>
      </div>
    </div>
  );
}

export default DailyHub;
