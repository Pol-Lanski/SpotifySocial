// Floating comment button component
class CommentButton {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      onClick: () => {},
      position: 'bottom-right',
      ...options
    };
    
    this.state = {
      visible: false,
      commentCount: 0,
      loading: false
    };
    
    this.render();
    this.setupEventListeners();
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.render();
  }

  render() {
    const { visible, commentCount, loading } = this.state;
    const { position } = this.options;
    
    this.container.innerHTML = `
      <div class="comment-button-container ${position} ${visible ? 'visible' : 'hidden'}">
        <button class="comment-button ${loading ? 'loading' : ''}" data-action="toggle">
          <div class="button-content">
            ${loading ? this.renderSpinner() : this.renderIcon()}
            <span class="button-text">Comments</span>
            ${commentCount > 0 ? `<span class="comment-badge">${commentCount}</span>` : ''}
          </div>
        </button>
      </div>
    `;
  }

  renderIcon() {
    return `
      <svg class="button-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M14 1a1 1 0 011 1v8a1 1 0 01-1 1H4.414L2 13.414V2a1 1 0 011-1h11zM2 2v9.586L3.414 10H14V2H2z"/>
        <path d="M5 6a1 1 0 100-2 1 1 0 000 2zm3 0a1 1 0 100-2 1 1 0 000 2zm3 0a1 1 0 100-2 1 1 0 000 2z"/>
      </svg>
    `;
  }

  renderSpinner() {
    return `
      <div class="button-spinner">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="37.7" stroke-dashoffset="37.7">
            <animate attributeName="stroke-dashoffset" dur="1s" values="37.7;0" repeatCount="indefinite"/>
          </circle>
        </svg>
      </div>
    `;
  }

  setupEventListeners() {
    this.container.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      
      if (action === 'toggle') {
        this.options.onClick();
      }
    });
  }

  show() {
    this.setState({ visible: true });
  }

  hide() {
    this.setState({ visible: false });
  }

  setCommentCount(count) {
    this.setState({ commentCount: count });
  }

  setLoading(loading) {
    this.setState({ loading });
  }

  // Animation helpers
  slideIn() {
    this.show();
    const button = this.container.querySelector('.comment-button');
    if (button) {
      button.style.animation = 'slideInUp 0.3s ease-out';
    }
  }

  slideOut() {
    const button = this.container.querySelector('.comment-button');
    if (button) {
      button.style.animation = 'slideOutDown 0.3s ease-in';
      setTimeout(() => this.hide(), 300);
    } else {
      this.hide();
    }
  }

  pulse() {
    const button = this.container.querySelector('.comment-button');
    if (button) {
      button.classList.add('pulse-animation');
      setTimeout(() => {
        button.classList.remove('pulse-animation');
      }, 1000);
    }
  }
}

// CSS animations for the button
const buttonAnimations = `
  @keyframes slideInUp {
    from {
      transform: translateY(100px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes slideOutDown {
    from {
      transform: translateY(0);
      opacity: 1;
    }
    to {
      transform: translateY(100px);
      opacity: 0;
    }
  }

  @keyframes pulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
    }
  }

  .comment-button.pulse-animation {
    animation: pulse 0.6s ease-in-out;
  }

  .comment-button-container {
    position: fixed;
    z-index: 10001;
    transition: all 0.3s ease;
  }

  .comment-button-container.bottom-right {
    bottom: 20px;
    right: 20px;
  }

  .comment-button-container.bottom-left {
    bottom: 20px;
    left: 20px;
  }

  .comment-button-container.top-right {
    top: 20px;
    right: 20px;
  }

  .comment-button-container.hidden {
    opacity: 0;
    transform: translateY(20px);
    pointer-events: none;
  }

  .comment-button-container.visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .comment-button {
    background: linear-gradient(135deg, #1db954 0%, #1ed760 100%);
    color: white;
    border: none;
    border-radius: 25px;
    padding: 12px 20px;
    cursor: pointer;
    font-family: 'Circular', Arial, sans-serif;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 20px rgba(29, 185, 84, 0.3);
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
  }

  .comment-button:hover {
    background: linear-gradient(135deg, #1ed760 0%, #1fdf64 100%);
    transform: translateY(-2px);
    box-shadow: 0 6px 25px rgba(29, 185, 84, 0.4);
  }

  .comment-button:active {
    transform: translateY(0);
    box-shadow: 0 2px 15px rgba(29, 185, 84, 0.3);
  }

  .comment-button.loading {
    cursor: wait;
  }

  .button-content {
    display: flex;
    align-items: center;
    gap: 8px;
    position: relative;
  }

  .button-icon,
  .button-spinner {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
  }

  .button-text {
    white-space: nowrap;
  }

  .comment-badge {
    background: #ff4444;
    color: white;
    border-radius: 10px;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: 700;
    min-width: 18px;
    text-align: center;
    margin-left: 4px;
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .comment-button {
      padding: 10px 16px;
      font-size: 13px;
    }
    
    .button-text {
      display: none;
    }
    
    .comment-button {
      border-radius: 50%;
      width: 48px;
      height: 48px;
      padding: 0;
    }
    
    .button-content {
      justify-content: center;
    }
  }
`;

// Inject button animations CSS if not already present
if (!document.querySelector('#comment-button-animations')) {
  const style = document.createElement('style');
  style.id = 'comment-button-animations';
  style.textContent = buttonAnimations;
  document.head.appendChild(style);
}

// Export for use in content script
window.CommentButton = CommentButton;
