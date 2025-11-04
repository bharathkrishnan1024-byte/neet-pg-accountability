const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Client } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const client = new Client({
  host: process.env.SUPABASE_HOST,
  database: process.env.SUPABASE_DB,
  user: process.env.SUPABASE_USER,
  password: process.env.SUPABASE_PASSWORD,
  port: process.env.SUPABASE_PORT,
  ssl: { rejectUnauthorized: false }
});

client.connect()
  .then(() => console.log('Database connected'))
  .catch(err => console.error('DB connection error', err));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

app.post('/api/user/create', async (req, res) => {
  try {
    const { name, email, exam_target } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }

    const result = await client.query(
      `INSERT INTO users (name, email, exam_target, preparation_stage, check_in_time)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, email, exam_target || 'NEET PG', 'Beginner', '07:00']
    );

    const userId = result.rows[0].id;
    await client.query('INSERT INTO user_stats (user_id) VALUES ($1)', [userId]);

    res.json({ success: true, user_id: userId });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { user_id, message } = req.body;
    if (!user_id || !message) {
      return res.status(400).json({ error: 'user_id and message required' });
    }

    await client.query('INSERT INTO conversations (user_id, sender, content) VALUES ($1, $2, $3)', 
      [user_id, 'user', message]);

    const historyRes = await client.query(
      'SELECT sender, content FROM conversations WHERE user_id = $1 ORDER BY id DESC LIMIT 5',
      [user_id]
    );

    const context = historyRes.rows.reverse()
                  .map(r => `${r.sender}: ${r.content}`)
                  .join('\n');

    const systemPrompt = `You are Dr. Mentor, a NEET PG accountability coach. Keep answers under 100 words.`;

    const fullPrompt = `${systemPrompt}\nConversation:\n${context}\n\nRespond supportively:`;

    const result = await model.generateContent(fullPrompt);
    const aiResponse = result.response.text();

    await client.query('INSERT INTO conversations (user_id, sender, content) VALUES ($1, $2, $3)', 
      [user_id, 'ai', aiResponse]);

    res.json({ success: true, response: aiResponse });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chat/history/:user_id', async (req, res) => {
  try {
    const result = await client.query('SELECT sender, content FROM conversations WHERE user_id = $1 ORDER BY id ASC',
      [req.params.user_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running');
});
