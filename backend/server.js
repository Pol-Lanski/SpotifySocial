// Express server for the Spotify Comments Extension backend (separated)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const { PrivyClient } = require('@privy-io/server-auth');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5050;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_insecure_secret_change_me';

// Initialize Privy client (server-side)
const PRIVY_APP_ID = process.env.PRIVY_APP_ID || '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || '';
let privy = null;
if (PRIVY_APP_ID && PRIVY_APP_SECRET) {
  try {
    privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
    console.log('✅ PrivyClient initialized');
  } catch (e) {
    console.warn('⚠️ Failed to initialize PrivyClient:', e.message);
  }
} else {
  console.warn('⚠️ PRIVY_APP_ID/PRIVY_APP_SECRET not set. /auth/exchange will be disabled.');
}

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/spotify_comments',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Trust proxy for rate limiting in hosted environments
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

// CORS configuration with optional override via CORS_ORIGINS env (comma-separated)
const defaultCorsOrigins = [
  'https://open.spotify.com',
  'https://localhost:8443',
  'http://localhost:5050'
];

const envCorsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const allowedOrigins = envCorsOrigins.length > 0 ? envCorsOrigins : defaultCorsOrigins;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.startsWith('chrome-extension://')) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

app.use(express.json({ limit: '1mb' }));
// Serve static assets for hosted auth UI if present
app.use('/static', express.static(path.join(__dirname, 'static'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));

// Helper: issue app JWT with user identifiers
function issueAppToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// Middleware: authenticate app JWT
function authenticate(req, res, next) {
  try {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

async function upsertUserByPrivyId(client, { privyUserId, email }) {
  const existing = await client.query('SELECT id, privy_user_id FROM users WHERE privy_user_id = $1', [privyUserId]);
  if (existing.rows.length > 0) {
    if (email) {
      await client.query('UPDATE users SET email = $1, updated_at = NOW() WHERE privy_user_id = $2', [email, privyUserId]);
    }
    return existing.rows[0];
  }
  const insert = await client.query(
    'INSERT INTO users (privy_user_id, email) VALUES ($1, $2) RETURNING id, privy_user_id',
    [privyUserId, email || null]
  );
  return insert.rows[0];
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Auth start: serves a minimal hosted login page
app.get('/auth/start', (req, res) => {
  const redirectUri = req.query.redirect_uri || '';
  res.setHeader('Content-Type', 'text/html');
  // Render a minimal login page that loads a locally bundled UI (no external CDN)
  const appId = PRIVY_APP_ID || '';
  res.send(`<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Sign in</title>
      <style>
        :root { color-scheme: light dark; }
        body { font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; margin: 0; padding: 0; display:flex; min-height:100vh; }
        .container { margin: auto; max-width: 420px; width: 100%; padding: 24px; }
        .card { border: 1px solid #ddd; border-radius: 12px; padding: 24px; background: white; color: #111; }
        @media (prefers-color-scheme: dark) { .card { background: #111; color: #fafafa; border-color: #333; }}
        h1 { font-size: 20px; margin: 0 0 12px; }
        p { margin: 0 0 16px; opacity: 0.8; }
        button { padding: 10px 14px; border-radius: 8px; border: none; background: #1db954; color: white; cursor: pointer; font-weight: 600; }
        button:disabled { background: #888; cursor: not-allowed; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>Sign in</h1>
          <p>The ‘Spotify Playlist Comments’ extension wants to access your account.</p>
          <div id="root">Loading…</div>
        </div>
      </div>
      <script type="module">
        window.__AUTH_REDIRECT_URI__ = ${JSON.stringify(redirectUri)};
        window.__PRIVY_APP_ID__ = ${JSON.stringify(appId)};
      </script>
      <script type="module" src="/static/auth-login.bundle.js"></script>
    </body>
  </html>`);
});

// Debug endpoint for extension testing
app.get('/debug', (req, res) => {
  res.json({
    message: 'Extension API is working!',
    timestamp: new Date().toISOString(),
    headers: req.headers,
    method: req.method,
    url: req.url
  });
});

// Get comments for a playlist or track
app.get('/comments', async (req, res) => {
  try {
    const { playlist_id, track_uri, limit = 50, offset = 0 } = req.query;
    
    if (!playlist_id) {
      return res.status(400).json({ 
        error: 'playlist_id is required' 
      });
    }
    
    // Validate playlist_id format (basic validation)
    if (typeof playlist_id !== 'string' || playlist_id.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid playlist_id format' 
      });
    }
    
    let query = `
      SELECT id, playlist_id, track_uri, text, created_at, user_id
      FROM comments 
      WHERE playlist_id = $1
    `;
    
    const params = [playlist_id];
    
    if (track_uri) {
      query += ' AND track_uri = $2';
      params.push(track_uri);
    } else {
      query += ' AND track_uri IS NULL';
    }
    
    query += ' ORDER BY created_at ASC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, params);
    
    // Annotate ownership if caller is authenticated
    let callerUserId = null;
    try {
      const auth = req.headers['authorization'] || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET);
        callerUserId = decoded.uid || null;
      }
    } catch (_) {}

    const rows = result.rows.map(r => ({
      id: r.id,
      playlist_id: r.playlist_id,
      track_uri: r.track_uri,
      text: r.text,
      created_at: r.created_at,
      is_owner: callerUserId ? r.user_id === callerUserId : false
    }));
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to fetch comments'
    });
  }
});

