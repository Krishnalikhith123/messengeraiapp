import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../server/models/User.js';

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-messenger');
const u = await User.findOne({ username: 'krishna' }).populate('contacts', 'username');
console.log('contacts count:', u.contacts?.length || 0);
console.log('contacts:', u.contacts?.map((c) => c.username));
await mongoose.disconnect();
