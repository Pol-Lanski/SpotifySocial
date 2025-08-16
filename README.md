# Spotify Playlist Comments Extension

A Chrome browser extension that adds a commenting system to Spotify's web player. Share your thoughts on playlists and individual tracks with other extension users!

## Features

- 💬 Comment on Spotify playlists and individual tracks
- 🔄 Real-time comment sharing between all extension users
- 🎨 Dark theme UI that matches Spotify's design
- 📱 Responsive design with floating comment button
- 🔔 Track-level comment bubbles for enhanced discovery
- ⚡ Optimistic UI updates for smooth user experience

## Installation

### 1. Load the Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select this project folder
5. The extension should now appear in your extensions list

### 2. Database Setup

The extension uses Supabase for storing comments:

1. Go to [Supabase dashboard](https://supabase.com/dashboard/projects)
2. Create a new project (free tier available)
3. Get your connection string from the project settings
4. Add it to your Replit secrets as `DATABASE_URL`

### 3. Start the Backend

The backend server will start automatically when you run the project in Replit.

## Usage

1. Navigate to [Spotify Web Player](https://open.spotify.com)
2. Go to any playlist page
3. Click the floating "💬 Comments" button in the bottom-right corner
4. View existing comments or add your own!
5. Look for small comment bubbles on individual tracks that have comments

## Project Structure

```
├── manifest.json          # Chrome extension manifest
├── content.js             # Main content script injected into Spotify
├── background.js          # Service worker for extension
├── styles.css            # Extension styles
├── popup.html            # Extension popup interface
├── server.js             # Express.js backend server
├── components/           # UI components
│   ├── CommentPanel.js   # Main comment panel
│   ├── CommentButton.js  # Floating comment button
│   └── CommentBubble.js  # Track comment indicators
├── utils/                # Utility modules
│   ├── spotify.js        # Spotify integration helpers
│   └── api.js           # Backend API communication
└── db/
    └── schema.sql       # Database schema
```

## API Endpoints

- `GET /health` - Health check
- `GET /comments?playlist_id=<id>[&track_uri=<uri>]` - Get comments
- `POST /comments` - Post new comment
- `POST /comments/counts` - Get comment counts for tracks
- `GET /comments/stats/:playlist_id` - Get playlist statistics

## Technical Details

- **Frontend**: Vanilla JavaScript with Shadow DOM for CSS isolation
- **Backend**: Node.js with Express, PostgreSQL database
- **Extension**: Chrome Manifest V3 with content scripts
- **Database**: PostgreSQL with Supabase hosting
- **Security**: Rate limiting, input validation, CORS protection

## Development

1. Make changes to the extension files
2. Reload the extension in `chrome://extensions/`
3. Refresh any open Spotify tabs to see changes
4. Check the browser console for debugging info

## Browser Compatibility

- ✅ Chrome (primary support)
- ✅ Brave (Chromium-based)
- ✅ Edge (Chromium-based)
- ❓ Firefox (may require manifest conversion)

## Privacy & Security

- No user authentication required (MVP version)
- Comments are public and visible to all extension users
- Rate limiting prevents spam and abuse
- Input validation and sanitization on all user content
- HTTPS/TLS encryption for all data transmission