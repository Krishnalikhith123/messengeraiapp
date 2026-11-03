import express from 'express';
import User from '../models/User.js';
import Message from '../models/Message.js';
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
    model = genAI.getGenerativeModel({ model: modelName });
  }
  return model;
};

// Get user profile
router.get('/profile/:userId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password')
      .populate('contacts', 'username profilePicture status');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all users (for contacts)
router.get('/all/list', auth, async (req, res) => {
  try {
    const users = await User.find({
      _id: { $ne: req.user.id },
      isBot: { $ne: true }
    })
      .select('-password')
      .sort({ username: 1 })
      .limit(100);

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Search users
router.get('/search/:query', auth, async (req, res) => {
  try {
    const users = await User.find({
      $or: [
        { username: { $regex: req.params.query, $options: 'i' } },
        { email: { $regex: req.params.query, $options: 'i' } }
      ],
      _id: { $ne: req.user.id },
      isBot: { $ne: true }
    }).select('-password').limit(20);

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update user profile
router.put('/update/:userId', auth, async (req, res) => {
  try {
    const { username, bio, profilePicture, phone, location } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { username, bio, profilePicture, phone, location },
      { new: true }
    ).select('-password');

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add contact
router.post('/contacts/add', auth, async (req, res) => {
  try {
    const { contactId } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $addToSet: { contacts: contactId } },
      { new: true }
    ).populate('contacts', 'username profilePicture status');

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Remove contact
router.post('/contacts/remove', auth, async (req, res) => {
  try {
    const { contactId } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { contacts: contactId } },
      { new: true }
    ).populate('contacts', 'username profilePicture status');

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Block user
router.post('/block', auth, async (req, res) => {
  try {
    const { blockedUserId } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $addToSet: { blockedUsers: blockedUserId } },
      { new: true }
    );

    res.status(200).json({ message: 'User blocked successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Toggle and configure Ghost Mode
router.post('/ghost-mode', auth, async (req, res) => {
  try {
    const { active, reason, returnTime } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        ghostModeActive: active,
        ghostModeReason: reason || '',
        ghostModeReturnTime: returnTime || ''
      },
      { new: true }
    ).select('-password');

    res.status(200).json({ message: 'Ghost Mode settings updated successfully', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Relationship Sentiment and coaching metrics route
router.post('/relationship/dashboard', auth, async (req, res) => {
  try {
    const { chatId } = req.body;
    if (!chatId) {
      return res.status(400).json({ message: 'Chat ID is required' });
    }

    const messages = await Message.find({ chatId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('senderId', 'username');

    if (!messages || messages.length === 0) {
      return res.status(200).json({
        vibe: "Quiet",
        latencyScore: 100,
        coachingTip: "No recent messages found. Spark up the conversation by saying hello or sharing a cool quote!",
        chemistryIndex: 50
      });
    }

    let latencyTotal = 0;
    let latencyCount = 0;
    for (let i = 0; i < messages.length - 1; i++) {
      const msgCurrent = messages[i];
      const msgNext = messages[i + 1];
      if (msgCurrent.senderId && msgNext.senderId && msgCurrent.senderId._id.toString() !== msgNext.senderId._id.toString()) {
        const timeDiff = Math.abs(new Date(msgCurrent.createdAt) - new Date(msgNext.createdAt)) / 1000;
        latencyTotal += timeDiff;
        latencyCount++;
      }
    }
    const avgLatencySecs = latencyCount > 0 ? (latencyTotal / latencyCount) : 60;
    let latencyScore = 100 - Math.min(Math.floor(avgLatencySecs / 120), 80);

    const aiModel = getAiModel();
    if (!aiModel) {
      return res.status(200).json({
        vibe: "Chilled",
        latencyScore,
        coachingTip: "Conversation analysis is offline. Keep messaging and sharing high-vibe contents!",
        chemistryIndex: 75
      });
    }

    const threadSample = messages
      .slice()
      .reverse()
      .map(m => `[${m.senderId?.username || 'Unknown'}]: ${m.content}`)
      .join('\n');

    const prompt = `You are Kane, a futuristic relationship analytics advisor for an intelligent messaging system.
    Analyze the following recent chat thread:
    ${threadSample}

    You MUST output ONLY a valid, raw JSON object matching the exact schema below. Do not wrap in markdown:
    {
      "vibe": "Vibrant" | "Chilled" | "Analytical" | "Quiet",
      "chemistryIndex": 80,
      "coachingTip": "You two have a solid connection. Keep up the rhythm!"
    }
    Ensure the JSON is correct. Do not use quotes inside the coachingTip that break JSON parsing.`;

    const result = await aiModel.generateContent(prompt);
    let textOut = result.response.text().trim();
    textOut = textOut.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsedResult;
    try {
      parsedResult = JSON.parse(textOut);
    } catch (err) {
      const match = textOut.match(/\{[\s\S]*\}/);
      if (match) {
        parsedResult = JSON.parse(match[0]);
      } else {
        parsedResult = {
          vibe: "Vibrant",
          chemistryIndex: 80,
          coachingTip: "You two have a solid rhythmic connection. Keep exchanging interesting thoughts and exploring ideas together!"
        };
      }
    }

    res.status(200).json({
      vibe: parsedResult.vibe || "Vibrant",
      latencyScore: latencyScore || 85,
      coachingTip: parsedResult.coachingTip || "Keep up the great conversation flow!",
      chemistryIndex: parsedResult.chemistryIndex || 80
    });
  } catch (error) {
    console.error('Relationship analytics error:', error);
    res.status(500).json({ message: 'Failed to compute relationship analytics.' });
  }
});

// ─── KANEPAY ROUTES ───────────────────────────────────────────────────────────

// Setup KanePay wallet for current user
router.post('/kanepay/setup', auth, async (req, res) => {
  try {
    const { bankName, accountNumber, ifscCode, upiId, city } = req.body;
    if (!bankName || !accountNumber || !upiId) {
      return res.status(400).json({ message: 'Bank name, account number, and UPI ID are required.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.kanePay = {
      isSetup: true,
      bankName,
      accountNumber,
      ifscCode: ifscCode || '',
      upiId,
      city: city || '',
      balanceINR: 5000, // Welcome bonus ₹5000
      transactions: [{
        type: 'credit',
        description: 'KanePay Welcome Bonus',
        amount: 5000,
        counterpartyName: 'KanePay',
        date: new Date()
      }]
    };

    await user.save();
    res.status(200).json({ message: 'KanePay wallet activated!', kanePay: user.kanePay });
  } catch (error) {
    console.error('KanePay setup error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get KanePay wallet data for current user
router.get('/kanepay/wallet', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('kanePay username');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ kanePay: user.kanePay, username: user.username });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Transfer INR between users (real DB update on both sides)
router.post('/kanepay/transfer', auth, async (req, res) => {
  try {
    const { recipientUsername, amountINR, note } = req.body;
    const amount = parseFloat(amountINR);

    if (!recipientUsername || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Recipient username and valid amount are required.' });
    }

    const sender = await User.findById(req.user.id);
    const recipient = await User.findOne({ username: recipientUsername });

    if (!sender) return res.status(404).json({ message: 'Sender not found' });
    if (!recipient) return res.status(404).json({ message: `User @${recipientUsername} not found.` });
    
    if (sender._id.toString() === recipient._id.toString()) {
      return res.status(400).json({ message: 'You cannot send money to yourself.' });
    }

    if (!sender.kanePay?.isSetup) return res.status(400).json({ message: 'Set up KanePay wallet first.' });
    if (!recipient.kanePay?.isSetup) return res.status(400).json({ message: `@${recipientUsername} has not set up their KanePay wallet.` });
    if (sender.kanePay.balanceINR < amount) return res.status(400).json({ message: 'Insufficient KanePay balance.' });

    // Atomic update for sender (Debit)
    const updatedSender = await User.findOneAndUpdate(
      { _id: sender._id },
      { 
        $inc: { 'kanePay.balanceINR': -amount },
        $push: {
          'kanePay.transactions': {
            $each: [{
              type: 'debit',
              description: note || `Sent to @${recipientUsername}`,
              amount: amount,
              counterpartyName: recipientUsername,
              date: new Date()
            }],
            $position: 0
          }
        }
      },
      { new: true }
    );

    // Atomic update for recipient (Credit)
    await User.findOneAndUpdate(
      { _id: recipient._id },
      { 
        $inc: { 'kanePay.balanceINR': amount },
        $push: {
          'kanePay.transactions': {
            $each: [{
              type: 'credit',
              description: note || `Received from @${sender.username}`,
              amount: amount,
              counterpartyName: sender.username,
              date: new Date()
            }],
            $position: 0
          }
        }
      }
    );

    // Send a chat notification message if they have a shared chat
    try {
      const Chat = (await import('../models/Chat.js')).default;
      const MsgModel = (await import('../models/Message.js')).default;
      const sharedChat = await Chat.findOne({
        isGroup: false,
        participants: { $all: [sender._id, recipient._id] }
      });

      if (sharedChat) {
        const notifMsg = new MsgModel({
          chatId: sharedChat._id,
          senderId: sender._id,
          content: `💸 *KanePay Transfer* — @${sender.username} sent ₹${amount.toFixed(2)} to @${recipientUsername}. ${note ? `Note: "${note}"` : ''}`,
          messageType: 'text'
        });
        await notifMsg.save();
      }
    } catch (msgErr) {
      console.warn('Could not post transfer notification message:', msgErr.message);
    }

    res.status(200).json({
      message: `Successfully transferred ₹${amount.toFixed(2)} to @${recipientUsername}`,
      newBalance: updatedSender.kanePay.balanceINR
    });
  } catch (error) {
    console.error('KanePay transfer error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add funds to KanePay (topup)
router.post('/kanepay/topup', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ message: 'Invalid topup amount.' });

    const user = await User.findById(req.user.id);
    if (!user?.kanePay?.isSetup) return res.status(400).json({ message: 'KanePay not set up.' });

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      {
        $inc: { 'kanePay.balanceINR': amt },
        $push: {
          'kanePay.transactions': {
            $each: [{
              type: 'credit',
              description: `Wallet Topup via UPI/Bank`,
              amount: amt,
              counterpartyName: user.kanePay.bankName,
              date: new Date()
            }],
            $position: 0
          }
        }
      },
      { new: true }
    );

    res.status(200).json({ message: `₹${amt} added to wallet.`, newBalance: updatedUser.kanePay.balanceINR });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Search users for recipient autocomplete
router.get('/kanepay/search/:query', auth, async (req, res) => {
  try {
    const q = req.params.query;
    const users = await User.find({
      username: { $regex: q, $options: 'i' },
      _id: { $ne: req.user.id }
    }).select('username profilePicture kanePay').limit(8);
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;