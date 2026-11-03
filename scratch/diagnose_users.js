import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mern-messenger';

async function run() {
  console.log('Connecting to:', uri);
  await mongoose.connect(uri);
  const User = (await import('../server/models/User.js')).default;
  const users = await User.find({ isBot: { $ne: true } }).select('username email password createdAt');
  console.log('Non-bot users:', users.length);
  for (const u of users) {
    const isBcrypt = u.password?.startsWith('$2');
    let matches123456 = false;
    if (isBcrypt) matches123456 = await bcrypt.compare('123456', u.password);
    console.log({
      username: u.username,
      email: u.email,
      bcrypt: isBcrypt,
      matches123456,
      createdAt: u.createdAt
    });
  }
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
