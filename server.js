// Express server for the Spotify Comments Extension backend
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = 5000; // Fixed port for Replit

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

app.use(cors({
  origin: [
    'https://open.spotify.com', 
    'http://localhost:3000', 
    'http://localhost:5000',
    'chrome-extension://*',
    'https://f1bda738-cf31-4dae-ac49-bd22ac121e8f-workspace-lanski.replit.app',
    'https://f1bda738-cf31-4dae-ac49-bd22ac121e8f-workspace-Lanski.replit.app',
    'https://f1bda738-cf31-4dae-ac49-bd22ac121e8f-00-ucp3v8whtp7c.riker.replit.dev'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

app.use(express.json({ limit: '1mb' }));

// Serve static files for testing
app.use(express.static('.'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased limit for development
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true
});

const postLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // Increased limit for development
  message: { error: 'Too many comments posted, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true
});

app.use(limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
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
      SELECT id, playlist_id, track_uri, text, created_at
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
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to fetch comments'
    });
  }
});

// Post a new comment
app.post('/comments', postLimiter, async (req, res) => {
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
      INSERT INTO comments (playlist_id, track_uri, text)
      VALUES ($1, $2, $3)
      RETURNING id, playlist_id, track_uri, text, created_at
    `;
    
    const params = [playlist_id, track_uri || null, text.trim()];
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

// Delete a comment (for future moderation features)
app.delete('/comments/:comment_id', async (req, res) => {
  try {
    const { comment_id } = req.params;
    
    if (!comment_id) {
      return res.status(400).json({ 
        error: 'comment_id is required' 
      });
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

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
