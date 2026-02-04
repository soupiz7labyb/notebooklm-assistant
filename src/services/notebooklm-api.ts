import { NOTEBOOKLM_BASE_URL } from '@/lib/constants';
import type { Notebook } from '@/types';

/**
 * Service for interacting with NotebookLM API
 * Uses RPC calls similar to add_to_NotebookLM-main project
 */
export class NotebookLMService {
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
        // File sources are not supported via RPC API
        // Files should be processed to extract text first, then sent as text sources
        throw new Error(
          'Direct file upload is not supported via RPC API. ' +
          'Please extract text content from the file and upload as text source.'
        );
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
   * Parse notebook details from RPC response
   * Same logic as in original project
   */
  private static parseNotebookDetails(responseText: string): { id: string; title: string; sources: Array<{ id: string; title: string; type: string; status: number }> } {
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
      
      // Based on logs: item0 = title, item1 = sources array, item2 = notebook ID
      const notebookTitle = notebookData[0] || '';
      const notebookId = notebookData[2] || '';
      const sourcesArray = Array.isArray(notebookData[1]) ? notebookData[1] : [];

      console.log('parseNotebookDetails: Structure:', {
        title: notebookTitle,
        id: notebookId,
        sourcesCount: sourcesArray.length,
        firstSource: sourcesArray[0],
      });

      const sources = sourcesArray
        .filter((source: any) => source && Array.isArray(source) && source.length > 0)
        .map((source: any) => {
          // Source structure based on logs:
          // [0] = [UUID] - source ID (array with one UUID string)
          // [1] = URL string (if URL source) or null
          // [2] = Array with metadata [null, number, timestamps, ..., type, ..., url array]
          // [3] = Array with [null, typeCode] or [UUID, timestamps]
          
          let sourceId = '';
          let sourceTitle = 'Untitled';
          let sourceType = 0;
          let sourceUrl = null;
          let sourceStatus = 0;
          
          // Extract source ID from [0] (array with UUID)
          if (Array.isArray(source[0]) && source[0].length > 0 && typeof source[0][0] === 'string') {
            sourceId = source[0][0];
          } else if (typeof source[0] === 'string' && source[0].includes('-')) {
            sourceId = source[0];
          }
          
          // Extract URL from [1] (if it's a string starting with http)
          if (typeof source[1] === 'string' && (source[1].startsWith('http://') || source[1].startsWith('https://'))) {
            sourceUrl = source[1];
          }
          
          // Extract type from [2] or [3]
          // [2] seems to be: [null, number, timestamps, ..., type, ..., url array]
          // [3] seems to be: [null, typeCode] or [UUID, timestamps]
          if (Array.isArray(source[2])) {
            // Look for type in [2] array - might be at index 4 or later
            for (let i = 0; i < source[2].length; i++) {
              const item = source[2][i];
              if (typeof item === 'number' && item > 0 && item < 10) {
                sourceType = item;
                break;
              }
            }
            
            // Look for URL in [2][7] (array with URLs)
            if (Array.isArray(source[2][7]) && source[2][7].length > 0) {
              const urlFromArray = source[2][7][0];
              if (typeof urlFromArray === 'string' && (urlFromArray.startsWith('http://') || urlFromArray.startsWith('https://'))) {
                sourceUrl = urlFromArray;
              }
            }
          }
          
          if (Array.isArray(source[3]) && source[3].length > 1) {
            const typeFrom3 = source[3][1];
            if (typeof typeFrom3 === 'number' && typeFrom3 > 0 && typeFrom3 < 10) {
              sourceType = typeFrom3;
            }
          }
          
          // Determine type based on URL
          if (sourceUrl) {
            if (sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be')) {
              sourceType = 4; // YouTube
            } else if (sourceUrl.endsWith('.pdf')) {
              sourceType = 7; // PDF
            } else {
              sourceType = 1; // URL
            }
          } else if (sourceType === 0) {
            // No URL and no type found - assume it's text
            sourceType = 3; // Text
          }
          
          // Extract title - it might be in the source array or we need to get it from NotebookLM
          // For now, try to find a meaningful string that's not a URL or UUID
          for (let i = source.length - 1; i >= 0; i--) {
            const item = source[i];
            if (typeof item === 'string' && 
                item.length > 3 && 
                !item.includes('-') && 
                !item.startsWith('http') &&
                !/^\d+$/.test(item) &&
                item !== sourceId) {
              sourceTitle = item;
              break;
            }
          }
          
          // If title not found, use a default based on type
          if (sourceTitle === 'Untitled') {
            if (sourceUrl) {
              // Extract filename from URL
              try {
                const urlObj = new URL(sourceUrl);
                const pathParts = urlObj.pathname.split('/');
                const filename = pathParts[pathParts.length - 1];
                if (filename && filename.length > 0) {
                  sourceTitle = filename;
                }
              } catch (e) {
                sourceTitle = sourceUrl.substring(0, 50);
              }
            } else {
              sourceTitle = 'Text source';
            }
          }
          
          const typeNames: Record<number, string> = {
            1: 'url',
            3: 'text',
            4: 'youtube',
            7: 'pdf',
            8: 'audio',
          };

          return {
            id: sourceId || '',
            title: sourceTitle,
            type: typeNames[sourceType] || 'unknown',
            typeCode: sourceType,
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
      console.error('Response text:', responseText.substring(0, 1000));
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
}
