import express from 'express';
import { auth } from '../middleware/auth.js';
import User from '../models/User.js';
import HealthHabitPlan from '../models/HealthHabitPlan.js';

const router = express.Router();

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const dateKey = (date = new Date()) => date.toISOString().slice(0, 10);

const tomorrowStart = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const HABIT_SUGGESTIONS = [
  {
    type: 'gym',
    title: 'Gym streak',
    description: 'Track strength training or gym attendance with rest-day awareness.',
    questions: [
      { key: 'targetDays', label: 'How many days do you want this streak to run?', type: 'number', defaultValue: 30 },
      { key: 'weeklyGoal', label: 'How many gym days per week is your goal?', type: 'number', defaultValue: 5 },
      { key: 'restDays', label: 'Which weekly rest days should Kane skip?', type: 'days', defaultValue: [0] },
      { key: 'workoutFocus', label: 'What is your main focus?', type: 'text', defaultValue: 'strength and consistency' },
      { key: 'reminderTime', label: 'What time should Kane usually remind you?', type: 'time', defaultValue: '18:00' }
    ]
  },
  {
    type: 'walking',
    title: 'Walking steps',
    description: 'Build a daily walking habit with a step target.',
    questions: [
      { key: 'targetDays', label: 'How many days should this challenge run?', type: 'number', defaultValue: 30 },
      { key: 'stepsPerDay', label: 'How many steps per day?', type: 'number', defaultValue: 8000 },
      { key: 'restDays', label: 'Any rest days?', type: 'days', defaultValue: [] },
      { key: 'preferredWalkTime', label: 'Best walking time?', type: 'time', defaultValue: '07:00' }
    ]
  },
  {
    type: 'water',
    title: 'Drink water',
    description: 'Track glasses of water every day.',
    questions: [
      { key: 'targetDays', label: 'How many days should this streak run?', type: 'number', defaultValue: 21 },
      { key: 'glassesPerDay', label: 'How many glasses per day?', type: 'number', defaultValue: 10 },
      { key: 'reminderFrequency', label: 'How often should Kane nudge you?', type: 'text', defaultValue: 'every 2 hours' }
    ]
  },
  {
    type: 'healthy_food',
    title: 'Healthy food streak',
    description: 'Track clean meals, cheat days, and daily meal count.',
    questions: [
      { key: 'targetDays', label: 'How many days do you want to continue?', type: 'number', defaultValue: 30 },
      { key: 'mealsPerDay', label: 'How many healthy meals per day?', type: 'number', defaultValue: 3 },
      { key: 'cheatDays', label: 'Which cheat days are allowed?', type: 'days', defaultValue: [6] },
      { key: 'avoidFoods', label: 'Any foods Kane should help you avoid?', type: 'text', defaultValue: 'junk food, sugary drinks' }
    ]
  },
  {
    type: 'medication',
    title: 'Medication streak',
    description: 'Track medicine consistency with schedule and safety notes.',
    questions: [
      { key: 'targetDays', label: 'How many days is this medication plan?', type: 'number', defaultValue: 14 },
      { key: 'medicineName', label: 'Medicine name or label?', type: 'text', defaultValue: 'medicine' },
      { key: 'timesPerDay', label: 'How many times per day?', type: 'number', defaultValue: 1 },
      { key: 'doseNote', label: 'Dose note, if any?', type: 'text', defaultValue: 'as prescribed' },
      { key: 'reminderTime', label: 'Primary reminder time?', type: 'time', defaultValue: '09:00' }
    ]
  },
  {
    type: 'meditation',
    title: 'Meditation streak',
    description: 'Track calm minutes and breathing practice.',
    questions: [
      { key: 'targetDays', label: 'How many days?', type: 'number', defaultValue: 21 },
      { key: 'minutesPerDay', label: 'Minutes per day?', type: 'number', defaultValue: 10 },
      { key: 'preferredTime', label: 'Preferred time?', type: 'time', defaultValue: '06:30' }
    ]
  },
  {
    type: 'sleep',
    title: 'Sleep discipline',
    description: 'Track sleep target, bedtime, and wake-up consistency.',
    questions: [
      { key: 'targetDays', label: 'How many days?', type: 'number', defaultValue: 30 },
      { key: 'sleepHours', label: 'Target sleep hours?', type: 'number', defaultValue: 8 },
      { key: 'bedtime', label: 'Target bedtime?', type: 'time', defaultValue: '22:30' }
    ]
  },
  {
    type: 'stretching',
    title: 'Stretching routine',
    description: 'Daily mobility and posture reset.',
    questions: [
      { key: 'targetDays', label: 'How many days?', type: 'number', defaultValue: 21 },
      { key: 'minutesPerDay', label: 'Minutes per day?', type: 'number', defaultValue: 12 },
      { key: 'focusArea', label: 'Focus area?', type: 'text', defaultValue: 'back, neck, hamstrings' }
    ]
  },
  {
    type: 'running',
    title: 'Running streak',
    description: 'Track running days, distance, and rest days.',
    questions: [
      { key: 'targetDays', label: 'How many days?', type: 'number', defaultValue: 30 },
      { key: 'distanceKm', label: 'Target distance in km?', type: 'number', defaultValue: 3 },
      { key: 'restDays', label: 'Rest days?', type: 'days', defaultValue: [0] }
    ]
  },
  {
    type: 'cycling',
    title: 'Cycling habit',
    description: 'Track cycling distance or ride completion.',
    questions: [
      { key: 'targetDays', label: 'How many days?', type: 'number', defaultValue: 30 },
      { key: 'distanceKm', label: 'Target distance in km?', type: 'number', defaultValue: 5 },
      { key: 'restDays', label: 'Rest days?', type: 'days', defaultValue: [] }
    ]
  },
  {
    type: 'yoga',
    title: 'Yoga streak',
    description: 'Track yoga sessions and flexibility goals.',
    questions: [
      { key: 'targetDays', label: 'How many days?', type: 'number', defaultValue: 21 },
      { key: 'minutesPerDay', label: 'Minutes per day?', type: 'number', defaultValue: 20 },
      { key: 'style', label: 'Yoga style or focus?', type: 'text', defaultValue: 'flexibility and calm' }
    ]
  },
  {
    type: 'screen_break',
    title: 'Screen break habit',
    description: 'Protect eyes and posture with scheduled breaks.',
    questions: [
      { key: 'targetDays', label: 'How many days?', type: 'number', defaultValue: 14 },
      { key: 'breaksPerDay', label: 'How many breaks per day?', type: 'number', defaultValue: 5 },
      { key: 'breakMinutes', label: 'How long per break?', type: 'number', defaultValue: 5 }
    ]
  },
  {
    type: 'protein',
    title: 'Protein goal',
    description: 'Track protein consistency for fitness goals.',
    questions: [
      { key: 'targetDays', label: 'How many days?', type: 'number', defaultValue: 30 },
      { key: 'proteinGrams', label: 'Protein grams per day?', type: 'number', defaultValue: 80 },
      { key: 'dietType', label: 'Diet preference?', type: 'text', defaultValue: 'balanced' }
    ]
  },
  {
    type: 'skincare',
    title: 'Skincare routine',
    description: 'Track morning/night skincare consistency.',
    questions: [
      { key: 'targetDays', label: 'How many days?', type: 'number', defaultValue: 30 },
      { key: 'timesPerDay', label: 'How many times per day?', type: 'number', defaultValue: 2 },
      { key: 'routineNote', label: 'Routine note?', type: 'text', defaultValue: 'cleanser, moisturizer, sunscreen' }
    ]
  },
  {
    type: 'journaling',
    title: 'Mood journal',
    description: 'Track daily reflection and emotional clarity.',
    questions: [
      { key: 'targetDays', label: 'How many days?', type: 'number', defaultValue: 21 },
      { key: 'minutesPerDay', label: 'Minutes per day?', type: 'number', defaultValue: 5 },
      { key: 'promptStyle', label: 'Prompt style?', type: 'text', defaultValue: 'gratitude and daily reflection' }
    ]
  }
];

