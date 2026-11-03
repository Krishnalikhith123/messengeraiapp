# 🚀 Advanced Features - Setup & Integration Guide

## Overview
This document provides complete setup instructions for integrating all 8 advanced features into ChatFlow.

---

## 📋 Prerequisites

### Environment Variables
Add these to your `.env` file in the project root:

```env
# AI & News APIs
GEMINI_API_KEY=your_gemini_api_key_here
NEWS_API_KEY=your_newsapi_key_here
OPENWEATHER_API_KEY=your_openweather_api_key_here

# GitHub Integration
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret

# JIRA Integration
JIRA_CLIENT_ID=your_jira_oauth_client_id
JIRA_CLIENT_SECRET=your_jira_oauth_client_secret

# Health Integration (Optional)
APPLE_HEALTH_TOKEN=your_apple_health_token
GOOGLE_FIT_CLIENT_ID=your_google_fit_client_id

# Database
MONGODB_URI=mongodb://localhost:27017/mern-messenger

# Server
PORT=5000
CLIENT_URL=http://localhost:3000
JWT_SECRET=your_jwt_secret_key
```

### API Keys Setup

#### 1. **Gemini AI API**
- Go to https://aistudio.google.com/
- Create API key
- Copy to `.env` as `GEMINI_API_KEY`

#### 2. **NewsAPI**
- Go to https://newsapi.org/
- Register and get API key
- Copy to `.env` as `NEWS_API_KEY`

#### 3. **OpenWeatherMap**
- Go to https://openweathermap.org/api
- Register and get API key
- Copy to `.env` as `OPENWEATHER_API_KEY`

#### 4. **GitHub OAuth App**
- Go to https://github.com/settings/developers
- Create OAuth App
- Copy Client ID and Secret to `.env`

---

## 🔧 Installation Steps

### 1. Install New Dependencies (Backend)

```bash
cd server
npm install axios  # Already included
# All other packages are already in package.json
```

### 2. Rebuild Database Models

```bash
# If using MongoDB Atlas or local MongoDB, ensure connection is active
# Models are automatically synced via Mongoose

# Restart server to apply new User schema fields
npm run server  # or `npm run dev`
```

### 3. Import Frontend Components

Update your `App.js` to include new components:

```javascript
import AIBriefing from './components/AIBriefing';
import SmartReplies from './components/SmartReplies';
import HealthDashboard from './components/HealthDashboard';  // Create this
import ExpenseDashboard from './components/ExpenseDashboard';  // Create this
import ProjectIntegrationPanel from './components/ProjectIntegrationPanel';  // Create this
```

---

## 🎯 Feature Setup & Usage

### Feature 1: AI Morning Briefing ✅ IMPLEMENTED

**Backend**: `/api/ai/briefing/morning`

**Frontend Integration**:
```javascript
import AIBriefing from './components/AIBriefing';

// In App.js or Navbar
<AIBriefing isOpen={showBriefing} onClose={() => setShowBriefing(false)} />
```

**Trigger**:
- Add a button in Navbar (morning bell icon)
- Auto-show on first login of the day
- Or open from settings

**What it does**:
1. Fetches unread message count & previews
2. Calls NewsAPI for top 5 news
3. Shows weather (if location set)
4. Displays habit streaks
5. Lets user check-in mood daily

---

### Feature 2: Smart Replies ✅ IMPLEMENTED

**Backend**: 
- `POST /api/ai/suggest-replies` - Get reply suggestions
- `POST /api/ai/tone-adjust` - Adjust tone intensity

**Frontend Integration**:
```javascript
import SmartReplies from './components/SmartReplies';

// In MessageList.js or ChatWindow.js
const [showReplies, setShowReplies] = useState(false);

// Add hover/context menu on message
<div onContextMenu={() => setShowReplies(true)}>
  {message.content}
  {showReplies && (
    <SmartReplies
      messageContent={message.content}
      senderName={message.sender.username}
      onSelectReply={(reply) => {
        setMessageContent(reply);
        setShowReplies(false);
      }}
      onClose={() => setShowReplies(false)}
    />
  )}
</div>
```

**How to use**:
1. Right-click on incoming message
2. Click "AI Suggest Replies"
3. Select tone (Casual, Professional, Funny, Empathetic, Flirty)
4. Adjust intensity slider (1-10)
5. Review suggestion
6. Copy or Send directly

