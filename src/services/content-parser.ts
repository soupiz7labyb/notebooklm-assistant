/**
 * Service for parsing and extracting content from web pages
 */

export interface ParsedContent {
  title: string;
  text: string;
  html?: string;
  url: string;
}

/**
 * Simple readability parser (lightweight alternative to @mozilla/readability)
 * Extracts main content from a page by removing navigation, ads, etc.
 */
export class ContentParser {
  /**
   * Parse current page content
   * Falls back to URL-only if script execution fails (permissions issue)
   */
  static async parseCurrentPage(): Promise<ParsedContent> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id || !tab.url) {
      throw new Error('No active tab found');
    }

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      throw new Error('Cannot parse this page. Please open a regular web page.');
    }

    // Try to execute script, but if it fails due to permissions, fall back to URL-only
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Remove script and style elements
          const scripts = document.querySelectorAll('script, style, noscript');
          scripts.forEach((el) => el.remove());

          // Try to find main content area
          const mainSelectors = [
            'main',
            'article',
            '[role="main"]',
            '.content',
            '#content',
            '.post',
            '.entry-content',
          ];

          let mainContent: HTMLElement | null = null;

          for (const selector of mainSelectors) {
            const element = document.querySelector(selector);
            if (element) {
              mainContent = element as HTMLElement;
              break;
            }
          }

          // If no main content found, use body
          if (!mainContent) {
            mainContent = document.body;
          }

          // Remove unwanted elements
          const unwantedSelectors = [
            'nav',
            'header',
            'footer',
            'aside',
            '.ad',
            '.advertisement',
            '.sidebar',
            '.menu',
            '.navigation',
            '[role="navigation"]',
            '[role="banner"]',
            '[role="complementary"]',
          ];

          unwantedSelectors.forEach((selector) => {
            mainContent?.querySelectorAll(selector).forEach((el) => el.remove());
          });

          // Get text content
          const text = mainContent?.innerText || mainContent?.textContent || '';
          const title = document.title || 'Untitled Page';

          // Clean up text (remove extra whitespace)
          const cleanedText = text
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();

          return {
            title,
            text: cleanedText,
            html: mainContent?.innerHTML,
            url: window.location.href,
          };
        },
      });

      if (!results || !results[0] || !results[0].result) {
        throw new Error('Failed to extract content from page');
      }

      const content = results[0].result as ParsedContent;
      content.url = tab.url || '';
      return content;
    } catch (error) {
      console.warn('Error parsing page (will send URL only):', error);
      // If script execution fails (permissions), return URL-only content
      // NotebookLM can fetch and process the URL itself
      if (error instanceof Error && (
        error.message.includes('Cannot access') ||
        error.message.includes('permission') ||
        error.message.includes('host')
      )) {
        // Return URL-only - NotebookLM will handle it
        return {
          title: tab.title || 'Untitled Page',
          text: '',
          url: tab.url,
        };
      }
      throw error;
    }
  }


  /**
   * Parse selected text from page
   */
  static async parseSelection(): Promise<ParsedContent> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      throw new Error('No active tab found');
    }

    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      throw new Error('Cannot parse this page. Please open a regular web page.');
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const selection = window.getSelection();
          const text = selection?.toString() || '';
          return {
            text: text.trim(),
            url: window.location.href,
          };
        },
      });

      if (!results || !results[0] || !results[0].result) {
        throw new Error('Failed to get selection from page');
      }

      const data = results[0].result as { text: string; url: string };
      return {
        title: 'Selected Text',
        text: data.text,
        url: data.url,
      };
    } catch (error) {
      console.error('Error parsing selection:', error);
      if (error instanceof Error && error.message.includes('Cannot access')) {
        throw new Error('Cannot access this page. Please try a different page or check permissions.');
      }
      throw error;
    }
  }


  /**
   * Check if current page is YouTube
   */
  static async isYouTube(): Promise<boolean> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab.url?.includes('youtube.com/watch') || false;
  }

  /**
   * Extract YouTube video info
   */
  static async getYouTubeInfo(): Promise<{ url: string; title: string; videoId: string }> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || !tab.id) {
      throw new Error('No active tab found');
    }

    const url = new URL(tab.url);
    const videoId = url.searchParams.get('v') || '';

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.title,
      });

      return {
        url: tab.url,
        title: results?.[0]?.result || tab.title || 'YouTube Video',
        videoId,
      };
    } catch (error) {
      // Fallback to tab title if script execution fails
      return {
        url: tab.url,
        title: tab.title || 'YouTube Video',
        videoId,
      };
    }
  }

  /**
   * Extract YouTube transcript (if available)
   */
  static async getYouTubeTranscript(): Promise<string | null> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      return null;
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Try to find transcript button and extract text
          // This is a simplified version - might need more sophisticated approach
          const transcriptButton = document.querySelector(
            'button[aria-label*="transcript"], button[aria-label*="Transcript"]'
          );

          if (!transcriptButton) {
            return null;
          }

          // This would need to click the button and extract text
          // For now, return null and let NotebookLM handle the URL
          return null;
        },
      });

      return results?.[0]?.result || null;
    } catch (error) {
      console.error('Error extracting transcript:', error);
      return null;
    }
  }

  /**
   * Detect YouTube page type and extract video URLs
   */
  static async detectYouTubePageType(): Promise<{
    type: 'video' | 'playlist' | 'playlist_video' | 'channel' | null;
    videoUrls?: string[];
    title?: string;
  }> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || !tab.id) {
      return { type: null };
    }

    const url = tab.url;
    if (!url.includes('youtube.com')) {
      return { type: null };
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const url = window.location.href;
          const urlObj = new URL(url);
          const hasPlaylistParam = urlObj.searchParams.has('list');

          let type: 'video' | 'playlist' | 'playlist_video' | 'channel' | null = null;
          const videoUrls: string[] = [];

          if (url.includes('/playlist')) {
            // Dedicated playlist page
            type = 'playlist';
            const videos = document.querySelectorAll('ytd-playlist-video-renderer a#video-title');
            videos.forEach((video) => {
              const href = video.getAttribute('href');
              if (href) {
                const videoUrl = new URL(href, 'https://www.youtube.com');
                videoUrl.searchParams.delete('list');
                videoUrl.searchParams.delete('index');
                videoUrls.push(videoUrl.toString());
              }
            });
          } else if (url.includes('/watch') && hasPlaylistParam) {
            // Watching a video from a playlist
            type = 'playlist_video';
            const selectors = [
              'ytd-playlist-panel-renderer ytd-playlist-panel-video-renderer a#wc-endpoint',
              'ytd-playlist-panel-renderer a#video-title',
              '#playlist-items ytd-playlist-panel-video-renderer a',
              'ytd-watch-flexy ytd-playlist-panel-video-renderer a#wc-endpoint',
            ];

            for (const selector of selectors) {
              const videos = document.querySelectorAll(selector);
              if (videos.length > 0) {
                videos.forEach((video) => {
                  const href = video.getAttribute('href');
                  if (href && href.includes('/watch')) {
                    const videoUrl = new URL(href, 'https://www.youtube.com');
                    videoUrl.searchParams.delete('list');
                    videoUrl.searchParams.delete('index');
                    videoUrl.searchParams.delete('pp');
                    videoUrls.push(videoUrl.toString());
                  }
                });
                break;
              }
            }

            // Fallback to mini-playlist
            if (videoUrls.length === 0) {
              const miniPlaylist = document.querySelectorAll('#items ytd-playlist-panel-video-renderer a');
              miniPlaylist.forEach((video) => {
                const href = video.getAttribute('href');
                if (href && href.includes('/watch')) {
                  const videoUrl = new URL(href, 'https://www.youtube.com');
                  videoUrl.searchParams.delete('list');
                  videoUrl.searchParams.delete('index');
                  videoUrls.push(videoUrl.toString());
                }
              });
            }
          } else if (url.includes('/watch')) {
            // Single video
            type = 'video';
            videoUrls.push(url.split('&')[0].split('?')[0] + '?v=' + urlObj.searchParams.get('v'));
          } else if (url.includes('/@') || url.includes('/channel/') || url.includes('/c/')) {
            // Channel page
            type = 'channel';
            const videos = document.querySelectorAll(
              'ytd-rich-grid-media a#video-title-link, ytd-grid-video-renderer a#video-title'
            );
            videos.forEach((video) => {
              const href = video.getAttribute('href');
              if (href && href.includes('/watch')) {
                videoUrls.push(`https://www.youtube.com${href.split('&')[0]}`);
              }
            });
          }

          // Remove duplicates and limit to 50
          const uniqueUrls = [...new Set(videoUrls)].slice(0, 50);

          return {
            type,
            videoUrls: uniqueUrls,
            title: document.title.replace(' - YouTube', ''),
          };
        },
      });

      return results?.[0]?.result || { type: null };
    } catch (error) {
      console.error('Error detecting YouTube page type:', error);
      // Fallback: if it's a YouTube URL, assume it's a video
      if (url.includes('/watch')) {
        return { type: 'video', videoUrls: [url] };
      }
      return { type: null };
    }
  }
}
