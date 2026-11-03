import express from 'express';
import mongoose from 'mongoose';
import { auth } from '../middleware/auth.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';
import Story from '../models/Story.js';
import AutomationRule from '../models/AutomationRule.js';
import HealthHabitPlan from '../models/HealthHabitPlan.js';

const router = express.Router();

const LEVELS = [
  { number: 1, title: 'Rookie', minXp: 0, nextXp: 1000, unlocks: ['Smart challenge tracking', 'Bronze profile badge'] },
  { number: 2, title: 'Connector', minXp: 1000, nextXp: 3000, unlocks: ['Silver profile badge', 'Advanced challenge targets'] },
  { number: 3, title: 'Power User', minXp: 3000, nextXp: 6000, unlocks: ['Gold profile badge', 'Priority Kane insights'] },
  { number: 4, title: 'Elite', minXp: 6000, nextXp: 10000, unlocks: ['Elite profile glow', 'Higher reward multipliers'] },
  { number: 5, title: 'Legend', minXp: 10000, nextXp: null, unlocks: ['Legend status', 'All progression perks unlocked'] }
];

const CHALLENGE_TEMPLATES = [
  {
    id: 'snaps_sent',
    title: 'Snap streak builder',
    description: 'Send snaps and keep your visual social streak alive.',
    unit: 'snaps',
    baseTarget: 100,
    levelStep: 200,
    baseXp: 100,
    metric: 'snapsSent'
  },
  {
    id: 'messages_sent',
    title: 'Conversation engine',
    description: 'Send messages and stay active with your people.',
    unit: 'messages',
    baseTarget: 300,
    levelStep: 300,
    baseXp: 120,
    metric: 'messagesSent'
  },
  {
    id: 'active_days',
    title: 'Daily app discipline',
    description: 'Use ChatFlow on multiple days through chats or health check-ins.',
    unit: 'active days',
    baseTarget: 7,
    levelStep: 14,
    baseXp: 200,
    metric: 'activeDays'
  },
  {
    id: 'health_checkins',
    title: 'Wellness consistency',
    description: 'Check in on health habits like gym, water, medicine, food, or meditation.',
    unit: 'check-ins',
    baseTarget: 7,
    levelStep: 14,
    baseXp: 180,
    metric: 'healthCheckIns'
  },
  {
    id: 'stories_posted',
    title: 'Story creator',
    description: 'Post stories, snaps, AR filters, and moments.',
    unit: 'stories',
    baseTarget: 5,
    levelStep: 10,
    baseXp: 130,
    metric: 'storiesPosted'
  },
  {
    id: 'polls_created',
    title: 'Group decision maker',
    description: 'Create polls and make group chats more interactive.',
    unit: 'polls',
    baseTarget: 3,
    levelStep: 7,
    baseXp: 140,
    metric: 'pollsCreated'
  },
  {
    id: 'contacts_added',
    title: 'Network grower',
    description: 'Build your contact circle.',
    unit: 'contacts',
    baseTarget: 5,
    levelStep: 5,
    baseXp: 100,
    metric: 'contactsCount'
  },
  {
    id: 'groups_joined',
    title: 'Community explorer',
    description: 'Create or join groups and discover communities.',
    unit: 'groups',
    baseTarget: 1,
    levelStep: 2,
    baseXp: 160,
    metric: 'groupsCount'
  },
  {
    id: 'game_wins',
    title: 'Game zone winner',
    description: 'Win games and climb the gaming board.',
    unit: 'wins',
    baseTarget: 3,
    levelStep: 7,
    baseXp: 180,
    metric: 'gameWins'
  },
  {
    id: 'automation_rules',
    title: 'Automation architect',
    description: 'Create personal automation rules for reminders and smart actions.',
    unit: 'rules',
    baseTarget: 1,
    levelStep: 2,
    baseXp: 150,
    metric: 'automationRules'
  }
];

const getLevelInfo = (xp = 0) => {
  return [...LEVELS].reverse().find((level) => xp >= level.minXp) || LEVELS[0];
};

const levelLabel = (level) => `Level ${level.number} - ${level.title}`;

const getChallengeTarget = (template, levelNumber) => template.baseTarget + ((levelNumber - 1) * template.levelStep);

const getChallengeXp = (template, levelNumber) => template.baseXp * levelNumber;

const challengeKey = (levelNumber, challengeId) => `L${levelNumber}_${challengeId}`;

const uniqueDateCount = (dates) => new Set(dates.filter(Boolean).map((date) => new Date(date).toISOString().slice(0, 10))).size;