// Post a new comment (requires auth)
app.post('/comments', authenticate, rateLimit({ windowMs: 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false, trustProxy: true }), async (req, res) => {
  try {
    const { playlist_id, track_uri, text } = req.body;
    
    // Validation
    if (!playlist_id || !text) {
      return res.status(400).json({ 
        error: 'playlist_id and text are required' 
      });
    }
    
    if (typeof playlist_id !== 'string' || playlist_id.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid playlist_id format' 
      });
    }
    
    if (typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Comment text cannot be empty' 
      });
    }
    
    if (text.length > 500) {
      return res.status(400).json({ 
        error: 'Comment text must be 500 characters or less' 
      });
    }
    
    // Validate track_uri format if provided
    if (track_uri && (!track_uri.startsWith('spotify:track:') || track_uri.length < 20)) {
      return res.status(400).json({ 
        error: 'Invalid track_uri format' 
      });
    }
    
    const query = `
      INSERT INTO comments (playlist_id, track_uri, text, user_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, playlist_id, track_uri, text, created_at
    `;
    
    const params = [playlist_id, track_uri || null, text.trim(), req.user.uid];
    const result = await pool.query(query, params);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error posting comment:', error);
    
    if (error.code === '23514') { // Check constraint violation
      return res.status(400).json({ 
        error: 'Comment validation failed',
        message: 'Comment text must be between 1 and 500 characters'
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to post comment'
    });
  }
});

// Get comment counts for multiple tracks (bulk operation)
app.post('/comments/counts', async (req, res) => {
  try {
    const { playlist_id, track_uris } = req.body;
    
    if (!playlist_id || !Array.isArray(track_uris)) {
      return res.status(400).json({ 
        error: 'playlist_id and track_uris array are required' 
      });
    }
    
    if (track_uris.length === 0) {
      return res.json({});
    }
    
    if (track_uris.length > 100) {
      return res.status(400).json({ 
        error: 'Maximum 100 track URIs allowed per request' 
      });
    }
    
    // Validate track URIs
    const invalidUris = track_uris.filter(uri => 
      !uri || !uri.startsWith('spotify:track:') || uri.length < 20
    );
    
    if (invalidUris.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid track URI format',
        invalid_uris: invalidUris
      });
    }
    
    const query = `
      SELECT track_uri, COUNT(*) as comment_count
      FROM comments 
      WHERE playlist_id = $1 AND track_uri = ANY($2)
      GROUP BY track_uri
    `;
    
    const result = await pool.query(query, [playlist_id, track_uris]);
    
    // Convert to object format for easier lookup
    const counts = {};
    result.rows.forEach(row => {
      counts[row.track_uri] = parseInt(row.comment_count);
    });
    
    res.json(counts);
  } catch (error) {
    console.error('Error fetching comment counts:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to fetch comment counts'
    });
  }
});

// Get comment statistics for a playlist
app.get('/comments/stats/:playlist_id', async (req, res) => {
  try {
    const { playlist_id } = req.params;
    
    if (!playlist_id) {
      return res.status(400).json({ 
        error: 'playlist_id is required' 
      });
    }
    
    const query = `
      SELECT 
        COUNT(*) as total_comments,
        COUNT(DISTINCT track_uri) as tracks_with_comments,
        MIN(created_at) as first_comment,
        MAX(created_at) as latest_comment
      FROM comments 
      WHERE playlist_id = $1
    `;
    
    const result = await pool.query(query, [playlist_id]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching comment stats:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to fetch comment statistics'
    });
  }
});