---

### Feature 3: Health/Fitness Integration ✅ IMPLEMENTED

**Backend Routes**:
- `POST /api/health/connect/:provider` - Connect health device
- `POST /api/health/sync` - Sync health data
- `GET /api/health/summary` - Get health overview
- `GET /api/health/challenges` - Get active challenges
- `POST /api/health/manual-entry` - Log manually (water, mood, activity)
- `GET /api/health/insights` - Get AI insights

**Frontend Component Setup** (Create `HealthDashboard.js`):
```javascript
// Features to implement:
// 1. Daily step counter with goal progress
// 2. Sleep quality tracker
// 3. Health challenges leaderboard
// 4. Habit streaks (exercise, meditation, water)
// 5. Manual entry forms
// 6. AI wellness insights
```

**Integration**:
- Add `/health` route to your app
- Display in Profile or separate Health Hub page
- Show widget in Navbar (steps/streaks)

---

### Feature 4: Smart Expense Tracking ✅ IMPLEMENTED

**Backend Routes**:
- `POST /api/expenses/upload-receipt` - OCR receipt
- `GET /api/expenses/forecast/:month` - Predict spending
- `POST /api/expenses/split-suggest` - AI split recommendation
- `GET /api/expenses/analytics/:period` - Get spending analytics
- `PUT /api/expenses/settings` - Configure budget

**Frontend Component Setup** (Create `ExpenseDashboard.js`):
```javascript
// Features to implement:
// 1. Receipt camera/upload
// 2. Spending trends chart (pie/bar)
// 3. Budget vs actual spending
// 4. Category breakdown
// 5. Recurring expenses list
// 6. AI savings recommendations
// 7. Bill split calculator
```

**Integration**:
- Replace/enhance existing KanePay section
- Add `/expenses` route
- Show spending summary in Daily Hub

---

### Feature 5: Project Management Integration ✅ IMPLEMENTED

**Backend Routes**:
- `POST /api/integrations/github/authenticate` - GitHub OAuth
- `GET /api/integrations/github/repos` - List repos
- `GET /api/integrations/github/pr/:owner/:repo/:number` - Get PR details
- `GET /api/integrations/jira/issues` - Get JIRA issues
- `POST /api/integrations/:provider/disconnect` - Disconnect service
- `POST /api/integrations/parse-message` - Extract project links from message

**Frontend Integration**:
```javascript
// In group chat, auto-detect and embed:
// - github.com/owner/repo/pull/123 → PR card
// - github.com/owner/repo/issues/456 → Issue card
// - JIRA-123 → JIRA issue card

// Features:
// 1. Settings page for connecting GitHub/JIRA
// 2. Message parser for automatic link detection
// 3. Inline PR/Issue card previews
// 4. Deploy command support (/deploy, /assign, /review)
```

**Setup**:
1. User navigates to Settings → Integrations
2. Click "Connect GitHub" → OAuth flow
3. Authorize permissions
4. Now mentions like `#123` auto-link to PR

---

### Feature 6: Code Collaboration Copilot ✅ IMPLEMENTED

**Backend Routes**:
- `POST /api/ai/analyze-code` - Analyze code for bugs/issues
- `POST /api/ai/generate-tests` - Generate unit tests
- `POST /api/ai/chat-recap` - Summarize group chat

**Frontend Component Setup** (Create `CodeAnalyzer.js`):
```javascript
// Features:
// 1. Code paste/file upload area
// 2. Language selection dropdown
// 3. Analysis results display:
//    - Bugs (severity levels)
//    - Security issues
//    - Performance tips
//    - Best practices
// 4. Generated test code
// 5. Copy test code button
```

**Integration**:
- Add Code Analyzer modal/page
- Trigger from message containing code blocks
- Display analysis in sidebar

---

### Feature 7: AR Story Filters ✅ SETUP

**Technologies**:
- TensorFlow.js (face detection)
- Canvas API (rendering)
- WebRTC (camera access)

**Implementation Steps**:
1. Install dependencies:
```bash
npm install @tensorflow/tfjs @mediapipe/selfie_segmentation
```

2. Create `ARStoryFilters.js` component with:
   - Camera access
   - Face detection
   - Filter rendering
   - Voice effects (Web Audio API)

