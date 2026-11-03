import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chats.js';
import messageRoutes from './routes/messages.js';
import userRoutes from './routes/users.js';
import storyRoutes from './routes/stories.js';
import snapRoutes from './routes/snaps.js';
import analyticsRoutes from './routes/analytics.js';
import giftcardRoutes from './routes/giftcards.js';
import musicRoutes from './routes/music.js';
import challengesRoutes from './routes/challenges.js';
import calendarRoutes from './routes/calendar.js';
import gamesRoutes from './routes/games.js';
import messagingFeaturesRoutes, { processScheduledMessages } from './routes/messagingFeatures.js';
import reminderRoutes, { processDueReminders } from './routes/reminders.js';
import companionRoutes from './routes/companion.js';
import featuresRoutes from './routes/features.js';
import partyRoutes from './routes/party.js';
import dailyHubRoutes from './routes/dailyHub.js';
import groupFeaturesRoutes from './routes/groupFeatures.js';
import aiFeatures from './routes/aiFeatures.js';
import healthIntegration from './routes/healthIntegration.js';
import expenseTracking from './routes/expenseTracking.js';
import projectIntegration from './routes/projectIntegration.js';
import automationRulesRoutes from './routes/automationRules.js';
import aiLabRoutes from './routes/aiLab.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initSocket, setOnlineUsers, emitToUser, getOnlineUsers } from './socket.js';
import Event from './models/Event.js';
import Chat from './models/Chat.js';
import User from './models/User.js';
import Message from './models/Message.js';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-messenger')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.log('❌ MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/snaps', snapRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/giftcards', giftcardRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/challenges', challengesRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/messaging', messagingFeaturesRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/companion', companionRoutes);
app.use('/api/features', featuresRoutes);
app.use('/api/party', partyRoutes);
app.use('/api/daily-hub', dailyHubRoutes);
app.use('/api/groups', groupFeaturesRoutes);
// Advanced Features Routes
app.use('/api/ai', aiFeatures);
app.use('/api/health', healthIntegration);
app.use('/api/expenses', expenseTracking);
app.use('/api/integrations', projectIntegration);
app.use('/api/automations', automationRulesRoutes);
app.use('/api/ai-lab', aiLabRoutes);

