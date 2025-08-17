// Utility functions for interacting with Spotify Web Player
class SpotifyUtils {
  constructor() {
    this.currentPlaylistId = null;
    this.currentTrackUri = null;
    this.observers = [];
  }

  // Parse playlist ID from current URL
  getCurrentPlaylistId() {
    const url = window.location.href;
    const match = url.match(/\/playlist\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  // Parse track ID from URL or current playing context
  getCurrentTrackId() {
    const url = window.location.href;
    const match = url.match(/\/track\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  // Get currently playing track from Spotify's UI
  getCurrentlyPlayingTrack() {
    // Try to get from the now playing bar
    const nowPlayingLink = document.querySelector('[data-testid="context-link"]');
    if (nowPlayingLink && nowPlayingLink.href) {
      const match = nowPlayingLink.href.match(/\/track\/([a-zA-Z0-9]+)/);
      if (match) {
        return {
          id: match[1],
          uri: `spotify:track:${match[1]}`,
          name: this.getCurrentTrackName(),
          artist: this.getCurrentTrackArtist()
        };
      }
    }
    
    return null;
  }

  getCurrentTrackName() {
    const titleElement = document.querySelector('[data-testid="now-playing-widget"] [data-testid="context-link"]');
    return titleElement ? titleElement.textContent.trim() : null;
  }

  getCurrentTrackArtist() {
    const artistElement = document.querySelector('[data-testid="now-playing-widget"] a[href*="/artist/"]');
    return artistElement ? artistElement.textContent.trim() : null;
  }

  // Get playlist name from the page
  getPlaylistName() {
    // Try multiple selectors for playlist name
    const selectors = [
      '[data-testid="entityTitle"]',
      'h1[data-encore-id="type"]',
      '.playlist-header h1',
      '.main-view-container h1'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }
    
    return 'Unknown Playlist';
  }

  // Extract track information from track row elements
  extractTrackInfo(trackRowElement) {
    if (!trackRowElement) return null;
    
    try {
      // Get track link
      const trackLink = trackRowElement.querySelector('[data-testid="internal-track-link"]');
      if (!trackLink || !trackLink.href) return null;
      
      const trackIdMatch = trackLink.href.match(/\/track\/([a-zA-Z0-9]+)/);
      if (!trackIdMatch) return null;
      
      const trackId = trackIdMatch[1];
      const trackUri = `spotify:track:${trackId}`;
      
      // Get track name
      const nameElement = trackRowElement.querySelector('[data-testid="internal-track-link"] div');
      const name = nameElement ? nameElement.textContent.trim() : 'Unknown Track';
      
      // Get artist name
      const artistElement = trackRowElement.querySelector('a[href*="/artist/"]');
      const artist = artistElement ? artistElement.textContent.trim() : 'Unknown Artist';
      
      // Get duration if available
      const durationElement = trackRowElement.querySelector('[data-testid="duration"]');
      const duration = durationElement ? durationElement.textContent.trim() : null;
      
      return {
        id: trackId,
        uri: trackUri,
        name,
        artist,
        duration,
        element: trackRowElement
      };
    } catch (error) {
      console.error('Error extracting track info:', error);
      return null;
    }
  }

  // Get all visible track rows
  getAllTrackRows() {
    const trackRows = document.querySelectorAll('[data-testid="tracklist-row"]');
    return Array.from(trackRows).map(row => this.extractTrackInfo(row)).filter(Boolean);
  }

  // Find track row by URI
  findTrackRowByUri(trackUri) {
    const trackRows = document.querySelectorAll('[data-testid="tracklist-row"]');
    
    for (const row of trackRows) {
      const trackInfo = this.extractTrackInfo(row);
      if (trackInfo && trackInfo.uri === trackUri) {
        return row;
      }
    }
    
    return null;
  }

  // Check if we're on a playlist page
  isPlaylistPage() {
    return /\/playlist\/[a-zA-Z0-9]+/.test(window.location.pathname);
  }

  // Check if we're on a track page
  isTrackPage() {
    return /\/track\/[a-zA-Z0-9]+/.test(window.location.pathname);
  }

  // Check if we're on an artist page
  isArtistPage() {
    return /\/artist\/[a-zA-Z0-9]+/.test(window.location.pathname);
  }

  // Check if we're on an album page
  isAlbumPage() {
    return /\/album\/[a-zA-Z0-9]+/.test(window.location.pathname);
  }

  // Wait for an element to appear in the DOM
  waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      const observer = new MutationObserver((mutations, obs) => {
        const element = document.querySelector(selector);
        if (element) {
          obs.disconnect();
          resolve(element);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  }

  // Observe changes to track list (for virtualized lists)
  observeTrackListChanges(callback) {
    const tracklistContainer = document.querySelector('[data-testid="playlist-tracklist"]') || 
                              document.querySelector('[role="grid"]');
    
    if (!tracklistContainer) {
      console.warn('Tracklist container not found');
      return null;
    }
    
    const observer = new MutationObserver((mutations) => {
      let hasTrackChanges = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE && 
                (node.matches('[data-testid="tracklist-row"]') || 
                 node.querySelector('[data-testid="tracklist-row"]'))) {
              hasTrackChanges = true;
            }
          });
        }
      });
      
      if (hasTrackChanges) {
        callback();
      }
    });
    
    observer.observe(tracklistContainer, {
      childList: true,
      subtree: true
    });
    
    this.observers.push(observer);
    return observer;
  }

  // Observe navigation changes
  observeNavigation(callback) {
    let lastUrl = window.location.href;
    
    const checkForUrlChange = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        callback(currentUrl);
      }
    };
    
    // Listen for history changes
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      setTimeout(checkForUrlChange, 100);
    };
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      setTimeout(checkForUrlChange, 100);
    };
    
    window.addEventListener('popstate', checkForUrlChange);
    
    // Also observe DOM changes that might indicate navigation
    const observer = new MutationObserver(() => {
      setTimeout(checkForUrlChange, 100);
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: false
    });
    
    this.observers.push(observer);
    return observer;
  }

  // Clean up observers
  cleanup() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }

  // Utility to safely inject elements without breaking Spotify's layout
  safeInject(element, targetSelector, position = 'append') {
    try {
      const target = document.querySelector(targetSelector);
      if (!target) {
        console.warn(`Target element ${targetSelector} not found for injection`);
        return false;
      }
      
      switch (position) {
        case 'append':
          target.appendChild(element);
          break;
        case 'prepend':
          target.insertBefore(element, target.firstChild);
          break;
        case 'after':
          target.parentNode.insertBefore(element, target.nextSibling);
          break;
        case 'before':
          target.parentNode.insertBefore(element, target);
          break;
        default:
          target.appendChild(element);
      }
      
      return true;
    } catch (error) {
      console.error('Error injecting element:', error);
      return false;
    }
  }

  // Get Spotify's current theme (dark/light)
  getSpotifyTheme() {
    const bodyClasses = document.body.classList;
    if (bodyClasses.contains('theme-dark') || 
        document.documentElement.getAttribute('data-theme') === 'dark') {
      return 'dark';
    }
    return 'dark'; // Spotify Web Player is primarily dark theme
  }

  // Debounce function for performance
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}

// Export singleton instance
window.SpotifyUtils = new SpotifyUtils();
