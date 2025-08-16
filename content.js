// Main content script that injects the comment system into Spotify
class SpotifyCommentsExtension {
  constructor() {
    this.shadowRoot = null;
    this.currentPlaylistId = null;
    this.currentTrackUri = null;
    this.isDrawerOpen = false;
    this.commentButton = null;
    this.drawer = null;
    this.mutationObserver = null;
    
    this.init();
  }

  init() {
    // Wait for Spotify to load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    this.createShadowDOM();
    this.setupMutationObserver();
    this.detectCurrentContext();
    this.injectUI();
    this.setupEventListeners();
  }

  createShadowDOM() {
    // Create shadow DOM container to prevent CSS conflicts
    const container = document.createElement('div');
    container.id = 'spotify-comments-extension';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 10000;
    `;
    
    this.shadowRoot = container.attachShadow({ mode: 'open' });
    
    // Add styles to shadow DOM
    const styleSheet = document.createElement('style');
    styleSheet.textContent = this.getStyles();
    this.shadowRoot.appendChild(styleSheet);
    
    document.body.appendChild(container);
  }

  getStyles() {
    return `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      .comment-button {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #1db954;
        color: white;
        border: none;
        border-radius: 50px;
        padding: 12px 20px;
        cursor: pointer;
        font-family: 'Circular', Arial, sans-serif;
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: auto;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.2s ease;
        z-index: 10001;
      }

      .comment-button:hover {
        background: #1ed760;
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
      }

      .comment-drawer {
        position: fixed;
        top: 0;
        right: 0;
        width: 400px;
        height: 100vh;
        background: #121212;
        border-left: 1px solid #282828;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        pointer-events: auto;
        z-index: 10002;
        display: flex;
        flex-direction: column;
      }

      .comment-drawer.open {
        transform: translateX(0);
      }

      .drawer-header {
        padding: 20px;
        border-bottom: 1px solid #282828;
        background: #181818;
      }

      .drawer-title {
        color: #ffffff;
        font-family: 'Circular', Arial, sans-serif;
        font-size: 18px;
        font-weight: 700;
        margin-bottom: 12px;
      }

      .drawer-tabs {
        display: flex;
        gap: 16px;
      }

      .tab-button {
        background: none;
        border: none;
        color: #b3b3b3;
        font-family: 'Circular', Arial, sans-serif;
        font-size: 14px;
        font-weight: 600;
        padding: 8px 0;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: all 0.2s ease;
      }

      .tab-button.active {
        color: #ffffff;
        border-bottom-color: #1db954;
      }

      .close-button {
        position: absolute;
        top: 16px;
        right: 16px;
        background: none;
        border: none;
        color: #b3b3b3;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: color 0.2s ease;
      }

      .close-button:hover {
        color: #ffffff;
      }

      .comment-list {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        scrollbar-width: thin;
        scrollbar-color: #535353 #121212;
      }

      .comment-list::-webkit-scrollbar {
        width: 8px;
      }

      .comment-list::-webkit-scrollbar-track {
        background: #121212;
      }

      .comment-list::-webkit-scrollbar-thumb {
        background: #535353;
        border-radius: 4px;
      }

      .comment-item {
        background: #181818;
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 12px;
        color: #ffffff;
        font-family: 'Circular', Arial, sans-serif;
      }

      .comment-text {
        font-size: 14px;
        line-height: 1.4;
        margin-bottom: 8px;
      }

      .comment-meta {
        font-size: 12px;
        color: #b3b3b3;
      }

      .comment-composer {
        padding: 20px;
        border-top: 1px solid #282828;
        background: #181818;
      }

      .composer-input {
        width: 100%;
        background: #2a2a2a;
        border: 1px solid #535353;
        border-radius: 8px;
        padding: 12px;
        color: #ffffff;
        font-family: 'Circular', Arial, sans-serif;
        font-size: 14px;
        resize: vertical;
        min-height: 60px;
        max-height: 120px;
      }

      .composer-input:focus {
        outline: none;
        border-color: #1db954;
      }

      .composer-input::placeholder {
        color: #b3b3b3;
      }

      .composer-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 12px;
      }

      .send-button {
        background: #1db954;
        color: white;
        border: none;
        border-radius: 20px;
        padding: 8px 20px;
        cursor: pointer;
        font-family: 'Circular', Arial, sans-serif;
        font-size: 14px;
        font-weight: 600;
        transition: background 0.2s ease;
      }

      .send-button:hover:not(:disabled) {
        background: #1ed760;
      }

      .send-button:disabled {
        background: #535353;
        cursor: not-allowed;
      }

      .empty-state {
        text-align: center;
        color: #b3b3b3;
        font-family: 'Circular', Arial, sans-serif;
        font-size: 14px;
        padding: 40px 20px;
      }