// Socket.io Real-time Communication
const onlineUsers = new Map();
initSocket(io);
setOnlineUsers(onlineUsers);

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  socket.on('user-online', (userId) => {
    onlineUsers.set(userId, socket.id);
    setOnlineUsers(onlineUsers);
    io.emit('user-status-changed', { userId, status: 'online' });
  });

  socket.on('send-message', (data) => {
    const notifyRecipient = (recipientId) => {
      if (!recipientId) return;
      const recipientSocketId = onlineUsers.get(recipientId.toString?.() || recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('receive-message', data);
        io.to(recipientSocketId).emit('unread-notification', {
          senderId: data.senderId._id || data.senderId,
          senderName: data.senderId.username,
          message: `You have received a new message from ${data.senderId.username}`
        });
        if (data._id) {
          io.to(recipientSocketId).emit('mark-delivered', { messageId: data._id });
        }
      }
    };

    if (data.participantIds && Array.isArray(data.participantIds)) {
      data.participantIds.forEach((pId) => {
        const id = pId.toString();
        if (id !== (data.senderId._id || data.senderId)?.toString()) {
          notifyRecipient(id);
        }
      });
    } else if (data.recipientId) {
      notifyRecipient(data.recipientId);
    }
  });

  socket.on('send-voice', (data) => {
    const recipientSocketId = onlineUsers.get(data.recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('receive-voice', data);
      io.to(recipientSocketId).emit('unread-notification', {
        senderId: data.senderId._id,
        senderName: data.senderId.username,
        message: `${data.senderId.username} sent you a voice message`
      });
    }
  });

  // Call handling
  socket.on('initiate-call', (data) => {
    const recipientSocketId = onlineUsers.get(data.receiverId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('incoming-call', {
        callerId: socket.id,
        callerSocketId: socket.id,
        callerUserId: data.callerUserId,
        callerName: data.callerName,
        callType: data.callType,
        offer: data.offer
      });
      socket.emit('call-ringing', {
        receiverId: data.receiverId,
        receiverSocketId: recipientSocketId,
        callType: data.callType
      });
    } else {
      socket.emit('call-unavailable', {
        receiverId: data.receiverId,
        message: 'User is offline or unavailable'
      });
    }
  });

  socket.on('accept-call', (data) => {
    const recipientSocketId = onlineUsers.get(data.callerId);
    const targetSocketId = data.callerSocketId || recipientSocketId || data.callerId;
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-accepted', {
        acceptedBy: data.acceptedBy,
        answer: data.answer,
        receiverSocketId: socket.id
      });
    }
  });

  socket.on('reject-call', (data) => {
    const recipientSocketId = onlineUsers.get(data.callerId);
    const targetSocketId = data.callerSocketId || recipientSocketId || data.callerId;
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-rejected', {
        rejectedBy: data.rejectedBy
      });
    }
  });

  socket.on('end-call', (data) => {
    const recipientSocketId = data.targetSocketId || onlineUsers.get(data.recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('call-ended', {
        endedBy: data.endedBy
      });
    }
  });

  socket.on('webrtc-ice-candidate', (data) => {
    const targetSocketId = data.targetSocketId || onlineUsers.get(data.targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('webrtc-ice-candidate', {
        candidate: data.candidate,
        fromSocketId: socket.id
      });
    }
  });

  socket.on('user-typing', (data) => {
    const recipientSocketId = onlineUsers.get(data.recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('user-typing', { userId: data.userId });
    }
  });

  socket.on('stop-typing', (data) => {
    const recipientSocketId = onlineUsers.get(data.recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('stop-typing', { userId: data.userId });
    }
  });

  socket.on('delete-message', (data) => {
    const recipientSocketId = onlineUsers.get(data.recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('message-deleted', {
        messageId: data.messageId
      });
    }
  });

  socket.on('react-message', (data) => {
    const recipientSocketId = onlineUsers.get(data.recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('message-reacted', data);
    }
  });

  socket.on('message-read', (data) => {
    const recipientSocketId = onlineUsers.get(data.senderId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('message-read-update', data);
    }
  });

  socket.on('draw-line', (data) => {
    if (data.participants && Array.isArray(data.participants)) {
      data.participants.forEach(pId => {
        if (pId !== data.senderId) {
          const sId = onlineUsers.get(pId);
          if (sId) io.to(sId).emit('draw-line', data);
        }
      });
    } else if (data.recipientId) {
      const recipientSocketId = onlineUsers.get(data.recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('draw-line', data);
      }
    }
  });

  socket.on('clear-canvas', (data) => {
    if (data.participants && Array.isArray(data.participants)) {
      data.participants.forEach(pId => {
        if (pId !== data.senderId) {
          const sId = onlineUsers.get(pId);
          if (sId) io.to(sId).emit('clear-canvas', data);
        }
      });
    } else if (data.recipientId) {
      const recipientSocketId = onlineUsers.get(data.recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('clear-canvas', data);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    let disconnectedUserId;
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        onlineUsers.delete(userId);
        setOnlineUsers(onlineUsers);
        break;
      }
    }
    if (disconnectedUserId) {
      io.emit('user-status-changed', { userId: disconnectedUserId, status: 'offline' });
    }
  });
});

// Error Handler
app.use(errorHandler);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running ✅' });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 API URL: http://localhost:${PORT}`);
});

// Process scheduled messages every 30 seconds
setInterval(() => {
  processScheduledMessages().catch((err) => console.error('Scheduled messages error:', err));
  processDueReminders().catch((err) => console.error('Reminders error:', err));
}, 30000);