// ========================
// HEALTH DATA INTEGRATION
// ========================

// Connect health provider (OAuth)
router.post('/connect/:provider', auth, async (req, res) => {
  try {
    const { provider } = req.params;
    const { accessToken, refreshToken } = req.body;
    
    if (!['apple_health', 'google_fit', 'fitbit'].includes(provider)) {
      return res.status(400).json({ message: 'Unsupported provider' });
    }

    const user = await User.findById(req.user.id);
    if (!user.healthConnections) user.healthConnections = [];

    // Remove existing connection for this provider
    user.healthConnections = user.healthConnections.filter(h => h.provider !== provider);

    // Add new connection
    user.healthConnections.push({
      provider,
      accessToken,
      refreshToken,
      lastSync: new Date(),
      isConnected: true
    });

    await user.save();

    res.status(200).json({ 
      message: `${provider} connected successfully`,
      provider
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get connected health providers
router.get('/providers', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('healthConnections');
    const providers = user.healthConnections?.map(h => ({
      provider: h.provider,
      isConnected: h.isConnected,
      lastSync: h.lastSync
    })) || [];

    res.status(200).json({ providers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Sync health data from connected providers
router.post('/sync', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user.healthConnections || user.healthConnections.length === 0) {
      return res.status(400).json({ message: 'No health providers connected' });
    }

    if (!user.healthData) {
      user.healthData = {
        dailySteps: [],
        sleepHours: [],
        heartRate: [],
        activities: [],
        waterIntake: [],
        mood: []
      };
    }

    // Simulate fetching data from providers
    // In production, use actual API calls to Google Fit, Apple HealthKit, etc.
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already synced today
    const alreadySynced = user.healthData.dailySteps?.some(d => 
      new Date(d.date).setHours(0, 0, 0, 0) === today.getTime()
    );

    if (!alreadySynced) {
      // Mock data - In production, fetch from real API
      const mockSteps = 7500 + Math.floor(Math.random() * 5000);
      const mockSleep = 6 + Math.random() * 3;
      const mockHeartRate = 60 + Math.floor(Math.random() * 40);

      user.healthData.dailySteps.push({
        date: today,
        steps: mockSteps
      });

      user.healthData.sleepHours.push({
        date: today,
        hours: mockSleep,
        quality: mockSleep > 7 ? 'excellent' : mockSleep > 6 ? 'good' : 'fair'
      });

      user.healthData.heartRate.push({
        date: today,
        bpm: mockHeartRate
      });

      // Update streak
      const yesterdayStr = new Date(today.getTime() - 86400000).toISOString().split('T')[0];
      const yesterdayData = user.healthData.dailySteps.find(d => 
        new Date(d.date).toISOString().split('T')[0] === yesterdayStr
      );

      if (yesterdayData && yesterdayData.steps >= 8000) {
        user.wellness.streaks.exercise = (user.wellness.streaks.exercise || 0) + 1;
      } else {
        user.wellness.streaks.exercise = 0;
      }
    }

    user.healthData.lastUpdated = new Date();
    await user.save();

    res.status(200).json({
      message: 'Health data synced successfully',
      today: {
        steps: user.healthData.dailySteps[user.healthData.dailySteps.length - 1]?.steps || 0,
        sleep: user.healthData.sleepHours[user.healthData.sleepHours.length - 1]?.hours || 0,
        heartRate: user.healthData.heartRate[user.healthData.heartRate.length - 1]?.bpm || 0
      }
    });
  } catch (error) {
    console.error('Health sync error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get health summary
router.get('/summary', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('healthData wellness healthGoals');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySteps = user.healthData?.dailySteps?.find(d => 
      new Date(d.date).setHours(0, 0, 0, 0) === today.getTime()
    )?.steps || 0;

    const todaySleep = user.healthData?.sleepHours?.find(d =>
      new Date(d.date).setHours(0, 0, 0, 0) === today.getTime()
    ) || null;

    const weeklySteps = user.healthData?.dailySteps?.slice(-7) || [];
    const avgSteps = weeklySteps.length > 0 
      ? Math.round(weeklySteps.reduce((a, b) => a + b.steps, 0) / weeklySteps.length)
      : 0;

    res.status(200).json({
      today: {
        steps: todaySteps,
        stepsGoal: 10000,
        progress: Math.min(100, Math.round((todaySteps / 10000) * 100)),
        sleep: todaySleep?.hours || 0,
        sleepQuality: todaySleep?.quality || 'unknown'
      },
      weekly: {
        avgSteps,
        totalSteps: weeklySteps.reduce((a, b) => a + b.steps, 0),
        daysActive: weeklySteps.filter(d => d.steps >= 5000).length
      },
      streaks: user.wellness?.streaks || {},
      goals: user.healthGoals || []
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/habit-suggestions', auth, async (req, res) => {
  res.json({ suggestions: HABIT_SUGGESTIONS });
});

router.get('/habit-plans', auth, async (req, res) => {
  try {
    const plans = await HealthHabitPlan.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50);
    const today = new Date();
    const todayDay = today.getDay();

    res.json({
      plans: plans.map((plan) => {
        const isRestDay = plan.restDays?.includes(todayDay);
        const hasCheckedInToday = plan.lastCheckInDate === dateKey(today);
        return {
          ...plan.toObject(),
          today: {
            isRestDay,
            dayName: DAY_NAMES[todayDay],
            hasCheckedInToday,
            message: isRestDay
              ? `Today is ${DAY_NAMES[todayDay]}, your planned rest day. Happy resting day!`
              : hasCheckedInToday
                ? 'You already checked in today. Nice work.'
                : "Kane is waiting for today's check-in."
          }
        };
      })
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/habit-plans', auth, async (req, res) => {
  try {
    const { type, title, answers = {} } = req.body;
    const suggestion = HABIT_SUGGESTIONS.find((item) => item.type === type);
    if (!suggestion) return res.status(400).json({ message: 'Unknown habit type' });

    const targetDays = Math.min(Math.max(Number(answers.targetDays || 30), 1), 365);
    const restDays = Array.isArray(answers.restDays)
      ? answers.restDays.map(Number).filter((day) => day >= 0 && day <= 6)
      : Array.isArray(answers.cheatDays)
        ? answers.cheatDays.map(Number).filter((day) => day >= 0 && day <= 6)
        : [];

    const plan = await HealthHabitPlan.create({
      userId: req.user.id,
      type,
      title: title || suggestion.title,
      startsOn: tomorrowStart(),
      targetDays,
      restDays,
      config: answers
    });

    res.status(201).json({
      plan,
      message: `${plan.title} will start tomorrow. Kane will respect your rest days.`
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/habit-plans/:planId/check-in', auth, async (req, res) => {
  try {
    const { value, note } = req.body;
    const plan = await HealthHabitPlan.findOne({ _id: req.params.planId, userId: req.user.id });
    if (!plan) return res.status(404).json({ message: 'Habit plan not found' });
    if (plan.status !== 'active') return res.status(400).json({ message: 'This plan is not active' });

    const today = new Date();
    const todayKey = dateKey(today);
    const day = today.getDay();

    if (today < plan.startsOn) {
      return res.status(400).json({ message: `${plan.title} starts tomorrow. Kane will begin tracking then.` });
    }

    if (plan.lastCheckInDate === todayKey) {
      return res.status(400).json({ message: 'You already checked in for today' });
    }

    const isRestDay = plan.restDays?.includes(day);
    const status = isRestDay ? 'rest' : 'done';

    plan.checkIns.push({ dateKey: todayKey, status, value, note });
    plan.lastCheckInDate = todayKey;

    if (!isRestDay) {
      plan.currentStreak += 1;
      plan.completedDays += 1;
      plan.bestStreak = Math.max(plan.bestStreak || 0, plan.currentStreak);
      if (plan.completedDays >= plan.targetDays) plan.status = 'completed';
    }

    await plan.save();

    res.json({
      plan,
      message: isRestDay
        ? `Today is ${DAY_NAMES[day]}, your planned rest day. Happy resting day!`
        : `Checked in. Your ${plan.title} streak is now ${plan.currentStreak} day${plan.currentStreak === 1 ? '' : 's'}.`
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/habit-plans/:planId', auth, async (req, res) => {
  try {
    const updates = {};
    if (['active', 'paused', 'completed'].includes(req.body.status)) updates.status = req.body.status;
    const plan = await HealthHabitPlan.findOneAndUpdate(
      { _id: req.params.planId, userId: req.user.id },
      updates,
      { new: true }
    );
    if (!plan) return res.status(404).json({ message: 'Habit plan not found' });
    res.json(plan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ========================
// HEALTH CHALLENGES
// ========================

// Personal plans power the advanced AI lab; keep this route before the legacy fallback.
router.get('/challenges/personal', auth, async (req, res) => {
  try {
    const plans = await HealthHabitPlan.find({
      userId: req.user.id,
      status: { $in: ['active', 'completed'] }
    }).sort({ createdAt: -1 }).limit(20);

    res.status(200).json({
      challenges: plans.map((plan) => ({
        id: plan._id,
        name: plan.title,
        description: `${plan.completedDays}/${plan.targetDays} tracked days`,
        progress: plan.completedDays,
        target: plan.targetDays,
        streak: plan.currentStreak,
        status: plan.status,
        reward: plan.status === 'completed' ? 'Completed' : 'Personal streak'
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get active challenges
router.get('/challenges', auth, async (req, res) => {
  try {
    // Return mock challenges - In production, fetch from DB
    const challenges = [
      {
        id: 'challenge_1',
        name: '10K Steps Daily',
        description: 'Walk 10,000 steps every day this week',
        progress: 75,
        target: 100,
        participants: 5,
        reward: '🏆 Badge + 50 XP',
        endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'challenge_2',
        name: 'Meditation Streak',
        description: '7 days of meditation',
        progress: 3,
        target: 7,
        participants: 12,
        reward: '🧘 Zen Badge',
        endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      },
      {
        id: 'challenge_3',
        name: 'Hydration Challenge',
        description: 'Drink 8 cups of water daily',
        progress: 5,
        target: 8,
        participants: 8,
        reward: '💧 Hydration Badge',
        endsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      }
    ];

    res.status(200).json({ challenges });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Join a challenge
router.post('/challenges/:challengeId/join', auth, async (req, res) => {
  try {
    const { challengeId } = req.params;
    // In production, add user to challenge in DB
    
    res.status(200).json({ 
      message: 'Successfully joined challenge',
      challengeId 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Log manual health entry (water, mood, etc.)
router.post('/manual-entry', auth, async (req, res) => {
  try {
    const { type, value, note } = req.body;
    const user = await User.findById(req.user.id);

    if (!user.healthData) {
      user.healthData = {
        dailySteps: [],
        sleepHours: [],
        heartRate: [],
        activities: [],
        waterIntake: [],
        mood: []
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (type) {
      case 'water':
        user.healthData.waterIntake.push({
          date: today,
          cups: value
        });
        user.wellness.streaks.waterIntake = (user.wellness.streaks.waterIntake || 0) + 1;
        break;

      case 'mood':
        user.healthData.mood.push({
          date: new Date(),
          emoji: value,
          text: note || ''
        });
        user.wellness.currentMood = value;
        break;

      case 'activity':
        user.healthData.activities.push({
          date: new Date(),
          activity: value,
          duration: note?.duration || 30,
          calories: note?.calories || 0
        });
        user.wellness.streaks.exercise = (user.wellness.streaks.exercise || 0) + 1;
        break;

      default:
        return res.status(400).json({ message: 'Invalid entry type' });
    }

    await user.save();

    res.status(200).json({
      message: `${type} entry logged successfully`,
      type,
      value
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get health insights
router.get('/insights', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('healthData wellness preferences');
    
    const insights = [];

    // Sleep insights
    const recentSleep = user.healthData?.sleepHours?.slice(-7) || [];
    const avgSleep = recentSleep.length > 0 
      ? (recentSleep.reduce((a, b) => a + b.hours, 0) / recentSleep.length).toFixed(1)
      : 0;

    if (avgSleep < 6) {
      insights.push({
        type: 'warning',
        category: 'sleep',
        message: `Your average sleep (${avgSleep}h) is below recommended 7-8 hours. Try establishing a consistent bedtime.`
      });
    }

    // Step insights
    const recentSteps = user.healthData?.dailySteps?.slice(-7) || [];
    const avgSteps = recentSteps.length > 0
      ? Math.round(recentSteps.reduce((a, b) => a + b.steps, 0) / recentSteps.length)
      : 0;

    if (avgSteps >= 10000) {
      insights.push({
        type: 'positive',
        category: 'activity',
        message: `Great job! You've been averaging ${avgSteps} steps daily. Keep up the momentum! 🎉`
      });
    } else if (avgSteps < 5000) {
      insights.push({
        type: 'suggestion',
        category: 'activity',
        message: `Consider increasing your daily steps. Aim for 10,000 steps to improve cardiovascular health.`
      });
    }

    // Streak insights
    if (user.wellness?.streaks?.exercise > 14) {
      insights.push({
        type: 'achievement',
        category: 'streaks',
        message: `🔥 You're on a ${user.wellness.streaks.exercise}-day exercise streak! You're building great habits.`
      });
    }

    res.status(200).json({ insights });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
