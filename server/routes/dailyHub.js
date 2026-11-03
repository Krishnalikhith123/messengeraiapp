import express from 'express';
import { auth } from '../middleware/auth.js';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import DailyOrder from '../models/DailyOrder.js';
import FeedBookmark from '../models/FeedBookmark.js';
import { getAiModel } from '../utils/aiModel.js';

const router = express.Router();

const RESTAURANTS = [
  { id: 1, name: 'Truffles Burger Joint', rating: 4.8, time: '25 min', min: 200, category: 'Burgers', icon: '🍔', deliveryFee: 29 },
  { id: 2, name: 'Meghana Foods', rating: 4.6, time: '40 min', min: 300, category: 'Biryani', icon: '🍱', deliveryFee: 39 },
  { id: 3, name: 'Leon Grill', rating: 4.4, time: '30 min', min: 150, category: 'Fast Food', icon: '🌯', deliveryFee: 25 },
  { id: 4, name: 'Third Wave Coffee', rating: 4.5, time: '20 min', min: 250, category: 'Cafe', icon: '☕', deliveryFee: 19 },
  { id: 5, name: 'Biryani Blues', rating: 4.7, time: '35 min', min: 280, category: 'Biryani', icon: '🍛', deliveryFee: 35 },
  { id: 6, name: 'Subway Fresh', rating: 4.3, time: '22 min', min: 180, category: 'Healthy', icon: '🥪', deliveryFee: 22 }
];

const MENU_CATALOG = [
  { id: 101, name: 'Peri Peri Burger', price: 249, icon: '🍔', veg: false, restaurantIds: [1] },
  { id: 102, name: 'Paneer Tikka Pizza', price: 399, icon: '🍕', veg: true, restaurantIds: [1, 3] },
  { id: 103, name: 'Chicken Biryani', price: 349, icon: '🍱', veg: false, restaurantIds: [2, 5] },
  { id: 104, name: 'Cold Coffee', price: 199, icon: '☕', veg: true, restaurantIds: [4] },
  { id: 105, name: 'Veg Supreme Pizza', price: 329, icon: '🍕', veg: true, restaurantIds: [1, 3] },
  { id: 106, name: 'Grilled Chicken Wrap', price: 219, icon: '🌯', veg: false, restaurantIds: [3, 6] },
  { id: 107, name: 'Mutton Biryani', price: 449, icon: '🍛', veg: false, restaurantIds: [2, 5] }
];

const FEATURE_MAP = {
  101: 'Daily Life Companion Hub',
  102: 'Munchies Store',
  103: 'KanePay Wallet',
  104: 'Checkout & Group Split',
  105: 'Daily Scroll Feed',
  106: 'Wellness & Voice Assistant',
  107: 'TimePass Arcade'
};

// #101 Hub dashboard
router.get('/dashboard', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('kanePay wellnessHub arcadeHub gameStats username');
  const orders = await DailyOrder.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(3);
  const bookmarks = await FeedBookmark.countDocuments({ userId: req.user.id });

  const today = new Date().toISOString().slice(0, 10);
  const wellness = user.wellnessHub || {};

  res.json({
    features: FEATURE_MAP,
    user: { username: user.username },
    balance: user.kanePay?.balanceINR || 0,
    walletReady: !!user.kanePay?.isSetup,
    recentOrders: orders,
    feedBookmarks: bookmarks,
    wellnessStreak: wellness.streakDays || 0,
    waterToday: wellness.waterCups || 0,
    arcadeHighScore: user.arcadeHub?.spaceHighScore || user.gameStats?.arcadeHighScore || 0,
    gameWins: user.gameStats?.totalWins || 0,
    quickActions: [
      { tab: 'munchies', label: 'Order food', icon: '🍔' },
      { tab: 'kanepay', label: 'Send money', icon: '💳' },
      { tab: 'scroll', label: 'Daily feed', icon: '📰' },
      { tab: 'myday', label: 'Log wellness', icon: '🧘' },
      { tab: 'arcade', label: 'Play arcade', icon: '🎮' }
    ],
    greeting: getGreeting(),
    dateKey: today
  });
});

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// #102 Munchies
router.get('/munchies/restaurants', auth, (req, res) => {
  res.json(RESTAURANTS);
});

router.get('/munchies/menu', auth, (req, res) => {
  const rid = Number(req.query.restaurantId);
  const menu = rid
    ? MENU_CATALOG.filter((m) => m.restaurantIds.includes(rid))
    : MENU_CATALOG;
  res.json(menu);
});