      .error-state {
        text-align: center;
        color: #e22134;
        font-family: 'Circular', Arial, sans-serif;
        font-size: 14px;
        padding: 40px 20px;
      }

      .track-comment-bubble {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        background: #1db954;
        border-radius: 50%;
        margin-left: 8px;
        cursor: pointer;
        font-size: 12px;
        color: white;
        transition: all 0.2s ease;
      }

      .track-comment-bubble:hover {
        background: #1ed760;
        transform: scale(1.1);
      }

      .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        color: #b3b3b3;
        font-family: 'Circular', Arial, sans-serif;
        font-size: 14px;
      }
    `;
  }

  setupMutationObserver() {
    // Listen for DOM changes to detect route navigation
    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.target.tagName === 'TITLE') {
          shouldUpdate = true;
        }
      });
      
      if (shouldUpdate) {
        setTimeout(() => {
          this.detectCurrentContext();
          this.updateUI();
        }, 500);
      }
    });
    
    this.mutationObserver.observe(document, {
      childList: true,
      subtree: true
    });
    
    // Also listen for history changes
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      setTimeout(() => {
        window.dispatchEvent(new Event('spotify-navigation'));
      }, 100);
    };
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      setTimeout(() => {
        window.dispatchEvent(new Event('spotify-navigation'));
      }, 100);
    };
    
    window.addEventListener('spotify-navigation', () => {
      this.detectCurrentContext();
      this.updateUI();
    });
  }

  detectCurrentContext() {
    const url = window.location.href;
    const playlistMatch = url.match(/\/playlist\/([a-zA-Z0-9]+)/);
    
    if (playlistMatch) {
      this.currentPlaylistId = playlistMatch[1];
      console.log('🎵 Detected playlist:', this.currentPlaylistId);
      console.log('🔗 Full URL:', url);
    } else {
      this.currentPlaylistId = null;
      console.log('❌ No playlist detected in URL:', url);
    }
  }

  injectUI() {
    this.createCommentButton();
    this.createCommentDrawer();
    this.addTrackBubbles();
  }

  createCommentButton() {
    if (this.commentButton) {
      this.commentButton.remove();
    }
    
    if (!this.currentPlaylistId) return;
    
    this.commentButton = document.createElement('button');
    this.commentButton.className = 'comment-button';
    this.commentButton.innerHTML = '💬 Comments';
    
    this.commentButton.addEventListener('click', () => {
      this.toggleDrawer();
    });
    
    this.shadowRoot.appendChild(this.commentButton);
  }

  createCommentDrawer() {
    if (this.drawer) {
      this.drawer.remove();
    }
    
    this.drawer = document.createElement('div');
    this.drawer.className = 'comment-drawer';
    
    this.drawer.innerHTML = `
      <div class="drawer-header">
        <button class="close-button">✕</button>
        <div class="drawer-title">Comments for Playlist</div>
        <div class="drawer-tabs">
          <button class="tab-button active" data-tab="playlist">Playlist</button>
          <button class="tab-button" data-tab="track">This Track</button>
        </div>
      </div>
      <div class="comment-list" id="comment-list">
        <div class="loading">Loading comments...</div>
      </div>
      <div class="comment-composer">
        <textarea class="composer-input" placeholder="Add a comment..." rows="3"></textarea>
        <div class="composer-actions">
          <button class="send-button">Send</button>
        </div>
      </div>
    `;
    
    // Setup event listeners
    const closeButton = this.drawer.querySelector('.close-button');
    closeButton.addEventListener('click', () => this.closeDrawer());
    
    const tabButtons = this.drawer.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        this.switchTab(tab);
      });
    });
    
    const sendButton = this.drawer.querySelector('.send-button');
    const textArea = this.drawer.querySelector('.composer-input');
    
    sendButton.addEventListener('click', () => this.sendComment());
    textArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        this.sendComment();
      }
    });
    
    this.shadowRoot.appendChild(this.drawer);
  }

  addTrackBubbles() {
    // Add comment bubbles to track rows
    const trackRows = document.querySelectorAll('[data-testid="tracklist-row"]');
    
    trackRows.forEach(row => {
      if (row.querySelector('.track-comment-bubble')) return;
      
      const trackUri = this.extractTrackUri(row);
      if (!trackUri) return;
      
      // Check if track has comments (would need API call in real implementation)
      this.checkTrackComments(trackUri).then(hasComments => {
        if (hasComments && !row.querySelector('.track-comment-bubble')) {
          const bubble = document.createElement('span');
          bubble.className = 'track-comment-bubble';
          bubble.textContent = '💬';
          bubble.title = 'View comments for this track';
          
          bubble.addEventListener('click', (e) => {
            e.stopPropagation();
            this.currentTrackUri = trackUri;
            this.openDrawer();
            this.switchTab('track');
          });
          
          const titleCell = row.querySelector('[data-testid="internal-track-link"]');
          if (titleCell && titleCell.parentNode) {
            titleCell.parentNode.appendChild(bubble);
          }
        }
      });
    });
  }

  extractTrackUri(trackRow) {
    // Extract track URI from the row - this is a simplified implementation
    const link = trackRow.querySelector('[data-testid="internal-track-link"]');
    if (link && link.href) {
      const match = link.href.match(/\/track\/([a-zA-Z0-9]+)/);
      return match ? `spotify:track:${match[1]}` : null;
    }
    return null;
  }

  async checkTrackComments(trackUri) {
    try {
      const response = await fetch(`${this.getApiUrl()}/comments?playlist_id=${this.currentPlaylistId}&track_uri=${encodeURIComponent(trackUri)}`);
      const comments = await response.json();
      return comments.length > 0;
    } catch (error) {
      console.error('Error checking track comments:', error);
      return false;
    }
  }

  toggleDrawer() {
    if (this.isDrawerOpen) {
      this.closeDrawer();
    } else {
      this.openDrawer();
    }
  }

  openDrawer() {
    this.isDrawerOpen = true;
    this.drawer.classList.add('open');
    this.loadComments();
    
    // Start polling for updates
    this.startPolling();
  }

  closeDrawer() {
    this.isDrawerOpen = false;
    this.drawer.classList.remove('open');
    this.stopPolling();
  }

  switchTab(tab) {
    const tabButtons = this.drawer.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.tab === tab);
    });
    
    this.currentTab = tab;
    this.loadComments();
  }

  async loadComments() {
    if (!this.currentPlaylistId) return;
    
    const commentList = this.drawer.querySelector('#comment-list');
    commentList.innerHTML = '<div class="loading">Loading comments...</div>';
    
    try {
      let url = `${this.getApiUrl()}/comments?playlist_id=${this.currentPlaylistId}`;
      
      if (this.currentTab === 'track' && this.currentTrackUri) {
        url += `&track_uri=${encodeURIComponent(this.currentTrackUri)}`;
      }
      
      console.log('🔍 Loading comments from:', url);
      const response = await fetch(url);
      console.log('📡 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const comments = await response.json();
      console.log('💬 Loaded comments:', comments);
      
      this.renderComments(comments);
    } catch (error) {
      console.error('❌ Error loading comments:', error);
      commentList.innerHTML = '<div class="error-state">Failed to load comments. Please try again.</div>';
    }
  }

  renderComments(comments) {
    const commentList = this.drawer.querySelector('#comment-list');
    
    if (comments.length === 0) {
      commentList.innerHTML = '<div class="empty-state">No comments yet. Be the first to comment!</div>';
      return;
    }
    
    const commentsHtml = comments.map(comment => `
      <div class="comment-item">
        <div class="comment-text">${this.escapeHtml(comment.text)}</div>
        <div class="comment-meta">${this.formatDate(comment.created_at)}</div>
      </div>
    `).join('');
    
    commentList.innerHTML = commentsHtml;
    
    // Scroll to bottom
    commentList.scrollTop = commentList.scrollHeight;
  }

  async sendComment() {
    const textArea = this.drawer.querySelector('.composer-input');
    const text = textArea.value.trim();
    
    if (!text || !this.currentPlaylistId) return;
    
    const sendButton = this.drawer.querySelector('.send-button');
    sendButton.disabled = true;
    
    try {
      const payload = {
        playlist_id: this.currentPlaylistId,
        text: text
      };
      
      if (this.currentTab === 'track' && this.currentTrackUri) {
        payload.track_uri = this.currentTrackUri;
      }
      
      console.log('📝 Sending comment:', payload);
      console.log('🎯 API URL:', this.getApiUrl());
      
      const response = await fetch(`${this.getApiUrl()}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      console.log('📡 Send response status:', response.status, response.statusText);
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Comment sent successfully:', result);
        textArea.value = '';
        this.loadComments(); // Refresh comments
      } else {
        const errorText = await response.text();
        console.error('❌ Server error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('❌ Error sending comment:', error);
      alert('Failed to send comment. Please try again.');
    } finally {
      sendButton.disabled = false;
    }
  }

  startPolling() {
    this.stopPolling();
    this.pollingInterval = setInterval(() => {
      if (this.isDrawerOpen) {
        this.loadComments();
      }
    }, 5000); // Poll every 5 seconds
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  updateUI() {
    this.createCommentButton();
    this.addTrackBubbles();
  }

  getApiUrl() {
    // Chrome extensions can access localhost with proper permissions
    return 'http://localhost:5000';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }
}

// Initialize the extension when content script loads
if (window.location.hostname === 'open.spotify.com') {
  new SpotifyCommentsExtension();
}
