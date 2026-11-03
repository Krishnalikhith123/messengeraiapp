import express from 'express';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';
import User from '../models/User.js';
import Event from '../models/Event.js';
import Story from '../models/Story.js';
import { emitToUser } from '../socket.js';
import { broadcastToChatParticipants } from '../utils/messageBroadcast.js';
import { fetchLinkPreview } from '../utils/linkPreview.js';
import { getMemberRole, canSendMessages, canModerate } from '../utils/groupPermissions.js';
import { auth } from '../middleware/auth.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { evaluateAutomationRules } from './automationRules.js';

const router = express.Router();

const requireValidChatId = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.chatId)) {
    return res.status(404).json({ message: 'Chat not found' });
  }
  next();
};

// Initialize Gemini AI (Lazy)
let genAI;
let model;

const getAiModel = () => {
  if (!model) {
    if (!process.env.GEMINI_API_KEY) return null;
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const modelName = "gemini-2.5-flash"; // Verified available in the API list
    console.log(`🤖 Initializing AI with model: ${modelName}`);
    model = genAI.getGenerativeModel({ model: modelName });
  }
  return model;
};

// Extract user intent using Gemini AI
router.post('/ai/extract-intent', auth, async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ message: 'Transcript is required' });

    const aiModel = getAiModel();
    if (!aiModel) {
      return res.status(500).json({ message: 'AI Assistant is not configured.' });
    }

    const prompt = `You are an advanced intent parser for a futuristic messaging application voice assistant named Kane.
The user will give you a voice command. Extract the action and the relevant entities.
You MUST return ONLY a valid JSON object. No other text.

Supported Actions:
1. "reply" - Sending a message to someone. 
   Entities: "recipientName" (string), "content" (string)
2. "create_group" - Creating a group chat. 
   Entities: "groupName" (string, default to "New Group" if not specified), "participantNames" (array of strings)
3. "check_stories" - Checking stories/statuses.
4. "catch_me_up" - Summarizing recent messages.
5. "activate_ghost_mode" - Activating ghost mode / going offline / turning on ghost mode / hiding online status.
6. "update_story" - Posting/updating a new text story/status update.
   Entities: "content" (string, the story text to post)
7. "add_contact" - Adding a contact or friend to the contacts list.
   Entities: "contactName" (string, the name of the contact to add)
8. "news" - If the user asks to tell the news, what is going on around the world, show world events, news headlines.
9. "set_message_reminder" - Remind about a message later (tomorrow, in 1 hour, etc).
   Entities: "remindAtText" (string, when to remind), "note" (string, optional reminder note)
10. "open_music" - Open music player, play a song, search music on spotify/youtube.
   Entities: "songQuery" (string, optional song/artist to search)
11. "start_health_habit" - Start a health/fitness habit streak or plan.
   Entities: "habitType" (one of gym, walking, water, healthy_food, medication, meditation, sleep, stretching, running, cycling, yoga, screen_break, protein, skincare, journaling), "details" (object with any spoken details like targetDays, restDays, glassesPerDay, medicineName, timesPerDay, mealsPerDay, cheatDays)
12. "health_habit_checkin" - User says they completed a health habit today, such as "I went to gym", "I drank my water", "I had my medicine".
   Entities: "habitType" (same list), "value" (string or number if mentioned), "note" (string)
13. "daily_activity_summary" - User asks what they did today, what happened in their daily life, or today's personal activity recap.
14. "snap_score" - User asks for their snap score or snap streak score.
15. "relationship_analytics" - User asks relationship analytics, chemistry, vibe, or stats with friends.
   Entities: "friendName" (string, optional)
16. "gaming_leaderboard" - User asks gaming leaderboard, weekly rank, first place, or their place in gaming.
17. "unknown" - If the command doesn't match above.

Rules:
- If the user says "create a group with [names]", action is "create_group".
- If the group name is not clear, use "New Group".
- Extract names of people clearly.

Example: "create a group with mallikarjun and ashwin"
JSON: { "action": "create_group", "groupName": "New Group", "participantNames": ["mallikarjun", "ashwin"] }

Example: "reply to mom I am coming home"
JSON: { "action": "reply", "recipientName": "mom", "content": "I am coming home" }

Example: "post a story saying chilling at home"
JSON: { "action": "update_story", "content": "chilling at home" }

Example: "activate ghost mode"
JSON: { "action": "activate_ghost_mode" }

Example: "tell me the news" or "whats going on around the world" or "read me the world headlines"
JSON: { "action": "news" }

Example: "add ashwin as a contact" or "add ashwin to my friends list" or "add mallikarjun"
JSON: { "action": "add_contact", "contactName": "ashwin" }

Example: "remind me about this message tomorrow" or "Kane remind me tomorrow about this"
JSON: { "action": "set_message_reminder", "remindAtText": "tomorrow", "note": "message follow-up" }

Example: "play music" or "open spotify" or "search song blinding lights"
JSON: { "action": "open_music", "songQuery": "blinding lights" }

Example: "start a gym streak" or "Kane start gym streak for 30 days and Sunday rest"
JSON: { "action": "start_health_habit", "habitType": "gym", "details": { "targetDays": 30, "restDays": [0] } }

Example: "I went to gym today" or "I took my medicine today" or "I drank 10 glasses of water"
JSON: { "action": "health_habit_checkin", "habitType": "gym", "note": "went to gym today" }

Example: "what did I do today" or "tell me my daily life recap"
JSON: { "action": "daily_activity_summary" }

Example: "what is my snap score"
JSON: { "action": "snap_score" }

Example: "tell me relationship analytics with Ashwin" or "how is my relationship with friends"
JSON: { "action": "relationship_analytics", "friendName": "Ashwin" }

Example: "what is my gaming rank" or "who is first in weekly leaderboard"
JSON: { "action": "gaming_leaderboard" }

User Command: "${transcript}"
`;

    const result = await aiModel.generateContent(prompt);
    let responseText = result.response.text().trim();
    console.log('🎤 Raw AI Intent Response:', responseText);
    
    // Improved cleaning logic
    responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const intentData = JSON.parse(responseText);
      res.status(200).json(intentData);
    } catch (parseError) {
      console.error('🎤 JSON Parse Error:', parseError, 'Content:', responseText);
      // Fallback: search for something that looks like JSON if it's buried in text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const intentData = JSON.parse(jsonMatch[0]);
        return res.status(200).json(intentData);
      }
      throw parseError;
    }
  } catch (error) {
    console.error('AI Intent Extraction Error:', error);
    res.status(500).json({ message: 'Failed to process voice command.' });
  }
});

