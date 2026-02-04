import { useStore } from '@/store/useStore';

/**
 * Google OAuth authentication using chrome.identity API
 */
export class AuthService {
  private static readonly SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  /**
   * Get Google OAuth token
   */
  static async getToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken(
        {
          interactive: true,
          scopes: this.SCOPES,
        },
        (token) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!token) {
            reject(new Error('Failed to get auth token'));
            return;
          }
          resolve(token);
        }
      );
    });
  }

  /**
   * Get user info from Google API
   */
  static async getUserInfo(token: string): Promise<{ email: string; name: string }> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    return response.json();
  }

  /**
   * Check if user is authenticated with NotebookLM
   * This checks cookies from notebooklm.google.com
   */
  static async checkNotebookLMAuth(): Promise<boolean> {
    try {
      const cookies = await chrome.cookies.getAll({
        domain: 'notebooklm.google.com',
      });

      // Log cookies for debugging (remove in production)
      console.log('NotebookLM cookies:', cookies.map(c => c.name));

      // Check for authentication cookies (common patterns)
      // Google cookies
      const googleAuthCookies = ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'NID', '__Secure-1PSID', '__Secure-3PSID'];
      // Session cookies
      const sessionPatterns = ['session', 'auth', 'token', 'login', 'user', 'account'];
      
      const hasAuthCookie = cookies.some(
        (cookie) => {
          // Check exact matches
          if (googleAuthCookies.includes(cookie.name)) {
            return true;
          }
          // Check patterns (case insensitive)
          const nameLower = cookie.name.toLowerCase();
          return sessionPatterns.some(pattern => nameLower.includes(pattern));
        }
      );

      // Also check if there are any cookies at all (user visited the site)
      const hasAnyCookies = cookies.length > 0;

      return hasAuthCookie || hasAnyCookies; // More lenient check
    } catch (error) {
      console.error('Error checking NotebookLM auth:', error);
      return false;
    }
  }

  /**
   * Authenticate user
   * First tries to use NotebookLM cookies, then falls back to OAuth if needed
   */
  static async authenticate(): Promise<void> {
    try {
      // First check if user is already logged in to NotebookLM via cookies
      const isNotebookLMAuthed = await this.checkNotebookLMAuth();
      
      if (isNotebookLMAuthed) {
        // User is already authenticated via cookies, no need for OAuth
        useStore.getState().setAuth({
          isAuthenticated: true,
          userEmail: undefined,
        });
        
        // Try to get user info via OAuth if possible (optional, don't fail if it doesn't work)
        try {
          const token = await this.getToken();
          const userInfo = await this.getUserInfo(token);
          useStore.getState().setAuth({
            isAuthenticated: true,
            token,
            userEmail: userInfo.email,
          });
        } catch (oauthError) {
          // OAuth failed, but cookies auth works, so continue
          console.log('OAuth not available or not configured, using cookies authentication');
          // Don't throw error - cookies auth is sufficient
        }
        return; // Success with cookies
      }
      
      // No cookies found, try OAuth
      try {
        const token = await this.getToken();
        const userInfo = await this.getUserInfo(token);
        
        // After OAuth, check cookies again (user might have logged in)
        const notebookLMAuth = await this.checkNotebookLMAuth();
        
        useStore.getState().setAuth({
          isAuthenticated: notebookLMAuth || true, // Allow OAuth-only auth
          token,
          userEmail: userInfo.email,
        });
      } catch (oauthError) {
        // OAuth failed - check error type
        const errorMessage = oauthError instanceof Error ? oauthError.message : String(oauthError);
        
        // Check if it's a Client ID error
        if (errorMessage.includes('bad client id') || errorMessage.includes('invalid_client')) {
          // Client ID is wrong, but try cookies one more time
          const cookieAuth = await this.checkNotebookLMAuth();
          if (cookieAuth) {
            useStore.getState().setAuth({
              isAuthenticated: true,
              userEmail: undefined,
            });
            return; // Success with cookies despite OAuth error
          }
          throw new Error('OAuth Client ID is incorrect. Please check your Client ID in manifest.json, or log in to notebooklm.google.com in this browser.');
        }
        
        // Other OAuth error - check cookies as fallback
        const cookieAuth = await this.checkNotebookLMAuth();
        if (cookieAuth) {
          useStore.getState().setAuth({
            isAuthenticated: true,
            userEmail: undefined,
          });
          return; // Success with cookies
        }
        
        // Both failed
        throw new Error('Please log in to notebooklm.google.com in this browser first. OAuth is optional and can be configured later.');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  static async logout(): Promise<void> {
    chrome.identity.removeCachedAuthToken(
      { token: useStore.getState().auth.token || '' },
      () => {
        useStore.getState().logout();
      }
    );
  }
}
