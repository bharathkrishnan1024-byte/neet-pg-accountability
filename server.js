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
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const { name, email, exam_target } = req.body;
    
    console.log('Creating user:', name, email);
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }
    
    const result = await client.query(
      'INSERT INTO users (name, email, exam_target, preparation_stage, check_in_time) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, email, exam_target || 'NEET PG', 'Beginner', '07:00']
    );
    
    const userId = result.rows[0].id;
    console.log('User created with ID:', userId);
    
    // Insert into user_stats
    try {
      await client.query(
        'INSERT INTO user_stats (user_id) VALUES ($1)',
        [userId]
      );
    } catch (statsErr) {
      console.log('Stats insert error (non-critical):', statsErr.message);
    }
    
    res.json({ success: true, user_id: userId });
  } catch (error) {
    console.error('❌ Create user error:', error.message);
    console.error('Full error:', error);
    res.status(500).json({ error: error.message });
  }
});

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