// Background Scheduler: Proactive 1-Hour AI Voice Reminder
setInterval(async () => {
  try {
    const now = new Date();
    // 1 hour from now
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    
    // Find active events scheduled in the next hour
    const activeEvents = await Event.find({
      eventTimestamp: { $lte: oneHourFromNow, $gt: now }
    });

    const onlineUsersMap = getOnlineUsers();

    for (const event of activeEvents) {
      // Find the chat participants to notify
      const chatDoc = await Chat.findById(event.chatId);
      if (chatDoc) {
        let eventUpdated = false;

        for (const pId of chatDoc.participants) {
          const userIdStr = pId.toString();

          // If the user is currently online
          if (onlineUsersMap.has(userIdStr)) {
            // Check if this user has already been reminded
            const hasBeenReminded = event.remindedUsers && event.remindedUsers.some(uId => uId.toString() === userIdStr);

            if (!hasBeenReminded) {
              console.log(`⏰ Broadcasting proactive 1-hour voice reminder for event "${event.title}" to user ${userIdStr}`);
              
              emitToUser(userIdStr, 'event-reminder', {
                _id: event._id,
                title: event.title,
                time: event.time,
                location: event.location,
                chatId: event.chatId
              });

              // Add user to the reminded list
              if (!event.remindedUsers) {
                event.remindedUsers = [];
              }
              event.remindedUsers.push(pId);
              eventUpdated = true;
            }
          }
        }

        if (eventUpdated) {
          await event.save();
        }
      }
    }

    // 2. Active Event Expiration and AI Follow-Up Checker
    const allEvents = await Event.find({});
    for (const event of allEvents) {
      if (!event.eventTimestamp) continue;

      const eventTimeMs = event.eventTimestamp.getTime();
      const nowMs = now.getTime();

      // Case A: Event is over (now > eventTimestamp) and not marked isOver
      if (nowMs > eventTimeMs && !event.isOver) {
        console.log(`🧹 Event "${event.title}" is over. Broadcasting expired status and marking isOver: true`);
        event.isOver = true;
        await event.save();

        const chatDoc = await Chat.findById(event.chatId);
        if (chatDoc) {
          chatDoc.participants.forEach(pId => {
            emitToUser(pId.toString(), 'event-expired', {
              eventId: event._id.toString(),
              chatId: event.chatId.toString()
            });
          });
        }
      }

      // Case B: 2 hours after event time (now >= eventTimestamp + 2 hours)
      // Trigger AI follow-up & completely delete from backend DB
      const twoHoursLaterMs = eventTimeMs + 2 * 60 * 60 * 1000;
      if (nowMs >= twoHoursLaterMs) {
        console.log(`🤖 AI Follow-up: 2 hours passed for event "${event.title}". Activating chatbot follow-up.`);
        
        const chatDoc = await Chat.findById(event.chatId);
        if (chatDoc) {
          // Find Kane bot user
          const botUser = await User.findOne({ username: 'Kane' });
          const botUserId = botUser ? botUser._id : chatDoc.participants[0];

          // Formulate bot check-in message
          const followUpText = `Hey boss, did you go to your event "${event.title}"? Hope you did great and had a great day! ✨`;

          const botMessage = new Message({
            chatId: event.chatId,
            senderId: botUserId,
            content: followUpText,
            messageType: 'text'
          });

          await botMessage.save();
          await Chat.findByIdAndUpdate(event.chatId, {
            lastMessage: botMessage._id,
            lastMessageTime: new Date()
          });

          // Broadcast message to all participants
          chatDoc.participants.forEach(pId => {
            emitToUser(pId.toString(), 'receive-message', {
              ...botMessage.toObject(),
              recipientId: pId.toString()
            });
          });
        }

        // Delete completely from the backend DB
        await Event.findByIdAndDelete(event._id);
        console.log(`🗑️ Event "${event.title}" deleted successfully from the backend database.`);
      }
    }
  } catch (err) {
    console.error('Proactive reminder scheduler error:', err);
  }
}, 15000); // Check every 15 seconds for rapid testing responsiveness!

// Specialized Roommate Billing dues check scheduler
setInterval(async () => {
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const splitChats = await Chat.find({ isSplitGroup: true }).populate('participants', 'username');
    
    for (const chat of splitChats) {
      if (!chat.fixedSplits || chat.fixedSplits.length === 0) continue;
      
      const shareTotal = chat.fixedSplits.reduce((acc, curr) => acc + curr.amount, 0) / chat.participants.length;
      if (shareTotal <= 0) continue;
      
      const dueDay = chat.splitDueDate || 5;
      const currentDay = now.getDate();
      let daysLeft = dueDay - currentDay;
      
      if (daysLeft >= 0 && daysLeft <= 5) {
        const botUser = await User.findOne({ username: 'Kane' });
        const botUserId = botUser ? botUser._id : chat.participants[0]?._id;
        
        for (const roommate of chat.participants) {
          const hasPaid = chat.payments && chat.payments.some(
            p => p.user.toString() === roommate._id.toString() && p.month === currentMonth && p.paid === true
          );
          
          if (!hasPaid) {
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const existingAlert = await Message.findOne({
              chatId: chat._id,
              senderId: botUserId,
              content: { $regex: new RegExp(`Rent & fixed splits due alert for ${roommate.username}`, 'i') },
              createdAt: { $gte: todayStart }
            });
            
            if (!existingAlert) {
              console.log(`🏠 Billing Vault: Posting automated rent split due reminder for roommate ${roommate.username} (days left: ${daysLeft})`);
              
              const reminderMsg = new Message({
                chatId: chat._id,
                senderId: botUserId,
                content: `⚠️ Rent & fixed splits due alert for ${roommate.username}! The due date is Day ${dueDay} (${daysLeft === 0 ? 'TODAY' : `in ${daysLeft} days`}). Please pay your roommate split share of $${shareTotal.toFixed(2)}.`,
                messageType: 'text'
              });
              
              await reminderMsg.save();
              await Chat.findByIdAndUpdate(chat._id, { lastMessage: reminderMsg._id, lastMessageTime: new Date() });
              
              chat.participants.forEach(p => {
                emitToUser(p._id.toString(), 'receive-message', { ...reminderMsg.toObject(), recipientId: p._id.toString() });
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Roommate dues alert scheduler error:', err);
  }
}, 30000);

export { app as default, io };
