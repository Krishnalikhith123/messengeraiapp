import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../server/models/User.js';

dotenv.config({ path: '../.env' });

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-messenger';
  console.log('Connecting to', uri);
  await mongoose.connect(uri);

  const users = await User.find({});
  for (const user of users) {
    if (!user.isBot) {
      console.log('Resetting password for user:', user.username);
      user.password = '123456';
      await user.save();
    }
  }

  console.log('Passwords reset successfully!');
  await mongoose.disconnect();
}

run().catch(console.error);
