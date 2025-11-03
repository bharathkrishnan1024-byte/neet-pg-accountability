const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Client } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
app.use(cors());
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

client.connect().catch(err => console.error('DB Connection Error:', err));

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
- Understand medical subjects and NEET PG exam structure (19 subjects: Anatomy, Physiology, Biochemistry, Pathology, Pharmacology, Microbiology, Medicine, Surgery, OB-GYN, Pediatrics, Psychiatry, ENT, Ophthalmology, Orthopedics, Radiology, Anesthesia, Dermatology, Forensic Medicine, Community Medicine)
- Be supportive but firm - you're an accountability partner, not just a cheerleader
- Know NEET PG 2026 is in August 2026 (about 9 months away)

Keep responses concise (under 150 words) and conversational. Ask one main question per response.`;

// API Routes

// 1. Save user profile
app.post('/api/user/create', async (req, res) => {
  const { name, email, exam_target, preparation_stage, check_in_time } = req.body;
  
  try {
    const result = await client.query(
      'INSERT INTO users (name, email, exam_target, preparation_stage, check_in_time) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, email, exam_target, preparation_stage, check_in_time]
    );
    
    // Create stats entry
    await client.query(
      'INSERT INTO user_stats (user_id) VALUES ($1)',
      [result.rows[0].id]
    );
    
    res.json({ success: true, user_id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get conversation history
app.get('/api/chat/history/:user_id', async (req, res) => {
  try {
    const result = await client.query(
      'SELECT * FROM conversations WHERE user_id = $1 ORDER BY timestamp ASC LIMIT 50',
      [req.params.user_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Send message and get AI response
app.post('/api/chat', async (req, res) => {
  const { user_id, message } = req.body;
  
  try {
    // Save user message
    await client.query(
      'INSERT INTO conversations (user_id, sender, content) VALUES ($1, $2, $3)',
      [user_id, 'user', message]
    );
    
    // Get conversation history (last 10 messages for context)
    const history = await client.query(
      'SELECT sender, content FROM conversations WHERE user_id = $1 ORDER BY timestamp ASC LIMIT 20',
      [user_id]
    );
    
    // Build conversation array for Gemini
    const conversationMessages = history.rows.map(row => ({
      role: row.sender === 'user' ? 'user' : 'model',
      parts: [{ text: row.content }]
    }));
    
    // Get AI response
    const chat = model.startChat({
      history: conversationMessages,
      generationConfig: {
        maxOutputTokens: 300
      }
    });
    
    const result = await chat.sendMessage(`You are an NEET PG preparation coach. ${SYSTEM_PROMPT}\n\nUser message: ${message}`);
    const aiResponse = result.response.text();
    
    // Save AI response
    await client.query(
      'INSERT INTO conversations (user_id, sender, content) VALUES ($1, $2, $3)',
      [user_id, 'ai', aiResponse]
    );
    
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Save check-in data
app.post('/api/checkin', async (req, res) => {
  const { user_id, study_hours, subjects, mood_rating, challenges } = req.body;
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    await client.query(
      'INSERT INTO check_ins (user_id, date, study_hours, subjects, mood_rating, challenges) VALUES ($1, $2, $3, $4, $5, $6)',
      [user_id, today, study_hours, JSON.stringify(subjects), mood_rating, challenges]
    );
    
    // Update stats
    const stats = await client.query(
      'SELECT total_check_ins FROM user_stats WHERE user_id = $1',
      [user_id]
    );
    
    await client.query(
      'UPDATE user_stats SET total_check_ins = $1, last_check_in_date = $2 WHERE user_id = $3',
      [stats.rows[0].total_check_ins + 1, today, user_id]
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Get user stats
app.get('/api/stats/:user_id', async (req, res) => {
  try {
    const result = await client.query(
      'SELECT * FROM user_stats WHERE user_id = $1',
      [req.params.user_id]
    );
    res.json(result.rows[0] || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
