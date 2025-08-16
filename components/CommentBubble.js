// Small comment bubble component for track rows
class CommentBubble {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      trackUri: null,
      commentCount: 0,
      onClick: () => {},
      ...options
    };
    
    this.render();
    this.setupEventListeners();
  }

  render() {
    const { commentCount } = this.options;
    
    this.container.innerHTML = `
      <div class="track-comment-bubble" data-action="click" title="View ${commentCount} comment${commentCount !== 1 ? 's' : ''} for this track">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M14 1a1 1 0 011 1v8a1 1 0 01-1 1H4.414L2 13.414V2a1 1 0 011-1h11zM2 2v9.586L3.414 10H14V2H2z"/>
        </svg>
        ${commentCount > 0 ? `<span class="bubble-count">${commentCount > 99 ? '99+' : commentCount}</span>` : ''}
      </div>
    `;
  }

  setupEventListeners() {
    this.container.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'click') {
        this.options.onClick(this.options.trackUri);
      }
    });
  }

  updateCount(count) {
    this.options.commentCount = count;
    this.render();
  }

  show() {
    this.container.style.display = 'inline-flex';
  }

  hide() {
    this.container.style.display = 'none';
  }

  // Animation methods
  fadeIn() {
    this.show();
    const bubble = this.container.querySelector('.track-comment-bubble');
    if (bubble) {
      bubble.style.animation = 'fadeIn 0.3s ease-out';
    }
  }

  fadeOut() {
    const bubble = this.container.querySelector('.track-comment-bubble');
    if (bubble) {
      bubble.style.animation = 'fadeOut 0.3s ease-in';
      setTimeout(() => this.hide(), 300);
    } else {
      this.hide();
    }
  }

  highlight() {
    const bubble = this.container.querySelector('.track-comment-bubble');
    if (bubble) {
      bubble.classList.add('highlight');
      setTimeout(() => {
        bubble.classList.remove('highlight');
      }, 2000);
    }
  }
}

// CSS for comment bubbles
const bubbleStyles = `
  .track-comment-bubble {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    background: #1db954;
    color: white;
    border-radius: 10px;
    padding: 2px 6px;
    margin-left: 8px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    transition: all 0.2s ease;
    position: relative;
    gap: 2px;
  }

  .track-comment-bubble:hover {
    background: #1ed760;
    transform: scale(1.1);
  }

  .track-comment-bubble.highlight {
    animation: highlight 2s ease-out;
  }

  .bubble-count {
    font-size: 9px;
    line-height: 1;
    margin-left: 2px;
  }

  /* Animations */
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes fadeOut {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.8);
    }
  }

  @keyframes highlight {
    0%, 100% {
      background: #1db954;
    }
    25%, 75% {
      background: #ff6b35;
    }
    50% {
      background: #ffd23f;
    }
  }

  /* Integration with Spotify's track rows */
  [data-testid="tracklist-row"] .track-comment-bubble {
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  [data-testid="tracklist-row"]:hover .track-comment-bubble {
    opacity: 1;
  }

  /* Always show if there are comments */
  [data-testid="tracklist-row"] .track-comment-bubble:not(:empty) {
    opacity: 0.7;
  }

  [data-testid="tracklist-row"]:hover .track-comment-bubble:not(:empty) {
    opacity: 1;
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .track-comment-bubble {
      min-width: 18px;
      height: 18px;
      font-size: 9px;
      margin-left: 6px;
    }
    
    .bubble-count {
      font-size: 8px;
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .track-comment-bubble {
      border: 1px solid white;
      background: #0d7377;
    }
    
    .track-comment-bubble:hover {
      background: #14a085;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .track-comment-bubble {
      transition: none;
    }
    
    .track-comment-bubble:hover {
      transform: none;
    }
    
    .track-comment-bubble.highlight {
      animation: none;
      background: #ff6b35;
    }
  }
`;

// Inject bubble styles if not already present
if (!document.querySelector('#comment-bubble-styles')) {
  const style = document.createElement('style');
  style.id = 'comment-bubble-styles';
  style.textContent = bubbleStyles;
  document.head.appendChild(style);
}

// Export for use in content script
window.CommentBubble = CommentBubble;
