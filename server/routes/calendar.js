import express from 'express';
import { auth } from '../middleware/auth.js';
import Event from '../models/Event.js';
import Chat from '../models/Chat.js';
import { emitToUser } from '../socket.js';

const router = express.Router();

// GET /api/calendar/:chatId
router.get('/:chatId', auth, async (req, res) => {
  try {
    const events = await Event.find({ chatId: req.params.chatId })
      .populate('createdBy', 'username profilePicture')
      .populate('rsvps.user', 'username profilePicture')
      .sort({ eventTimestamp: 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/calendar/:chatId
router.post('/:chatId', auth, async (req, res) => {
  try {
    const { title, date, time, location, eventTimestamp } = req.body;
    if (!title || !date || !time) {
      return res.status(400).json({ message: 'Title, date, and time are required.' });
    }

    const event = new Event({
      title,
      date,
      time,
      location: location || '',
      eventTimestamp: eventTimestamp ? new Date(eventTimestamp) : null,
      chatId: req.params.chatId,
      createdBy: req.user.id,
      rsvps: [{ user: req.user.id, status: 'going' }]
    });

    await event.save();
    await event.populate('createdBy', 'username profilePicture');
    await event.populate('rsvps.user', 'username profilePicture');

    // Notify other chat participants via socket
    const chat = await Chat.findById(req.params.chatId);
    if (chat) {
      chat.participants.forEach(p => {
        emitToUser(p.toString(), 'new-event', event.toObject());
      });
    }

    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/calendar/events/:eventId/rsvp
router.post('/events/:eventId/rsvp', auth, async (req, res) => {
  try {
    const { status } = req.body; // going, maybe, declined
    if (!['going', 'maybe', 'declined'].includes(status)) {
      return res.status(400).json({ message: 'Invalid RSVP status.' });
    }

    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found.' });

    // Remove existing RSVP
    event.rsvps = event.rsvps.filter(r => r.user.toString() !== req.user.id);
    // Add new RSVP
    event.rsvps.push({ user: req.user.id, status });

    await event.save();
    await event.populate('createdBy', 'username profilePicture');
    await event.populate('rsvps.user', 'username profilePicture');

    // Emit event update to all participants in this chat
    const chat = await Chat.findById(event.chatId);
    if (chat) {
      chat.participants.forEach(p => {
        emitToUser(p.toString(), 'event-rsvp-updated', event.toObject());
      });
    }

    res.json(event);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
