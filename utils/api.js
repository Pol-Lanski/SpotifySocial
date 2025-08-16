// API utility functions for backend communication
class ApiUtils {
  constructor() {
    // For Chrome extensions, we can use localhost with proper permissions
    // Chrome extensions bypass mixed content restrictions
    this.baseUrl = 'http://localhost:5000';
    this.timeout = 10000; // 10 seconds
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second
  }

  // Generic fetch wrapper with error handling and retries
  async fetchWithRetry(url, options = {}, attempt = 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (attempt < this.retryAttempts && !error.name === 'AbortError') {
        console.warn(`API request failed (attempt ${attempt}), retrying...`, error);
        await this.delay(this.retryDelay * attempt);
        return this.fetchWithRetry(url, options, attempt + 1);
      }
      
      throw error;
    }
  }

  // Get comments for a playlist or track
  async getComments(playlistId, trackUri = null) {
    try {
      let url = `${this.baseUrl}/comments?playlist_id=${encodeURIComponent(playlistId)}`;
      
      if (trackUri) {
        url += `&track_uri=${encodeURIComponent(trackUri)}`;
      }
      
      const response = await this.fetchWithRetry(url);
      const comments = await response.json();
      
      // Validate response structure
      if (!Array.isArray(comments)) {
        throw new Error('Invalid response format: expected array of comments');
      }
      
      return comments.map(comment => this.validateComment(comment)).filter(Boolean);
    } catch (error) {
      console.error('Error fetching comments:', error);
      throw new Error(`Failed to load comments: ${error.message}`);
    }
  }

  // Post a new comment
  async postComment(playlistId, text, trackUri = null) {
    try {
      if (!playlistId || !text || text.trim().length === 0) {
        throw new Error('Playlist ID and comment text are required');
      }
      
      if (text.length > 500) {
        throw new Error('Comment text must be 500 characters or less');
      }
      
      const payload = {
        playlist_id: playlistId,
        text: text.trim()
      };
      
      if (trackUri) {
        payload.track_uri = trackUri;
      }
      
      const response = await this.fetchWithRetry(`${this.baseUrl}/comments`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      const comment = await response.json();
      return this.validateComment(comment);
    } catch (error) {
      console.error('Error posting comment:', error);
      throw new Error(`Failed to post comment: ${error.message}`);
    }
  }

  // Get comment count for tracks (bulk operation)
  async getTrackCommentCounts(playlistId, trackUris) {
    try {
      if (!playlistId || !Array.isArray(trackUris) || trackUris.length === 0) {
        return {};
      }
      
      const response = await this.fetchWithRetry(`${this.baseUrl}/comments/counts`, {
        method: 'POST',
        body: JSON.stringify({
          playlist_id: playlistId,
          track_uris: trackUris
        })
      });
      
      const counts = await response.json();
      return counts || {};
    } catch (error) {
      console.error('Error fetching track comment counts:', error);
      return {}; // Return empty object on error to fail gracefully
    }
  }

  // Check backend health
  async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        timeout: 5000
      });
      
      return {
        online: response.ok,
        status: response.status,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        online: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Validate comment object structure
  validateComment(comment) {
    if (!comment || typeof comment !== 'object') {
      console.warn('Invalid comment object:', comment);
      return null;
    }
    
    const required = ['id', 'playlist_id', 'text', 'created_at'];
    const missing = required.filter(field => !comment[field]);
    
    if (missing.length > 0) {
      console.warn('Comment missing required fields:', missing, comment);
      return null;
    }
    
    return {
      id: comment.id,
      playlist_id: comment.playlist_id,
      track_uri: comment.track_uri || null,
      text: String(comment.text),
      created_at: comment.created_at
    };
  }

  // Utility function to add delay
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cache management for performance
  setupCache() {
    this.cache = new Map();
    this.cacheTimeout = 30000; // 30 seconds
  }

  getCacheKey(url, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return `${url}?${sortedParams}`;
  }

  setCache(key, data) {
    if (!this.cache) this.setupCache();
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Clean up old cache entries
    setTimeout(() => {
      if (this.cache.has(key)) {
        const entry = this.cache.get(key);
        if (Date.now() - entry.timestamp > this.cacheTimeout) {
          this.cache.delete(key);
        }
      }
    }, this.cacheTimeout);
  }

  getCache(key) {
    if (!this.cache) return null;
    
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  clearCache() {
    if (this.cache) {
      this.cache.clear();
    }
  }

  // Get comments with caching
  async getCommentsWithCache(playlistId, trackUri = null) {
    const cacheKey = this.getCacheKey('/comments', { 
      playlist_id: playlistId, 
      track_uri: trackUri 
    });
    
    const cached = this.getCache(cacheKey);
    if (cached) {
      return cached;
    }
    
    const comments = await this.getComments(playlistId, trackUri);
    this.setCache(cacheKey, comments);
    
    return comments;
  }

  // Set custom backend URL
  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/$/, ''); // Remove trailing slash
  }

  // Get current backend URL
  getBaseUrl() {
    return this.baseUrl;
  }

  // Configure timeout
  setTimeout(ms) {
    this.timeout = ms;
  }

  // Configure retry settings
  setRetrySettings(attempts, delay) {
    this.retryAttempts = attempts;
    this.retryDelay = delay;
  }

  // Error handling helper
  handleApiError(error) {
    if (error.name === 'AbortError') {
      return 'Request timed out. Please check your connection.';
    }
    
    if (error.message.includes('Failed to fetch')) {
      return 'Unable to connect to server. Please check if the backend is running.';
    }
    
    if (error.message.includes('HTTP 404')) {
      return 'API endpoint not found. Please check the backend configuration.';
    }
    
    if (error.message.includes('HTTP 500')) {
      return 'Server error. Please try again later.';
    }
    
    return error.message || 'An unexpected error occurred.';
  }
}

// Export singleton instance
window.ApiUtils = new ApiUtils();
