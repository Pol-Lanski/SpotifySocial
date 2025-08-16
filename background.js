// Background service worker for the extension
class SpotifyCommentsBackground {
  constructor() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        console.log('Spotify Comments extension installed');
        this.openWelcomePage();
      }
    });

    // Handle messages from content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Handle tab updates to inject content script if needed
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && tab.url.includes('open.spotify.com')) {
        this.ensureContentScriptInjected(tabId);
      }
    });
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'GET_COMMENTS':
          const comments = await this.fetchComments(message.payload);
          sendResponse({ success: true, data: comments });
          break;

        case 'POST_COMMENT':
          const result = await this.postComment(message.payload);
          sendResponse({ success: true, data: result });
          break;

        case 'CHECK_BACKEND_STATUS':
          const status = await this.checkBackendStatus();
          sendResponse({ success: true, data: status });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async fetchComments({ playlistId, trackUri }) {
    try {
      let url = `http://localhost:5000/comments?playlist_id=${playlistId}`;
      if (trackUri) {
        url += `&track_uri=${encodeURIComponent(trackUri)}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching comments:', error);
      throw error;
    }
  }

  async postComment({ playlistId, trackUri, text }) {
    try {
      const payload = {
        playlist_id: playlistId,
        text: text
      };

      if (trackUri) {
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

      return await response.json();
    } catch (error) {
      console.error('Error posting comment:', error);
      throw error;
    }
  }

  async checkBackendStatus() {
    try {
      const response = await fetch('http://localhost:5000/health');
      return { online: response.ok };
    } catch (error) {
      return { online: false };
    }
  }

  async ensureContentScriptInjected(tabId) {
    try {
      // Check if content script is already injected
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.spotifyCommentsExtensionLoaded
      });

      if (!results[0]?.result) {
        // Inject content script
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });

        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ['styles.css']
        });
      }
    } catch (error) {
      console.error('Error injecting content script:', error);
    }
  }

  openWelcomePage() {
    chrome.tabs.create({
      url: 'https://open.spotify.com'
    });
  }

  // Store and retrieve extension settings
  async getSettings() {
    try {
      const result = await chrome.storage.sync.get(['settings']);
      return result.settings || {
        polling_interval: 5000,
        show_track_bubbles: true,
        backend_url: 'http://localhost:5000'
      };
    } catch (error) {
      console.error('Error getting settings:', error);
      return {};
    }
  }

  async setSettings(settings) {
    try {
      await chrome.storage.sync.set({ settings });
      return true;
    } catch (error) {
      console.error('Error setting settings:', error);
      return false;
    }
  }
}

// Initialize background script
new SpotifyCommentsBackground();