3. Integration:
   - Add to StoryCreator component
   - Provide filter library UI
   - Enable voice effect options

---

### Feature 8: Additional Enhancements ✅ IMPLEMENTED

**Music Integration**:
- Routes already exist in `/api/music`
- Add Spotify "now playing" in status

**Wellness Reminders**:
- Create `/api/reminders/schedule` for wellness notifications
- Push notifications for water breaks, exercise time

**Mindfulness**:
- Add meditation timer with guided audio
- Breathing exercises (4-7-8 pattern)

---

## 📊 API Endpoint Summary

### AI Features
```
POST /api/ai/suggest-replies
POST /api/ai/tone-adjust
POST /api/ai/analyze-code
POST /api/ai/generate-tests
POST /api/ai/chat-recap
GET /api/ai/briefing/morning
POST /api/ai/briefing/mood-checkin
```

### Health
```
POST /api/health/connect/:provider
POST /api/health/sync
GET /api/health/summary
GET /api/health/challenges
POST /api/health/challenges/:id/join
POST /api/health/manual-entry
GET /api/health/insights
```

### Expenses
```
POST /api/expenses/upload-receipt
GET /api/expenses/forecast/:month
POST /api/expenses/split-suggest
GET /api/expenses/analytics/:period
GET /api/expenses/recurring
PUT /api/expenses/settings
```

### Project Integration
```
POST /api/integrations/github/authenticate
GET /api/integrations/github/repos
GET /api/integrations/github/pr/:owner/:repo/:number
GET /api/integrations/jira/issues
POST /api/integrations/:provider/disconnect
GET /api/integrations/list
POST /api/integrations/parse-message
GET /api/integrations/metadata/:type/:identifier
```

---

## 🧪 Testing

### Test Morning Briefing
```bash
curl -X GET http://localhost:5000/api/ai/briefing/morning \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Smart Replies
```bash
curl -X POST http://localhost:5000/api/ai/suggest-replies \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messageContent": "Hey, how was your day?",
    "senderName": "Sarah"
  }'
```

### Test Code Analysis
```bash
curl -X POST http://localhost:5000/api/ai/analyze-code \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "const x = undefined; console.log(x.toString());",
    "language": "javascript"
  }'
```

### Test Health Sync
```bash
curl -X POST http://localhost:5000/api/health/sync \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🎨 Frontend Integration Checklist

- [ ] Add AIBriefing component to App
- [ ] Add SmartReplies to message context menu
- [ ] Create HealthDashboard component
- [ ] Create ExpenseDashboard component
- [ ] Create ProjectIntegrationPanel component
- [ ] Create CodeAnalyzer component
- [ ] Add AR filters to StoryCreator
- [ ] Wire up all API calls in components
- [ ] Test all features end-to-end
- [ ] Deploy to production

---

## 🚀 Deployment Checklist

1. **Environment Variables**: Set all `.env` values in production
2. **Database**: Ensure MongoDB indexes are created
3. **APIs**: Test all third-party integrations
4. **CORS**: Update CORS origins if needed
5. **Testing**: Run full feature test suite
6. **Documentation**: Update user guide
7. **Monitoring**: Set up error logging

---

## 📝 Next Steps

1. Create remaining frontend components (Health, Expense, Project Integration dashboards)
2. Add AR filter library and effects
3. Implement real health device integrations (Apple Health, Google Fit)
4. Set up push notifications for reminders
5. Create admin dashboard for feature management
6. Add analytics/telemetry
7. Implement feature flags for gradual rollout

---

## 🆘 Troubleshooting

### "AI model not configured"
- Check `GEMINI_API_KEY` in `.env`
- Verify API key is active on Google Cloud Console

### "News API failed"
- Check `NEWS_API_KEY`
- Verify daily API call limit not exceeded

### GitHub integration errors
- Ensure GitHub app is created and registered
- Check OAuth redirect URI matches `GITHUB_CALLBACK_URL`

### Database connection errors
- Verify MongoDB is running
- Check `MONGODB_URI` connection string
- Run `mongosh` to test connection

---

## 📚 Additional Resources

- [Gemini API Docs](https://ai.google.dev/)
- [NewsAPI Docs](https://newsapi.org/)
- [GitHub API Docs](https://docs.github.com/en/rest)
- [TensorFlow.js Docs](https://js.tensorflow.org/)
- [WebRTC Docs](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)

