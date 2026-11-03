import express from 'express';
import { auth } from '../middleware/auth.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Message from '../models/Message.js';
import User from '../models/User.js';
import Chat from '../models/Chat.js';

const router = express.Router();

const FALLBACK_TOP_NEWS = [
  {
    title: 'AI tools become standard in classrooms and workplaces',
    description: 'New productivity and learning workflows are being built around AI copilots, tutoring, and task automation.',
    source: 'Kane Briefing',
    url: 'https://news.google.com'
  },
  {
    title: 'Global markets watch inflation, jobs, and energy costs',
    description: 'Investors and households are tracking economic signals as governments balance growth and affordability.',
    source: 'Kane Briefing',
    url: 'https://news.google.com'
  },
  {
    title: 'Health tech expands sleep, fitness, and mental wellness insights',
    description: 'Wearables and apps are moving from simple tracking to personalized coaching and early warning signals.',
    source: 'Kane Briefing',
    url: 'https://news.google.com'
  },
  {
    title: 'Climate resilience projects accelerate in major cities',
    description: 'Cities are investing in cleaner transport, heat protection, water systems, and renewable infrastructure.',
    source: 'Kane Briefing',
    url: 'https://news.google.com'
  },
  {
    title: 'Sports leagues lean into live digital fan experiences',
    description: 'Interactive streams, real-time stats, and social viewing are becoming part of everyday sports coverage.',
    source: 'Kane Briefing',
    url: 'https://news.google.com'
  }
];

const fetchJson = async (baseUrl, { params = {}, timeout = 5000 } = {}) => {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
};

