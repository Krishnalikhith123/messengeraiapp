import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../server/models/User.js';

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-messenger');

const users = await User.find({ isBot: { $ne: true } }).populate('contacts', 'username');
for (const u of users) {
  console.log(`User: ${u.username} (${u.email})`);
  console.log(`  Contacts (${u.contacts?.length || 0}):`, u.contacts?.map(c => c.username));
}

await mongoose.disconnect();