// #104 Checkout + split bill
router.post('/munchies/order', auth, async (req, res) => {
  const { items, restaurantName, deliveryLocation, splitChatId, restaurantId } = req.body;
  if (!items?.length) return res.status(400).json({ message: 'Cart is empty' });

  const user = await User.findById(req.user.id);
  if (!user?.kanePay?.isSetup) return res.status(400).json({ message: 'Setup KanePay first (#103)' });

  const subtotal = items.reduce((s, i) => s + i.price * (i.qty || 1), 0);
  const restaurant = RESTAURANTS.find((r) => r.id === restaurantId) || RESTAURANTS[0];
  const deliveryFee = restaurant.deliveryFee || 29;
  const total = subtotal + deliveryFee;

  if (user.kanePay.balanceINR < total) {
    return res.status(400).json({ message: 'Insufficient KanePay balance' });
  }

  const updatedUser = await User.findOneAndUpdate(
    { _id: user._id },
    {
      $inc: { 'kanePay.balanceINR': -total },
      $push: {
        'kanePay.transactions': {
          $each: [{
            type: 'debit',
            description: `Munchies: ${restaurantName || restaurant.name}`,
            amount: total,
            counterpartyName: 'Munchies Store',
            date: new Date()
          }],
          $position: 0
        }
      }
    },
    { new: true }
  );

  const order = await DailyOrder.create({
    userId: req.user.id,
    restaurantName: restaurantName || restaurant.name,
    items,
    subtotal,
    deliveryFee,
    total,
    deliveryLocation: deliveryLocation || '',
    etaMinutes: parseInt(restaurant.time, 10) || 35,
    splitChatId: splitChatId || null,
    status: 'placed'
  });

  // Simulate order progression
  setTimeout(async () => {
    await DailyOrder.findByIdAndUpdate(order._id, { status: 'preparing' });
  }, 8000);
  setTimeout(async () => {
    await DailyOrder.findByIdAndUpdate(order._id, { status: 'out_for_delivery' });
  }, 20000);
  setTimeout(async () => {
    await DailyOrder.findByIdAndUpdate(order._id, { status: 'delivered', deliveredAt: new Date() });
  }, 45000);

  let splitMessage = null;
  if (splitChatId) {
    const chat = await Chat.findById(splitChatId);
    if (chat?.participants.some((p) => p.toString() === req.user.id)) {
      const participantCount = chat.participants.length;
      const perPerson = Math.ceil(total / participantCount);
      const itemSummary = items.map((i) => `${i.name}×${i.qty || 1}`).join(', ');

      splitMessage = new Message({
        chatId: splitChatId,
        senderId: req.user.id,
        content: `🍔 Munchies Order — ${restaurantName}\n${itemSummary}\nTotal ₹${total} · Split ₹${perPerson}/person (${participantCount} members)`,
        messageType: 'text',
        isAdHocBill: true,
        billDescription: `Munchies: ${restaurantName}`,
        billTotal: total,
        billSplits: chat.participants.map((p) => ({
          user: p,
          amount: perPerson,
          paid: p.toString() === req.user.id
        }))
      });
      await splitMessage.save();
      await splitMessage.populate('senderId', 'username profilePicture');
      await Chat.findByIdAndUpdate(splitChatId, {
        lastMessage: splitMessage._id,
        lastMessageTime: new Date()
      });
      order.splitBillMessageId = splitMessage._id;
      await order.save();
    }
  }

  res.status(201).json({
    order,
    newBalance: updatedUser.kanePay.balanceINR,
    splitMessage: splitMessage?.toObject?.() || splitMessage,
    feature: 104
  });
});

router.get('/munchies/orders', auth, async (req, res) => {
  const orders = await DailyOrder.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(20);
  res.json(orders);
});

router.get('/munchies/orders/:orderId/track', auth, async (req, res) => {
  const order = await DailyOrder.findOne({ _id: req.params.orderId, userId: req.user.id });
  if (!order) return res.status(404).json({ message: 'Order not found' });
  const steps = ['placed', 'preparing', 'out_for_delivery', 'delivered'];
  const idx = steps.indexOf(order.status);
  res.json({
    order,
    timeline: steps.map((s, i) => ({
      status: s,
      label: s.replace(/_/g, ' '),
      done: i <= idx,
      active: i === idx
    }))
  });
});

// #103 KanePay stats
router.get('/kanepay/stats', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('kanePay');
  const txs = user?.kanePay?.transactions || [];
  const credits = txs.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const debits = txs.filter((t) => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const byCategory = {};
  txs.forEach((t) => {
    const key = t.description?.includes('Munchies') ? 'Food'
      : t.description?.includes('Space') || t.description?.includes('Arcade') ? 'Rewards'
      : t.description?.includes('Sent') || t.description?.includes('Received') ? 'Transfers'
      : 'Other';
    byCategory[key] = (byCategory[key] || 0) + (t.type === 'debit' ? t.amount : 0);
  });

  res.json({
    balance: user.kanePay?.balanceINR || 0,
    totalCredits: credits,
    totalDebits: debits,
    transactionCount: txs.length,
    spendingByCategory: Object.entries(byCategory).map(([name, amount]) => ({ name, amount })),
    upiId: user.kanePay?.upiId || '',
    qrPayload: `upi://pay?pa=${encodeURIComponent(user.kanePay?.upiId || 'user@kanepay')}&pn=ChatFlow&am=0`
  });
});

// #105 Feed bookmarks (feed content fetched from existing /api/messages/daily-feed)
router.get('/feed/bookmarks', auth, async (req, res) => {
  const bookmarks = await FeedBookmark.find({ userId: req.user.id }).sort({ savedAt: -1 }).limit(50);
  res.json(bookmarks);
});

