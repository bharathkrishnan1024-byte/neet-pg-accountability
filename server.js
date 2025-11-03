const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Client } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();

// Enable CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Database connection
const client = new Client({
  host: process.env.SUPABASE_HOST,
  database: process.env.SUPABASE_DB,
  user: process.env.SUPABASE_USER,
  password: process.env.SUPABASE_PASSWORD,
  port: process.env.SUPABASE_PORT,
  ssl: { rejectUnauthorized: false }
});

client.connect()
  .then(() => console.log('✅ Database connected successfully'))
  .catch(err => console.error('❌ DB Connection Error:', err.message));

// Gemini AI setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// NEET PG-specific system prompt
const SYSTEM_PROMPT = `You are Dr. Mentor, an AI accountability coach specializing in NEET PG preparation. 

Your role:
- Check in daily with students about their study progress
- Ask specific questions about study hours, subjects covered, and challenges
- Provide constructive feedback and motivation
- Maintain context of previous conversations
- Understand medical subjects and NEET PG exam structure
- Be supportive but firm - you're an accountability partner, not just a cheerleader
- Know NEET PG 2026 is in August 2026

Keep responses concise (under 150 words) and conversational. Ask one main question per response.`;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// 1. Create user profile
app.post('/api/user/create', async (req, res) => {
  try {
    const { name, email, exam_target, preparation_stage, check_in_time } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }
    
    const result = await client.query(
      'INSERT INTO users (name, email, exam_target, preparation_stage, check_in_time) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, email, exam_target || 'NEET PG', preparation_stage || 'Beginner', check_in_time || '07:00']
    );
    
    const userId = result.rows[0].id;
    
    // Create stats entry
    await client.query(
      'INSERT INTO user_stats (user_id) VALUES ($1)',
      [userId]
    );
    
    res.json({ success: true, user_id: userId });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Send message and get AI response
app.post('/api/chat', async (req, res) => {
  try {
    const { user_id, message } = req.body;
    
    if (!user_id || !message) {
      return res.status(400).json({ error: 'user_id and message required' });
    }
    
    // Save user message
    await client.query(
      'INSERT INTO conversations (user_id, sender, content) VALUES ($1, $2, $3)',
      [user_id, 'user', message]
    );
    
    // Get recent conversation history
    const history = await client.query(
      'SELECT sender, content FROM conversations WHERE user_id = $1 ORDER BY timestamp ASC LIMIT 20',
      [user_id]
    );
    
    // Build conversation for Gemini
    const conversationMessages = history.rows.map(row => ({
      role: row.sender === 'user' ? 'user' : 'model',
      parts: [{ text: row.content }]
    }));
    
    // Get AI response
    const chat = model.startChat({
      history: conversationMessages,
      generationConfig: {
        maxOutputTokens: 300,
        temperature: 0.7
      }
    });
    
    const result = await chat.sendMessage(`System: ${SYSTEM_PROMPT}\n\nUser: ${message}`);
    const aiResponse = result.response.text();
    
    // Save AI response
    await client.query(
      'INSERT INTO conversations (user_id, sender, content) VALUES ($1, $2, $3)',
      [user_id, 'ai', aiResponse]
    );
    
    res.json({ success: true, response: aiResponse });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Get conversation history
app.get('/api/chat/history/:user_id', async (req, res) => {
  try {
    const result = await client.query(
      'SELECT sender, content, timestamp FROM conversations WHERE user_id = $1 ORDER BY timestamp ASC LIMIT 100',
      [req.params.user_id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Get user stats
app.get('/api/stats/:user_id', async (req, res) => {
  try {
    const result = await client.query(
      'SELECT * FROM user_stats WHERE user_id = $1',
      [req.params.user_id]
    );
    
    if (result.rows.length === 0) {
      return res.json({ total_check_ins: 0 });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 API URL: https://neet-pg-accountability.onrender.com`);
});
