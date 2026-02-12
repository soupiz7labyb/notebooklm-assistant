import { NOTEBOOKLM_BASE_URL } from '@/lib/constants';
import type { Notebook } from '@/types';
import type {
  NoteContent,
  ChatMessage,
  Flashcard,
  DataTable,
  SlideContent,
  MindmapContent,
  InfographicContent,
} from '@/types/export';

/**
 * Service for interacting with NotebookLM API
 * Uses RPC calls similar to add_to_NotebookLM-main project
 */
export class NotebookLMService {
  private static readonly DEBUG = false;
  private static tokens: { bl: string; at: string; authuser: number } | null = null;
  private static isRefreshingTokens = false;

  /**
   * Fetch with timeout
   */
  private static async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeout = 30000
  ): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(id);
    }
  }

  /**
   * Get authentication tokens from NotebookLM page HTML
   * Extracts cfb2h (bl) and SNlM0e (at) tokens
   * Exact same as original project
   */
  private static async getTokens(authuser = 0): Promise<{ bl: string; at: string; authuser: number }> {
    // Check if we're already refreshing tokens to avoid duplicate requests
    if (this.isRefreshingTokens) {
      // Wait for tokens to be refreshed by another call
      await new Promise(resolve => setTimeout(resolve, 100));
      if (this.tokens) return this.tokens;
    }

    this.isRefreshingTokens = true;
    try {
      const url = authuser > 0
        ? `${NOTEBOOKLM_BASE_URL}/?authuser=${authuser}&pageId=none`
        : NOTEBOOKLM_BASE_URL;

      const response = await this.fetchWithTimeout(url, {
        credentials: 'include',
        redirect: 'manual' as RequestRedirect,
      });

      if (!response.ok && response.type !== 'opaqueredirect') {
        throw new Error('Failed to fetch NotebookLM page');
      }

      const html = await response.text();

      // Extract tokens from HTML - same regex as original
      const bl = this.extractToken('cfb2h', html);
      const at = this.extractToken('SNlM0e', html);

      if (!bl || !at) {
        throw new Error('Not authorized. Please login to NotebookLM first.');
      }

      this.tokens = { bl, at, authuser };
      return this.tokens;
    } catch (error) {
      console.error('getTokens error:', error);
      throw new Error('Please login to NotebookLM first');
    } finally {
      this.isRefreshingTokens = false;
    }
  }

  /**
   * Extract token from HTML using regex
   */
  private static extractToken(key: string, html: string): string | null {
    const regex = new RegExp(`"${key}":"([^"]+)"`);
    const match = regex.exec(html);
    return match ? match[1] : null;
  }

  /**
   * Execute RPC call to NotebookLM
   * Exact same format as original project - simple, no retry logic
   */
  private static async rpc(rpcId: string, params: any[], sourcePath = '/'): Promise<string> {
    if (!this.tokens) {
      await this.getTokens();
    }

    const url = new URL(`${NOTEBOOKLM_BASE_URL}/_/LabsTailwindUi/data/batchexecute`);
    const reqId = Math.floor(Math.random() * 900000 + 100000).toString();

    url.searchParams.set('rpcids', rpcId);
    url.searchParams.set('source-path', sourcePath);
    url.searchParams.set('bl', this.tokens!.bl);
    url.searchParams.set('_reqid', reqId);
    url.searchParams.set('rt', 'c');

    if (this.tokens!.authuser > 0) {
      url.searchParams.set('authuser', this.tokens!.authuser.toString());
    }

    // Format exactly as original project
    const body = new URLSearchParams({
      'f.req': JSON.stringify([[[rpcId, JSON.stringify(params), null, 'generic']]]),
      'at': this.tokens!.at,
    });

    const response = await this.fetchWithTimeout(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      credentials: 'include',
      body: body.toString(),
    }, 30000); // 30 second timeout (same as original)

    if (!response.ok) {
      throw new Error(`RPC call failed: ${response.status}`);
    }

    return await response.text();
  }

  /**
   * Get list of notebooks/projects
   * Uses RPC call 'wXbhsf' to get notebooks list
   */
  static async getNotebooks(): Promise<Notebook[]> {
    try {
      const response = await this.rpc('wXbhsf', [null, 1, null, [2]]);
      return this.parseNotebookList(response);
    } catch (error) {
      console.error('Error fetching notebooks:', error);
      throw error;
    }
  }

  /**
   * Parse notebook list from RPC response
   */
  private static parseNotebookList(responseText: string): Notebook[] {
    try {
      // Response format: )]}'\n\nXX[[["wrb.fr","wXbhsf","[...]",...
      const lines = responseText.split('\n');
      const dataLine = lines.find((line) => line.includes('wrb.fr'));
      if (!dataLine) return [];

      // Parse the nested JSON
      const parsed = JSON.parse(dataLine);
      const innerData = JSON.parse(parsed[0][2]);

      if (!innerData || !innerData[0]) return [];

      return innerData[0]
        .filter((item: any) => item && item.length >= 3)
        .filter((item: any) => {
          // Filter out shared notebooks (type 3)
          const metadata = item[5];
          return !(Array.isArray(metadata) && metadata.length > 0 && metadata[0] === 3);
        })
        .map((item: any) => ({
          id: item[2],
          name: item[0]?.trim() || 'Untitled notebook',
          createdAt: undefined,
          updatedAt: undefined,
        }));
    } catch (error) {
      console.error('parseNotebookList error:', error);
      return [];
    }
  }

  /**
   * Create a new notebook
   * Uses RPC call 'CCqFvf' to create notebook
   */
  static async createNotebook(name: string): Promise<Notebook> {
    try {
      const response = await this.rpc('CCqFvf', [name]);

      // Extract notebook ID from response (UUID format)
      const uuidMatch = response.match(
        /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
      );
      if (!uuidMatch) {
        throw new Error('Failed to create notebook');
      }

      return {
        id: uuidMatch[0],
        name,
        createdAt: undefined,
        updatedAt: undefined,
      };
    } catch (error) {
      console.error('Error creating notebook:', error);
      throw error;
    }
  }

  /**
   * Add source to notebook
   * Uses RPC call 'izAoDd' to add sources
   */
  static async addSource(
    notebookId: string,
    content: {
      type: 'text' | 'url' | 'file';
      title: string;
      content?: string;
      url?: string;
      fileData?: string; // Base64 encoded file
      fileName?: string;
      mimeType?: string;
    }
  ): Promise<void> {
    try {
      let sources: any[];

      if (content.type === 'text') {
        // Text source format from actual NotebookLM request:
        // [null, [title, text], null, 2, null, null, null, null, null, null, 1]
        const textContent = content.content || '';
        const textTitle = content.title || 'Untitled';
        
        if (!textContent.trim()) {
          throw new Error('Text content cannot be empty');
        }
        
        // Correct format: [null, [title, text], null, 2, null, null, null, null, null, null, 1]
        // Index 1: [title, text] - array with title first, then text
        // Index 3: 2 - source type (2 = text)
        // Index 10: 1 - some flag
        sources = [[null, [textTitle, textContent], null, 2, null, null, null, null, null, null, 1]];
        console.log('Text source prepared (correct format):', { 
          textLength: textContent.length, 
          title: textTitle,
          preview: textContent.substring(0, 100),
          payloadFormat: JSON.stringify(sources).substring(0, 300)
        });
      } else if (content.type === 'url') {
        // URL source format
        if (content.url?.includes('youtube.com') || content.url?.includes('youtu.be')) {
          // YouTube URLs need special format
          sources = [[null, null, null, null, null, null, null, [content.url]]];
        } else {
          // Regular URLs
          sources = [[null, null, [content.url]]];
        }
      } else if (content.type === 'file') {
        // Binary file sources are handled by addFileSource (RPC o4cbdc)
        // This branch should not normally be used directly.
        await this.addFileSource(notebookId, {
          fileName: content.fileName || content.title,
        });
        return;
      } else {
        throw new Error(`Unsupported content type: ${content.type}`);
      }

      console.log('Adding source with payload:', JSON.stringify(sources).substring(0, 200));
      
      // Try the RPC call - same as original project
      const response = await this.rpc('izAoDd', [sources, notebookId], `/notebook/${notebookId}`);
      console.log('RPC response for addSource:', response.substring(0, 500)); // Log first 500 chars
      
      // Check response for errors - error code 4 might indicate processing or error
      if (response.includes('["e",4')) {
        const errorMatch = response.match(/\["e",4,null,null,(\d+)\]/);
        if (errorMatch) {
          const errorCode = errorMatch[1];
          console.log('RPC returned error code:', errorCode);
          // Error codes 139-141, 412, 466, 496, 497, 536, 537, 552, 553 are normal for async processing
          // 139-141 appear for text sources being processed
          // 412 appears for URL sources that are being processed asynchronously
          // 466 appears for URL sources (PDFs, web pages) that are being processed
          // 496, 497, 536, 537, 552, 553 appear but resource is still added successfully (especially for YouTube)
          const normalErrorCodes = ['139', '140', '141', '412', '466', '496', '497', '536', '537', '552', '553'];
          if (!normalErrorCodes.includes(errorCode)) {
            console.warn('Unexpected error code in RPC response:', errorCode);
            // If it's not a normal error code, throw an error
            throw new Error(`RPC returned error code: ${errorCode}`);
          }
          // For normal error codes, don't throw - resource is added successfully
          // Just check for UUID to confirm
          const uuidMatch = response.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/i);
          if (uuidMatch) {
            console.log('✓ Source successfully added with ID:', uuidMatch[0]);
          }
          // Don't throw for normal error codes - resource was added
          return;
        }
      }
      
      // In original project, addTextSource just returns the response without waiting
      // The waiting is done by the caller (waitForSources)
      // So we don't wait here - let the caller handle it
    } catch (error) {
      console.error('Error adding source:', error);
      throw error;
    }
  }

  /**
   * Add binary file as source (images, etc.) using RPC `o4cbdc`
   *
   * This is based on observed f.req payload from NotebookLM:
   * [[["o4cbdc","[[[\"Screenshot 2024-02-15 115837.png\",13]],\"<notebookId>\",[2],[1,null,null,null,null,null,null,null,null,null,[1]]]",null,"generic"]]]
   */
  static async addFileSource(
    notebookId: string,
    file: { fileName: string } | File
  ): Promise<void> {
    const fileName = file instanceof File ? file.name : file.fileName;

    // 13 — тип источника для файлов (по наблюдаемому запросу NotebookLM)
    const sourceTypeCode = 13;

    // Структура параметров соответствует строке внутри f.req из твоего примера:
    // [[[fileName, 13]], notebookId, [2], [1,null,null,null,null,null,null,null,null,null,[1]]]
    const params = [
      [[fileName, sourceTypeCode]],
      notebookId,
      [2],
      [1, null, null, null, null, null, null, null, null, null, [1]],
    ];

    // Вызываем RPC o4cbdc с этой структурой.
    // Внутри rpc() params будет сериализован в JSON и обёрнут в f.req.
    await this.rpc('o4cbdc', params, `/notebook/${notebookId}`);
  }

  /**
   * Add multiple sources to notebook (batch)
   */
  static async addSources(notebookId: string, urls: string[]): Promise<void> {
    try {
      const sources = urls.map((url) => {
        // YouTube URLs need special format
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
          return [null, null, null, null, null, null, null, [url]];
        }
        // Regular URLs
        return [null, null, [url]];
      });

      await this.rpc('izAoDd', [sources, notebookId], `/notebook/${notebookId}`);
    } catch (error) {
      console.error('Error adding sources:', error);
      throw error;
    }
  }

  /**
   * Add text content as source
   * Correct format from actual NotebookLM request:
   * [null, [title, text], null, 2, null, null, null, null, null, null, 1]
   */
  static async addTextSource(notebookId: string, text: string, title = 'Imported content'): Promise<void> {
    try {
      // Correct format from actual NotebookLM request:
      // [null, [title, text], null, 2, null, null, null, null, null, null, 1]
      // Index 1: [title, text] - array with title first, then text
      // Index 3: 2 - source type (2 = text)
      // Index 10: 1 - some flag
      const source = [null, [title, text], null, 2, null, null, null, null, null, null, 1];
      const sources = [source];
      
      console.log('addTextSource called (correct format from NotebookLM):', {
        notebookId,
        textLength: text.length,
        title,
        payloadFormat: '[null, [title, text], null, 2, null, null, null, null, null, null, 1]',
        payload: JSON.stringify(sources).substring(0, 300),
      });
      
      const response = await this.rpc('izAoDd', [sources, notebookId], `/notebook/${notebookId}`);
      
      console.log('addTextSource RPC response:', response.substring(0, 500));
      
      // Check for error codes
      if (response.includes('["e",4')) {
        const errorMatch = response.match(/\["e",4,null,null,(\d+)\]/);
        if (errorMatch) {
          const errorCode = errorMatch[1];
          console.log('addTextSource error code:', errorCode);
          // Error codes 139-141, 412, 466, 536, 537, 552, 553 are normal for async processing
          // 536, 537, 552, 553 appear but resource is still added successfully
          const normalErrorCodes = ['139', '140', '141', '412', '466', '536', '537', '552', '553'];
          if (!normalErrorCodes.includes(errorCode)) {
            console.warn('Unexpected error code in addTextSource:', errorCode);
          } else {
            // Don't log normal error codes - they're expected and resource is added
            // console.log('Error code', errorCode, 'is normal for async processing');
          }
        }
      }
      
      // Check if source was successfully added by looking for UUID in response
      const uuidMatch = response.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/i);
      if (uuidMatch) {
        console.log('✓ Text source successfully added with ID:', uuidMatch[0]);
      } else {
        console.log('No UUID found in response - source may be processing asynchronously');
      }
      
      return;
    } catch (error) {
      console.error('Error adding text source:', error);
      throw error;
    }
  }

  /**
   * Get notebook details with sources list
   * Same as parseNotebookDetails in original project
   */
  static async getNotebook(notebookId: string): Promise<{ id: string; title: string; sources: Array<{ id: string; title: string; type: string; status: number }> }> {
    try {
      // Updated parameters from actual NotebookLM request: [notebookId, null, [2], null, 1]
      // Last parameter is 1 instead of 0
      const response = await this.rpc('rLM1Ne', [notebookId, null, [2], null, 1], `/notebook/${notebookId}`);
      return this.parseNotebookDetails(response);
    } catch (error) {
      console.error('Error getting notebook:', error);
      throw error;
    }
  }

  /**
   * NotebookLM API source type codes
   * Verified against actual user data + notebooklm-py SDK
   *
   * API code → Type:
   *   1 → Google Drive / Google Docs
   *   2 → Text (pasted text)
   *   3 → PDF / File
   *   4 → Text (pasted text variant)
   *   5 → URL (web page)
   *   6 → Google Slides
   *   7 → PDF
   *   8 → Text Note
   *   9 → YouTube Video
   *  10 → Video File
   *  13 → Image
   *  14 → PDF from Drive
   *  15 → Mind Map Note
   */
  private static readonly API_TYPE_MAP: Record<number, string> = {
    1: 'gdrive',
    2: 'text',
    3: 'pdf',
    4: 'text',
    5: 'url',
    6: 'slides',
    7: 'pdf',
    8: 'note',
    9: 'youtube',
    10: 'video',
    13: 'image',
    14: 'pdf',
    15: 'mindmap',
  };

  /**
   * Check if a string is a UUID
   */
  private static isUUID(str: string): boolean {
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(str);
  }

  /**
   * Check if a string is a URL
   */
  private static isURL(str: string): boolean {
    return str.startsWith('http://') || str.startsWith('https://');
  }

  /**
   * Recursively search for a URL in a nested structure
   */
  private static findURLInStructure(data: any, depth = 0): string | null {
    if (depth > 5) return null;
    if (typeof data === 'string' && this.isURL(data)) return data;
    if (Array.isArray(data)) {
      for (const item of data) {
        const found = this.findURLInStructure(item, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Parse notebook details from RPC response
   * Uses correct API type codes from notebooklm-kit SDK
   */
  private static parseNotebookDetails(responseText: string): { id: string; title: string; sources: Array<{ id: string; title: string; type: string; typeCode: number; url: string | null; status: number }> } {
    try {
      const lines = responseText.split('\n');
      const dataLine = lines.find((line) => line.includes('wrb.fr'));
      if (!dataLine) {
        console.log('parseNotebookDetails: No data line found');
        return { id: '', title: '', sources: [] };
      }

      const parsed = JSON.parse(dataLine);
      const innerData = JSON.parse(parsed[0][2]);

      if (!innerData || !innerData[0]) {
        console.log('parseNotebookDetails: No inner data or notebook data');
        return { id: '', title: '', sources: [] };
      }

      const notebookData = innerData[0];

      // Structure: [title, [sources...], notebookId, emoji?, ...]
      const notebookTitle = notebookData[0] || '';
      const notebookId = notebookData[2] || '';
      const sourcesArray = Array.isArray(notebookData[1]) ? notebookData[1] : [];

      console.log('parseNotebookDetails:', {
        title: notebookTitle,
        id: notebookId,
        sourcesCount: sourcesArray.length,
      });

      // Log first source structure only in debug mode
      if (this.DEBUG && sourcesArray.length > 0) {
        console.log('First source raw structure:', JSON.stringify(sourcesArray[0]).substring(0, 500));
      }

      const sources = sourcesArray
        .filter((source: any) => source && Array.isArray(source) && source.length > 0)
        .map((source: any) => {
          let sourceId = '';
          let sourceTitle = 'Untitled';
          let apiTypeCode = 0;
          let sourceUrl: string | null = null;
          let sourceStatus = 2; // Default READY

          // ── Extract source ID ────────────────────────────────
          // Python SDK: src[0][0] if src[0] is a list, otherwise src[0]
          if (Array.isArray(source[0]) && source[0].length > 0 && typeof source[0][0] === 'string') {
            sourceId = source[0][0];
          } else if (typeof source[0] === 'string' && this.isUUID(source[0])) {
            sourceId = source[0];
          }

          // ── Extract title ────────────────────────────────────
          // Python SDK: title at src[1]
          if (typeof source[1] === 'string' && source[1].length > 0) {
            sourceTitle = source[1];
          }

          // ── Extract metadata from src[2] ────────────────────
          if (Array.isArray(source[2])) {
            const meta = source[2];

            // Type code at src[2][4] (Python SDK: type_code = src[2][4])
            if (meta.length > 4 && typeof meta[4] === 'number' && Number.isInteger(meta[4])) {
              apiTypeCode = meta[4];
            }

            // URL at src[2][7][0] (Python SDK: url = src[2][7][0])
            if (meta.length > 7 && Array.isArray(meta[7]) && meta[7].length > 0 && typeof meta[7][0] === 'string') {
              sourceUrl = meta[7][0];
            }
          }

          // ── Extract status from src[3][1] ────────────────────
          // Python SDK: status_code = src[3][1]
          if (Array.isArray(source[3]) && source[3].length > 1 && typeof source[3][1] === 'number') {
            sourceStatus = source[3][1];
          }

          // ── Fallback: broader search for type code ────────────
          if (apiTypeCode === 0 || !(apiTypeCode in this.API_TYPE_MAP)) {
            // Search known positions
            for (let i = 2; i < Math.min(source.length, 5); i++) {
              if (Array.isArray(source[i])) {
                for (const item of source[i]) {
                  if (typeof item === 'number' && Number.isInteger(item) && item in this.API_TYPE_MAP) {
                    apiTypeCode = item;
                    break;
                  }
                }
                if (apiTypeCode !== 0) break;
              }
            }
          }

          // ── Fallback: search for URL if not found ─────────────
          if (!sourceUrl) {
            sourceUrl = this.findURLInStructure(source);
          }

          // ── Infer type from URL if API code not found ────────
          if (apiTypeCode === 0 && sourceUrl) {
            if (sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be')) {
              apiTypeCode = 9; // YouTube
            } else if (sourceUrl.match(/\.pdf(\?|$)/i)) {
              apiTypeCode = 3; // PDF
            } else if (sourceUrl.includes('docs.google.com') || sourceUrl.includes('drive.google.com')) {
              apiTypeCode = 1; // Google Drive
            } else {
              apiTypeCode = 5; // URL/web page
            }
          }

          // If no URL and no type, default to Text (2)
          if (apiTypeCode === 0) {
            apiTypeCode = 2; // Text
          }

          // ── Fallback title ──────────────────────────────────
          if (sourceTitle === 'Untitled') {
            // Try to find title string elsewhere in the source structure
            for (let i = source.length - 1; i >= 0; i--) {
              const item = source[i];
              if (
                typeof item === 'string' &&
                item.length > 1 &&
                !this.isUUID(item) &&
                !this.isURL(item) &&
                !/^\d+$/.test(item) &&
                item !== sourceId
              ) {
                sourceTitle = item;
                break;
              }
            }
          }

          // Fallback title from URL
          if (sourceTitle === 'Untitled' && sourceUrl) {
            try {
              const urlObj = new URL(sourceUrl);
              const pathParts = urlObj.pathname.split('/').filter(Boolean);
              if (pathParts.length > 0) {
                sourceTitle = decodeURIComponent(pathParts[pathParts.length - 1]).replace(/[_-]/g, ' ');
              } else {
                sourceTitle = urlObj.hostname;
              }
            } catch {
              sourceTitle = sourceUrl.substring(0, 80);
            }
          }

          // Map API type code to human-readable type name
          const typeName = this.API_TYPE_MAP[apiTypeCode] || 'unknown';

          return {
            id: sourceId || '',
            title: sourceTitle,
            type: typeName,
            typeCode: apiTypeCode,
            url: sourceUrl,
            status: sourceStatus,
          };
        });

      return {
        id: notebookId,
        title: notebookTitle,
        sources,
      };
    } catch (error) {
      console.error('parseNotebookDetails error:', error);
      console.error('Response text (first 1000 chars):', responseText.substring(0, 1000));
      return { id: '', title: '', sources: [] };
    }
  }

  /**
   * Check notebook status (sources loading)
   */
  static async getNotebookStatus(notebookId: string): Promise<boolean> {
    try {
      // Use same parameters as original project: [notebookId, null, [2], null, 0]
      const response = await this.rpc('rLM1Ne', [notebookId, null, [2], null, 0], `/notebook/${notebookId}`);
      // Check if notebook ID appears in response (means sources are loaded)
      // If response includes `null,\\"${notebookId}`, sources are still processing
      // This is the same logic as in the original project
      const isReady = !response.includes(`null,\\"${notebookId}`);
      return isReady;
    } catch (error) {
      console.error('Error checking notebook status:', error);
      return false;
    }
  }

  /**
   * Wait for sources to be added
   * Same logic as in the original project
   */
  static async waitForSources(notebookId: string, maxAttempts = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      const ready = await this.getNotebookStatus(notebookId);
      if (ready) return true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
  }

  /**
   * Delete a single source from notebook
   * RPC ID: tGMBJ
   * Payload format: [[[sourceId]]] (triple-nested)
   */
  static async deleteSource(notebookId: string, sourceId: string): Promise<void> {
    try {
      // Payload structure: [[[source_id]]] (triple-nested)
      const response = await this.rpc('tGMBJ', [[[sourceId]]], `/notebook/${notebookId}`);
      console.log('deleteSource response:', response.substring(0, 200));
    } catch (error) {
      console.error('Error deleting source:', error);
      throw error;
    }
  }

  /**
   * Delete multiple sources from notebook (batch operation)
   * API supports max ~20 sources per request, so we chunk into batches
   * RPC ID: tGMBJ
   */
  static async deleteSources(notebookId: string, sourceIds: string[]): Promise<{ success: boolean; deletedCount: number }> {
    if (sourceIds.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    const BATCH_SIZE = 20;
    let deletedCount = 0;

    try {
      // Split into chunks of BATCH_SIZE
      for (let i = 0; i < sourceIds.length; i += BATCH_SIZE) {
        const batch = sourceIds.slice(i, i + BATCH_SIZE);

        // Batch delete: payload format is [[[id1], [id2], [id3]...]]
        const batchPayload = [batch.map(id => [id])];
        await this.rpc('tGMBJ', batchPayload, `/notebook/${notebookId}`);

        deletedCount += batch.length;
      }

      return { success: true, deletedCount };
    } catch (error) {
      console.error('Error deleting sources:', error);
      throw error;
    }
  }

  /**
   * Rename notebook
   * RPC ID: s0tc2d
   * Payload format: [notebookId, [[null, null, null, [null, newName]]]]
   */
  static async renameNotebook(notebookId: string, newName: string): Promise<void> {
    try {
      // Format: [notebookId, [[null, null, null, [null, newName]]]]
      const payload = [notebookId, [[null, null, null, [null, newName]]]];
      const response = await this.rpc('s0tc2d', payload, `/notebook/${notebookId}`);
      console.log('renameNotebook response:', response.substring(0, 200));
    } catch (error) {
      console.error('Error renaming notebook:', error);
      throw error;
    }
  }

  /**
   * Get notebook URL
   */
  static getNotebookUrl(notebookId: string, authuser = 0): string {
    const base = `${NOTEBOOKLM_BASE_URL}/notebook/${notebookId}`;
    return authuser > 0 ? `${base}?authuser=${authuser}` : base;
  }

  /**
   * Artifact type codes from the API (ArtifactTypeCode enum in notebooklm-py)
   */
  private static readonly ARTIFACT_TYPE_MAP: Record<number, string> = {
    1: 'audio',
    2: 'report',
    3: 'video',
    4: 'quiz_flashcard', // variant=1 → flashcards, variant=2 → quiz
    5: 'mindmap',
    7: 'infographic',
    8: 'slide_deck',
    9: 'data_table',
  };

  /**
   * Get extended notebook content (notes, chat, flashcards, etc.)
   * RPCs used (from notebooklm-py):
   * - cFji9  → GET_NOTES_AND_MIND_MAPS: notes + mindmaps
   * - gArtLc → LIST_ARTIFACTS: all artifacts (slides, quiz, flashcards, etc.)
   * - hPTbtc → GET_CONVERSATION_HISTORY: chat messages
   */
  static async getNotebookExtendedContent(notebookId: string): Promise<{
    notes: NoteContent[];
    chatHistory: ChatMessage[];
    flashcards: Flashcard[];
    tables: DataTable[];
    slides: SlideContent[];
    mindmaps: MindmapContent[];
    infographics: InfographicContent[];
    artifacts: Array<{ id: string; type: string; typeCode: number; title: string; status: number }>;
  }> {
    const result = {
      notes: [] as NoteContent[],
      chatHistory: [] as ChatMessage[],
      flashcards: [] as Flashcard[],
      tables: [] as DataTable[],
      slides: [] as SlideContent[],
      mindmaps: [] as MindmapContent[],
      infographics: [] as InfographicContent[],
      artifacts: [] as Array<{ id: string; type: string; typeCode: number; title: string; status: number }>,
    };

    // ── 1. Get notes and mind maps via RPC cFji9 ─────────────────
    // Params: [notebookId]
    // Response: array of [noteId, [noteId, content, [metadata], null, title]] or [id, null, 2] for deleted
    try {
      const notesResponse = await this.rpc('cFji9', [notebookId], `/notebook/${notebookId}`);
      const lines = notesResponse.split('\n');
      const dataLine = lines.find((line) => line.includes('wrb.fr'));
      if (dataLine) {
        const parsed = JSON.parse(dataLine);
        const innerData = JSON.parse(parsed[0][2]);
        console.log('Notes/MindMaps raw:', JSON.stringify(innerData).substring(0, 300));

        if (Array.isArray(innerData)) {
          const itemsArray = Array.isArray(innerData[0]) ? innerData : [innerData];
          for (const item of itemsArray) {
            if (!Array.isArray(item) || item.length < 2) continue;

            // Deleted items: [id, null, 2]
            if (item[1] === null && item[2] === 2) continue;

            const itemData = item[1];
            if (!Array.isArray(itemData) || itemData.length < 2) continue;

            const itemId = typeof item[0] === 'string' ? item[0] : '';
            const content = typeof itemData[1] === 'string' ? itemData[1] : '';
            const title = itemData.length > 4 && typeof itemData[4] === 'string' ? itemData[4] : '';

            if (!content) continue;

            // Mind maps have JSON content with "name" and "children" keys
            if (content.startsWith('{') && content.includes('"children"')) {
              try {
                const mmData = JSON.parse(content);
                result.mindmaps.push({
                  id: itemId,
                  title: title || mmData.name || 'Mind Map',
                  rootNode: this.parseMindmapNode(mmData),
                });
              } catch {
                // Not valid mind map JSON, treat as note
                result.notes.push({ id: itemId, title: title || 'Note', content });
              }
            } else {
              result.notes.push({ id: itemId, title: title || 'Note', content });
            }
          }
        }
      }
      console.log(`Loaded ${result.notes.length} notes, ${result.mindmaps.length} mindmaps`);
    } catch (e) {
      console.log('Could not load notes:', e);
    }

    // ── 2. Get chat history via RPC hPTbtc ───────────────────────
    // Params: [[], null, notebookId, limit]
    try {
      const chatResponse = await this.rpc(
        'hPTbtc',
        [[], null, notebookId, 50],
        `/notebook/${notebookId}`
      );
      const lines = chatResponse.split('\n');
      const dataLine = lines.find((line) => line.includes('wrb.fr'));
      if (dataLine) {
        const parsed = JSON.parse(dataLine);
        const innerData = JSON.parse(parsed[0][2]);
        console.log('Chat raw:', JSON.stringify(innerData).substring(0, 300));

        // Chat response is a nested array of conversations
        // Each conversation contains messages
        if (Array.isArray(innerData)) {
          this.parseChatHistory(innerData, result.chatHistory);
        }
      }
      console.log(`Loaded ${result.chatHistory.length} chat messages`);
    } catch (e) {
      console.log('Could not load chat history:', e);
    }

    // ── 3. Get artifacts via RPC gArtLc ──────────────────────────
    // Params: [[2], notebookId, 'NOT artifact.status = "ARTIFACT_STATUS_SUGGESTED"']
    try {
      const artifactsResponse = await this.rpc(
        'gArtLc',
        [[2], notebookId, 'NOT artifact.status = "ARTIFACT_STATUS_SUGGESTED"'],
        `/notebook/${notebookId}`
      );
      const lines = artifactsResponse.split('\n');
      const dataLine = lines.find((line) => line.includes('wrb.fr'));
      if (dataLine) {
        const parsed = JSON.parse(dataLine);
        const innerData = JSON.parse(parsed[0][2]);
        console.log('Artifacts raw:', JSON.stringify(innerData).substring(0, 500));

        if (Array.isArray(innerData)) {
          this.parseArtifacts(innerData, result);
        }
      }
      console.log(`Loaded artifacts: ${result.artifacts.length} total, ${result.slides.length} slides, ${result.flashcards.length} flashcards, ${result.tables.length} tables`);
    } catch (e) {
      console.log('Could not load artifacts:', e);
    }

    // ── 4. Fetch content for quiz/flashcards/data_tables/reports via v9rmvd ──
    // Collect artifact IDs that need content fetching
    const artifactsNeedingContent = result.artifacts.filter(
      (a) => (a.typeCode === 2 || a.typeCode === 4 || a.typeCode === 9) && (a.status === 3 || a.status === 0)
    );

    for (const art of artifactsNeedingContent) {
      try {
        const htmlContent = await this.getArtifactInteractiveHtml(notebookId, art.id);
        if (!htmlContent) continue;

        switch (art.typeCode) {
          case 2: { // report → add to notes
            // Extract text content from HTML
            const textContent = this.extractTextFromHtml(htmlContent);
            if (textContent) {
              result.notes.push({
                id: art.id,
                title: art.title || 'Report',
                content: textContent,
              });
            }
            break;
          }
          case 4: { // quiz or flashcard
            const parsed = this.parseQuizFlashcardHtml(htmlContent, art);
            if (parsed.flashcards.length > 0) {
              result.flashcards.push(...parsed.flashcards);
            }
            break;
          }
          case 9: { // data_table
            const tableData = this.parseDataTableHtml(htmlContent, art);
            if (tableData) {
              result.tables.push(tableData);
            }
            break;
          }
        }
      } catch (e) {
        console.log(`Could not fetch content for artifact ${art.id} (type ${art.typeCode}):`, e);
      }
    }

    return result;
  }

  /**
   * Fetch interactive HTML content for quiz/flashcard/data_table/report artifacts.
   * RPC: v9rmvd (GET_INTERACTIVE_HTML)
   * Params: [[artifactId], notebookId]
   */
  private static async getArtifactInteractiveHtml(notebookId: string, artifactId: string): Promise<string | null> {
    try {
      const response = await this.rpc(
        'v9rmvd',
        [[artifactId], notebookId],
        `/notebook/${notebookId}`
      );
      const lines = response.split('\n');
      const dataLine = lines.find((line) => line.includes('wrb.fr'));
      if (!dataLine) {
        console.log(`v9rmvd: No wrb.fr line in response for ${artifactId}. Lines: ${lines.length}`);
        return null;
      }

      const parsed = JSON.parse(dataLine);
      const innerRaw = parsed[0][2];
      if (!innerRaw) {
        console.log(`v9rmvd: parsed[0][2] is empty for ${artifactId}`);
        return null;
      }

      const innerData = JSON.parse(innerRaw);
      console.log(`v9rmvd response for ${artifactId}: type=${typeof innerData}, ` +
        `isArray=${Array.isArray(innerData)}, ` +
        `preview=${JSON.stringify(innerData).substring(0, 200)}`);

      // Response should contain HTML string
      if (typeof innerData === 'string') return innerData;
      if (Array.isArray(innerData) && typeof innerData[0] === 'string') return innerData[0];

      // Search nested for HTML content
      function findHtml(obj: any): string | null {
        if (typeof obj === 'string' && obj.length > 50 &&
            (obj.includes('<') || obj.includes('data-app-data'))) {
          return obj;
        }
        if (Array.isArray(obj)) {
          for (const item of obj) {
            const found = findHtml(item);
            if (found) return found;
          }
        }
        return null;
      }

      const htmlContent = findHtml(innerData);
      if (htmlContent) {
        console.log(`v9rmvd: Found HTML content (${htmlContent.length} chars) for ${artifactId}`);
        return htmlContent;
      }

      // Also try: response might be a URL to the interactive page
      function findUrl(obj: any): string | null {
        if (typeof obj === 'string' && obj.startsWith('http')) return obj;
        if (Array.isArray(obj)) {
          for (const item of obj) {
            const found = findUrl(item);
            if (found) return found;
          }
        }
        return null;
      }

      const url = findUrl(innerData);
      if (url) {
        console.log(`v9rmvd: Found URL for ${artifactId}: ${url.substring(0, 100)}`);
        // If it's a URL, we can't use it directly, but log it for debugging
      }

      console.log(`v9rmvd: No HTML content found in response for ${artifactId}`);
      return null;
    } catch (e) {
      console.log(`v9rmvd RPC failed for ${artifactId}:`, e);
      return null;
    }
  }

  /**
   * Extract text content from HTML (used for reports)
   */
  private static extractTextFromHtml(html: string): string {
    // Simple HTML-to-text: strip tags, decode entities
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return text;
  }

  /**
   * Parse quiz/flashcard HTML content.
   * The HTML embeds JSON in a data-app-data attribute.
   * Quiz (variant=2) contains {questions: [{question, answerOptions: [{text, isCorrect}]}]}
   * Flashcards (variant=1) contain {cards: [{f: "front", b: "back"}]}
   */
  private static parseQuizFlashcardHtml(
    html: string,
    art: { id: string; title: string; typeCode: number }
  ): { flashcards: Flashcard[] } {
    const result = { flashcards: [] as Flashcard[] };

    // Extract data-app-data JSON
    const match = html.match(/data-app-data="([^"]+)"/);
    if (!match) {
      console.log('No data-app-data found in quiz/flashcard HTML');
      return result;
    }

    try {
      // HTML-unescape the attribute value
      const decoded = match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      const data = JSON.parse(decoded);

      // Flashcards: {cards: [{f: "front", b: "back"}]}
      if (Array.isArray(data.cards)) {
        for (let i = 0; i < data.cards.length; i++) {
          const card = data.cards[i];
          result.flashcards.push({
            id: `${art.id}-card-${i}`,
            front: card.f || card.front || '',
            back: card.b || card.back || '',
          });
        }
      }

      // Quiz: {questions: [{question, answerOptions: [{text, isCorrect}], hint}]}
      if (Array.isArray(data.questions)) {
        for (let i = 0; i < data.questions.length; i++) {
          const q = data.questions[i];
          const questionText = q.question || '';
          const answers = (q.answerOptions || [])
            .map((a: any) => `${a.isCorrect ? '✓' : '✗'} ${a.text}`)
            .join('\n');
          result.flashcards.push({
            id: `${art.id}-q-${i}`,
            front: questionText,
            back: answers + (q.hint ? `\n\nHint: ${q.hint}` : ''),
          });
        }
      }
    } catch (e) {
      console.log('Failed to parse quiz/flashcard data:', e);
    }

    return result;
  }

  /**
   * Parse data table HTML content.
   * The response contains nested arrays with table data.
   */
  private static parseDataTableHtml(
    html: string,
    art: { id: string; title: string }
  ): DataTable | null {
    // Try data-app-data first
    const match = html.match(/data-app-data="([^"]+)"/);
    if (match) {
      try {
        const decoded = match[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        const data = JSON.parse(decoded);

        // Try to extract headers and rows
        if (data.headers && data.rows) {
          return {
            id: art.id,
            title: art.title || 'Data Table',
            headers: data.headers,
            rows: data.rows,
          };
        }
      } catch (e) {
        console.log('Failed to parse data table data-app-data:', e);
      }
    }

    // Fallback: extract table from HTML
    const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    if (tableMatch) {
      const tableHtml = tableMatch[1];
      const headers: string[] = [];
      const rows: string[][] = [];

      // Extract headers
      const thMatches = tableHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi);
      for (const th of thMatches) {
        headers.push(th[1].replace(/<[^>]+>/g, '').trim());
      }

      // Extract rows
      const trMatches = tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
      for (const tr of trMatches) {
        const row: string[] = [];
        const tdMatches = tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        for (const td of tdMatches) {
          row.push(td[1].replace(/<[^>]+>/g, '').trim());
        }
        if (row.length > 0) {
          rows.push(row);
        }
      }

      if (headers.length > 0 || rows.length > 0) {
        return {
          id: art.id,
          title: art.title || 'Data Table',
          headers: headers.length > 0 ? headers : (rows[0] || []),
          rows: headers.length > 0 ? rows : rows.slice(1),
        };
      }
    }

    // Last fallback: just create a basic entry
    const text = this.extractTextFromHtml(html);
    if (text) {
      // Try to parse CSV-like text
      const lines = text.split('\n').filter((l) => l.trim());
      if (lines.length > 1) {
        const headers = lines[0].split(/[,\t|]/).map((h) => h.trim());
        const rows = lines.slice(1).map((l) => l.split(/[,\t|]/).map((c) => c.trim()));
        return { id: art.id, title: art.title || 'Data Table', headers, rows };
      }
    }

    return null;
  }

  /**
   * Parse a mind map node from JSON data
   */
  private static parseMindmapNode(data: any): { id: string; label: string; children: any[] } {
    const node = {
      id: data.id || `mm-${Math.random().toString(36).substr(2, 9)}`,
      label: data.name || data.label || 'Node',
      children: [] as any[],
    };
    if (Array.isArray(data.children)) {
      node.children = data.children.map((child: any) => this.parseMindmapNode(child));
    }
    return node;
  }

  /**
   * Parse chat history from the hPTbtc (GET_CONVERSATION_HISTORY) response.
   *
   * The response from hPTbtc contains conversation turn data. Each turn has:
   * - The answer text (AI response)
   * - A marker: 2 = AI response, 1 = user query
   * - The user's query text
   *
   * From the SDK (_chat.py), conversation history items follow the pattern:
   *   [answer_text, null, 2]  → AI response
   *   [query_text, null, 1]   → User query
   *
   * The overall response structure for hPTbtc is:
   *   data = [[conversations...]] or data = [conversations...]
   *   Each conversation = [conv_id, messages_array, ...]
   *   messages_array = [[text, metadata, type_marker], ...]
   *   type_marker: 1 = user, 2 = AI
   */
  private static parseChatHistory(data: any, messages: ChatMessage[]): void {
    if (!Array.isArray(data)) return;

    // The response might be wrapped in an extra array
    let conversations = data;
    if (data.length > 0 && Array.isArray(data[0]) && data[0].length > 0 && Array.isArray(data[0][0])) {
      conversations = data[0];
    }

    for (const conv of conversations) {
      if (!Array.isArray(conv)) continue;

      // Each conversation has messages. Messages can be at different positions.
      // Look for arrays that contain [text, something, type_marker] patterns
      const turns: { text: string; type: number }[] = [];

      function findTurns(obj: any, depth: number): void {
        if (depth > 8 || !Array.isArray(obj)) return;

        // Check if this array looks like a message: [string, ?, number(1|2)]
        if (obj.length >= 3 && typeof obj[0] === 'string' && obj[0].length > 3) {
          const lastItem = obj[obj.length - 1];
          if (lastItem === 1 || lastItem === 2) {
            turns.push({ text: obj[0], type: lastItem });
            return;
          }
        }

        // Recurse into children
        for (const item of obj) {
          if (Array.isArray(item)) {
            findTurns(item, depth + 1);
          }
        }
      }

      findTurns(conv, 0);

      // Convert turns to messages (type 1 = user, type 2 = AI)
      for (const turn of turns) {
        messages.push({
          id: `chat-${messages.length}`,
          role: turn.type === 1 ? 'user' : 'assistant',
          content: turn.text,
        });
      }
    }

    // If structured parsing found nothing, try brute-force approach
    // BUT skip UUIDs and other non-content strings (the RPC often returns
    // only conversation IDs without actual message text).
    if (messages.length === 0) {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const allStrings: string[] = [];

      function collectStrings(obj: any, depth: number): void {
        if (depth > 10) return;
        if (typeof obj === 'string' && obj.length > 20 && !UUID_RE.test(obj)) {
          allStrings.push(obj);
        }
        if (Array.isArray(obj)) {
          for (const item of obj) collectStrings(item, depth + 1);
        }
      }
      collectStrings(data, 0);

      const unique = [...new Set(allStrings)];
      for (let i = 0; i < unique.length; i++) {
        messages.push({
          id: `chat-${messages.length}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: unique[i],
        });
      }

      // If STILL empty, log that we only got IDs (DOM extraction is needed)
      if (messages.length === 0) {
        console.log('RPC chat: only conversation IDs found, no message content (DOM extraction required)');
      }
    }
  }

  /**
   * Parse artifacts from the gArtLc response.
   * 
   * From the SDK (types.py Artifact.from_api_response):
   *   data[0] = artifact_id (string)
   *   data[1] = title (string)
   *   data[2] = type_code (number)
   *   data[4] = status (1=processing, 2=pending, 3=completed, 4=failed)
   *   data[9][1][0] = variant for type 4 (1=flashcards, 2=quiz)
   *   data[15][0] = timestamp
   *
   * typeCode: 1=audio, 2=report, 3=video, 4=quiz/flashcard, 5=mindmap, 7=infographic, 8=slide_deck, 9=data_table
   */
  private static parseArtifacts(data: any, result: {
    artifacts: Array<{ id: string; type: string; typeCode: number; title: string; status: number }>;
    flashcards: Flashcard[];
    tables: DataTable[];
    slides: SlideContent[];
    infographics: InfographicContent[];
  }): void {
    if (!Array.isArray(data)) return;

    // The response is [[artifacts...]] — unwrap outer array
    let artifactsList = data;
    if (data.length > 0 && Array.isArray(data[0]) && data[0].length > 0 && Array.isArray(data[0][0])) {
      artifactsList = data[0];
    }

    console.log(`Parsing ${artifactsList.length} artifact entries`);

    for (const artifact of artifactsList) {
      if (!Array.isArray(artifact) || artifact.length < 3) continue;

      // SDK structure: [id, title, typeCode, ?, status, ...]
      const artifactId = typeof artifact[0] === 'string' ? artifact[0] : '';
      const title = typeof artifact[1] === 'string' ? artifact[1] : '';
      const typeCode = typeof artifact[2] === 'number' ? artifact[2] : 0;
      const status = (artifact.length > 4 && typeof artifact[4] === 'number') ? artifact[4] : 0;

      // Skip if not a valid artifact
      if (!artifactId && !title) continue;

      // Determine type name with quiz/flashcard distinction
      let typeName = this.ARTIFACT_TYPE_MAP[typeCode] || `type_${typeCode}`;

      // For type 4, check variant at data[9][1][0]
      let variant: number | null = null;
      if (typeCode === 4 && artifact.length > 9) {
        try {
          if (Array.isArray(artifact[9]) && Array.isArray(artifact[9][1])) {
            variant = artifact[9][1][0];
            if (variant === 1) typeName = 'flashcards';
            else if (variant === 2) typeName = 'quiz';
          }
        } catch { /* ignore */ }
      }

      console.log(`Artifact: ${artifactId.substring(0, 8)}... type=${typeCode}(${typeName}) status=${status} title="${title}"`);

      result.artifacts.push({
        id: artifactId,
        type: typeName,
        typeCode,
        title: title || typeName,
        status,
      });

      // Skip non-completed artifacts (status 3 = completed)
      if (status !== 3 && status !== 0) continue;

      // Extract media URLs from artifact data
      const { imageUrls, pdfUrl, allUrls } = this.extractMediaUrls(artifact);

      // Categorize based on type
      switch (typeCode) {
        case 8: { // slide_deck
          // Slide deck: imageUrls are individual slide images (lh3.googleusercontent.com)
          // pdfUrl is the full presentation PDF (contribution.usercontent.google.com)
          if (imageUrls.length > 0) {
            for (let i = 0; i < imageUrls.length; i++) {
              result.slides.push({
                id: `${artifactId}-slide-${i}`,
                title: title || 'Slide Deck',
                content: '',
                imageUrl: imageUrls[i],
                pdfUrl: pdfUrl || undefined,
                slideNumber: i + 1,
              });
            }
          } else if (pdfUrl) {
            // Only PDF URL found — still create a slide entry
            result.slides.push({
              id: artifactId,
              title: title || 'Slide Deck',
              content: '',
              pdfUrl,
              slideNumber: 1,
            });
          } else {
            result.slides.push({
              id: artifactId,
              title: title || 'Slide Deck',
              content: '',
              slideNumber: result.slides.length + 1,
            });
          }
          break;
        }
        case 7: { // infographic
          result.infographics.push({
            id: artifactId,
            title: title || 'Infographic',
            imageUrl: imageUrls[0] || allUrls[0] || undefined,
          });
          break;
        }
      }
    }
  }

  /**
   * Extract media URLs from an artifact data array.
   * Separates individual slide images (lh3.googleusercontent.com)
   * from PDF download links (contribution.usercontent.google.com).
   */
  private static extractMediaUrls(artifact: any[]): {
    imageUrls: string[];
    pdfUrl: string | null;
    allUrls: string[];
  } {
    const allUrls: string[] = [];
    const seen = new Set<string>();

    function findUrls(obj: any, depth: number): void {
      if (depth > 12) return;
      if (typeof obj === 'string') {
        if (
          obj.startsWith('https://') &&
          (obj.includes('googleusercontent.com') ||
           obj.includes('usercontent.google.com') ||
           obj.includes('google.com/') ||
           obj.includes('gstatic.com')) &&
          !seen.has(obj)
        ) {
          seen.add(obj);
          allUrls.push(obj);
        }
        return;
      }
      if (Array.isArray(obj)) {
        for (const item of obj) {
          findUrls(item, depth + 1);
        }
      }
    }

    // Search from position 5 onwards where media data lives
    for (let i = 5; i < artifact.length; i++) {
      findUrls(artifact[i], 0);
    }

    // Separate image URLs from PDF download URL
    // - lh3.googleusercontent.com/notebooklm/... → individual slide images
    // - contribution.usercontent.google.com/download?... → full PDF
    const imageUrls: string[] = [];
    let pdfUrl: string | null = null;

    for (const url of allUrls) {
      if (url.includes('contribution.usercontent.google.com/download') ||
          url.includes('/download?') && url.includes('filename=')) {
        pdfUrl = url;
      } else if (url.includes('lh3.googleusercontent.com') ||
                 url.includes('googleusercontent.com/notebooklm')) {
        imageUrls.push(url);
      }
    }

    return { imageUrls, pdfUrl, allUrls };
  }

  /**
   * Get artifact content/details by ID using RPC BnLyuf (GET_ARTIFACT)
   */
  static async getArtifactContent(notebookId: string, artifactId: string): Promise<any> {
    try {
      const response = await this.rpc(
        'BnLyuf',
        [artifactId, notebookId],
        `/notebook/${notebookId}`
      );
      const lines = response.split('\n');
      const dataLine = lines.find((line) => line.includes('wrb.fr'));
      if (dataLine) {
        const parsed = JSON.parse(dataLine);
        const innerData = JSON.parse(parsed[0][2]);
        return innerData;
      }
      return null;
    } catch (e) {
      console.log(`Could not get artifact ${artifactId}:`, e);
      return null;
    }
  }

  /**
   * Get quiz/flashcard HTML content via RPC v9rmvd (GET_INTERACTIVE_HTML)
   */
  static async getQuizFlashcardContent(notebookId: string, artifactId: string): Promise<string | null> {
    try {
      const response = await this.rpc(
        'v9rmvd',
        [artifactId, notebookId],
        `/notebook/${notebookId}`
      );
      const lines = response.split('\n');
      const dataLine = lines.find((line) => line.includes('wrb.fr'));
      if (dataLine) {
        const parsed = JSON.parse(dataLine);
        const innerData = JSON.parse(parsed[0][2]);
        // The response typically contains HTML or JSON with quiz/flashcard data
        if (typeof innerData === 'string') return innerData;
        if (Array.isArray(innerData)) {
          // Look for string content
          const texts: string[] = [];
          this.collectTextStrings(innerData, texts, 0);
          if (texts.length > 0) {
            texts.sort((a, b) => b.length - a.length);
            return texts[0];
          }
        }
        return JSON.stringify(innerData);
      }
      return null;
    } catch (e) {
      console.log(`Could not get quiz/flashcard ${artifactId}:`, e);
      return null;
    }
  }

  /**
   * Load source fulltext content by ID
   * Uses RPC 'hizoJc' (GET_SOURCE) to get the actual text content of a source.
   * Exact parameter format from notebooklm-py SDK: [[source_id], [2], [2]]
   *
   * @param notebookId - The notebook ID
   * @param sourceId   - The source ID
   * @returns The text content of the source, or null if unavailable
   */
  static async loadSourceContent(notebookId: string, sourceId: string): Promise<string | null> {
    try {
      // RPC hizoJc (GET_SOURCE) — Load source fulltext
      // Params: [[source_id], [2], [2]]  (from notebooklm-py _sources.py get_fulltext())
      // notebook_id goes in source_path, NOT in params
      const response = await this.rpc(
        'hizoJc',
        [[sourceId], [2], [2]],
        `/notebook/${notebookId}`
      );

      const content = this.parseFulltextResponse(response);
      if (content) {
        console.log(`✓ Loaded fulltext for source ${sourceId}: ${content.length} chars`);
        return content;
      }

      console.log(`hizoJc returned no content for ${sourceId}, trying tr032e (guide)...`);
    } catch (error) {
      console.log(`hizoJc failed for source ${sourceId}:`, error);
    }

    // Fallback: try RPC tr032e (GET_SOURCE_GUIDE) — returns summary, not fulltext
    // Params: [[[[source_id]]]]  (quadruple nested!)
    try {
      const response = await this.rpc(
        'tr032e',
        [[[[sourceId]]]],
        `/notebook/${notebookId}`
      );
      const guide = this.parseGuideResponse(response);
      if (guide) {
        console.log(`✓ Loaded guide summary for source ${sourceId}: ${guide.length} chars`);
        return guide;
      }
    } catch (error2) {
      console.log(`tr032e also failed for source ${sourceId}:`, error2);
    }

    return null;
  }

  /**
   * Parse fulltext response from hizoJc (GET_SOURCE) RPC
   * Content blocks are at result[3][0] — extract all text strings recursively.
   * Based on notebooklm-py's get_fulltext() implementation.
   */
  private static parseFulltextResponse(responseText: string): string | null {
    try {
      const lines = responseText.split('\n');
      const dataLine = lines.find((line) => line.includes('wrb.fr'));
      if (!dataLine) {
        console.log('parseFulltextResponse: no wrb.fr line found');
        return null;
      }

      const parsed = JSON.parse(dataLine);
      const innerData = JSON.parse(parsed[0][2]);

      if (!innerData || !Array.isArray(innerData)) {
        console.log('parseFulltextResponse: invalid inner data');
        return null;
      }

      // Content blocks at result[3][0]  (from Python SDK: result[3][0])
      if (innerData.length > 3 && Array.isArray(innerData[3]) && innerData[3].length > 0) {
        const contentBlocks = innerData[3][0];
        if (Array.isArray(contentBlocks)) {
          const texts = this.extractAllText(contentBlocks);
          if (texts.length > 0) {
            return texts.join('\n');
          }
        }
      }

      // Fallback: try collecting all long text strings from anywhere in the response
      const allTexts: string[] = [];
      this.collectTextStrings(innerData, allTexts, 0);
      if (allTexts.length > 0) {
        // Sort by length descending, return the longest string
        allTexts.sort((a, b) => b.length - a.length);
        return allTexts[0];
      }

      console.log('parseFulltextResponse: no content found in response structure');
      return null;
    } catch (e) {
      console.log('parseFulltextResponse error:', e);
      return null;
    }
  }

  /**
   * Parse guide/summary response from tr032e (GET_SOURCE_GUIDE) RPC
   * Response structure: [[[null, [summary], [[keywords]], []]]]
   */
  private static parseGuideResponse(responseText: string): string | null {
    try {
      const lines = responseText.split('\n');
      const dataLine = lines.find((line) => line.includes('wrb.fr'));
      if (!dataLine) return null;

      const parsed = JSON.parse(dataLine);
      const innerData = JSON.parse(parsed[0][2]);

      // Summary at innerData[0][0][1][0]
      if (
        Array.isArray(innerData) && innerData.length > 0 &&
        Array.isArray(innerData[0]) && innerData[0].length > 0 &&
        Array.isArray(innerData[0][0]) && innerData[0][0].length > 1 &&
        Array.isArray(innerData[0][0][1]) && innerData[0][0][1].length > 0 &&
        typeof innerData[0][0][1][0] === 'string'
      ) {
        return innerData[0][0][1][0];
      }

      // Fallback: collect all text
      const allTexts: string[] = [];
      this.collectTextStrings(innerData, allTexts, 0);
      if (allTexts.length > 0) {
        allTexts.sort((a, b) => b.length - a.length);
        return allTexts[0];
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Recursively extract all text strings from nested arrays.
   * Used for parsing content blocks from GET_SOURCE response.
   */
  private static extractAllText(data: any[], maxDepth = 100): string[] {
    if (maxDepth <= 0) return [];
    const texts: string[] = [];
    for (const item of data) {
      if (typeof item === 'string' && item.length > 0) {
        texts.push(item);
      } else if (Array.isArray(item)) {
        texts.push(...this.extractAllText(item, maxDepth - 1));
      }
    }
    return texts;
  }

  /**
   * Collect long text strings from deeply nested structures.
   * Fallback method when content is not at expected positions.
   */
  private static collectTextStrings(obj: any, results: string[], depth: number): void {
    if (depth > 15) return;
    if (typeof obj === 'string' && obj.length > 50) {
      results.push(obj);
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.collectTextStrings(item, results, depth + 1);
      }
    }
  }

  /**
   * Load content for multiple sources in parallel (with concurrency limit)
   *
   * @param notebookId - The notebook ID
   * @param sourceIds  - Array of source IDs to load
   * @param concurrency - Max parallel requests (default 3)
   * @returns Map of sourceId → content string
   */
  static async loadMultipleSourceContents(
    notebookId: string,
    sourceIds: string[],
    concurrency = 3,
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const queue = [...sourceIds];

    const worker = async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id) break;
        try {
          const content = await this.loadSourceContent(notebookId, id);
          if (content) {
            results.set(id, content);
          }
        } catch (e) {
          console.log(`Failed to load content for source ${id}:`, e);
        }
      }
    };

    // Run workers in parallel
    const workers = Array.from({ length: Math.min(concurrency, sourceIds.length) }, () => worker());
    await Promise.all(workers);

    return results;
  }

  /**
   * Get source content by ID (convenience alias for loadSourceContent)
   */
  static async getSourceContent(notebookId: string, sourceId: string): Promise<string | null> {
    return this.loadSourceContent(notebookId, sourceId);
  }
}
