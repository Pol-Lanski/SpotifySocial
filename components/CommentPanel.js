// React component for the main comment panel
class CommentPanel {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      playlistId: null,
      trackUri: null,
      onClose: () => {},
      onTabChange: () => {},
      ...options
    };
    
    this.state = {
      comments: [],
      loading: false,
      error: null,
      activeTab: 'playlist',
      composerText: ''
    };
    
    this.render();
    this.setupEventListeners();
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.render();
  }

  render() {
    const { comments, loading, error, activeTab, composerText } = this.state;
    const { playlistId, trackUri } = this.options;
    
    this.container.innerHTML = `
      <div class="comment-panel">
        <div class="panel-header">
          <button class="close-btn" data-action="close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 7.293l2.146-2.147a.5.5 0 01.708.708L8.707 8l2.147 2.146a.5.5 0 01-.708.708L8 8.707l-2.146 2.147a.5.5 0 01-.708-.708L7.293 8 5.146 5.854a.5.5 0 01.708-.708L8 7.293z"/>
            </svg>
          </button>
          <div class="panel-title">
            <h2>Comments${playlistId ? ' for Playlist' : ''}</h2>
          </div>
          <div class="panel-tabs">
            <button 
              class="tab-btn ${activeTab === 'playlist' ? 'active' : ''}" 
              data-action="switch-tab" 
              data-tab="playlist"
            >
              Playlist
            </button>
            <button 
              class="tab-btn ${activeTab === 'track' ? 'active' : ''}" 
              data-action="switch-tab" 
              data-tab="track"
              ${!trackUri ? 'disabled' : ''}
            >
              This Track
            </button>
          </div>
        </div>
        
        <div class="panel-content">
          ${this.renderCommentsList()}
        </div>
        
        <div class="panel-composer">
          ${this.renderComposer()}
        </div>
      </div>
    `;
  }

  renderCommentsList() {
    const { comments, loading, error } = this.state;
    
    if (loading) {
      return `
        <div class="comments-loading">
          <div class="loading-spinner"></div>
          <span>Loading comments...</span>
        </div>
      `;
    }
    
    if (error) {
      return `
        <div class="comments-error">
          <p>Failed to load comments</p>
          <button data-action="retry" class="retry-btn">Try Again</button>
        </div>
      `;
    }
    
    if (comments.length === 0) {
      return `
        <div class="comments-empty">
          <p>No comments yet</p>
          <p class="empty-subtitle">Be the first to share your thoughts!</p>
        </div>
      `;
    }
    
    return `
      <div class="comments-list">
        ${comments.map(comment => this.renderComment(comment)).join('')}
      </div>
    `;
  }

  renderComment(comment) {
    const timeAgo = this.getTimeAgo(comment.created_at);
    const isTrackComment = comment.track_uri;
    
    return `
      <div class="comment-item ${isTrackComment ? 'track-comment' : 'playlist-comment'}">
        <div class="comment-content">
          <p class="comment-text">${this.escapeHtml(comment.text)}</p>
          <div class="comment-meta">
            <span class="comment-time">${timeAgo}</span>
            ${isTrackComment ? '<span class="comment-type">Track</span>' : ''}
          </div>
        </div>
      </div>
    `;
  }

  renderComposer() {
    const { composerText, loading } = this.state;
    const { playlistId } = this.options;
    
    if (!playlistId) {
      return `
        <div class="composer-disabled">
          <p>Navigate to a playlist to leave comments</p>
        </div>
      `;
    }
    
    return `
      <div class="comment-composer">
        <div class="composer-input-container">
          <textarea 
            class="composer-textarea"
            placeholder="Add a comment..."
            rows="3"
            maxlength="500"
            data-action="input"
          >${composerText}</textarea>
          <div class="composer-counter">
            <span class="char-count">${composerText.length}/500</span>
          </div>
        </div>
        <div class="composer-actions">
          <button 
            class="compose-btn send-btn"
            data-action="send"
            ${!composerText.trim() || loading ? 'disabled' : ''}
          >
            ${loading ? '<div class="loading-spinner"></div>' : 'Send'}
          </button>
        </div>
      </div>
    `;
  }

  setupEventListeners() {
    this.container.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      
      switch (action) {
        case 'close':
          this.options.onClose();
          break;
        case 'switch-tab':
          const tab = e.target.dataset.tab;
          this.switchTab(tab);
          break;
        case 'send':
          this.sendComment();
          break;
        case 'retry':
          this.loadComments();
          break;
      }
    });

    this.container.addEventListener('input', (e) => {
      if (e.target.dataset.action === 'input') {
        this.setState({ composerText: e.target.value });
      }
    });

    this.container.addEventListener('keydown', (e) => {
      if (e.target.dataset.action === 'input' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.sendComment();
      }
    });
  }

  switchTab(tab) {
    this.setState({ activeTab: tab });
    this.options.onTabChange(tab);
    this.loadComments();
  }

  async loadComments() {
    const { playlistId, trackUri } = this.options;
    const { activeTab } = this.state;
    
    if (!playlistId) return;
    
    this.setState({ loading: true, error: null });
    
    try {
      let url = `/comments?playlist_id=${playlistId}`;
      
      if (activeTab === 'track' && trackUri) {
        url += `&track_uri=${encodeURIComponent(trackUri)}`;
      }
      
      const response = await fetch(`http://localhost:5000${url}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const comments = await response.json();
      
      this.setState({ 
        comments: comments || [], 
        loading: false 
      });
    } catch (error) {
      console.error('Error loading comments:', error);
      this.setState({ 
        loading: false, 
        error: error.message 
      });
    }
  }

  async sendComment() {
    const { playlistId, trackUri } = this.options;
    const { composerText, activeTab } = this.state;
    
    if (!composerText.trim() || !playlistId) return;
    
    this.setState({ loading: true });
    
    try {
      const payload = {
        playlist_id: playlistId,
        text: composerText.trim()
      };
      
      if (activeTab === 'track' && trackUri) {
        payload.track_uri = trackUri;
      }
      
      const response = await fetch('http://localhost:5000/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const newComment = await response.json();
      
      // Optimistic update
      this.setState({ 
        composerText: '',
        loading: false,
        comments: [...this.state.comments, newComment]
      });
      
      // Scroll to bottom
      setTimeout(() => {
        const commentsList = this.container.querySelector('.comments-list');
        if (commentsList) {
          commentsList.scrollTop = commentsList.scrollHeight;
        }
      }, 100);
      
    } catch (error) {
      console.error('Error sending comment:', error);
      this.setState({ loading: false });
      
      // Show error notification
      this.showNotification('Failed to send comment. Please try again.', 'error');
    }
  }

  showNotification(message, type = 'info') {
    // Create and show a temporary notification
    const notification = document.createElement('div');
    notification.className = `comment-notification ${type}`;
    notification.textContent = message;
    
    this.container.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  getTimeAgo(dateString) {
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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Public methods
  updatePlaylist(playlistId) {
    this.options.playlistId = playlistId;
    this.loadComments();
  }

  updateTrack(trackUri) {
    this.options.trackUri = trackUri;
    if (this.state.activeTab === 'track') {
      this.loadComments();
    }
  }

  refresh() {
    this.loadComments();
  }
}

// Export for use in content script
window.CommentPanel = CommentPanel;
