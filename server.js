const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// In-memory storage (for testing)
const users = {};
const conversations = {};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Create user
app.post('/api/user/create', async (req, res) => {
  try {
    const { name, email, exam_target } = req.body;
    const userId = 'user_' + Date.now();
    
    users[userId] = { name, email, exam_target };
    conversations[userId] = [];
    
    console.log('User created:', userId);
    res.json({ success: true, user_id: userId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { user_id, message } = req.body;
    
    if (!conversations[user_id]) {
      conversations[user_id] = [];
    }
    
    // Save user message
    conversations[user_id].push({ sender: 'user', content: message });
    
    // Get AI response
    const response = await model.generateContent(message);
    const aiText = response.response.text();
    
    // Save AI message
    conversations[user_id].push({ sender: 'ai', content: aiText });
    
    console.log('Chat message saved');
    res.json({ success: true, response: aiText });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get history
app.get('/api/chat/history/:user_id', (req, res) => {
  const history = conversations[req.params.user_id] || [];
  res.json(history);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