async function buildMetrics(user) {
  const userId = new mongoose.Types.ObjectId(user._id);
  const [messagesSent, snapsSent, pollsCreated, storiesPosted, groupsCount, automationRules, healthPlans] = await Promise.all([
    Message.countDocuments({ senderId: userId, messageType: { $ne: 'poll' } }),
    Message.countDocuments({ senderId: userId, isSnap: true }),
    Message.countDocuments({ senderId: userId, messageType: 'poll' }),
    Story.countDocuments({ userId }),
    Chat.countDocuments({ participants: userId, isGroupChat: true }),
    AutomationRule.countDocuments({ userId }),
    HealthHabitPlan.find({ userId }).select('checkIns')
  ]);

  const healthCheckIns = healthPlans.reduce((sum, plan) => sum + (plan.checkIns?.filter((check) => check.status === 'done').length || 0), 0);
  const healthDates = healthPlans.flatMap((plan) => plan.checkIns?.map((check) => check.createdAt) || []);
  const messageDates = await Message.find({ senderId: userId }).select('createdAt').limit(5000);

  return {
    messagesSent,
    snapsSent,
    pollsCreated,
    storiesPosted,
    groupsCount,
    automationRules,
    healthCheckIns,
    contactsCount: user.contacts?.length || 0,
    gameWins: user.gameStats?.totalWins || 0,
    activeDays: uniqueDateCount([...messageDates.map((m) => m.createdAt), ...healthDates])
  };
}

async function evaluateChallenges(user) {
  const previousLevelNumber = getLevelInfo(user.xp || 0).number;
  const metrics = await buildMetrics(user);
  const completedSet = new Set((user.completedChallenges || []).map((item) => item.challengeId));
  const newlyCompleted = [];
  let keepEvaluating = true;
  let guard = 0;

  while (keepEvaluating && guard < LEVELS.length) {
    guard += 1;
    keepEvaluating = false;
    const levelInfo = getLevelInfo(user.xp || 0);

    CHALLENGE_TEMPLATES.forEach((template) => {
      const target = getChallengeTarget(template, levelInfo.number);
      const progress = metrics[template.metric] || 0;
      const key = challengeKey(levelInfo.number, template.id);

      if (progress >= target && !completedSet.has(key)) {
        const xpReward = getChallengeXp(template, levelInfo.number);
        user.completedChallenges.push({ challengeId: key, date: new Date() });
        completedSet.add(key);
        user.xp = (user.xp || 0) + xpReward;
        newlyCompleted.push({ id: key, title: template.title, xpReward });
      }
    });

    keepEvaluating = getLevelInfo(user.xp || 0).number > levelInfo.number;
  }

  const activeLevel = getLevelInfo(user.xp || 0);
  const levelUp = activeLevel.number > previousLevelNumber;
  user.level = levelLabel(activeLevel);
  await user.save();

  const activeChallenges = CHALLENGE_TEMPLATES.map((template) => {
    const target = getChallengeTarget(template, activeLevel.number);
    const progress = metrics[template.metric] || 0;
    const key = challengeKey(activeLevel.number, template.id);
    const completed = completedSet.has(key);

    return {
      id: key,
      baseId: template.id,
      title: template.title,
      description: template.description,
      unit: template.unit,
      progress,
      target,
      progressPercent: Math.min(100, Math.round((progress / target) * 100)),
      xpReward: getChallengeXp(template, activeLevel.number),
      completed,
      claimed: completed
    };
  });

  return {
    challenges: activeChallenges,
    metrics,
    newlyCompleted,
    levelUp: levelUp ? {
      from: previousLevelNumber,
      to: activeLevel.number,
      title: levelLabel(activeLevel),
      unlocks: activeLevel.unlocks
    } : null
  };
}

router.get('/today', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const evaluation = await evaluateChallenges(user);
    const levelInfo = getLevelInfo(user.xp || 0);
    const nextXp = levelInfo.nextXp;

    res.json({
      challenges: evaluation.challenges,
      metrics: evaluation.metrics,
      xp: user.xp || 0,
      level: user.level || levelLabel(levelInfo),
      levelInfo,
      nextLevelXp: nextXp,
      xpToNext: nextXp ? Math.max(0, nextXp - (user.xp || 0)) : 0,
      progressPercent: nextXp ? Math.min(100, Math.round((((user.xp || 0) - levelInfo.minXp) / (nextXp - levelInfo.minXp)) * 100)) : 100,
      newlyCompleted: evaluation.newlyCompleted,
      levelUp: evaluation.levelUp
    });
  } catch (err) {
    console.error('Challenge evaluation error:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/complete', auth, async (req, res) => {
  res.status(410).json({ message: 'Challenges are now auto-evaluated by Kane. Refresh the challenge page to update progress.' });
});

export default router;