let genAI;
const getAiModel = () => {
  if (!genAI && process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI?.getGenerativeModel({ model: 'gemini-2.5-flash' });
};

// ========================
// 1. MORNING BRIEFING API
// ========================

router.get('/briefing/morning', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Fetch unread message count
    const unreadChats = await Chat.find({ participants: req.user.id })
      .populate('participants', 'username profilePicture')
      .populate('lastMessage')
      .limit(30);

    let unreadCount = 0;
    let unreadPreviews = [];
    
    for (const chat of unreadChats) {
      const unreadMsg = chat.unreadCount?.get?.(req.user.id) || chat.unreadCount?.[req.user.id] || 0;
      if (unreadMsg > 0) {
        unreadCount += unreadMsg;
        const chatName = chat.isGroupChat ? chat.groupName : chat.participants
          .find(p => p.toString() !== req.user.id)?.username || 'Unknown';
        unreadPreviews.push({
          chatId: chat._id,
          name: chatName,
          count: unreadMsg,
          lastMessage: chat.lastMessage?.content?.substring(0, 50) || 'New messages'
        });
      }
    }

    // Fetch top 5 news from NewsAPI
    let topNews = [];
    try {
      const newsInterests = user.preferences?.newsInterests || ['tech', 'health'];
      const newsQuery = newsInterests.join(' OR ');
      
      const newsData = await fetchJson('https://newsapi.org/v2/everything', {
        params: {
          q: newsQuery,
          sortBy: 'publishedAt',
          language: 'en',
          pageSize: 5,
          apiKey: process.env.NEWS_API_KEY || 'demo'
        },
        timeout: 5000
      });

      topNews = (newsData?.articles || []).map(article => ({
        title: article.title,
        description: article.description?.substring(0, 100),
        url: article.url,
        source: article.source?.name,
        image: article.urlToImage,
        publishedAt: article.publishedAt
      }));
    } catch (newsErr) {
      console.warn('News API error:', newsErr.message);
        topNews = FALLBACK_TOP_NEWS;
    }

    // Get today's habits/streaks
    const todayStr = new Date().toISOString().split('T')[0];
    const todayMood = user.wellness?.moodHistory?.find(m => 
      m.date?.toISOString().split('T')[0] === todayStr
    );

    // Get weather (optional - OpenWeatherMap)
    let weather = null;
    if (user.location) {
      try {
        const weatherData = await fetchJson('https://api.openweathermap.org/data/2.5/weather', {
          params: {
            q: user.location,
            appid: process.env.OPENWEATHER_API_KEY || 'demo',
            units: 'metric'
          },
          timeout: 5000
        });
        weather = {
          temp: weatherData.main.temp,
          condition: weatherData.weather[0].main,
          icon: weatherData.weather[0].icon,
          city: weatherData.name
        };
      } catch (weatherErr) {
        console.warn('Weather API error:', weatherErr.message);
      }
    }

    // Get overdue reminders/tasks (if exists)
    const reminders = [];
    if (user.preferences?.enableBriefing) {
      // This would connect to your reminders collection
      // For now, placeholder
    }

    res.status(200).json({
      greeting: `Hey boss! 🌅`,
      briefing: {
        unreadMessages: {
          count: unreadCount,
          previews: unreadPreviews
        },
        topNews: topNews.length > 0 ? topNews : FALLBACK_TOP_NEWS,
        todayMood: todayMood?.mood || null,
        streaks: {
          exercise: user.wellness?.streaks?.exercise || 0,
          meditation: user.wellness?.streaks?.meditation || 0,
          waterIntake: user.wellness?.streaks?.waterIntake || 0
        },
        weather: weather,
        reminders: reminders,
        productivityScore: user.wellness?.productivityScore || 0
      },
      prompts: {
        wantNews: user.preferences?.enableNewsDigest !== false,
        wantMoodCheck: !todayMood, // Show mood check if not done today
        wantHealthUpdate: user.preferences?.enableHealthReminders
      }
    });
  } catch (error) {
    console.error('Briefing error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Log mood check-in
router.post('/briefing/mood-checkin', auth, async (req, res) => {
  try {
    const { mood, text } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user.wellness) user.wellness = {};
    if (!user.wellness.moodHistory) user.wellness.moodHistory = [];

    user.wellness.currentMood = mood;
    user.wellness.moodHistory.push({
      date: new Date(),
      mood: mood
    });

    await user.save();
    const mindfulnessByMood = {
      happy: 'Lock in the good energy: name one thing you want to make progress on today.',
      focused: 'Try a 25-minute focus sprint, then take a real break.',
      tired: 'Keep the schedule light and drink water before your next task.',
      stressed: 'Take three slow breaths: inhale for 4, hold for 2, exhale for 6.',
      sad: 'Be gentle with yourself. One small completed task is enough momentum.'
    };

    res.status(200).json({
      message: 'Mood logged',
      mood,
      mindfulness: mindfulnessByMood[text] || mindfulnessByMood.stressed
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/compose', auth, async (req, res) => {
  try {
    const { draft, intent, tone = 'friendly', context = '', variants = false } = req.body;
    const source = draft || intent;
    if (!source?.trim()) {
      return res.status(400).json({ message: 'Draft or intent is required' });
    }

    const model = getAiModel();
    if (!model) {
      const fallback = source.trim();
      return res.status(200).json({
        message: fallback,
        variants: variants ? [
          { tone: 'friendly', text: fallback },
          { tone: 'short', text: fallback.slice(0, 160) },
          { tone: 'professional', text: fallback }
        ] : []
      });
    }

    const prompt = variants
      ? `Rewrite this message into 4 useful chat-ready variants. Context: ${context || 'none'}.
Input: "${source}"
Return ONLY JSON: {"variants":[{"tone":"friendly","text":"..."},{"tone":"professional","text":"..."},{"tone":"short","text":"..."},{"tone":"warm","text":"..."}]}`
      : `Rewrite this message for a ${tone} tone. Keep it natural, concise, and ready to send.
Context: ${context || 'none'}
Input: "${source}"
Return ONLY the rewritten message.`;

    const result = await model.generateContent(prompt);
    let textOut = result.response.text().trim().replace(/```json/gi, '').replace(/```/g, '').trim();

    if (variants) {
      const match = textOut.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : textOut);
      return res.json({ variants: parsed.variants || [] });
    }

    res.json({ message: textOut.replace(/^["']|["']$/g, '') });
  } catch (error) {
    console.error('Compose error:', error);
    res.status(500).json({ message: 'Failed to compose message' });
  }
});

// ========================
// 2. SMART REPLIES API
// ========================

router.post('/suggest-replies', auth, async (req, res) => {
  try {
    const { messageContent, senderName } = req.body;
    const model = getAiModel();

    if (!model) {
      return res.status(400).json({ message: 'AI model not configured' });
    }

    const prompt = `You are an expert at crafting contextual message replies. 
    
Analyze this incoming message and suggest exactly 5 different tone-based replies:
- Casual: Friendly and laid-back
- Professional: Formal and respectful
- Funny: Humorous and entertaining
- Empathetic: Compassionate and understanding
- Flirty: Light and playful

Incoming message from ${senderName}: "${messageContent}"

Respond with ONLY a valid JSON object (no markdown):
{
  "casual": "your casual reply here",
  "professional": "your professional reply here",
  "funny": "your funny reply here",
  "empathetic": "your empathetic reply here",
  "flirty": "your flirty reply here",
  "sentiment": "positive|neutral|negative",
  "suggestedTone": "casual|professional|funny|empathetic|flirty"
}`;

    const result = await model.generateContent(prompt);
    let textOut = result.response.text().trim();
    textOut = textOut.replace(/```json/g, '').replace(/```/g, '').trim();

    let suggestions;
    try {
      suggestions = JSON.parse(textOut);
    } catch (parseErr) {
      const match = textOut.match(/\{[\s\S]*\}/);
      suggestions = JSON.parse(match[0]);
    }

    res.status(200).json(suggestions);
  } catch (error) {
    console.error('Reply suggestion error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Adjust tone of a message
router.post('/tone-adjust', auth, async (req, res) => {
  try {
    const { message, targetTone, intensity } = req.body; // intensity: 1-10
    const model = getAiModel();

    if (!model) {
      return res.status(400).json({ message: 'AI model not configured' });
    }

    const intensityLabel = intensity <= 3 ? 'subtle' : intensity <= 7 ? 'moderate' : 'strong';

    const prompt = `Adjust this message to have a ${targetTone} tone (intensity: ${intensityLabel}/${intensity}/10):

Original message: "${message}"

Respond with ONLY the adjusted message text, no quotes or explanations.`;

    const result = await model.generateContent(prompt);
    const adjustedMessage = result.response.text().trim().replace(/^["']|["']$/g, '');

    res.status(200).json({ 
      original: message,
      adjusted: adjustedMessage,
      tone: targetTone,
      intensity 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ========================
// 3. CODE ANALYSIS API
// ========================

router.post('/analyze-code', auth, async (req, res) => {
  try {
    const { code, language } = req.body;
    const model = getAiModel();

    if (!model) {
      return res.status(400).json({ message: 'AI model not configured' });
    }

    const prompt = `You are an expert code reviewer. Analyze this ${language} code and provide:

CODE:
\`\`\`${language}
${code}
\`\`\`

Respond with ONLY a valid JSON object (no markdown):
{
  "bugs": [
    { "severity": "high|medium|low", "issue": "description", "line": number, "suggestion": "how to fix" }
  ],
  "security": [
    { "vulnerability": "description", "risk": "high|medium|low", "fix": "recommendation" }
  ],
  "performance": [
    { "issue": "description", "optimization": "how to improve" }
  ],
  "bestPractices": [
    { "issue": "description", "suggestion": "recommendation" }
  ],
  "explanation": "Brief plain-English explanation of what this code does",
  "score": 0-100
}`;

    const result = await model.generateContent(prompt);
    let textOut = result.response.text().trim();
    textOut = textOut.replace(/```json/g, '').replace(/```/g, '').trim();

    let analysis;
    try {
      analysis = JSON.parse(textOut);
    } catch (parseErr) {
      const match = textOut.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(match[0]);
    }

    // Save to user's code snippets history
    const user = await User.findById(req.user.id);
    if (!user.codeSnippets) user.codeSnippets = [];
    
    user.codeSnippets.push({
      id: `snippet_${Date.now()}`,
      language,
      code,
      analysis,
      timestamp: new Date()
    });
    
    if (user.codeSnippets.length > 50) {
      user.codeSnippets = user.codeSnippets.slice(-50);
    }

    await user.save();

    res.status(200).json({
      ...analysis,
      snippetId: `snippet_${Date.now()}`
    });
  } catch (error) {
    console.error('Code analysis error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Generate test cases for code
router.post('/generate-tests', auth, async (req, res) => {
  try {
    const { code, language } = req.body;
    const model = getAiModel();

    if (!model) {
      return res.status(400).json({ message: 'AI model not configured' });
    }

    const prompt = `Generate comprehensive unit test cases for this ${language} code. Include edge cases, error handling, and normal flow tests.

CODE:
\`\`\`${language}
${code}
\`\`\`

Respond with the test code only (no explanation), ready to copy-paste.`;

    const result = await model.generateContent(prompt);
    const testCode = result.response.text().trim();

    res.status(200).json({
      testCode,
      language: `${language}_tests`
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ========================
// 4. CONVERSATION RECAP
// ========================

router.post('/chat-recap', auth, async (req, res) => {
  try {
    const { chatId, days = 7 } = req.body;
    const model = getAiModel();

    if (!model) {
      return res.status(400).json({ message: 'AI model not configured' });
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    const messages = await Message.find({
      chatId,
      createdAt: { $gte: since }
    })
      .populate('senderId', 'username')
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    const threadText = messages
      .map(m => `[${m.senderId?.username || 'Unknown'}]: ${m.content}`)
      .join('\n');

    const prompt = `Summarize this group chat discussion. Provide:
1. Key decisions made
2. Action items with owners
3. Main topics discussed
4. Any agreements reached

Chat thread:
${threadText}

Respond with ONLY a valid JSON object (no markdown):
{
  "summary": "brief overall summary",
  "keyDecisions": ["decision1", "decision2"],
  "actionItems": [
    { "item": "description", "owner": "username", "dueDate": "optional" }
  ],
  "topics": ["topic1", "topic2"],
  "agreements": ["agreement1"],
  "sentiment": "positive|neutral|negative"
}`;

    const result = await model.generateContent(prompt);
    let textOut = result.response.text().trim();
    textOut = textOut.replace(/```json/g, '').replace(/```/g, '').trim();

    let recap;
    try {
      recap = JSON.parse(textOut);
    } catch (parseErr) {
      const match = textOut.match(/\{[\s\S]*\}/);
      recap = JSON.parse(match[0]);
    }

    res.status(200).json(recap);
  } catch (error) {
    console.error('Recap error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
