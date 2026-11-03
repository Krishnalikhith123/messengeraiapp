import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../server/models/User.js';

dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-messenger';
await mongoose.connect(uri);
const u = await User.findOne({ username: 'krishna' });
const secret = process.env.JWT_SECRET || 'your_secret_key';
const token = jwt.sign({ id: u._id.toString() }, secret, { expiresIn: '7d' });

const res = await fetch(`http://localhost:5000/api/users/profile/${u._id.toString()}`, {
  headers: { Authorization: `Bearer ${token}` }
});
console.log('Status:', res.status);
const body = await res.json();
console.log('Keys of body:', Object.keys(body));
console.log('Contacts array structure:', JSON.stringify(body.contacts, null, 2));
await mongoose.disconnect();
