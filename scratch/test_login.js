import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-messenger';

async function run() {
  await mongoose.connect(uri);
  const User = (await import('../server/models/User.js')).default;

  const tests = [
    { email: 'krishnalikhith.work@gmail.com', password: '123456' },
    { email: 'krishnalikhith.work@gmail.com', password: 'wrong' },
    { email: 'KRISHNALIKHITH.WORK@GMAIL.COM', password: '123456' },
    { email: 'krishna', password: '123456' },
  ];

  for (const t of tests) {
    const user = await User.findOne({ email: t.email });
    const byEmailLower = await User.findOne({ email: t.email.toLowerCase() });
    let match = false;
    if (user) match = await user.matchPassword(t.password);
    console.log(t, { found: !!user, foundLower: !!byEmailLower, match });
  }
  await mongoose.disconnect();
}

run().catch(console.error);
