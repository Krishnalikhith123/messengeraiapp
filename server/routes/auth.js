import express from 'express';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'your_secret_key', { expiresIn: '7d' });
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Find all non-bot users matching email or username (for login password check) */
async function findUsersByIdentifier(identifier) {
  const raw = (identifier || '').trim();
  if (!raw) return [];

  const emailLower = raw.toLowerCase();
  const ciPattern = new RegExp(`^${escapeRegex(raw)}$`, 'i');

  return User.find({
    isBot: { $ne: true },
    $or: [
      { email: emailLower },
      { email: ciPattern },
      { username: raw },
      { username: ciPattern }
    ]
  });
}

/** Single user for password reset — prefer exact matches */
async function findUserByEmailOrUsername(identifier) {
  const raw = (identifier || '').trim();
  if (!raw) return null;

  let user = await User.findOne({ email: raw.toLowerCase(), isBot: { $ne: true } });
  if (user) return user;

  user = await User.findOne({ username: raw, isBot: { $ne: true } });
  if (user) return user;

  const matches = await findUsersByIdentifier(raw);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const err = new Error('MULTIPLE_ACCOUNTS');
    err.matches = matches.map((m) => ({ username: m.username, email: m.email }));
    throw err;
  }
  return null;
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    let user = await User.findOne({ $or: [{ email }, { username }] });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    user = new User({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password
    });
    await user.save();

    const token = generateToken(user._id);
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id: String(user._id), username: user.username, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Login — accepts email OR username in the "email" field
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({ message: 'Email/username and password are required' });
    }

    const candidates = await findUsersByIdentifier(email);
    if (!candidates.length) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    let user = null;
    for (const candidate of candidates) {
      if (await candidate.matchPassword(password)) {
        user = candidate;
        break;
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    user.status = 'online';
    await user.save();

    const token = generateToken(user._id);
    res.status(200).json({
      message: 'Logged in successfully',
      token,
      user: {
        id: String(user._id),
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        bio: user.bio
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Reset password (forgot password) — email or username
router.post('/reset-password', async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;

    if (!email?.trim() || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    let user;
    try {
      user = await findUserByEmailOrUsername(email);
    } catch (multiErr) {
      if (multiErr.message === 'MULTIPLE_ACCOUNTS') {
        return res.status(400).json({
          message: 'Multiple accounts match. Please use your full email address.',
          accounts: multiErr.matches
        });
      }
      throw multiErr;
    }

    if (!user) {
      return res.status(404).json({ message: 'No account found with that email or username' });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      message: 'Password updated successfully. You can log in with your new password.',
      email: user.email,
      username: user.username
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (user) {
      user.status = 'offline';
      await user.save();
    }
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;