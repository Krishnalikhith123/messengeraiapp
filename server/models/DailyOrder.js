import mongoose from 'mongoose';

const dailyOrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  restaurantName: { type: String, required: true },
  items: [{
    itemId: Number,
    name: String,
    price: Number,
    qty: Number,
    icon: String,
    veg: Boolean
  }],
  subtotal: { type: Number, required: true },
  deliveryFee: { type: Number, default: 29 },
  total: { type: Number, required: true },
  deliveryLocation: { type: String, default: '' },
  status: {
    type: String,
    enum: ['placed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'placed'
  },
  etaMinutes: { type: Number, default: 35 },
  splitChatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' },
  splitBillMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  placedAt: { type: Date, default: Date.now },
  deliveredAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('DailyOrder', dailyOrderSchema);
