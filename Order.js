// models/Order.js
const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  items: [
    {
      itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
      quantity: Number
    }
  ],
  total: { type: Number },
  status: { type: String, default: 'Processing' },
  shippingAddress: { type: String },
  paymentMethod: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);
