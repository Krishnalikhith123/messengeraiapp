import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../server/models/User.js';

dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-messenger';
await mongoose.connect(uri);
const u = await User.findOne({ username: 'krishna' });
if (!u) {
  console.log('User krishna not found');
  process.exit(1);
}
const users = await User.find({ _id: { $ne: u._id }, isBot: { $ne: true } })
  .select('-password')
  .limit(50);
console.log('Current:', u.username, String(u._id));
console.log('Others:', users.length, users.map((x) => x.username));
await mongoose.disconnect();