router.post('/feed/bookmarks', auth, async (req, res) => {
  const { title, content, tag } = req.body;
  const bookmark = await FeedBookmark.create({ userId: req.user.id, title, content, tag });
  res.status(201).json(bookmark);
});

router.delete('/feed/bookmarks/:id', auth, async (req, res) => {
  await FeedBookmark.deleteOne({ _id: req.params.id, userId: req.user.id });
  res.json({ message: 'Removed' });
});

// #106 Wellness
router.get('/wellness', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('wellnessHub');
  res.json(user.wellnessHub || {});
});

router.put('/wellness', auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  const today = new Date().toISOString().slice(0, 10);
  const prev = user.wellnessHub || {};
  let streak = prev.streakDays || 0;

  if (prev.lastWellnessDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    streak = prev.lastWellnessDate === yesterday ? streak + 1 : 1;
  }

  user.wellnessHub = {
    waterCups: req.body.waterCups ?? prev.waterCups ?? 0,
    gymDone: req.body.gymDone ?? prev.gymDone ?? false,
    mood: req.body.mood ?? prev.mood ?? '',
    moodEmoji: req.body.moodEmoji ?? prev.moodEmoji ?? '😊',
    streakDays: streak,
    lastWellnessDate: today,
    customHabits: req.body.customHabits ?? prev.customHabits ?? [],
    checklist: req.body.checklist ?? prev.checklist ?? []
  };
  await user.save();
  res.json(user.wellnessHub);
});

router.post('/wellness/mood-advice', auth, async (req, res) => {
  const { mood, moodEmoji } = req.body;
  let advice = `${moodEmoji || '😊'} Thanks for checking in! Take one small win today — hydrate, stretch, or message a friend.`;

  try {
    const aiModel = getAiModel();
    if (aiModel) {
      const result = await aiModel.generateContent(
        `User mood: ${moodEmoji} ${mood}. Give 2 sentences of warm, actionable wellness advice. Be modern and friendly.`
      );
      advice = result.response.text().trim();
    }
  } catch { /* fallback */ }

  const user = await User.findById(req.user.id);
  if (user.wellnessHub) {
    user.wellnessHub.mood = mood;
    user.wellnessHub.moodEmoji = moodEmoji;
    await user.save();
  }

  res.json({ advice, mood, moodEmoji });
});

// #107 Arcade
router.get('/arcade/stats', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('arcadeHub gameStats username');
  const top = await User.find({ isBot: { $ne: true } })
    .select('username profilePicture arcadeHub gameStats')
    .sort({ 'arcadeHub.spaceHighScore': -1, 'gameStats.totalWins': -1 })
    .limit(10);

  res.json({
    myStats: {
      spaceHighScore: user.arcadeHub?.spaceHighScore || 0,
      tictactoeWins: user.arcadeHub?.tictactoeWins || 0,
      totalWins: user.gameStats?.totalWins || 0,
      rewardsClaimedToday: user.arcadeHub?.rewardsClaimedToday || 0
    },
    leaderboard: top,
    rewards: [
      { id: 'space100', label: 'Space Kane 100+ pts', amount: 250, claimed: false },
      { id: 'ttt3', label: '3 Tic-Tac-Toe wins today', amount: 100, claimed: false }
    ]
  });
});

router.post('/arcade/score', auth, async (req, res) => {
  const { game, score, won } = req.body;
  const user = await User.findById(req.user.id);
  if (!user.arcadeHub) user.arcadeHub = {};

  if (game === 'space' && score > (user.arcadeHub.spaceHighScore || 0)) {
    user.arcadeHub.spaceHighScore = score;
    if (user.gameStats) user.gameStats.arcadeHighScore = score;
  }
  if (game === 'tictactoe' && won) {
    user.arcadeHub.tictactoeWins = (user.arcadeHub.tictactoeWins || 0) + 1;
  }

  const today = new Date().toISOString().slice(0, 10);
  let rewardGranted = null;

  if (game === 'space' && score >= 100) {
    if (user.arcadeHub.lastRewardDate !== today || (user.arcadeHub.rewardsClaimedToday || 0) < 3) {
      if (user.kanePay?.isSetup) {
        user.kanePay.balanceINR = (user.kanePay.balanceINR || 0) + 250;
        user.kanePay.transactions = user.kanePay.transactions || [];
        user.kanePay.transactions.unshift({
          type: 'credit',
          description: 'Space Kane Arcade Reward (#107)',
          amount: 250,
          counterpartyName: 'TimePass Arcade',
          date: new Date()
        });
        user.arcadeHub.rewardsClaimedToday = user.arcadeHub.lastRewardDate === today
          ? (user.arcadeHub.rewardsClaimedToday || 0) + 1
          : 1;
        user.arcadeHub.lastRewardDate = today;
        rewardGranted = { amount: 250, reason: 'Space Kane 100+ points' };
      }
    }
  }

  await user.save();
  res.json({
    arcadeHub: user.arcadeHub,
    rewardGranted,
    balance: user.kanePay?.balanceINR
  });
});

export default router;
