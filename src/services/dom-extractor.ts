/**
 * DOM Extractor Service
 * Uses chrome.scripting.executeScript to extract data from the NotebookLM page DOM.
 * This is needed for content that isn't available via RPC (e.g., rendered slide images,
 * chat panel messages, artifact viewer content).
 */

export interface ExtractedChatMessage {
  role: 'user' | 'assistant' | 'date';
  content: string;
}

export interface ExtractedArtifact {
  id: string;
  type: string;
  title: string;
  hasContent: boolean;
}

export interface ExtractedSlideImage {
  index: number;
  dataUrl: string; // base64 data URL of the slide image
  width: number;
  height: number;
}

export class DOMExtractor {
  /**
   * Currently active notebook ID for targeting the correct tab
   */
  private static _notebookId: string | null = null;

  static setNotebookId(id: string) {
    this._notebookId = id;
  }

  /**
   * Find the NotebookLM tab that has the specific notebook open.
   * If notebookId is set, find the tab with that notebook in the URL.
   */
  private static async findNotebookLMTab(): Promise<chrome.tabs.Tab | null> {
    const tabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });
    if (tabs.length === 0) return null;

    // If we have a specific notebook ID, find the tab with that notebook
    if (this._notebookId) {
      const matchingTab = tabs.find((t) =>
        t.url?.includes(`/notebook/${this._notebookId}`)
      );
      if (matchingTab) return matchingTab;
    }

    // Fallback: return the first NotebookLM tab
    return tabs[0];
  }

  /**
   * Ensure the correct notebook is open in a NotebookLM tab.
   * If no matching tab is found, navigates an existing tab to the notebook URL.
   * Returns the tab after the notebook page has loaded.
   *
   * This is critical for chat extraction — the DOM shows chat for the OPEN notebook only.
   */
  static async ensureNotebookOpen(notebookId: string): Promise<chrome.tabs.Tab | null> {
    const notebookUrl = `https://notebooklm.google.com/notebook/${notebookId}`;
    const tabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });

    // Check if any tab already has this notebook open
    const matchingTab = tabs.find((t) => t.url?.includes(`/notebook/${notebookId}`));
    if (matchingTab) {
      console.log(`Notebook ${notebookId} already open in tab ${matchingTab.id}`);
      return matchingTab;
    }

    // No matching tab — navigate the first NotebookLM tab to this notebook
    if (tabs.length > 0 && tabs[0].id) {
      console.log(`Navigating tab ${tabs[0].id} to notebook ${notebookId}...`);
      await chrome.tabs.update(tabs[0].id, { url: notebookUrl });

      // Wait for navigation + page load
      return new Promise<chrome.tabs.Tab | null>((resolve) => {
        const tabId = tabs[0].id!;
        const timeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          // Try to use the tab anyway
          chrome.tabs.get(tabId).then(resolve).catch(() => resolve(null));
        }, 15000);

        const listener = (
          updatedTabId: number,
          changeInfo: chrome.tabs.TabChangeInfo,
          tab: chrome.tabs.Tab
        ) => {
          if (updatedTabId === tabId && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timeout);
            // Extra wait for Angular to bootstrap
            setTimeout(() => resolve(tab), 2000);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    }

    return null;
  }

  /**
   * Extract data-app-data from an artifact by opening it in a background tab.
   * This avoids disrupting the current page by clicking artifacts.
   *
   * Steps:
   * 1. Open artifact URL in a new background (inactive) tab
   * 2. Wait for page load
   * 3. Read data-app-data attribute
   * 4. Close the background tab
   * 5. Return parsed JSON data
   */
  static async extractDataFromBackgroundTab(
    notebookId: string,
    artifactId: string,
    maxWaitMs: number = 25000,
  ): Promise<any | null> {
    const notebookUrl = `https://notebooklm.google.com/notebook/${notebookId}`;
    let newTabId: number | undefined;

    // Helper: parse data-app-data JSON (handles HTML-escaped attributes)
    const parseAppDataScript = () => {
      const el = document.querySelector('[data-app-data]');
      if (!el) return null;
      const raw = el.getAttribute('data-app-data');
      if (!raw || raw.length < 10) return null;
      try {
        return JSON.parse(raw);
      } catch {
        const decoded = raw
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        try {
          return JSON.parse(decoded);
        } catch {
          return null;
        }
      }
    };

    try {
      // Create a new background tab (inactive)
      const newTab = await chrome.tabs.create({
        url: notebookUrl,
        active: false,
        pinned: true,
      });
      newTabId = newTab.id;
      if (!newTabId) throw new Error('Could not create tab');

      console.log(`Opened artifact tab ${newTabId} for ${artifactId}`);

      // Wait for tab to finish loading
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          // Don't reject — continue anyway (the tab may still be usable)
          resolve();
        }, maxWaitMs);

        const listener = (
          updatedTabId: number,
          changeInfo: chrome.tabs.TabChangeInfo,
        ) => {
          if (updatedTabId === newTabId && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timeout);
            setTimeout(resolve, 3000); // wait for Angular + iframe
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });

      // Ensure the requested artifact viewer is actually opened.
      // In some notebooks, /artifact/:id still lands on library UI and iframe
      // is created only after clicking the specific artifact button.
      try {
        const openResults = await chrome.scripting.executeScript({
          target: { tabId: newTabId },
          args: [artifactId],
          func: (targetArtifactId: string) => {
            const hasIframe = !!document.querySelector('iframe[src*="usercontent.goog"]');
            if (hasIframe) {
              return { hasIframe: true, clicked: false };
            }

            const candidates = Array.from(
              document.querySelectorAll(
                'button.artifact-button-content[jslog], artifact-library-item button[jslog], button[jslog][aria-description="Artifact"]'
              )
            ) as HTMLElement[];

            for (const btn of candidates) {
              const jslog = btn.getAttribute('jslog') || '';
              const match = jslog.match(/0:([A-Za-z0-9+/=]+)$/);
              if (!match) continue;
              try {
                const decoded = JSON.parse(atob(match[1]));
                if (Array.isArray(decoded) && Array.isArray(decoded[0])) {
                  const id = decoded[0][1] || decoded[0][0];
                  if (id === targetArtifactId) {
                    btn.click();
                    return { hasIframe: false, clicked: true };
                  }
                }
              } catch {
                // ignore malformed jslog payloads
              }
            }

            return { hasIframe: false, clicked: false };
          },
        });

        const openState = openResults?.[0]?.result as { hasIframe?: boolean; clicked?: boolean } | undefined;
        if (openState?.clicked) {
          console.log(`[Flashcards] Clicked artifact button for ${artifactId} in background tab`);
          await new Promise((r) => setTimeout(r, 2500));
        } else if (!openState?.hasIframe) {
          console.log(`[Flashcards] Artifact iframe not present yet for ${artifactId}`);
        }
      } catch (e) {
        console.log(`[Flashcards] Could not force-open artifact viewer for ${artifactId}:`, e);
      }

      // ── Strategy 1: Search ALL frames (main + iframes) ──
      // The flashcard/quiz data-app-data is inside an iframe at
      // *.scf.usercontent.goog, not on the main page.
      const pollStart = Date.now();
      while (Date.now() - pollStart < 15000) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: newTabId, allFrames: true },
            func: parseAppDataScript,
          });

          // Check ALL frame results (not just results[0])
          const match = results?.find((r) => r.result != null);
          if (match?.result) {
            console.log(`Extracted data-app-data from background tab (frame ${match.frameId ?? '?'}) for ${artifactId}`);
            return match.result;
          }
        } catch (e) {
          // Frame might not be ready yet — keep polling
        }

        await new Promise((r) => setTimeout(r, 1500));
      }

      // ── Strategy 2: Find the iframe src and navigate to it directly ──
      // If allFrames didn't work (e.g. iframe CSP blocks scripts),
      // extract the iframe URL and navigate the tab there.
      try {
        console.log(`[Flashcards] allFrames found nothing, trying iframe navigation for ${artifactId}`);
        const iframeResults = await chrome.scripting.executeScript({
          target: { tabId: newTabId },
          func: () => {
            const iframe = document.querySelector('iframe[src*="usercontent.goog"]') as HTMLIFrameElement;
            return iframe?.src ?? null;
          },
        });

        const iframeSrc = iframeResults?.[0]?.result;
        if (iframeSrc) {
          console.log(`[Flashcards] Found iframe src: ${iframeSrc.substring(0, 80)}...`);

          // Navigate the same tab to the iframe URL directly
          await chrome.tabs.update(newTabId, { url: iframeSrc });

          // Wait for the direct iframe page to load
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 12000);
            const listener = (updatedId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
              if (updatedId === newTabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                clearTimeout(timeout);
                setTimeout(resolve, 2000);
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
          });

          // Now data-app-data should be on the main frame
          const poll2Start = Date.now();
          while (Date.now() - poll2Start < 8000) {
            try {
              const results = await chrome.scripting.executeScript({
                target: { tabId: newTabId },
                func: parseAppDataScript,
              });

              if (results?.[0]?.result) {
                console.log(`Extracted data-app-data via iframe navigation for ${artifactId}`);
                return results[0].result;
              }
            } catch { /* keep polling */ }

            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      } catch (e) {
        console.log(`[Flashcards] iframe navigation strategy failed:`, e);
      }

      // ── Strategy 3: DOM fallback for non-iframe artifacts ──
      // Data tables and reports are often rendered directly in the notebooklm page
      // (no data-app-data attribute). Extract structured content from DOM.
      try {
        const domResults = await chrome.scripting.executeScript({
          target: { tabId: newTabId },
          func: () => {
            // Table artifact
            const tableEl = document.querySelector('table-viewer table');
            if (tableEl) {
              const rows = Array.from(tableEl.querySelectorAll('tr'));
              if (rows.length > 0) {
                const headers = Array.from(rows[0].querySelectorAll('th')).map((h) =>
                  (h as HTMLElement).innerText.trim()
                );
                const dataRows = rows
                  .slice(1)
                  .map((r) =>
                    Array.from(r.querySelectorAll('td')).map((c) => (c as HTMLElement).innerText.trim())
                  )
                  .filter((r) => r.length > 0);
                if (headers.length > 0 || dataRows.length > 0) {
                  return { kind: 'table', headers, rows: dataRows };
                }
              }
            }

            // Report artifact
            const reportEl = document.querySelector('report-viewer labs-tailwind-doc-viewer');
            if (reportEl) {
              const text = (reportEl as HTMLElement).innerText?.trim() || '';
              if (text.length > 0) {
                return { kind: 'report', content: text };
              }
            }

            // Infographic artifact
            const img =
              (document.querySelector('infographic-viewer img[src]') as HTMLImageElement | null) ||
              (document.querySelector('infographic-viewer foreignObject img[src]') as HTMLImageElement | null);
            if (img?.src) {
              return { kind: 'infographic', imageUrl: img.src };
            }

            return null;
          },
        });

        const domData = domResults?.[0]?.result as any;
        if (domData) {
          console.log(`Extracted ${domData.kind} artifact data from DOM for ${artifactId}`);
          return domData;
        }
      } catch (e) {
        console.log(`[Artifacts] DOM fallback extraction failed for ${artifactId}:`, e);
      }

      console.warn(`No data-app-data found for artifact ${artifactId} after all strategies`);
      return null;
    } catch (e) {
      console.error(`Background tab extraction failed for artifact ${artifactId}:`, e);
      return null;
    } finally {
      if (newTabId) {
        try {
          await chrome.tabs.remove(newTabId);
          console.log(`Closed background tab ${newTabId}`);
        } catch { /* tab may already be closed */ }
      }
    }
  }

  /**
   * Extract chat history from the NotebookLM page DOM.
   *
   * Two-phase approach:
   *   Phase 1 — activate the Chat tab (it may not be the active tab)
   *   Phase 2 — extract messages using .from-user-container / .to-user-container
   *
   * DOM structure (from user's actual browser):
   *   div.chat-message-pair
   *     chat-message > div.from-user-container > mat-card > mat-card-content
   *       > div.message-text-content  ← USER text
   *     chat-message > div.to-user-container > mat-card > mat-card-content
   *       > div.message-text-content  ← AI text
   *       mat-card-actions  ← buttons (SKIP)
   */
  static async extractChatHistory(): Promise<ExtractedChatMessage[]> {
    const tab = await this.findNotebookLMTab();
    if (!tab?.id) {
      console.log('No NotebookLM tab found for chat extraction');
      return [];
    }

    try {
      // Phase 1: Activate the Chat tab so Angular renders the chat panel.
      // We click the tab labelled "Chat" (or containing the chat icon).
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Material Design tabs: look for role="tab" elements
          const tabs = document.querySelectorAll('[role="tab"]');
          for (const t of tabs) {
            const text = (t as HTMLElement).innerText?.trim().toLowerCase() || '';
            if (text === 'chat' || text.includes('chat')) {
              (t as HTMLElement).click();
              console.log('DOM: clicked Chat tab');
              return;
            }
          }
          // Fallback: look for mat-tab-label with chat text
          const labels = document.querySelectorAll('.mat-tab-label, .mdc-tab');
          for (const l of labels) {
            const text = (l as HTMLElement).innerText?.trim().toLowerCase() || '';
            if (text === 'chat' || text.includes('chat')) {
              (l as HTMLElement).click();
              console.log('DOM: clicked Chat tab (fallback selector)');
              return;
            }
          }
          console.log('DOM: Chat tab not found, continuing anyway');
        },
      });

      // Wait for Angular to render the chat content after tab switch
      await new Promise((r) => setTimeout(r, 1500));

      // Phase 2: Extract messages
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const messages: { role: 'user' | 'assistant' | 'date'; content: string }[] = [];

          // ── Primary strategy: use from-user-container / to-user-container ──
          // These selectors are reliable and exist on every chat message
          // regardless of parent structure.  Search the whole document.
          const fromUser = document.querySelectorAll('.from-user-container');
          const toUser = document.querySelectorAll('.to-user-container');

          console.log(`DOM chat: ${fromUser.length} user msgs, ${toUser.length} AI msgs`);

          type Item = { role: 'user' | 'assistant'; el: Element; top: number };
          const allItems: Item[] = [];

          fromUser.forEach((el) => {
            allItems.push({ role: 'user', el, top: el.getBoundingClientRect().top });
          });
          toUser.forEach((el) => {
            allItems.push({ role: 'assistant', el, top: el.getBoundingClientRect().top });
          });

          // Sort by vertical position so messages are in chat order
          allItems.sort((a, b) => a.top - b.top);

          for (const item of allItems) {
            const container = item.el as HTMLElement;

            // Get text ONLY from .message-text-content (excludes buttons / actions)
            const textEl = container.querySelector('.message-text-content') as HTMLElement | null;
            const text = textEl
              ? textEl.innerText?.trim()
              : (container.querySelector('mat-card-content') as HTMLElement)?.innerText?.trim();

            if (text && text.length > 0) {
              messages.push({ role: item.role, content: text });
            }
          }

          // ── Date separators ──
          // They live as siblings of chat-message-pair divs inside chat-panel-content
          const chatPanel = document.querySelector('chat-panel');
          if (chatPanel) {
            const contentPanel = chatPanel.querySelector('.chat-panel-content') || chatPanel;
            for (const child of contentPanel.children) {
              const el = child as HTMLElement;
              // Skip if it contains chat messages (turn group)
              if (el.querySelector('chat-message') || el.querySelector('.from-user-container')) continue;
              const text = el.innerText?.trim();
              if (text && text.length > 0 && text.length < 80) {
                // Heuristic: looks like a date
                const low = text.toLowerCase();
                const looksLikeDate = text.length < 50 &&
                  (text.match(/\d/) ||
                   low.includes('today') || low.includes('yesterday') ||
                   low.includes('ago') || low.includes('jan') ||
                   low.includes('feb') || low.includes('mar') ||
                   low.includes('apr') || low.includes('may') ||
                   low.includes('jun') || low.includes('jul') ||
                   low.includes('aug') || low.includes('sep') ||
                   low.includes('oct') || low.includes('nov') ||
                   low.includes('dec') ||
                   low.includes('сегодня') || low.includes('вчера'));
                if (looksLikeDate) {
                  // Insert dates at correct position based on DOM order
                  messages.push({ role: 'date', content: text });
                }
              }
            }
          }

          console.log(`DOM: Extracted ${messages.length} chat items`);
          return messages;
        },
      });

      if (results?.[0]?.result) {
        return results[0].result as ExtractedChatMessage[];
      }
      return [];
    } catch (e) {
      console.error('Error extracting chat from DOM:', e);
      return [];
    }
  }

  /**
   * Extract the list of artifacts from the Studio panel DOM.
   * Uses artifact-library-item elements and mat-icon names for type detection.
   */
  static async extractArtifactsList(): Promise<ExtractedArtifact[]> {
    const tab = await this.findNotebookLMTab();
    if (!tab?.id) return [];

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const artifacts: { id: string; type: string; title: string; hasContent: boolean }[] = [];

          const container = document.querySelector('.artifact-library-container') ||
                           document.querySelector('artifact-library');
          if (!container) return artifacts;

          // Use the exact artifact-library-item elements
          const items = container.querySelectorAll('artifact-library-item');

          for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // Get title from .artifact-title
            const titleEl = item.querySelector('.artifact-title');
            const title = titleEl?.textContent?.trim() || `Artifact ${i + 1}`;

            // Get icon name from mat-icon.artifact-icon
            const iconEl = item.querySelector('mat-icon.artifact-icon');
            const iconName = iconEl?.textContent?.trim() || '';

            // Map icon name to type
            const iconMap: Record<string, string> = {
              'cards_star': 'flashcard',
              'quiz': 'quiz',
              'slideshow': 'slide_deck',
              'view_carousel': 'slide_deck',
              'article': 'report',
              'description': 'report',
              'image': 'infographic',
              'photo': 'infographic',
              'table_chart': 'data_table',
              'hub': 'mindmap',
              'mic': 'audio',
              'headphones': 'audio',
              'videocam': 'video',
              'movie': 'video',
            };

            const type = iconMap[iconName] || 'unknown';

            // Try to get artifact ID from jslog
            let id = `artifact-${i}`;
            const button = item.querySelector('button[jslog]');
            if (button) {
              const jslog = button.getAttribute('jslog') || '';
              const match = jslog.match(/0:([A-Za-z0-9+/=]+)$/);
              if (match) {
                try {
                  const decoded = JSON.parse(atob(match[1]));
                  if (Array.isArray(decoded) && Array.isArray(decoded[0])) {
                    id = decoded[0][1] || id;
                  }
                } catch { /* ignore */ }
              }
            }

            artifacts.push({ id, type, title, hasContent: true });
          }

          return artifacts;
        },
      });

      if (results?.[0]?.result) {
        return results[0].result as ExtractedArtifact[];
      }
      return [];
    } catch (e) {
      console.error('Error extracting artifacts from DOM:', e);
      return [];
    }
  }

  /**
   * Extract slide deck images from the NotebookLM viewer.
   * This captures the rendered slide images from the slide-deck-viewer component.
   */
  static async extractSlideImages(): Promise<ExtractedSlideImage[]> {
    const tab = await this.findNotebookLMTab();
    if (!tab?.id) return [];

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const slides: { index: number; dataUrl: string; width: number; height: number }[] = [];

          // Find slide deck viewer
          const viewerSelectors = [
            'slide-deck-viewer',
            '[class*="slide-deck-viewer"]',
            '.artifact-content slide-deck-viewer',
            'artifact-viewer slide-deck-viewer',
          ];

          let viewer: Element | null = null;
          for (const sel of viewerSelectors) {
            viewer = document.querySelector(sel);
            if (viewer) break;
          }

          if (!viewer) {
            // Try broader search
            const tabContents = document.querySelectorAll('[id*="mat-tab-group"][id*="content"]');
            for (const tc of tabContents) {
              viewer = tc.querySelector('slide-deck-viewer');
              if (viewer) break;
            }
          }

          if (!viewer) return slides;

          // Find all slide images
          const images = viewer.querySelectorAll('img');
          for (let i = 0; i < images.length; i++) {
            const img = images[i];
            if (!img.src || img.width < 50) continue;

            // For images already loaded as data URLs or blob URLs
            if (img.src.startsWith('data:') || img.complete) {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(img, 0, 0);
                  const dataUrl = canvas.toDataURL('image/png');
                  slides.push({
                    index: i,
                    dataUrl,
                    width: canvas.width,
                    height: canvas.height,
                  });
                }
              } catch (e) {
                // CORS issue - store the URL instead
                slides.push({
                  index: i,
                  dataUrl: img.src,
                  width: img.naturalWidth || img.width,
                  height: img.naturalHeight || img.height,
                });
              }
            } else {
              slides.push({
                index: i,
                dataUrl: img.src,
                width: img.naturalWidth || img.width,
                height: img.naturalHeight || img.height,
              });
            }
          }

          return slides;
        },
      });

      if (results?.[0]?.result) {
        return results[0].result as ExtractedSlideImage[];
      }
      return [];
    } catch (e) {
      console.error('Error extracting slide images from DOM:', e);
      return [];
    }
  }

  /**
   * Extract infographic image from the viewer
   */
  static async extractInfographicImage(): Promise<string | null> {
    const tab = await this.findNotebookLMTab();
    if (!tab?.id) return null;

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Find infographic viewer
          const selectors = [
            'infographic-viewer img',
            '.artifact-content img[class*="infographic"]',
            'artifact-viewer img',
          ];

          for (const sel of selectors) {
            const img = document.querySelector(sel) as HTMLImageElement;
            if (img && img.src && img.width > 100) {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(img, 0, 0);
                  return canvas.toDataURL('image/png');
                }
              } catch {
                return img.src;
              }
            }
          }
          return null;
        },
      });

      return results?.[0]?.result || null;
    } catch (e) {
      console.error('Error extracting infographic from DOM:', e);
      return null;
    }
  }

  /**
   * Fetch a single image URL using the extension's cookie store.
   *
   * Primary strategy: Open the image URL in a background tab.
   * The browser natively handles authentication, cookies, and redirects.
   * We then extract the rendered image via canvas.toDataURL().
   *
   * Fallback: Direct fetch from extension context (for truly signed/public URLs).
   */
  static async fetchImageInTabContext(imageUrl: string): Promise<string | null> {
    console.log(`[fetch] URL: ${imageUrl.substring(0, 100)}...`);

    // ── Strategy 1: Background tab (most reliable — browser handles auth) ──
    try {
      const dataUrl = await this.fetchImageViaBackgroundTab(imageUrl);
      if (dataUrl) {
        console.log(`[fetch] Background tab succeeded`);
        return dataUrl;
      }
    } catch (e) {
      console.log(`[fetch] Background tab failed: ${(e as Error).message}`);
    }

    // ── Strategy 2: Direct fetch from extension (for signed/public URLs) ──
    try {
      const resp = await Promise.race([
        fetch(imageUrl, { credentials: 'omit' }),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]);
      if (resp.ok) {
        const blob = await resp.blob();
        if (blob.size > 0) {
          return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('FileReader error'));
            reader.readAsDataURL(blob);
          });
        }
      }
    } catch (e) {
      console.log(`[fetch] Direct fetch failed: ${(e as Error).message}`);
    }

    // ── Strategy 3: Fetch inside NotebookLM tab context with include credentials ──
    try {
      const tab = await this.findNotebookLMTab();
      if (tab?.id) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: async (url: string) => {
            try {
              const response = await fetch(url, { credentials: 'include' });
              if (!response.ok) return null;
              const blob = await response.blob();
              if (!blob.size) return null;
              return await new Promise<string | null>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
            } catch {
              return null;
            }
          },
          args: [imageUrl],
        });

        const dataUrl = results?.[0]?.result ?? null;
        if (dataUrl) {
          console.log('[fetch] Notebook tab fetch succeeded');
          return dataUrl;
        }
      }
    } catch (e) {
      console.log(`[fetch] Notebook tab fetch failed: ${(e as Error).message}`);
    }

    return null;
  }

  /**
   * Fetch image directly inside the currently open NotebookLM tab.
   * More stable for artifact images that fail in temporary background tabs.
   */
  static async fetchImageInNotebookTabContext(imageUrl: string): Promise<string | null> {
    try {
      const tab = await this.findNotebookLMTab();
      if (!tab?.id) return null;

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: async (url: string) => {
          try {
            const response = await fetch(url, { credentials: 'include' });
            if (!response.ok) return null;
            const blob = await response.blob();
            if (!blob.size) return null;
            return await new Promise<string | null>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            });
          } catch {
            return null;
          }
        },
        args: [imageUrl],
      });

      return results?.[0]?.result ?? null;
    } catch (e) {
      console.log(`[fetch] Notebook tab image fetch failed: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Open an image URL in a background tab, let the browser render it
   * (with all native cookies/auth), then extract pixel data via canvas.
   *
   * When Chrome opens a raw image URL it creates a minimal page with a
   * single <img> element.  We find that element, draw it to a canvas,
   * and return the dataURL.
   */
  private static async fetchImageViaBackgroundTab(
    imageUrl: string,
    timeoutMs: number = 15000,
  ): Promise<string | null> {
    let tabId: number | null = null;

    try {
      const tab = await chrome.tabs.create({
        url: imageUrl,
        active: false,
        pinned: true,
      });
      tabId = tab.id ?? null;
      if (!tabId) return null;

      // Some Google image responses never transition tab status to "complete".
      // Poll extraction aggressively and only use timeout as final guard.
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        // Extract image data via canvas — try ISOLATED world first
        let dataUrl = await this.extractImageFromTab(tabId!);

        // If ISOLATED world fails (canvas taint), try MAIN world
        if (!dataUrl) {
          dataUrl = await this.extractImageFromTab(tabId!, 'MAIN');
        }

        if (dataUrl) return dataUrl;
        await new Promise((r) => setTimeout(r, 300));
      }

      throw new Error('Tab load timeout');
    } finally {
      if (tabId) {
        try { await chrome.tabs.remove(tabId); } catch { /* tab may already be closed */ }
      }
    }
  }

  /**
   * Execute script in a tab to extract the <img> element as a data URL via canvas.
   */
  private static async extractImageFromTab(
    tabId: number,
    world: 'ISOLATED' | 'MAIN' = 'ISOLATED',
  ): Promise<string | null> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world,
        func: () => {
          try {
            const img = document.querySelector('img');
            if (!img || !img.complete || !img.naturalWidth) return null;

            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            ctx.drawImage(img, 0, 0);
            return canvas.toDataURL('image/png');
          } catch {
            return null;
          }
        },
      });
      return results?.[0]?.result ?? null;
    } catch (e) {
      const message = (e as Error).message || '';
      // Frequent when temporary tabs auto-close; avoid noisy spam.
      if (message.includes('No tab with id') || message.includes('Frame with ID 0 was removed')) {
        return null;
      }
      console.log(`[fetch] extractImageFromTab (${world}) failed: ${message}`);
      return null;
    }
  }

  /**
   * Fetch multiple image URLs SEQUENTIALLY (one at a time).
   */
  static async fetchImagesInTabContext(imageUrls: string[]): Promise<Array<{ url: string; dataUrl: string }>> {
    const results: Array<{ url: string; dataUrl: string }> = [];

    for (const url of imageUrls) {
      console.log(`Fetching slide image ${results.length + 1}/${imageUrls.length}...`);
      const dataUrl = await this.fetchImageInTabContext(url);
      if (dataUrl) {
        results.push({ url, dataUrl });
      } else {
        console.warn(`Failed to fetch: ${url.substring(0, 80)}...`);
      }
    }

    return results;
  }

  /**
   * Fetch a binary file (PDF etc.) using the same multi-strategy approach.
   * Returns the file as a base64 data URL.
   */
  static async fetchFileInTabContext(fileUrl: string): Promise<string | null> {
    // Helper: convert blob to data URL
    const blobToDataUrl = (blob: Blob): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      });

    const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ]);

    // Strategy 1: Direct fetch
    try {
      const resp = await withTimeout(fetch(fileUrl), 15000);
      if (resp.ok) {
        const blob = await resp.blob();
        if (blob.size > 0) return await blobToDataUrl(blob);
      }
    } catch (e) {
      console.log(`[fetch file] Strategy 1 (direct) failed: ${(e as Error).message}`);
    }

    // Strategy 2: Fetch with cookies
    try {
      const url = new URL(fileUrl);
      const cookies = await chrome.cookies.getAll({ domain: url.hostname });
      if (cookies.length > 0) {
        const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        const resp = await withTimeout(
          fetch(fileUrl, { headers: { Cookie: cookieHeader }, credentials: 'omit' }),
          15000,
        );
        if (resp.ok) {
          const blob = await resp.blob();
          if (blob.size > 0) return await blobToDataUrl(blob);
        }
      }
    } catch (e) {
      console.log(`[fetch file] Strategy 2 (cookies) failed: ${(e as Error).message}`);
    }

    // Strategy 3: Content script
    const tab = await this.findNotebookLMTab();
    if (tab?.id) {
      try {
        const results = await withTimeout(
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (url: string) => {
              try {
                const response = await fetch(url, { credentials: 'include' });
                if (!response.ok) return null;
                const blob = await response.blob();
                return new Promise<string | null>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.onerror = () => resolve(null);
                  reader.readAsDataURL(blob);
                });
              } catch {
                return null;
              }
            },
            args: [fileUrl],
          }),
          20000,
        );
        if (results?.[0]?.result) return results[0].result;
      } catch (e) {
        console.log(`[fetch file] Strategy 3 (content script) failed: ${(e as Error).message}`);
      }
    }

    return null;
  }

  /**
   * Download a file using chrome.downloads API (uses browser cookies natively).
   * This is the most reliable way to download authenticated Google URLs.
   * Returns the download ID, or null on failure.
   */
  static async downloadViaChrome(url: string, filename: string): Promise<number | null> {
    return new Promise((resolve) => {
      chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('chrome.downloads.download failed:', chrome.runtime.lastError);
          resolve(null);
        } else {
          resolve(downloadId ?? null);
        }
      });
    });
  }

  /**
   * Click on an artifact in the library by its artifact ID (from jslog attribute),
   * then wait for it to load. Uses MAIN world for proper Angular event handling.
   * The jslog attribute contains base64-encoded [notebookId, artifactId].
   */
  static async openArtifactById(artifactId: string): Promise<boolean> {
    const tab = await this.findNotebookLMTab();
    if (!tab?.id) return false;

    // Remember current tab count so we can detect new tabs
    const tabsBefore = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });
    const tabCountBefore = tabsBefore.length;

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN', // MAIN world to trigger Angular event handlers properly
        func: (targetArtifactId: string) => {
          // Search in all possible containers for artifact-library-item elements
          const items = document.querySelectorAll('artifact-library-item');
          console.log(`[NLM ext] Found ${items.length} artifact-library-items, looking for ID: ${targetArtifactId}`);

          for (const item of items) {
            // Try all buttons and links with jslog
            const jslogElements = item.querySelectorAll('[jslog]');
            for (const el of jslogElements) {
              const jslog = el.getAttribute('jslog') || '';
              // jslog format: "261224;track:...;0:BASE64"
              const match = jslog.match(/0:([A-Za-z0-9+/=]+)$/);
              if (match) {
                try {
                  const decoded = JSON.parse(atob(match[1]));
                  // decoded = [["notebookId", "artifactId"]]
                  if (Array.isArray(decoded) && Array.isArray(decoded[0])) {
                    const id = decoded[0][1] || decoded[0][0];
                    if (id === targetArtifactId) {
                      console.log(`[NLM ext] Found artifact, clicking...`);
                      (el as HTMLElement).click();
                      return true;
                    }
                  }
                } catch { /* ignore */ }
              }
            }

            // Also try clicking the button inside artifact-library-item
            const button = item.querySelector('button.artifact-button-content, button');
            if (button) {
              const jslog = button.getAttribute('jslog') || '';
              const match = jslog.match(/0:([A-Za-z0-9+/=]+)$/);
              if (match) {
                try {
                  const decoded = JSON.parse(atob(match[1]));
                  if (Array.isArray(decoded) && Array.isArray(decoded[0])) {
                    const id = decoded[0][1] || decoded[0][0];
                    if (id === targetArtifactId) {
                      console.log(`[NLM ext] Found artifact via button, clicking...`);
                      (button as HTMLElement).click();
                      return true;
                    }
                  }
                } catch { /* ignore */ }
              }
            }
          }

          console.log(`[NLM ext] Artifact ${targetArtifactId} not found in DOM`);
          return false;
        },
        args: [artifactId],
      });

      if (results?.[0]?.result) {
        // Wait for the viewer/new tab to load
        // First wait a bit for any new tab to open
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check if a new tab opened (artifact viewers often open in new tabs)
        const tabsAfter = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });
        if (tabsAfter.length > tabCountBefore) {
          // New tab opened — wait extra time for it to load
          console.log('New tab detected for artifact viewer, waiting for load...');
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        return true;
      }
      return false;
    } catch (e) {
      console.error('Error clicking artifact:', e);
      return false;
    }
  }

  /**
   * Extract data-app-data from the artifact viewer.
   * When a quiz/flashcard artifact is clicked, NotebookLM opens it in a NEW TAB.
   * The interactive viewer page has:
   *   <app-root data-app-data="{ &quot;flashcards&quot;: [...] }">
   *
   * We poll ALL Google tabs (not just notebooklm.google.com, since the viewer
   * might be on a subdomain or different path pattern) waiting for the
   * data-app-data attribute to appear.
   */
  static async extractArtifactAppData(maxWaitMs: number = 10000): Promise<any | null> {
    const startTime = Date.now();
    const pollInterval = 1000;

    while (Date.now() - startTime < maxWaitMs) {
      // Check ALL Google tabs — artifact viewer could be on any notebooklm.google.com URL
      const allTabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });

      for (const tab of allTabs) {
        if (!tab.id) continue;

        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              // Strategy 1: Check app-root for data-app-data attribute
              const appRoot = document.querySelector('app-root[data-app-data]');
              if (appRoot) {
                const raw = appRoot.getAttribute('data-app-data');
                if (raw && raw.length > 10) {
                  try {
                    return JSON.parse(raw);
                  } catch {
                    // Try HTML-unescaping
                    const decoded = raw
                      .replace(/&amp;/g, '&')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&quot;/g, '"')
                      .replace(/&#39;/g, "'");
                    try {
                      return JSON.parse(decoded);
                    } catch { /* ignore */ }
                  }
                }
              }

              // Strategy 2: Check for interactive card stack (flashcards)
              const cardStack = document.querySelector('app-interactive-card-stack');
              if (cardStack) {
                const root = cardStack.closest('[data-app-data]') ||
                             document.querySelector('[data-app-data]');
                if (root) {
                  const raw = root.getAttribute('data-app-data');
                  if (raw && raw.length > 10) {
                    try { return JSON.parse(raw); } catch { /* ignore */ }
                  }
                }
              }

              // Strategy 3: Check for quiz container
              const quizContainer = document.querySelector('app-quiz, [class*="quiz-container"]');
              if (quizContainer) {
                const root = quizContainer.closest('[data-app-data]') ||
                             document.querySelector('[data-app-data]');
                if (root) {
                  const raw = root.getAttribute('data-app-data');
                  if (raw && raw.length > 10) {
                    try { return JSON.parse(raw); } catch { /* ignore */ }
                  }
                }
              }

              // Strategy 4: Check ANY element with data-app-data
              const anyAppData = document.querySelector('[data-app-data]');
              if (anyAppData) {
                const raw = anyAppData.getAttribute('data-app-data');
                if (raw && raw.length > 10) {
                  try { return JSON.parse(raw); } catch {
                    const decoded = raw
                      .replace(/&amp;/g, '&')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&quot;/g, '"')
                      .replace(/&#39;/g, "'");
                    try { return JSON.parse(decoded); } catch { /* ignore */ }
                  }
                }
              }

              return null;
            },
          });

          const data = results?.[0]?.result;
          if (data) {
            console.log(`Found data-app-data in tab ${tab.id} (${tab.url?.substring(0, 60)})`);
            return data;
          }
        } catch (e) {
          // Tab might not be accessible, continue to next
        }
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    console.warn('extractArtifactAppData: timed out waiting for data-app-data');
    return null;
  }

  /**
   * Extract all artifacts with their IDs and types from the DOM.
   * Uses jslog attributes to get artifact IDs and icon names to detect types.
   * Searches globally (not just .artifact-library-container).
   */
  static async extractArtifactsWithIds(): Promise<Array<{
    notebookId: string;
    artifactId: string;
    title: string;
    type: string;
    iconName: string;
  }>> {
    const tab = await this.findNotebookLMTab();
    if (!tab?.id) return [];

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const artifacts: Array<{
            notebookId: string;
            artifactId: string;
            title: string;
            type: string;
            iconName: string;
          }> = [];

          // Search globally for artifact-library-item elements
          const items = document.querySelectorAll('artifact-library-item');
          console.log(`[NLM ext] Found ${items.length} artifact-library-items in DOM`);

          if (items.length === 0) return artifacts;

          for (const item of items) {
            // Look for any element with jslog (button, link, etc.)
            const jslogEls = item.querySelectorAll('[jslog]');
            let notebookId = '';
            let artifactId = '';

            for (const el of jslogEls) {
              const jslog = el.getAttribute('jslog') || '';
              const match = jslog.match(/0:([A-Za-z0-9+/=]+)$/);
              if (match) {
                try {
                  const decoded = JSON.parse(atob(match[1]));
                  if (Array.isArray(decoded) && Array.isArray(decoded[0])) {
                    notebookId = decoded[0][0] || '';
                    artifactId = decoded[0][1] || '';
                  }
                } catch { /* ignore */ }
              }
              if (artifactId) break;
            }

            // Get title (try multiple selectors)
            const titleEl = item.querySelector('.artifact-title') ||
                           item.querySelector('[class*="title"]') ||
                           item.querySelector('span');
            const title = titleEl?.textContent?.trim() || '';

            // Get icon name to determine type
            const iconEl = item.querySelector('mat-icon') ||
                          item.querySelector('.material-icons');
            const iconName = iconEl?.textContent?.trim() || '';

            // Map icon name to artifact type
            const iconMap: Record<string, string> = {
              'cards_star': 'flashcards',
              'style': 'flashcards',        // alternate flashcard icon
              'quiz': 'quiz',
              'slideshow': 'slide_deck',
              'view_carousel': 'slide_deck',
              'article': 'report',
              'description': 'report',
              'summarize': 'report',
              'image': 'infographic',
              'photo': 'infographic',
              'table_chart': 'data_table',
              'grid_on': 'data_table',
              'hub': 'mindmap',
              'account_tree': 'mindmap',
              'mic': 'audio',
              'headphones': 'audio',
              'videocam': 'video',
              'movie': 'video',
            };
            const type = iconMap[iconName] || 'unknown';

            console.log(`[NLM ext] Artifact: ${title} | icon=${iconName} | type=${type} | id=${artifactId}`);
            artifacts.push({ notebookId, artifactId, title, type, iconName });
          }

          return artifacts;
        },
      });

      return (results?.[0]?.result as any[]) || [];
    } catch (e) {
      console.error('Error extracting artifacts with IDs:', e);
      return [];
    }
  }

  /**
   * Click on an artifact in the library to open it in the viewer,
   * then wait for it to load before extracting content.
   */
  static async openArtifactByIndex(index: number): Promise<boolean> {
    const tab = await this.findNotebookLMTab();
    if (!tab?.id) return false;

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (idx: number) => {
          const container = document.querySelector('.artifact-library-container') ||
                           document.querySelector('artifact-library');
          if (!container) return false;

          const items = container.querySelectorAll(
            'artifact-library-item button.artifact-button-content'
          );
          if (idx >= items.length) return false;

          (items[idx] as HTMLElement).click();
          return true;
        },
        args: [index],
      });

      if (results?.[0]?.result) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return true;
      }
      return false;
    } catch (e) {
      console.error('Error clicking artifact:', e);
      return false;
    }
  }
}
