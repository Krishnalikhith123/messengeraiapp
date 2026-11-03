import express from 'express';
import { auth } from '../middleware/auth.js';
import Message from '../models/Message.js';
import Chat from '../models/Chat.js';
import User from '../models/User.js';
import { emitToUser } from '../socket.js';

const router = express.Router();

/**
 * POST /api/giftcards/send
 * Body: { chatId, recipientId, giftAmount, giftMessage }
 */
router.post('/send', auth, async (req, res) => {
  try {
    const { chatId, recipientId, giftAmount, giftMessage } = req.body;
    if (!chatId || !recipientId || !giftAmount || giftAmount <= 0) {
      return res.status(400).json({ message: 'chatId, recipientId, and a positive giftAmount are required.' });
    }
    // Deduct from sender's KanePay balance
    const sender = await User.findById(req.user.id);
    if (!sender || (sender.kanePay?.balanceINR || 0) < giftAmount) {
      return res.status(400).json({ message: 'Insufficient KanePay balance.' });
    }
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { 'kanePay.balanceINR': -giftAmount },
      $push: {
        'kanePay.transactions': {
          type: 'debit',
          description: `🎁 Gift Card sent to recipient`,
          amount: giftAmount,
          counterpartyName: recipientId,
          date: new Date()
        }
      }
    });

    const message = new Message({
      chatId,
      senderId: req.user.id,
      recipientId,
      content: `🎁 Gift Card: ₹${giftAmount}`,
      messageType: 'giftcard',
      giftAmount,
      giftMessage: giftMessage || '🎉 A little something for you!',
      giftRedeemed: false
    });
    await message.save();
    await message.populate('senderId', 'username profilePicture');
    await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id, lastMessageTime: new Date() });
    emitToUser(recipientId, 'receive-message', message.toObject());
    res.status(201).json(message);
  } catch (err) {
    console.error('Gift card send error:', err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/giftcards/:messageId/redeem
 * Recipient redeems the gift card — credits their KanePay balance.
 */
router.post('/:messageId/redeem', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message || message.messageType !== 'giftcard') {
      return res.status(404).json({ message: 'Gift card not found.' });
    }
    if (message.giftRedeemed) {
      return res.status(400).json({ message: 'This gift card has already been redeemed.' });
    }
    if (message.recipientId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only the recipient can redeem this gift card.' });
    }
    // Credit the recipient
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { 'kanePay.balanceINR': message.giftAmount },
      $push: {
        'kanePay.transactions': {
          type: 'credit',
          description: `🎁 Gift Card redeemed`,
          amount: message.giftAmount,
          counterpartyName: message.senderId.toString(),
          date: new Date()
        }
      }
    });
    message.giftRedeemed = true;
    message.giftRedeemedBy = req.user.id;
    await message.save();
    await message.populate('senderId', 'username profilePicture');
    // Notify sender
    emitToUser(message.senderId.toString(), 'giftcard-redeemed', { messageId: message._id });
    res.json(message);
  } catch (err) {
    console.error('Gift card redeem error:', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
