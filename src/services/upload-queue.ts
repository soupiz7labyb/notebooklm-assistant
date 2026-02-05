import { NotebookLMService } from './notebooklm-api';
import { FileProcessor } from './file-processor';
import { ContentParser } from './content-parser';
import { QUEUE_DELAY_MS, CHUNK_SIZE } from '@/lib/constants';
import { useStore } from '@/store/useStore';
import type { UploadItem } from '@/types';

/**
 * Service for managing upload queue
 */
export class UploadQueue {
  private static isProcessing = false;

  /**
   * Process upload queue
   */
  static async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const state = useStore.getState();
    const pendingItems = state.uploadQueue.filter((item) => item.status === 'pending');

    for (const item of pendingItems) {
      try {
        await this.processItem(item);
        // Delay between items
        await new Promise((resolve) => setTimeout(resolve, QUEUE_DELAY_MS));
      } catch (error) {
        console.error('Error processing item:', error);
        useStore.getState().updateQueueItem(item.id, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.isProcessing = false;
  }

  /**
   * Check if source already exists in notebook (duplicate check)
   */
  private static async checkDuplicate(
    notebookId: string,
    item: UploadItem
  ): Promise<boolean> {
    try {
      const notebook = await NotebookLMService.getNotebook(notebookId);
      
      // Check by title first (simpler and more reliable)
      const title = item.title;
      if (title) {
        const titleMatch = notebook.sources.some((source) => {
          // Exact title match
          if (source.title === title) return true;
          // Case-insensitive match
          if (source.title.toLowerCase().trim() === title.toLowerCase().trim()) return true;
          return false;
        });
        if (titleMatch) {
          return true; // Duplicate found by title
        }
      }
      
      // Also check by URL for URL-based sources
      if (item.type === 'youtube' || item.type === 'page') {
        const url = item.url;
        if (!url) return false;
        
        // Normalize URL (remove query params that don't affect content)
        const normalizeUrl = (u: string) => {
          try {
            const urlObj = new URL(u);
            
            // For YouTube URLs, normalize to video ID format
            if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
              // For channel pages, keep full URL (they're unique)
              if (urlObj.pathname.includes('/@') || urlObj.pathname.includes('/channel/') || urlObj.pathname.includes('/c/')) {
                // Channel URL - keep as is but remove query params
                urlObj.search = '';
                return urlObj.toString();
              }
              
              // For video URLs, extract video ID
              let videoId = urlObj.searchParams.get('v');
              if (!videoId && urlObj.hostname.includes('youtu.be')) {
                videoId = urlObj.pathname.split('/').pop() || null;
              }
              if (videoId && videoId.length >= 10) { // YouTube video IDs are 10-11 characters
                // Clean video ID (remove any extra characters)
                videoId = videoId.substring(0, 11);
                return `https://www.youtube.com/watch?v=${videoId}`;
              }
            }
            
            // For other URLs, remove common tracking params
            urlObj.searchParams.delete('utm_source');
            urlObj.searchParams.delete('utm_medium');
            urlObj.searchParams.delete('utm_campaign');
            urlObj.searchParams.delete('ref');
            urlObj.searchParams.delete('fbclid');
            urlObj.searchParams.delete('gclid');
            return urlObj.toString();
          } catch {
            return u;
          }
        };
        
        const normalizedUrl = normalizeUrl(url);
        return notebook.sources.some((source) => {
          const sourceUrl = (source as any).url;
          if (!sourceUrl) return false;
          return normalizeUrl(sourceUrl) === normalizedUrl;
        });
      } else if (item.type === 'note' || item.type === 'file' || item.type === 'selection') {
        // Check by title (for text sources, title is usually unique enough)
        const title = item.title;
        if (!title) return false;
        
        return notebook.sources.some((source) => {
          // Exact title match
          if (source.title === title) return true;
          // For chunked files, check if base title matches
          if (title.includes('(Part') && source.title.startsWith(title.split('(Part')[0].trim())) {
            return true;
          }
          return false;
        });
      }
      
      return false;
    } catch (error) {
      console.error('Error checking duplicate:', error);
      // If check fails, allow upload (better to add duplicate than fail)
      return false;
    }
  }

  /**
   * Process single upload item
   */
  private static async processItem(item: UploadItem): Promise<void> {
    const notebookId = item.notebookId || useStore.getState().selectedNotebookId;
    if (!notebookId) {
      throw new Error('No notebook selected');
    }

    // Check for duplicates before processing
    // Always refresh notebook to get latest sources
    const isDuplicate = await this.checkDuplicate(notebookId, item);
    if (isDuplicate) {
      console.log(`Skipping duplicate source: ${item.title}`);
      useStore.getState().updateQueueItem(item.id, {
        status: 'error',
        progress: 0,
        error: 'Source already exists in notebook',
      });
      return;
    }

    useStore.getState().updateQueueItem(item.id, {
      status: 'processing',
      progress: 0,
    });

    try {
      switch (item.type) {
            case 'page': {
              // For web pages, prefer sending URL directly to NotebookLM
              // NotebookLM handles URLs better and can process them automatically
              if (item.url && !item.url.startsWith('chrome://') && !item.url.startsWith('chrome-extension://')) {
                // Send URL directly - NotebookLM will fetch and process it
                await NotebookLMService.addSource(notebookId, {
                  type: 'url',
                  title: item.title,
                  url: item.url,
                });
              } else if (item.content && item.content.trim()) {
                    // Fallback to text if URL is not available
                    // Use addTextSource directly for text content
                    if (item.content.length > CHUNK_SIZE) {
                      const { TextSplitter } = await import('@/lib/text-splitter');
                      const splitter = new TextSplitter(CHUNK_SIZE);
                      const chunks = splitter.splitText(item.content);
                      
                      useStore.getState().updateQueueItem(item.id, {
                        chunks: chunks.length,
                        currentChunk: 0,
                      });

                      for (let i = 0; i < chunks.length; i++) {
                        const chunk = chunks[i];
                        await NotebookLMService.addTextSource(
                          notebookId,
                          chunk.text,
                          `${item.title} (Part ${i + 1}/${chunks.length})`
                        );

                        useStore.getState().updateQueueItem(item.id, {
                          currentChunk: i + 1,
                          progress: ((i + 1) / chunks.length) * 100,
                        });
                        
                        // Wait between chunks
                        if (i < chunks.length - 1) {
                          await new Promise((resolve) => setTimeout(resolve, 2000));
                        }
                      }
                    } else {
                      await NotebookLMService.addTextSource(notebookId, item.content, item.title);
                      await this.waitForTextSource(notebookId, item.title);
                    }
                  } else {
                    throw new Error('Page URL or content not found');
                  }
                  break;
                }

        case 'selection': {
          const content = await ContentParser.parseSelection();
          // Use addTextSource directly - same as original project
          await NotebookLMService.addTextSource(notebookId, content.text, content.title);
          await this.waitForTextSource(notebookId, content.title);
          break;
        }

        case 'youtube': {
          // Duplicate check is already done at the beginning of processItem
          try {
            await NotebookLMService.addSource(notebookId, {
              type: 'url',
              title: item.title,
              url: item.url,
            });
            // For YouTube URLs, normal error codes mean success - don't throw
          } catch (error) {
            // Check if it's a normal error code
            if (error instanceof Error && error.message.includes('RPC returned error code:')) {
              const errorCodeMatch = error.message.match(/RPC returned error code: (\d+)/);
              if (errorCodeMatch) {
                const errorCode = errorCodeMatch[1];
                const normalErrorCodes = ['139', '140', '141', '412', '466', '496', '497', '536', '537', '552', '553'];
                if (normalErrorCodes.includes(errorCode)) {
                  // Normal error - resource was added successfully, don't throw
                  break;
                }
              }
            }
            throw error;
          }
          break;
        }

        case 'file': {
          if (!item.file) {
            throw new Error('File not found');
          }

          const extension = item.file.name.split('.').pop()?.toLowerCase() || '';
          const binaryExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

          if (binaryExtensions.includes(extension)) {
            // Binary/image file: upload using file RPC (o4cbdc)
            await NotebookLMService.addFileSource(notebookId, item.file);
            // Для бинарных файлов у NotebookLM нет текстового контента, поэтому не ждём waitForTextSource
          } else {
            // Text-like files: use existing text pipeline (PDF/TXT/MD/CSV/DOCX)
            const processed = await FileProcessor.processFile(item.file);

            if (processed.needsChunking && processed.chunks) {
              // Upload chunks sequentially
              useStore.getState().updateQueueItem(item.id, {
                chunks: processed.chunks.length,
                currentChunk: 0,
              });

              for (let i = 0; i < processed.chunks.length; i++) {
                const chunk = processed.chunks[i];
                const chunkTitle = `${item.title} (Part ${i + 1}/${processed.chunks!.length})`;
                await NotebookLMService.addTextSource(notebookId, chunk.text, chunkTitle);

                useStore.getState().updateQueueItem(item.id, {
                  currentChunk: i + 1,
                  progress: ((i + 1) / processed.chunks!.length) * 100,
                });
                
                // Wait for each chunk
                if (i < processed.chunks.length - 1) {
                  await this.waitForTextSource(notebookId, chunkTitle);
                  await new Promise((resolve) => setTimeout(resolve, 2000));
                }
              }
              // Wait for last chunk
              await this.waitForTextSource(
                notebookId,
                `${item.title} (Part ${processed.chunks.length}/${processed.chunks.length})`
              );
            } else {
              // Upload as text source (for TXT, MD, CSV and extracted PDF/DOCX text)
              await NotebookLMService.addTextSource(notebookId, processed.content, item.title);
              await this.waitForTextSource(notebookId, item.title);
            }
          }
          break;
        }

        case 'note': {
          // Process note using addTextSource directly
          const noteContent = item.content || '';
          
          // Check if content needs chunking (300k tokens = ~225k chars)
          if (noteContent.length > CHUNK_SIZE) {
            const { TextSplitter } = await import('@/lib/text-splitter');
            const splitter = new TextSplitter(CHUNK_SIZE);
            const chunks = splitter.splitText(noteContent);
            
            useStore.getState().updateQueueItem(item.id, {
              chunks: chunks.length,
              currentChunk: 0,
            });

            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i];
              const chunkTitle = `${item.title} (Part ${i + 1}/${chunks.length})`;
              await NotebookLMService.addTextSource(notebookId, chunk.text, chunkTitle);

              useStore.getState().updateQueueItem(item.id, {
                currentChunk: i + 1,
                progress: ((i + 1) / chunks.length) * 100,
              });
              
              // Wait for each chunk
              if (i < chunks.length - 1) {
                await this.waitForTextSource(notebookId, chunkTitle);
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
            }
            // Wait for last chunk
            await this.waitForTextSource(notebookId, `${item.title} (Part ${chunks.length}/${chunks.length})`);
          } else {
            await NotebookLMService.addTextSource(notebookId, noteContent, item.title);
            await this.waitForTextSource(notebookId, item.title);
          }
          break;
        }
      }

      // Text sources are processed asynchronously - wait for them
      // This is now handled by waitForTextSource calls in each case

          useStore.getState().updateQueueItem(item.id, {
            status: 'done',
            progress: 100,
          });
        } catch (error) {
          // Check if error is a normal RPC error code (resource still added)
          if (error instanceof Error && error.message.includes('RPC returned error code:')) {
            const errorCodeMatch = error.message.match(/RPC returned error code: (\d+)/);
            if (errorCodeMatch) {
              const errorCode = errorCodeMatch[1];
                const normalErrorCodes = ['139', '140', '141', '412', '466', '496', '497', '536', '537', '552', '553'];
              if (normalErrorCodes.includes(errorCode)) {
                // Normal error - resource was added, just mark as done
                useStore.getState().updateQueueItem(item.id, {
                  status: 'done',
                  progress: 100,
                });
                return; // Don't throw - resource was successfully added
              }
            }
          }
          throw error;
        }
  }

  /**
   * Wait for text source to be processed by NotebookLM
   * Simple check - if source appears immediately, great. Otherwise, just continue.
   */
  private static async waitForTextSource(notebookId: string, expectedTitle: string): Promise<void> {
    // Just wait a moment for async processing, then do a quick check
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
    
    try {
      const notebook = await NotebookLMService.getNotebook(notebookId);
      const sourceTitles = new Set(notebook.sources.map(s => s.title.toLowerCase().trim()));
      const normalizedExpectedTitle = expectedTitle.toLowerCase().trim();
      
      if (sourceTitles.has(normalizedExpectedTitle)) {
        console.log(`✓ Text source "${expectedTitle}" found in notebook`);
      } else {
        console.log(`Text source "${expectedTitle}" may still be processing`);
      }
    } catch (e) {
      console.warn('Could not verify text source:', e);
    }
  }

  /**
   * Add item to queue and start processing
   */
  static async addAndProcess(item: UploadItem): Promise<void> {
    useStore.getState().addToQueue(item);
    // Start processing if not already processing
    if (!this.isProcessing) {
      this.processQueue();
    }
  }
}
