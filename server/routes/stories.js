import express from 'express';
import Story from '../models/Story.js';
import Chat from '../models/Chat.js';
import { checkAndUpdateStreak } from './messages.js';
import { auth } from '../middleware/auth.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = express.Router();

// Initialize Gemini AI (Lazy)
let genAI;
let model;

const getAiModel = () => {
  if (!model) {
    if (!process.env.GEMINI_API_KEY) return null;
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const modelName = "gemini-2.5-flash";
    console.log(`🤖 Story Analyzer Initializing with model: ${modelName}`);
    model = genAI.getGenerativeModel({ model: modelName });
  }
  return model;
};

// Analyze and summarize active stories using Gemini
router.get('/analyze', auth, async (req, res) => {
  try {
    const stories = await Story.find({
      expiresAt: { $gt: new Date() }
    }).populate('userId', 'username');

    // Filter out user's own stories for the analysis
    const friendsStories = stories.filter(s => s.userId._id.toString() !== req.user.id);

    if (friendsStories.length === 0) {
      return res.status(200).json({ summary: "Nobody has posted any new stories today." });
    }

    const aiModel = getAiModel();
    if (!aiModel) {
      // Fallback
      const uniqueNames = [...new Set(friendsStories.map(s => s.userId.username))];
      return res.status(200).json({ summary: `Nobody is online but the following people posted updates: ${uniqueNames.join(', ')}.` });
    }

    const formattedStories = friendsStories.map(s => `[User: ${s.userId.username}]: ${s.content || '(Image status)'}`).join('\n');

    const prompt = `You are Kane, an AI status and story analyzer for a futuristic messaging app.
The user wants you to give them a brief, intelligent summary of what their friends have posted on their stories/statuses today.
Here are the active stories:
${formattedStories}

Synthesize these stories into a very friendly, natural, and conversational 1-2 sentence spoken summary.
E.g.: "Ashwin posted that he's working late at the library, while Mallikarjun is sharing some weekend vibes!"
Do not use markdown, formatting, or bullet points. Speak directly as Kane.`;

    const result = await aiModel.generateContent(prompt);
    const summary = result.response.text().trim();

    res.status(200).json({ summary });
  } catch (error) {
    console.error('Story analysis error:', error);
    res.status(500).json({ message: 'Failed to analyze stories.' });
  }
});

// Create story
router.post('/', auth, async (req, res) => {
  try {
    const { content, mediaUrl, mediaType } = req.body;

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const story = new Story({
      userId: req.user.id,
      content,
      mediaUrl,
      mediaType,
      expiresAt
    });

    await story.save();
    await story.populate('userId', 'username profilePicture');

    // If an image story is posted, update SnapStreaks with all friends
    if (mediaType === 'image') {
      try {
        const userChats = await Chat.find({ participants: req.user.id, isGroupChat: false });
        userChats.forEach(chat => {
          checkAndUpdateStreak(chat._id).catch(err => console.error(err));
        });
      } catch (err) {
        console.error('Error triggering streak update from story:', err);
      }
    }

    res.status(201).json(story);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const fallbackShorts = [
  { id: 'v1', title: 'Extreme Skateboard Trickshots! 🛹', creator: 'SkatePro', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', tags: ['Sports', 'Stunts', 'Skills'], views: '2.5M views' },
  { id: 'v2', title: 'Oddly Satisfying Color Art ASMR 🎨', creator: 'FluidArtist', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', tags: ['Satisfying', 'ASMR', 'Relaxing'], views: '5.2M views' },
  { id: 'v3', title: 'Adrenaline FPV Parkour Rooftop Run! 👟', creator: 'UrbanNinja', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', tags: ['Parkour', 'Stunts', 'Action'], views: '8.4M views' },
  { id: 'v4', title: 'Tokyo Nights Walk in Neon Rain 🌃', creator: 'NeonWanderer', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', tags: ['Vibe', 'Neon', 'City'], views: '3.1M views' },
  { id: 'v5', title: 'Insane Live DJ Beat Drop in Tokyo 🎧', creator: 'DJPulse', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', tags: ['Music', 'Party', 'Vibe'], views: '4.7M views' },
  { id: 'v6', title: 'Riding a Monster Ocean Wave 🌊', creator: 'SurferX', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4', tags: ['Nature', 'Surfing', 'Extreme'], views: '2.1M views' },
  { id: 'v7', title: 'Cooking the Ultimate Cheese Pasta! 🍝', creator: 'TasteKitchen', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', tags: ['Cooking', 'Satisfying', 'Yummy'], views: '6.3M views' },
  { id: 'v8', title: 'Deep Mystical Forest Walk in Fog 🌲', creator: 'ForestVibes', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', tags: ['Nature', 'Forest', 'Peaceful'], views: '1.2M views' },
  { id: 'v9', title: 'Secret Magical Waterfall Hidden in Jungle 🏞️', creator: 'JungleNature', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', tags: ['Nature', 'Waterfall', 'Calm'], views: '4.9M views' }
];

// Get real-time trending Shorts/Reels from Gemini or fallback (supports endless scroll offsets)
router.get('/reels/trending', auth, async (req, res) => {
  try {
    const offset = parseInt(req.query.offset) || 0;
    const limit = 8;

    // Directly return a paginated slice of fallbackShorts with direct secure Mixkit CDN vertical MP4 links
    const sliced = [];
    for (let i = 0; i < limit; i++) {
      const index = (offset + i) % fallbackShorts.length;
      sliced.push(fallbackShorts[index]);
    }
    res.status(200).json(sliced);
  } catch (error) {
    console.error("Reels trending error:", error);
    const offset = parseInt(req.query.offset) || 0;
    const limit = 8;
    const sliced = [];
    for (let i = 0; i < limit; i++) {
      const index = (offset + i) % fallbackShorts.length;
      sliced.push(fallbackShorts[index]);
    }
    res.status(200).json(sliced);
  }
});

// Get all stories
router.get('/', auth, async (req, res) => {
  try {
    const stories = await Story.find({
      expiresAt: { $gt: new Date() }
    })
      .populate('userId', 'username profilePicture')
      .sort({ createdAt: -1 });

    res.status(200).json(stories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// View story
router.post('/:storyId/view', auth, async (req, res) => {
  try {
    const story = await Story.findByIdAndUpdate(
      req.params.storyId,
      {
        $addToSet: {
          viewedBy: {
            userId: req.user.id,
            viewedAt: new Date()
          }
        }
      },
      { new: true }
    ).populate('userId', 'username profilePicture');

    res.status(200).json(story);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete story
router.delete('/:storyId', auth, async (req, res) => {
  try {
    const story = await Story.findByIdAndDelete(req.params.storyId);

    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    res.status(200).json({ message: 'Story deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;