// Summarize unread messages using Gemini AI
router.post('/ai/summarize', auth, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: 'Messages array is required' });
    }

    const aiModel = getAiModel();
    if (!aiModel) return res.status(500).json({ message: 'AI Assistant is not configured.' });

    const formattedMessages = messages.map(m => `[From ${m.senderName}]: ${m.content}`).join('\n');

    const prompt = `
You are Kane, a futuristic AI assistant for a messaging app. 
The user asked to be "Caught Up" on their unread messages.
Here are the unread messages:
${formattedMessages}

Provide a very short, conversational, and friendly 2-3 sentence summary of what the user missed.
Do not use bullet points, just a natural spoken paragraph. Start with "Here is what you missed..." or similar.
`;

    const result = await aiModel.generateContent(prompt);
    let summary = result.response.text().trim();
    
    res.status(200).json({ summary });
  } catch (error) {
    console.error('AI Summarization Error:', error);
    res.status(500).json({ message: 'Failed to summarize messages.' });
  }
});

// Get all unread messages for the logged-in user
router.get('/unread/all', auth, async (req, res) => {
  try {
    const unreadMessages = await Message.find({
      recipientId: req.user.id,
      isRead: false,
      isDeleted: false,
      messageType: 'text' // Only fetch text messages for AI reading
    }).populate('senderId', 'username').sort({ createdAt: 1 });

    res.status(200).json(unreadMessages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark specific messages as read
router.post('/mark-read', auth, async (req, res) => {
  try {
    const { messageIds } = req.body;
    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ message: 'Invalid message IDs' });
    }

    await Message.updateMany(
      { _id: { $in: messageIds }, recipientId: req.user.id },
      { 
        isRead: true,
        $addToSet: { readBy: req.user.id }
      }
    );

    res.status(200).json({ message: 'Messages marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get messages for a chat
router.get('/:chatId([0-9a-fA-F]{24})', auth, requireValidChatId, async (req, res) => {
  try {
    const messages = await Message.find({ 
      chatId: req.params.chatId,
      isDeleted: false,
      deletedFor: { $nin: [req.user.id] },
      $or: [
        { isScheduled: false },
        { isScheduled: true, senderId: req.user.id }
      ]
    })
      .populate('senderId', 'username profilePicture')
      .populate({
        path: 'replyTo',
        select: 'content messageType senderId',
        populate: { path: 'senderId', select: 'username' }
      })
      .populate('reactions.user', 'username')
      .sort({ createdAt: 1 });

    // Mark messages as read
    const readResult = await Message.updateMany(
      { 
        chatId: req.params.chatId,
        recipientId: req.user.id,
        isRead: false
      },
      { 
        isRead: true,
        deliveryStatus: 'read',
        $addToSet: { readBy: req.user.id }
      }
    );

    if (readResult.modifiedCount > 0) {
      const readMsgs = await Message.find({
        chatId: req.params.chatId,
        senderId: { $ne: req.user.id },
        deliveryStatus: 'read'
      }).select('_id senderId').limit(50);
      readMsgs.forEach((m) => {
        emitToUser(m.senderId.toString(), 'message-delivery-update', {
          messageId: m._id,
          deliveryStatus: 'read'
        });
      });
    }

    // Reset unread count for this chat
    await Chat.findByIdAndUpdate(
      req.params.chatId,
      { $set: { [`unreadCount.${req.user.id}`]: 0 } }
    );

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Send message
router.post('/', auth, async (req, res) => {
  try {
    const { chatId, recipientId, content, messageType, mediaUrl, duration, replyTo, isAdHocBill, billDescription, billTotal, latitude, longitude, locationLabel, messageEffect, mentions, fileName, fileSize, linkPreview } = req.body;

    const chatForPerms = await Chat.findById(chatId);
    if (chatForPerms?.isGroupChat) {
      const role = getMemberRole(chatForPerms, req.user.id);
      if (!canSendMessages(role)) {
        return res.status(403).json({ message: 'Read-only members cannot send messages (#101)' });
      }
      const slowSec = chatForPerms.slowModeSeconds || 0;
      if (slowSec > 0 && !canModerate(chatForPerms, req.user.id)) {
        const last = chatForPerms.slowModeLastSent?.get?.(req.user.id) || chatForPerms.slowModeLastSent?.[req.user.id];
        if (last) {
          const elapsed = (Date.now() - new Date(last).getTime()) / 1000;
          if (elapsed < slowSec) {
            return res.status(429).json({
              message: `Slow mode: wait ${Math.ceil(slowSec - elapsed)}s (#106)`,
              waitSeconds: Math.ceil(slowSec - elapsed)
            });
          }
        }
        if (!chatForPerms.slowModeLastSent) chatForPerms.slowModeLastSent = new Map();
        chatForPerms.slowModeLastSent.set(req.user.id, new Date());
        await chatForPerms.save();
      }
    }

    let billSplits = [];
    if (isAdHocBill && billTotal) {
      const chatDoc = await Chat.findById(chatId);
      if (chatDoc) {
        const totalParticipants = chatDoc.participants.length || 1;
        const share = Number(billTotal) / totalParticipants;
        billSplits = chatDoc.participants.map(pId => ({
          user: pId,
          share: share,
          paid: pId.toString() === req.user.id // The creator of the bill split paid the initial total bill, so they start settled
        }));
      }
    }

    let parsedMentions = mentions || [];
    let parsedLinkPreview = linkPreview || null;

    if (content && messageType === 'text') {
      const chatDocForMentions = await Chat.findById(chatId).populate('participants', 'username');
      if (chatDocForMentions?.isGroupChat) {
        const mentionMatches = content.match(/@(\w+)/g) || [];
        const usernames = [...new Set(mentionMatches.map((m) => m.slice(1).toLowerCase()))];
        parsedMentions = chatDocForMentions.participants
          .filter((p) => usernames.includes(p.username?.toLowerCase()))
          .map((p) => p._id);
      }
      if (!parsedLinkPreview) {
        const urlMatch = content.match(/https?:\/\/[^\s<>"']+/);
        if (urlMatch) {
          parsedLinkPreview = await fetchLinkPreview(urlMatch[0]);
        }
      }
    }

    const message = new Message({
      chatId,
      senderId: req.user.id,
      recipientId,
      content,
      messageType,
      mediaUrl,
      duration,
      replyTo: replyTo || null,
      isRead: false,
      isVanish: req.body.isVanish || false,
      isAdHocBill: isAdHocBill || false,
      billDescription: billDescription || '',
      billTotal: billTotal || 0,
      billSplits,
      isSnap: req.body.isSnap || false,
      latitude,
      longitude,
      locationLabel,
      messageEffect: messageEffect || 'none',
      mentions: parsedMentions,
      ...(parsedLinkPreview ? { linkPreview: parsedLinkPreview } : {}),
      fileName: fileName || '',
      fileSize: fileSize || 0,
      deliveryStatus: 'sent'
    });

    await message.save();
    await message.populate('senderId', 'username profilePicture');
    await message.populate('billSplits.user', 'username profilePicture');
    if (replyTo) {
      await message.populate({
        path: 'replyTo',
        select: 'content messageType senderId',
        populate: { path: 'senderId', select: 'username' }
      });
    }

    // Notify mentioned users
    if (parsedMentions.length > 0) {
      parsedMentions.forEach((uid) => {
        if (uid.toString() !== req.user.id) {
          emitToUser(uid.toString(), 'mention-notification', {
            chatId,
            messageId: message._id,
            senderName: message.senderId?.username
          });
        }
      });
    }

    // Update chat last message
    const chat = await Chat.findByIdAndUpdate(
      chatId,
      {
        lastMessage: message._id,
        lastMessageTime: new Date(),
        $inc: { [`unreadCount.${recipientId}`]: 1 }
      },
      { new: true }
    );

    // Dynamic SnapStreak check
    if (message.isSnap) {
      checkAndUpdateStreak(chatId).catch(err => console.error(err));
      updateSnapScoresOnSend(req.user.id, chatId).catch(err => console.error(err));
    }

    res.status(201).json(message);

    evaluateAutomationRules(message).catch((err) => console.error('Automation rules error:', err));

    // AI POST-PROCESSING (Background Tasks)
    (async () => {
      const aiModel = getAiModel();
      if (!aiModel) return;

      const chatDoc = await Chat.findById(chatId).populate('participants');
      if (!chatDoc) return;

      // 1. @Kane Chat Co-Pilot (Case-Insensitive, Direct & Group Chats)
      if (content.toLowerCase().includes('@kane')) {
        try {
          // Fetch last 10 messages for context
          const recentMsgs = await Message.find({ chatId }).sort({ createdAt: -1 }).limit(10).populate('senderId', 'username');
          const contextStr = recentMsgs.reverse().map(m => `[${m.senderId?.username || 'User'}]: ${m.content}`).join('\n');
          
          const prompt = `You are Kane, a friendly and intelligent AI assistant in this chat. 
Recent Chat History Context:
${contextStr}

The user just sent: "${content}"
Provide a helpful, direct, friendly, and concise response. Do not use markdown wrappers.`;

          const result = await aiModel.generateContent(prompt);
          let botReply = result.response.text().trim();

          // Find or create AI Bot User
          let botUser = await User.findOne({ username: 'Kane (AI)' });
          if (!botUser) {
            botUser = new User({ username: 'Kane (AI)', email: 'kane@ai.bot', password: 'ai', isBot: true });
            await botUser.save();
          }

          const recipientId = chatDoc.isGroupChat 
            ? undefined 
            : chatDoc.participants.find(p => p._id.toString() !== req.user.id)?._id;

          const botMessage = new Message({
            chatId,
            senderId: botUser._id,
            recipientId,
            content: botReply,
            messageType: 'text',
            isRead: false
          });
          await botMessage.save();
          await botMessage.populate('senderId', 'username profilePicture');

          // Update chat
          await Chat.findByIdAndUpdate(chatId, { lastMessage: botMessage._id, lastMessageTime: new Date() });

          // Emit to all participants
          chatDoc.participants.forEach(p => {
            emitToUser(p._id, 'receive-message', { ...botMessage.toObject(), recipientId: p._id });
            if (p._id.toString() !== req.user.id) {
               emitToUser(p._id, 'unread-notification', { senderId: botUser._id, senderName: 'Kane (AI)', message: chatDoc.isGroupChat ? 'Kane (AI) replied in the group.' : 'Kane (AI) replied.' });
            }
          });
        } catch (e) {
          console.error('Co-Pilot Error:', e);
        }
      }

      // 1.5 Ghost Mode Auto-Responder (Loop Protected, Direct Chats only)
      if (recipientId && !chatDoc.isGroupChat && !content.startsWith('🤖 [Ghost Mode]')) {
        try {
          const recipient = await User.findById(recipientId);
          if (recipient && recipient.ghostModeActive) {
            const reason = recipient.ghostModeReason || 'away';
            const returnTime = recipient.ghostModeReturnTime || 'later';
            
            const autoReplyContent = `🤖 [Ghost Mode]: Hey! ${recipient.username} is currently ${reason}. They expect to be back online at ${returnTime}.`;

            const ghostMessage = new Message({
              chatId,
              senderId: recipient._id,
              recipientId: req.user.id,
              content: autoReplyContent,
              messageType: 'text',
              isRead: false
            });
            await ghostMessage.save();
            await ghostMessage.populate('senderId', 'username profilePicture');

            // Update chat last message
            await Chat.findByIdAndUpdate(chatId, {
              lastMessage: ghostMessage._id,
              lastMessageTime: new Date()
            });

            // Emit to both participants
            chatDoc.participants.forEach(p => {
              emitToUser(p._id, 'receive-message', { ...ghostMessage.toObject(), recipientId: p._id });
            });
          }
        } catch (ghostErr) {
          console.error('Ghost Auto-Responder Error:', ghostErr);
        }
      }

      // 2. Autonomous Event Extraction
      const timeKeywords = ['tomorrow', 'today', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', ' pm', ' am', ' at ', 'let\'s meet'];
      if (timeKeywords.some(kw => content.toLowerCase().includes(kw))) {
        try {
          const eventPrompt = `Extract event details from this message if any exist: "${content}". 
Current local time is: ${new Date().toString()}.
Return ONLY JSON format: { 
  "isEvent": true/false, 
  "title": "...", 
  "date": "...", 
  "time": "...", 
  "location": "...",
  "isoDateTime": "YYYY-MM-DDTHH:MM:SS.000Z" (Calculate this exact ISO string in UTC or standard local timezone, based on the current local time provided above)
}. No markdown wrappers.`;
          
          const eventResult = await aiModel.generateContent(eventPrompt);
          let rawEvent = eventResult.response.text().trim();
          
          // Clean markdown code blocks robustly
          rawEvent = rawEvent.replace(/```json/gi, '').replace(/```/g, '').trim();
          
          // Regex fallback if needed
          let eventData = { isEvent: false };
          try {
            eventData = JSON.parse(rawEvent);
          } catch (parseErr) {
            const jsonMatch = rawEvent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              eventData = JSON.parse(jsonMatch[0]);
            }
          }
          
          if (eventData.isEvent) {
             const newEvent = new Event({
               title: eventData.title,
               date: eventData.date,
               time: eventData.time,
               location: eventData.location,
               eventTimestamp: eventData.isoDateTime ? new Date(eventData.isoDateTime) : null,
               chatId,
               createdBy: req.user.id
             });
             await newEvent.save();
             
             // Emit to participants
             chatDoc.participants.forEach(p => {
               emitToUser(p._id, 'new-event', newEvent.toObject());
             });
          }
        } catch (e) {
          console.error('Event Extraction Error:', e);
        }
      }
    })();

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: error.message || 'Failed to send message' });
  }
});

// Stateless AI Assistant Chat Route for Floating Assistant
router.post('/ai-chat', auth, async (req, res) => {
  try {
    const { content } = req.body;
    
    const aiModel = getAiModel();
    if (!aiModel) {
      return res.status(200).json({ reply: "I'm currently in 'offline mode' because no API key was found. Please add GEMINI_API_KEY to the .env file!" });
    }

    // Generate real AI response
    const result = await aiModel.generateContent(content);
    const aiContent = result.response.text();

    // Return stateless response
    res.status(200).json({ reply: aiContent });
  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ 
      message: "Sorry, I had trouble processing that request. Please try again later." 
    });
  }
});

// Mark as read
router.put('/:messageId/read', auth, async (req, res) => {
  try {
    const message = await Message.findByIdAndUpdate(
      req.params.messageId,
      {
        isRead: true,
        $addToSet: { readBy: req.user.id }
      },
      { new: true }
    );

    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add or remove reaction
router.post('/:messageId/react', auth, async (req, res) => {
  try {
    const { emoji } = req.body;
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const existingReactionIndex = message.reactions.findIndex(
      (r) => r.emoji === emoji && r.user.toString() === req.user.id
    );

    if (existingReactionIndex !== -1) {
      message.reactions.splice(existingReactionIndex, 1);
    } else {
      message.reactions.push({ emoji, user: req.user.id });
    }

    await message.save();
    await message.populate('reactions.user', 'username');

    await broadcastToChatParticipants(message.chatId, req.user.id, 'message-reacted', message.toObject());

    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete message (soft delete) — prefer /api/messaging/:id?forEveryone=true for new clients
router.delete('/:messageId', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user is the sender
    if (message.senderId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this message' });
    }

    // Soft delete - just mark as deleted
    const deletedMessage = await Message.findByIdAndUpdate(
      req.params.messageId,
      { 
        isDeleted: true,
        deletedAt: new Date(),
        content: 'This message was deleted'
      },
      { new: true }
    );

    await broadcastToChatParticipants(message.chatId, req.user.id, 'message-deleted', {
      messageId: message._id,
      forEveryone: true,
      data: deletedMessage
    });

    res.status(200).json({ message: 'Message deleted successfully', data: deletedMessage });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete all messages in a chat
router.delete('/chat/:chatId/all', auth, async (req, res) => {
  try {
    await Message.deleteMany({ chatId: req.params.chatId });
    
    await Chat.findByIdAndUpdate(
      req.params.chatId,
      {
        lastMessage: null,
        lastMessageTime: new Date(),
        $set: { 'unreadCount.$[]': 0 }
      }
    );

    res.status(200).json({ message: 'All messages deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Fetch all active events for a chat
router.get('/:chatId([0-9a-fA-F]{24})/events', auth, requireValidChatId, async (req, res) => {
  try {
    const events = await Event.find({ chatId: req.params.chatId, isOver: { $ne: true } }).sort({ createdAt: 1 });
    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete/Dismiss an event
router.delete('/events/:eventId', auth, async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.eventId);
    res.status(200).json({ message: 'Event dismissed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// AI Chat Summarizer (TL;DR) Dashboard
router.post('/:chatId([0-9a-fA-F]{24})/tldr', auth, requireValidChatId, async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId })
      .populate('senderId', 'username')
      .sort({ createdAt: -1 })
      .limit(50);

    if (messages.length === 0) {
      return res.status(200).json({ tldr: "No messages in this chat yet!" });
    }

    // Format in chronological order
    const chatText = messages.reverse().map(m => `[${m.senderId?.username || 'User'}]: ${m.content}`).join('\n');

    const aiModel = getAiModel();
    if (!aiModel) {
      return res.status(200).json({ tldr: "AI Assistant is not configured. Summaries are unavailable." });
    }

    const prompt = `You are Kane, an advanced chat analyst.
The user wants a "TL;DR" (Too Long; Didn't Read) summary of the recent conversation in this chat window.
Here is the transcript of the last 50 messages:
${chatText}

Generate a concise, friendly summary consisting of:
1. A brief 1-sentence overview of the conversation.
2. A beautiful bulleted list of 2-3 key decisions, topics, or action items discussed (use relevant emojis for bullets).
Return ONLY the formatted text. Keep it highly readable and visually polished. Speak directly to the user as Kane.`;

    const result = await aiModel.generateContent(prompt);
    const tldr = result.response.text().trim();

    res.status(200).json({ tldr });
  } catch (error) {
    console.error('TLDR Error:', error);
    res.status(500).json({ message: 'Failed to generate chat summary.' });
  }
});

// Voice Message Audio-to-Text Transcription using Multimodal Gemini
router.post('/:messageId/transcribe', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Voice message not found' });
    }

    // If already transcribed, return it
    if (message.transcription) {
      return res.status(200).json({ transcription: message.transcription });
    }

    if (message.messageType !== 'voice' || !message.mediaUrl) {
      return res.status(400).json({ message: 'Message is not a voice message or lacks audio media.' });
    }

    const aiModel = getAiModel();
    if (!aiModel) {
      return res.status(200).json({ transcription: "Speech-to-text is disabled (Gemini not configured)." });
    }

    // Strip out base64 media header (e.g. data:audio/mpeg;base64,...)
    const base64Data = message.mediaUrl.split(';base64,').pop();

    console.log(`🤖 Attempting speech-to-text transcription via Gemini for message: ${message._id}`);
    
    // Call Gemini with the raw audio data!
    const response = await aiModel.generateContent([
      {
        inlineData: {
          data: base64Data,
          mimeType: "audio/mp3"
        }
      },
      "You are Kane, an advanced speech-to-text transcriber. Transcribe this audio file precisely word-for-word. Do not summarize, do not add introductory remarks. Return ONLY the raw transcribed text. If there is no speech, return '(Unintelligible speech or silence)'."
    ]);

    const transcription = response.response.text().trim();
    message.transcription = transcription;
    await message.save();

    res.status(200).json({ transcription });
  } catch (error) {
    console.error('Transcription Error:', error);
    res.status(500).json({ message: 'Failed to transcribe voice message.' });
  }
});

// Translate Message using Gemini
router.post('/:messageId/translate', auth, async (req, res) => {
  try {
    const { targetLanguage } = req.body;
    if (!targetLanguage) {
      return res.status(400).json({ message: 'Target language is required' });
    }

    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const aiModel = getAiModel();
    if (!aiModel) {
      return res.status(200).json({ translatedText: `Translation disabled (Gemini not configured).` });
    }

    const prompt = `Translate the following text into ${targetLanguage}. Return ONLY the translated text, do not add any quotes, preamble, or explanations.
Text: "${message.content}"`;

    const result = await aiModel.generateContent(prompt);
    const translatedText = result.response.text().trim();

    res.status(200).json({ translatedText });
  } catch (error) {
    console.error('Translation Error:', error);
    res.status(500).json({ message: 'Failed to translate message.' });
  }
});

// Permanent self-destruct deletion for Vanish Mode messages
router.delete('/:messageId/vanish', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message already deleted' });
    }

    // Permanently remove from database
    await Message.findByIdAndDelete(req.params.messageId);
    res.status(200).json({ message: 'Vanished message purged successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const FALLBACK_FEED = [
  {
    title: "The Power of Yet",
    content: "In times of doubt, remember: you haven't mastered everything YET. Every small step builds momentum towards your grandest dreams.",
    tag: "Motivation"
  },
  {
    title: "Global Summit Agrees on Historic Climate Protection Treaty",
    content: "Representatives from over 190 nations have signed a landmark agreement to accelerate green transition. The pact sets binding limits on high-emission industries and guarantees renewable energy funding.",
    tag: "World News"
  },
  {
    title: "Astronomers Detect Strongest Ever Cosmic Radio Burst",
    content: "A cosmic telescope has detected a highly energetic, repeating fast radio burst from a galaxy 3 billion light-years away. Scientists expect this to yield insights into black hole behaviors.",
    tag: "World News"
  },
  {
    title: "AI Breakout: Medical Diagnosis Accuracy Hits 99%",
    content: "A newly unveiled neural network has demonstrated an unprecedented 99% accuracy rate in early cancer detection. Clinical trials have begun to integrate this assistive AI in primary care.",
    tag: "World News"
  },
  {
    title: "Deep Sea Exploration Reveals 50 New Marine Species",
    content: "Biologists exploring the Mariana Trench depth anomalies have documented fifty previously unknown sea creatures. This discovery underscores the ocean's untapped biological diversity.",
    tag: "World News"
  },
  {
    title: "Global Inflation Cools down as Supply Chains Stabilize",
    content: "Leading central banks reported a significant drops in standard consumer price index rates this quarter. Lower logistical costs and bumper harvest crops are credited for the positive shift.",
    tag: "World News"
  },
  {
    title: "Supercomputer Recreates First Millisecond of Universe",
    content: "Physicists have successfully simulated the early Big Bang quark-gluon plasma state using next-gen processors. The simulation offers new avenues for quantum particle physics exploration.",
    tag: "World News"
  },
  {
    title: "Archaeologists Unearth Unknown Ancient Silk Road Hub",
    content: "Excavations in Central Asia have revealed an amazingly preserved trade hub dating back to 200 BCE. Artifacts show early, extensive global currency and technology exchanges.",
    tag: "World News"
  },
  {
    title: "Smart Cities Network Expands to 40 New Municipalities",
    content: "A global infrastructure group has rolled out integrated IoT power grids in forty new urban hubs. The setups are proven to reduce carbon footprints and lower municipal costs.",
    tag: "World News"
  },
  {
    title: "Renewable Energy Share Surpasses Fossil Fuels Globally",
    content: "An energy sector study revealed that wind and solar energy generation officially outpaced coal and gas globally. This landmark achievement signals a permanent structural shift.",
    tag: "World News"
  },
  {
    title: "Breakthrough in Biodegradable Plastic Synthesis",
    content: "Material scientists have engineered a durable, seaweed-based polymer that fully dissolves in water in just 10 days. Commercial packaging companies are already scaling up production.",
    tag: "World News"
  },
  {
    title: "Underdog Wins Grand Slam Championship in Historic Thriller",
    content: "The unseeded challenger clinched the title after an epic, five-hour tennis masterclass. Fans and experts are calling it the greatest final match in the sport's history.",
    tag: "Sports"
  },
  {
    title: "World Record Smashed in Men's 100m Freestyle Swim",
    content: "A 21-year-old swimming sensation shaved 0.15 seconds off the previous world record at the Olympic trials. The performance has left the athletic community in sheer disbelief.",
    tag: "Sports"
  },
  {
    title: "Football Giants Announce Groundbreaking Youth Academy Merger",
    content: "Two historic football clubs have combined their youth operations to create the largest talent incubator in Europe. The merger is expected to streamline athletic development.",
    tag: "Sports"
  },
  {
    title: "Automobile Racer Clinches Championship on Final Lap",
    content: "In a breathtaking finish, the racing driver executed a flawless overtake on the very last corner to win the Grand Prix. The victory secures their first-ever world title.",
    tag: "Sports"
  }
];

// Get AI News Feed for Daily Hub
router.get('/daily-feed', auth, async (req, res) => {
  try {
    const aiModel = getAiModel();
    if (!aiModel) {
      console.warn("AI Assistant not configured. Serving fallback news feed.");
      return res.status(200).json({ feed: FALLBACK_FEED });
    }

    const prompt = `Generate a modern, exciting, and real-time news feed containing exactly 15 items:
1. 1 highly inspiring motivation quote (tag: "Motivation")
2. 10 hot global news headlines happening around the world with a 2-sentence summary each (tag: "World News")
3. 4 major sports news headlines (tag: "Sports")

Return the result as a raw JSON array of objects. Each object must have these exact keys: "title", "content", "tag".
Do not wrap in markdown code blocks, do not add any explanation or preamble. Return ONLY the raw JSON array.`;

    let responseText = "";
    try {
      const result = await aiModel.generateContent(prompt);
      responseText = result.response.text().trim();
    } catch (apiErr) {
      console.error('Gemini API call failed, using high-fidelity fallback news feed:', apiErr);
      return res.status(200).json({ feed: FALLBACK_FEED });
    }

    // Sanitize any markdown wrapper
    responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();

    // Extract the JSON array
    const arrayMatch = responseText.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      responseText = arrayMatch[0];
    }

    let feed = [];
    try {
      // 1. Standard parser
      feed = JSON.parse(responseText);
    } catch (parseErr) {
      console.warn("Standard JSON parse failed. Attempting robust Regex recovery parser...", parseErr);
      
      // 2. Robust Regex recovery parser to parse unescaped quotes or messy outputs
      const matches = responseText.match(/\{[\s\S]*?\}/g);
      if (matches) {
        for (const match of matches) {
          try {
            const item = JSON.parse(match);
            if (item.title && item.content) {
              feed.push(item);
            }
          } catch (e3) {
            // Regex match with trailing boundary lookaheads to handle unescaped quotes safely
            const titleMatch = match.match(/"title"\s*:\s*"([\s\S]*?)"\s*(?=,|\})/);
            const contentMatch = match.match(/"content"\s*:\s*"([\s\S]*?)"\s*(?=,|\})/);
            const tagMatch = match.match(/"tag"\s*:\s*"([\s\S]*?)"\s*(?=,|\})/);
            
            if (titleMatch && contentMatch) {
              feed.push({
                title: titleMatch[1].trim(),
                content: contentMatch[1].trim(),
                tag: tagMatch ? tagMatch[1].trim() : 'World News'
              });
            }
          }
        }
      }
    }

    // 3. Guarantee success: If parsed feed is empty or malformed, seamlessly fall back to static feed
    if (!feed || !Array.isArray(feed) || feed.length === 0) {
      console.warn("Parsed feed was empty. Serving fallback news feed.");
      feed = FALLBACK_FEED;
    }

    res.status(200).json({ feed });
  } catch (error) {
    console.error('Daily Feed API Error, recovering with fallback feed:', error);
    res.status(200).json({ feed: FALLBACK_FEED });
  }
});

// Workspace AI Student Tutor assistant query
router.post('/workspace/ask', auth, async (req, res) => {
  try {
    const { chatId, question, notepadContent, docContext } = req.body;
    if (!chatId || !question) {
      return res.status(400).json({ message: 'Chat ID and question are required' });
    }

    const aiModel = getAiModel();
    if (!aiModel) {
      return res.status(500).json({ message: 'AI Assistant is not configured.' });
    }

    const prompt = `You are Kane, an advanced, interactive, and futuristic AI Student Tutor.
    The student is asking: "${question}"
    
    Context 1: Collaborative Notepad Notes:
    "${notepadContent || ''}"

    Context 2: Uploaded Document Context (if any):
    "${docContext || ''}"

    You MUST return ONLY a valid JSON object matching this schema:
    {
      "textResponse": "Your detailed explanation, study guide, markdown formatted notes, or code blocks.",
      "quizzes": [
        {
          "question": "A multiple choice question",
          "options": ["Option 0", "Option 1", "Option 2", "Option 3"],
          "correctAnswer": 0,
          "explanation": "Detailed explanation of correct answer"
        }
      ],
      "flashcards": [
        {
          "front": "Term / Concept",
          "back": "Detailed definition or answer"
        }
      ],
      "mindMap": {
        "nodes": [
          {"id": "node1", "label": "Main Topic", "x": 200, "y": 50, "type": "root"},
          {"id": "node2", "label": "Subconcept A", "x": 100, "y": 180, "type": "concept"},
          {"id": "node3", "label": "Subconcept B", "x": 300, "y": 180, "type": "concept"}
        ],
        "edges": [
          {"from": "node1", "to": "node2"},
          {"from": "node1", "to": "node3"}
        ]
      },
      "sandboxResult": {
        "consoleOutput": "Simulated terminal output of running the code if they asked to run code. Otherwise empty.",
        "errors": "Any syntax errors or exceptions detected in their code, otherwise empty.",
        "advice": "Kane's expert debugging or refactoring suggestions if code was run, otherwise empty."
      },
      "kanbanTasks": [
        {
          "id": "task_1",
          "title": "Task description extracted from note/chat context",
          "deadline": "YYYY-MM-DD or Days left",
          "status": "todo"
        }
      ]
    }

    Note on Mind Maps:
    If they click "Generate Mind Map" or ask to visualize concepts, design an elegant, spacious node diagram. Ensure coordinates (x: 50 to 550, y: 50 to 350) represent a readable tree structure. Give nodes descriptive, short titles.
    
    Note on Sandboxes:
    If they submit code to run/debug, act as the JS/Python virtual execution environment. Print exact simulated console logs, warnings, or detailed traces.

    Note on Kanban tasks:
    If they ask to scan tasks, extract clear actionable tasks with due dates.

    Ensure textResponse is clean, highly helpful, and properly formatted with Markdown.
    Return ONLY the raw JSON block without markdown formatting wrapper.`;

    const result = await aiModel.generateContent(prompt);
    let responseText = result.response.text().trim();
    responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          parsed = { textResponse: responseText, quizzes: [], flashcards: [], mindMap: null, sandboxResult: null, kanbanTasks: [] };
        }
      } else {
        parsed = { textResponse: responseText, quizzes: [], flashcards: [], mindMap: null, sandboxResult: null, kanbanTasks: [] };
      }
    }

    let botMsg;
    const botUser = await User.findOne({ username: 'Kane' }) || { _id: req.user.id };
    
    if (chatId === 'global') {
      botMsg = {
        _id: new mongoose.Types.ObjectId(),
        chatId: 'global',
        senderId: botUser,
        content: JSON.stringify(parsed),
        messageType: 'text',
        isWorkspaceMessage: true,
        createdAt: new Date()
      };
    } else {
      botMsg = new Message({
        chatId,
        senderId: botUser._id,
        content: JSON.stringify(parsed),
        messageType: 'text',
        isWorkspaceMessage: true
      });

      await botMsg.save();
      await botMsg.populate('senderId', 'username profilePicture');

      const chat = await Chat.findById(chatId);
      if (chat) {
        await Chat.findByIdAndUpdate(chatId, { lastMessage: botMsg._id, lastMessageTime: new Date() });
        chat.participants.forEach(p => {
          emitToUser(p._id, 'receive-message', { ...botMsg.toObject(), recipientId: p._id });
        });
      }
    }

    res.status(200).json(botMsg);
  } catch (error) {
    console.error('Workspace Ask Error:', error);
    res.status(500).json({ message: 'Failed to process tutoring request.' });
  }
});

// Prompt-to-SVG Transparent Vector Sticker Generator
router.post('/sticker/generate', auth, async (req, res) => {
  try {
    const { chatId, promptText } = req.body;
    if (!chatId || !promptText) {
      return res.status(400).json({ message: 'Chat ID and prompt are required' });
    }

    const aiModel = getAiModel();
    if (!aiModel) {
      return res.status(500).json({ message: 'AI Assistant is not configured.' });
    }

    const prompt = `You are an advanced SVG vector sticker designer.
    The user wants a futuristic transparent cartoon sticker of: "${promptText}".
    You MUST return a valid, standalone, raw SVG string (from <svg ...> to </svg>).
    
    Rules:
    - Keep it extremely clean, modern, and cartoonish.
    - Use bright, beautiful color gradients (neon purple, blue, gold).
    - Ensure width and height are 120px. viewBox="0 0 120 120".
    - Do not include HTML body or markdown wrappers (no \`\`\`xml or \`\`\`svg).
    - Ensure the background is transparent (do not add a solid full rect background, or keep it transparent/none).
    - You can add simple text badges inside, styled elements, cartoon faces, tech logos, or abstract vector shapes that look spectacular!
    `;

    const result = await aiModel.generateContent(prompt);
    let svgContent = result.response.text().trim();
    
    svgContent = svgContent.replace(/```xml/g, '').replace(/```svg/g, '').replace(/```/g, '').trim();

    if (!svgContent.startsWith('<svg')) {
      const match = svgContent.match(/<svg[\s\S]*<\/svg>/);
      if (match) {
        svgContent = match[0];
      } else {
        svgContent = `<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="60" cy="60" r="50" fill="url(#grad)" stroke="#a855f7" stroke-width="3"/>
          <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Outfit" font-size="12" font-weight="bold">STICKER</text>
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#3b82f6"/>
              <stop offset="100%" stop-color="#ec4899"/>
            </linearGradient>
          </defs>
        </svg>`;
      }
    }

    const stickerMsg = new Message({
      chatId,
      senderId: req.user.id,
      content: `Sticker: ${promptText}`,
      messageType: 'text',
      isSticker: true,
      stickerSvg: svgContent
    });

    await stickerMsg.save();
    await stickerMsg.populate('senderId', 'username profilePicture');

    const chat = await Chat.findById(chatId);
    if (chat) {
      await Chat.findByIdAndUpdate(chatId, { lastMessage: stickerMsg._id, lastMessageTime: new Date() });
      chat.participants.forEach(p => {
        emitToUser(p._id, 'receive-message', { ...stickerMsg.toObject(), recipientId: p._id });
      });
    }

    res.status(200).json(stickerMsg);
  } catch (error) {
    console.error('Sticker Generation Error:', error);
    res.status(500).json({ message: 'Failed to generate sticker.' });
  }
});

// Settle share of an ad-hoc split bill
router.post('/:messageId/settle-split', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Bill split card not found' });
    }

    if (!message.isAdHocBill) {
      return res.status(400).json({ message: 'Message is not a bill split card' });
    }

    const splitIdx = message.billSplits.findIndex(s => s.user.toString() === req.user.id);
    if (splitIdx === -1) {
      return res.status(400).json({ message: 'You are not a participant in this bill split' });
    }

    message.billSplits[splitIdx].paid = true;
    await message.save();
    await message.populate('senderId', 'username profilePicture');
    await message.populate('billSplits.user', 'username profilePicture');

    const chat = await Chat.findById(message.chatId);
    if (chat) {
      chat.participants.forEach(p => {
        emitToUser(p._id, 'receive-message', { ...message.toObject(), recipientId: p._id });
      });
    }

    res.status(200).json(message);
  } catch (error) {
    console.error('Settle Split Error:', error);
    res.status(500).json({ message: 'Failed to settle bill split.' });
  }
});

// Generate raw transparent SVG sticker for stories/snaps
router.post('/sticker/generate-raw', auth, async (req, res) => {
  try {
    const { promptText } = req.body;
    if (!promptText) {
      return res.status(400).json({ message: 'Prompt is required' });
    }

    const aiModel = getAiModel();
    if (!aiModel) {
      return res.status(500).json({ message: 'AI Assistant is not configured.' });
    }

    const prompt = `You are an advanced SVG vector sticker designer.
    The user wants a futuristic transparent cartoon sticker of: "${promptText}".
    You MUST return a valid, standalone, raw SVG string (from <svg ...> to </svg>).
    
    Rules:
    - Keep it extremely clean, modern, and cartoonish.
    - Use bright, beautiful color gradients (neon purple, blue, gold).
    - Ensure width and height are 120px. viewBox="0 0 120 120".
    - Do not include HTML body or markdown wrappers (no \`\`\`xml or \`\`\`svg).
    - Ensure the background is transparent (do not add a solid full rect background, or keep it transparent/none).
    `;

    const result = await aiModel.generateContent(prompt);
    let svgContent = result.response.text().trim();
    svgContent = svgContent.replace(/```xml/g, '').replace(/```svg/g, '').replace(/```/g, '').trim();

    if (!svgContent.startsWith('<svg')) {
      const match = svgContent.match(/<svg[\s\S]*<\/svg>/);
      if (match) svgContent = match[0];
    }

    res.status(200).json({ svg: svgContent });
  } catch (error) {
    console.error('Raw Sticker Generation Error:', error);
    res.status(500).json({ message: 'Failed to generate sticker.' });
  }
});

// Open/burn direct snap
router.put('/:messageId/open-snap', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Snap not found' });
    }

    if (!message.isSnap) {
      return res.status(400).json({ message: 'Message is not a snap' });
    }

    // Add recipient to viewed list
    if (!message.snapOpenedBy.some(id => id.toString() === req.user.id)) {
      message.snapOpenedBy.push(req.user.id);
      await message.save();
      await message.populate('senderId', 'username profilePicture');
      
      // Notify other user via sockets so the UI burns the snap in real-time
      const chat = await Chat.findById(message.chatId);
      if (chat) {
        chat.participants.forEach(p => {
          emitToUser(p._id.toString(), 'receive-message', { ...message.toObject(), recipientId: p._id.toString() });
        });
      }
    }

    res.status(200).json(message);
  } catch (error) {
    console.error('Open Snap Error:', error);
    res.status(500).json({ message: 'Failed to burn snap.' });
  }
});

// Check and Update Daily SnapStreak (🔥) between two users
export const checkAndUpdateStreak = async (chatId) => {
  try {
    const chat = await Chat.findById(chatId);
    if (!chat || chat.isGroupChat) return;

    const userAId = chat.participants[0];
    const userBId = chat.participants[1];

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // User A has posted a snap story OR sent a direct snap in 24h
    const userAActive = (await Story.exists({ userId: userAId, mediaType: 'image', createdAt: { $gte: oneDayAgo } })) ||
                        (await Message.exists({ senderId: userAId, chatId, isSnap: true, createdAt: { $gte: oneDayAgo } }));

    // User B has posted a snap story OR sent a direct snap in 24h
    const userBActive = (await Story.exists({ userId: userBId, mediaType: 'image', createdAt: { $gte: oneDayAgo } })) ||
                        (await Message.exists({ senderId: userBId, chatId, isSnap: true, createdAt: { $gte: oneDayAgo } }));

    if (userAActive && userBActive) {
      const now = Date.now();
      const lastUpdate = chat.lastStreakUpdate ? new Date(chat.lastStreakUpdate).getTime() : 0;
      
      // Only increment if at least 12 hours passed (prevents double increments on the same day)
      if (now - lastUpdate > 12 * 60 * 60 * 1000) {
        const newStreakCount = (chat.snapStreakCount || 0) + 1;
        chat.snapStreakCount = newStreakCount;
        chat.lastStreakUpdate = new Date();
        await chat.save();

        console.log(`🔥 SnapStreak incremented to ${newStreakCount} between ${userAId} and ${userBId}`);

        // Milestone rewards in KanePay Cash
        const milestones = { 3: 250, 7: 500, 15: 1500, 30: 5000 };
        const reward = milestones[newStreakCount];
        if (reward) {
          // Award User A
          await User.findByIdAndUpdate(userAId, {
            $inc: { 'kanePay.balanceINR': reward },
            $push: {
              'kanePay.transactions': {
                type: 'credit',
                description: `🔥 SnapStreak Milestone: ${newStreakCount} Days!`,
                amount: reward,
                counterpartyName: 'Kane Award Systems',
                date: new Date()
              }
            }
          });
          // Award User B
          await User.findByIdAndUpdate(userBId, {
            $inc: { 'kanePay.balanceINR': reward },
            $push: {
              'kanePay.transactions': {
                type: 'credit',
                description: `🔥 SnapStreak Milestone: ${newStreakCount} Days!`,
                amount: reward,
                counterpartyName: 'Kane Award Systems',
                date: new Date()
              }
            }
          });

          // Post a system message in the chat
          const botUser = await User.findOne({ username: 'Kane' });
          const botUserId = botUser ? botUser._id : userAId;
          const systemMsg = new Message({
            chatId,
            senderId: botUserId,
            content: `🎉 CONGRATULATIONS! You maintained your SnapStreak for ${newStreakCount} days! Kane has awarded ₹${reward} to both your wallets! Go get some Munchies! 🍔`,
            messageType: 'text',
            isWorkspaceMessage: true
          });
          await systemMsg.save();

          chat.participants.forEach(p => {
            emitToUser(p.toString(), 'receive-message', systemMsg.toObject());
          });
        }
      }
    }
  } catch (err) {
    console.error('Error updating SnapStreak:', err);
  }
};

// Update Friendship and Individual Snap Score on Sending Snap
export const updateSnapScoresOnSend = async (senderId, chatId) => {
  try {
    // 1. Increment User's global snapScore
    await User.findByIdAndUpdate(senderId, { $inc: { snapScore: 1 } });

    // 2. Increment Chat's friendship snapScoreDetails
    const chat = await Chat.findById(chatId);
    if (!chat) return;

    if (!chat.snapScoreDetails) {
      chat.snapScoreDetails = new Map();
    }

    const currentDetails = chat.snapScoreDetails.get(senderId.toString()) || {
      score: 0,
      lastSnapSent: new Date(),
      warningActive: false,
      status: 'active'
    };

    const newScore = (currentDetails.score || 0) + 1;
    chat.snapScoreDetails.set(senderId.toString(), {
      score: newScore,
      lastSnapSent: new Date(),
      warningActive: false,
      status: 'active'
    });

    await chat.save();
    console.log(`⚡ SnapScore incremented to ${newScore} for user ${senderId} in chat ${chatId}`);

    // Notify the sender's client so the Navbar badge refreshes in real time
    emitToUser(senderId.toString(), 'snapScoreUpdated', { snapScore: newScore });
  } catch (err) {
    console.error('Error in updateSnapScoresOnSend:', err);
  }
};

// ===== AI SMART REPLIES =====
router.get('/:messageId/smart-replies', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const aiModel = getAiModel();
    if (!aiModel) return res.json({ suggestions: ['👍 Got it!', 'Sure!', 'Thanks!'] });

    const prompt = `You are a messaging assistant. Given this message: "${message.content}", generate exactly 3 short, natural reply suggestions. Return ONLY a JSON array of 3 strings. Example: ["Sounds good!", "On my way!", "Let me check"]. No other text.`;
    const result = await aiModel.generateContent(prompt);
    let text = result.response.text().trim();
    // Strip markdown fences if present
    text = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const suggestions = JSON.parse(text);
    res.json({ suggestions: Array.isArray(suggestions) ? suggestions.slice(0, 3) : ['👍', 'Sure!', 'Thanks!'] });
  } catch (err) {
    console.error('Smart reply error:', err);
    res.json({ suggestions: ['👍 Got it!', 'Sure!', 'Thanks!'] });
  }
});

// ===== POLLS =====
// Create a poll message
router.post('/poll', auth, async (req, res) => {
  try {
    const { chatId, recipientId, pollQuestion, pollOptions, pollDurationHours = 24, pollAnonymous = false } = req.body;
    if (!chatId || !pollQuestion || !Array.isArray(pollOptions) || pollOptions.length < 2) {
      return res.status(400).json({ message: 'chatId, pollQuestion, and at least 2 pollOptions required' });
    }
    const expiry = new Date(Date.now() + pollDurationHours * 60 * 60 * 1000);
    const message = new Message({
      chatId,
      senderId: req.user.id,
      recipientId,
      content: `📊 Poll: ${pollQuestion}`,
      messageType: 'poll',
      pollQuestion,
      pollOptions: pollOptions.map(label => ({ label, votes: [] })),
      pollExpiresAt: expiry,
      pollAnonymous: !!pollAnonymous
    });
    await message.save();
    await message.populate('senderId', 'username profilePicture');
    await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id, lastMessageTime: new Date() });
    // Emit to all participants
    const chat = await Chat.findById(chatId);
    if (chat) {
      chat.participants.forEach(p => {
        if (p.toString() !== req.user.id) {
          emitToUser(p.toString(), 'receive-message', message.toObject());
        }
      });
    }
    res.status(201).json(message);
  } catch (err) {
    console.error('Poll create error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Vote on a poll
router.post('/:messageId/vote', auth, async (req, res) => {
  try {
    const { optionIndex } = req.body;
    const message = await Message.findById(req.params.messageId);
    if (!message || message.messageType !== 'poll') return res.status(404).json({ message: 'Poll not found' });
    if (message.pollExpiresAt && new Date() > message.pollExpiresAt) {
      return res.status(400).json({ message: 'Poll has expired' });
    }
    const userId = req.user.id;
    // Remove any previous vote by this user across all options
    message.pollOptions.forEach(opt => {
      opt.votes = opt.votes.filter(v => v.toString() !== userId);
    });
    // Add new vote
    if (optionIndex >= 0 && optionIndex < message.pollOptions.length) {
      message.pollOptions[optionIndex].votes.push(userId);
    }
    await message.save();
    await message.populate('senderId', 'username profilePicture');

    const payload = message.toObject();
    if (message.pollAnonymous) {
      payload.pollOptions = message.pollOptions.map((opt) => ({
        label: opt.label,
        voteCount: opt.votes?.length || 0,
        votes: []
      }));
    }

    const chat = await Chat.findById(message.chatId);
    if (chat) {
      chat.participants.forEach(p => {
        emitToUser(p.toString(), 'poll-updated', payload);
      });
    }
    res.json(payload);
  } catch (err) {
    console.error('Poll vote error:', err);
    res.status(500).json({ message: err.message });
  }
});

export { router as default };
