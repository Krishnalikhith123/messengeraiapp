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

const res = await fetch('http://localhost:5000/api/users/all/list', {
  headers: { Authorization: `Bearer ${token}` }
});
console.log('Status:', res.status);
const body = await res.text();
console.log('Body preview:', body.slice(0, 500));
await mongoose.disconnect();
