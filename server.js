// server.js
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
require('./auth_jwt');

const User = require('./User');
const Item = require('./item');
const Cart = require('./cart');
const Order = require('./order');

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(passport.initialize());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// JWT helper
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.SECRET_KEY, { expiresIn: '1d' });
};

// --- AUTH ROUTES ---

app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashedPassword });
    const token = generateToken(user._id);
    res.status(201).json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Signup failed' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = generateToken(user._id);
    res.status(200).json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Login failed' });
  }
});

// --- ITEM ROUTES ---

app.get('/items', async (req, res) => {
  try {
    const items = await Item.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch items' });
  }
});

// --- CART ROUTES ---

const { isAuthenticated } = require('./auth_jwt');

app.get('/cart', isAuthenticated, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user._id }).populate('items.itemId');
    res.json(cart || { items: [], total: 0 });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get cart' });
  }
});

app.post('/cart', isAuthenticated, async (req, res) => {
  const { itemId, quantity } = req.body;
  if (!itemId || quantity <= 0) return res.status(400).json({ message: 'Invalid item or quantity' });

  try {
    let cart = await Cart.findOne({ userId: req.user._id });
    if (!cart) cart = new Cart({ userId: req.user._id, items: [], total: 0 });

    const existingItem = cart.items.find(i => i.itemId.toString() === itemId);
    if (existingItem) existingItem.quantity += quantity;
    else cart.items.push({ itemId, quantity });

    const itemDocs = await Item.find({ _id: { $in: cart.items.map(i => i.itemId) } });
    cart.total = cart.items.reduce((sum, i) => {
      const item = itemDocs.find(d => d._id.toString() === i.itemId.toString());
      return sum + (item?.price || 0) * i.quantity;
    }, 0);

    await cart.save();
    res.status(200).json(cart);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update cart' });
  }
});

app.put('/cart', isAuthenticated, async (req, res) => {
  const { itemId, quantity } = req.body;
  if (!itemId) return res.status(400).json({ message: 'Missing itemId' });

  try {
    const cart = await Cart.findOne({ userId: req.user._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const itemIndex = cart.items.findIndex(i => i.itemId.toString() === itemId);
    if (itemIndex === -1) return res.status(404).json({ message: 'Item not in cart' });

    if (quantity <= 0) cart.items.splice(itemIndex, 1);
    else cart.items[itemIndex].quantity = quantity;

    const itemDocs = await Item.find({ _id: { $in: cart.items.map(i => i.itemId) } });
    cart.total = cart.items.reduce((sum, i) => {
      const item = itemDocs.find(d => d._id.toString() === i.itemId.toString());
      return sum + (item?.price || 0) * i.quantity;
    }, 0);

    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ message: 'Failed to modify cart' });
  }
});

app.delete('/cart', isAuthenticated, async (req, res) => {
  try {
    await Cart.deleteOne({ userId: req.user._id });
    res.json({ message: 'Cart cleared' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to clear cart' });
  }
});

app.post('/checkout', isAuthenticated, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user._id });
    if (!cart || cart.items.length === 0) return res.status(400).json({ message: 'Cart is empty' });

    const order = await Order.create({
      userId: req.user._id,
      items: cart.items,
      total: cart.total,
      status: 'Processing'
    });

    await Cart.deleteOne({ userId: req.user._id });
    res.status(201).json({ message: 'Order placed', order });
  } catch (err) {
    res.status(500).json({ message: 'Checkout failed' });
  }
});

// --- START SERVER ---

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