// Delete a comment (owner only)
app.delete('/comments/:comment_id', authenticate, async (req, res) => {
  try {
    const { comment_id } = req.params;
    
    if (!comment_id) {
      return res.status(400).json({ 
        error: 'comment_id is required' 
      });
    }
    // Check ownership
    const owner = await pool.query('SELECT user_id FROM comments WHERE id = $1', [comment_id]);
    if (owner.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (!owner.rows[0].user_id || owner.rows[0].user_id !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const query = 'DELETE FROM comments WHERE id = $1 RETURNING id';
    const result = await pool.query(query, [comment_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Comment not found' 
      });
    }
    
    res.json({ 
      message: 'Comment deleted successfully',
      deleted_id: result.rows[0].id
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to delete comment'
    });
  }
});

// Auth: exchange a Privy token for an app token
app.post('/auth/exchange', async (req, res) => {
  try {
    const { privyToken } = req.body;
    if (!privyToken) return res.status(400).json({ error: 'privyToken is required' });

    // DEV mode: accept tokens starting with "dev." or when Privy isn't configured
    if (!privy || String(privyToken).startsWith('dev.')) {
      const privyUserId = String(privyToken).startsWith('dev.') ? String(privyToken).slice(4) : `dev_${Date.now()}`;
      const userRow = await upsertUserByPrivyId(pool, { privyUserId, email: null });
      const token = issueAppToken({ uid: userRow.id, sub: userRow.privy_user_id });
      return res.json({ token, privyUserId: userRow.privy_user_id });
    }

    // Verify the Privy auth token and fetch user (production path)
    const verified = await privy.verifyAuthToken(privyToken);
    const userId = verified?.userId || verified?.id || null;
    if (!userId) return res.status(401).json({ error: 'Invalid Privy token' });

    // Optionally fetch user profile for email
    let email = null;
    try {
      const user = await privy.getUser(userId);
      email = user?.email?.address || null;
    } catch (_) {}

    const userRow = await upsertUserByPrivyId(pool, { privyUserId: userId, email });
    const token = issueAppToken({ uid: userRow.id, sub: userRow.privy_user_id });
    res.json({ token, privyUserId: userRow.privy_user_id });
  } catch (e) {
    console.error('Error in /auth/exchange:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dev-only: emulate a Privy token for email login if Privy is not configured
app.post('/auth/dev-login', async (req, res) => {
  try {
    if (privy) return res.status(400).json({ error: 'Dev login disabled when Privy configured' });
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email is required' });
    // Create a deterministic fake privyUserId for this email in dev
    const privyUserId = 'dev_' + Buffer.from(email).toString('hex').slice(0, 24);
    const userRow = await upsertUserByPrivyId(pool, { privyUserId, email });
    const token = issueAppToken({ uid: userRow.id, sub: userRow.privy_user_id });
    // Return a fake privyToken for the hosted page to complete the flow
    res.json({ privyToken: `dev.${privyUserId}` });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Auth: get current user from app token
app.get('/auth/me', authenticate, async (req, res) => {
  try {
    const { uid, sub } = req.user;
    const result = await pool.query('SELECT id, privy_user_id, email, created_at FROM users WHERE id = $1', [uid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ id: result.rows[0].id, privy_user_id: sub, email: result.rows[0].email, created_at: result.rows[0].created_at });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

// Database connection test
async function testDatabaseConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully');
    console.log('📅 Database time:', result.rows[0].now);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Please check your DATABASE_URL environment variable');
    process.exit(1);
  }
}

// Start server
async function startServer() {
  await testDatabaseConnection();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Spotify Comments Server running on http://0.0.0.0:${PORT}`);
    console.log(`🎵 Ready to handle comments for Spotify playlists!`);
    console.log(`📊 Health check available at http://0.0.0.0:${PORT}/health`);
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  await pool.end();
  process.exit(0);
});

// Extra diagnostics to investigate unexpected exits
process.on('beforeExit', (code) => {
  console.error(`⚠️  Process beforeExit with code: ${code}`);
});

process.on('exit', (code) => {
  console.error(`⚠️  Process exit with code: ${code}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception thrown:', err);
});

// Periodic heartbeat to confirm the event loop remains active
setInterval(() => {
  console.log('💓 Server heartbeat', new Date().toISOString());
}, 300000); // every 5 minutes

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});


