import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../server/models/User.js';

dotenv.config({ path: '../.env' });

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-messenger';
  console.log('Connecting to', uri);
  await mongoose.connect(uri);
  const users = await User.find({}, 'username email password');
  console.log('Users found:', users.map(u => ({ username: u.username, email: u.email })));
  await mongoose.disconnect();
}

run().catch(console.error);
