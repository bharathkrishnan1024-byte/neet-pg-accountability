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
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const { user_id, message } = req.body;
    
    if (!user_id || !message) {
      return res.status(400).json({ error: 'user_id and message required' });
    }
    
    console.log('Chat from user:', user_id, 'Message:', message);
    
    // Save user message
    await client.query(
      'INSERT INTO conversations (user_id, sender, content) VALUES ($1, $2, $3)',
      [user_id, 'user', message]
    );
    
    // Get recent history
    const history = await client.query(
      'SELECT sender, content FROM conversations WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 10',
      [user_id]
    );
    
    // Build prompt
    let chatHistory = history.rows.reverse().map(r => `${r.sender}: ${r.content}`).join('\n');
    
    const prompt = `You are a NEET PG accountability coach. Be supportive but firm. Keep responses under 100 words.\n\nConversation:\n${chatHistory}\n\nRespond to the last user message with coaching feedback.`;
    
    // Get AI response
    const result = await model.generateContent(prompt);
    const aiResponse = result.response.text();
    
    // Save AI response
    await client.query(
      'INSERT INTO conversations (user_id, sender, content) VALUES ($1, $2, $3)',
      [user_id, 'ai', aiResponse]
    );
    
    console.log('Chat saved, response:', aiResponse.substring(0, 50));
    
    res.json({ success: true, response: aiResponse });
  } catch (error) {
    console.error('❌ Chat error:', error.message);
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
