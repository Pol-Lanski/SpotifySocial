// Background service worker for the extension
class SpotifyCommentsBackground {
  constructor() {
    this.session = null; // { token, privyUserId }
    this.apiUrlOverride = null;
    this.setupEventListeners();
    this.bootstrapAuth();
    this.loadApiUrlOverride();
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
        case 'GET_AUTH_STATE':
          sendResponse({ success: true, data: { authenticated: !!this.session?.token, privyUserId: this.session?.privyUserId || null } });
          break;

        case 'OPEN_LOGIN':
          await this.openHostedLogin(message?.payload?.forceNew === true);
          sendResponse({ success: true });
          break;

        case 'GET_COMMENTS':
          const comments = await this.fetchComments(message.payload);
          sendResponse({ success: true, data: comments });
          break;

        case 'POST_COMMENT':
          const result = await this.postComment(message.payload);
          sendResponse({ success: true, data: result });
          break;

        case 'DELETE_COMMENT':
          await this.deleteComment(message.payload.commentId);
          sendResponse({ success: true });
          break;

        case 'CHECK_BACKEND_STATUS':
          const status = await this.checkBackendStatus();
          sendResponse({ success: true, data: status });
          break;

        case 'LOGOUT':
          await this.clearSession();
          sendResponse({ success: true });
          break;

        case 'GET_PROFILE':
          try {
            const prof = await this.getProfile();
            sendResponse({ success: true, data: prof });
          } catch (e) {
            sendResponse({ success: false, error: e.message });
          }
          break;

        case 'UPDATE_USERNAME':
          try {
            const updated = await this.updateUsername(message?.payload?.username);
            sendResponse({ success: true, data: updated });
          } catch (e) {
            sendResponse({ success: false, error: e.message });
          }
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async bootstrapAuth() {
    try {
      const stored = await chrome.storage.local.get(['session']);
      if (stored?.session?.token) {
        this.session = stored.session;
        return;
      }
      // No session: encourage login via popup flow on demand
      this.session = null;
    } catch (e) {
      console.warn('Auth bootstrap failed:', e);
    }
  }

  async setSession(session) {
    this.session = session;
    await chrome.storage.local.set({ session });
    chrome.runtime.sendMessage({ type: 'PRIVY_SESSION_UPDATED' }).catch(() => {});
  }

  async clearSession() {
    try {
      this.session = null;
      await chrome.storage.local.remove('session');
    } finally {
      chrome.runtime.sendMessage({ type: 'PRIVY_SESSION_UPDATED' }).catch(() => {});
    }
  }

  async openHostedLogin(forceNew = false) {
    // Use WebAuthFlow to capture a redirect back to the extension with a token
    const baseUrl = this.getApiUrl();
    const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/privy`; // special redirect for extensions
    const startUrl = `${baseUrl}/auth/start?redirect_uri=${encodeURIComponent(redirectUri)}${forceNew ? '&force_new=1' : ''}`;
    try {
      const redirect = await chrome.identity.launchWebAuthFlow({
        url: startUrl,
        interactive: true
      });
      console.log('[Auth] WebAuthFlow redirect URL:', redirect);
      // redirect is the final URL, e.g., https://<ext>.chromiumapp.org/privy#privyToken=...
      const tokenMatch = redirect && redirect.match(/[?#&]privyToken=([^&#]+)/);
      const privyToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
      if (!privyToken) {
        console.error('[Auth] Missing privyToken in redirect');
        throw new Error('Missing privyToken in redirect');
      }
      console.log('[Auth] Exchanging Privy token');
      await this.exchangePrivyToken(privyToken);
      console.log('[Auth] Exchange complete, session stored');
    } catch (e) {
      console.error('Login flow failed', e);
      throw e;
    }
  }

  async exchangePrivyToken(privyToken) {
    const baseUrl = this.getApiUrl();
    const res = await fetch(`${baseUrl}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privyToken })
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error('[Auth] Exchange failed', res.status, t);
      throw new Error(`Exchange failed: ${res.status}`);
    }
    const data = await res.json();
    if (!data?.token) {
      console.error('[Auth] Exchange returned no token', data);
      throw new Error('No app token in exchange response');
    }
    await this.setSession({ token: data.token, privyUserId: data.privyUserId });
  }

  async loadApiUrlOverride() {
    try {
      const stored = await chrome.storage.local.get(['spotifyCommentsApiUrl']);
      this.apiUrlOverride = stored?.spotifyCommentsApiUrl || null;
    } catch (_) {}
  }

  async fetchComments({ playlistId, trackUri }) {
    try {
      const baseUrl = this.getApiUrl();
      let url = `${baseUrl}/comments?playlist_id=${playlistId}`;
      if (trackUri) {
        url += `&track_uri=${encodeURIComponent(trackUri)}`;
      }

      const response = await fetch(url, {
        headers: this.session?.token ? { 'Authorization': `Bearer ${this.session.token}` } : {}
      });
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
      if (!this.session?.token) {
        throw new Error('Not authenticated');
      }
      const payload = {
        playlist_id: playlistId,
        text: text
      };

      if (trackUri) {
        payload.track_uri = trackUri;
      }

      const baseUrl = this.getApiUrl();
      const response = await fetch(`${baseUrl}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.session.token}`
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

  async deleteComment(commentId) {
    if (!this.session?.token) throw new Error('Not authenticated');
    const baseUrl = this.getApiUrl();
    const response = await fetch(`${baseUrl}/comments/${commentId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${this.session.token}` }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return true;
  }

  async checkBackendStatus() {
    try {
      const baseUrl = this.getApiUrl();
      const response = await fetch(`${baseUrl}/health`);
      return { online: response.ok };
    } catch (error) {
      return { online: false };
    }
  }

  async getProfile() {
    if (!this.session?.token) throw new Error('Not authenticated');
    const baseUrl = this.getApiUrl();
    const r = await fetch(`${baseUrl}/auth/me`, {
      headers: { 'Authorization': `Bearer ${this.session.token}` }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  async updateUsername(username) {
    if (!this.session?.token) throw new Error('Not authenticated');
    const baseUrl = this.getApiUrl();
    const r = await fetch(`${baseUrl}/auth/me/username`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.session.token}`
      },
      body: JSON.stringify({ username })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
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

  getApiUrl() {
    // Allow overriding API URL via chrome.storage.local for easier testing/migration
    if (this.apiUrlOverride) return this.apiUrlOverride;
    // Default to local HTTPS reverse proxy (Caddy)
    return 'https://localhost:8443';
  }

  // Store and retrieve extension settings
  async getSettings() {
    try {
      const result = await chrome.storage.sync.get(['settings']);
      return result.settings || {
        polling_interval: 5000,
        show_track_bubbles: true,
        backend_url: this.getApiUrl()
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
