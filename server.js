const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Client } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();

// Middleware
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

// Connect to database
client.connect()
  .then(() => console.log('✅ Database connected'))
  .catch(err => console.error('❌ DB Error:', err.message));

// Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', time: new Date() });
});

// Create user
app.post('/api/user/create', async (req, res) => {
  try {
    const { name, email, exam_target } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }

    const query = `
      INSERT INTO users (name, email, exam_target, preparation_stage, check_in_time)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    
    const result = await client.query(query, [
      name,
      email,
      exam_target || 'NEET PG',
      'Beginner',
      '07:00'
    ]);

    const userId = result.rows[0].id;

    // Create stats entry
    await client.query(
      'INSERT INTO user_stats (user_id) VALUES ($1)',
      [userId]
    );

    res.json({ success: true, user_id: userId });
  } catch (error) {
    console.error('Create user error:', error);
    res
