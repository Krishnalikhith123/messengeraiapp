import mongoose from 'mongoose';

const feedBookmarkSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: String,
  content: String,
  tag: String,
  savedAt: { type: Date, default: Date.now }
});

feedBookmarkSchema.index({ userId: 1, savedAt: -1 });

export default mongoose.model('FeedBookmark', feedBookmarkSchema);
