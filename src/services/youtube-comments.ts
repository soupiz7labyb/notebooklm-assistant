/**
 * Service for extracting YouTube comments via InnerTube API.
 * All fetch requests run in MAIN world so that the Origin header is
 * youtube.com (not chrome-extension://), avoiding 403 errors.
 *
 * YouTube has migrated from commentRenderer to commentViewModel format.
 * Comment data now lives in frameworkUpdates.entityBatchUpdate.mutations,
 * referenced by keys from commentViewModel.
 */

interface Comment {
  id: string;
  author: string;
  text: string;
  likeCount: number;
  publishedAt: string;
}

interface VideoMeta {
  title: string;
  channelName: string;
  videoUrl: string;
}

interface PageResult {
  comments: Comment[];
  nextContinuation: string | null;
}

export interface CommentsResult {
  text: string;
  title: string;
  commentCount: number;
}

export class YouTubeCommentsService {
  static async fetchAndFormat(
    tabId: number,
    videoId: string,
    options: { maxComments: number; sortBy?: 'top' | 'newest' }
  ): Promise<CommentsResult> {
    const { apiKey, context } = await this.getInnerTubeConfig(tabId);
    const meta = await this.getVideoMeta(tabId, videoId);

    let continuationToken = await this.tryTokenFromPageData(tabId);
    if (!continuationToken) {
      continuationToken = await this.fetchTokenViaApi(tabId, apiKey, context, videoId);
    }

    if (!continuationToken) {
      throw new Error('Comments are disabled or unavailable for this video');
    }

    const allComments: Comment[] = [];
    let token: string | null = continuationToken;
    const sortBy = options.sortBy || 'top';

    while (token && allComments.length < options.maxComments) {
      const page = await this.fetchCommentsPage(tabId, apiKey, context, token, sortBy);

      if (page.comments.length === 0 && !page.nextContinuation) break;

      for (const comment of page.comments) {
        if (allComments.length >= options.maxComments) break;
        allComments.push(comment);
      }

      token = page.nextContinuation;
    }

    const text = this.formatAsMarkdown(allComments, meta, videoId);
    const sortLabel = sortBy === 'newest' ? 'Newest' : 'Top';
    const title = `Comments (${sortLabel}, ${allComments.length}): ${meta.title}`;

    return { text, title, commentCount: allComments.length };
  }

  private static async getInnerTubeConfig(
    tabId: number
  ): Promise<{ apiKey: string; context: object }> {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        try {
          const cfg = (window as any).ytcfg?.data_ || {};
          return {
            apiKey: cfg.INNERTUBE_API_KEY || '',
            context: cfg.INNERTUBE_CONTEXT || {},
          };
        } catch {
          return { apiKey: '', context: {} };
        }
      },
    });
    const result = results?.[0]?.result;
    if (!result) throw new Error('Failed to extract YouTube config from page');
    return { apiKey: result.apiKey, context: result.context };
  }

  private static async getVideoMeta(tabId: number, videoId: string): Promise<VideoMeta> {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (vid: string) => {
        const title = document.title.replace(' - YouTube', '').trim() || `Video ${vid}`;
        const channelEl =
          document.querySelector('#channel-name a') ||
          document.querySelector('ytd-channel-name a') ||
          document.querySelector('#owner-name a');
        const channelName = (channelEl as HTMLElement | null)?.textContent?.trim() || '';
        return { title, channelName };
      },
      args: [videoId],
    });
    const r = results?.[0]?.result;
    return {
      title: r?.title || `Video ${videoId}`,
      channelName: r?.channelName || '',
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  private static async tryTokenFromPageData(tabId: number): Promise<string | null> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          try {
            const initData = (window as any).ytInitialData;
            if (!initData) return null;
            return deepFind(initData, 0);
          } catch {
            return null;
          }

          function deepFind(obj: any, depth: number): string | null {
            if (depth > 20 || !obj || typeof obj !== 'object') return null;
            if (obj.itemSectionRenderer?.sectionIdentifier === 'comment-item-section') {
              for (const c of obj.itemSectionRenderer.contents || []) {
                const tok =
                  c?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
                if (tok) return tok;
              }
            }
            if (obj.continuationEndpoint?.continuationCommand?.token) {
              return obj.continuationEndpoint.continuationCommand.token;
            }
            if (Array.isArray(obj)) {
              for (const item of obj) {
                const r = deepFind(item, depth + 1);
                if (r) return r;
              }
            } else {
              for (const key of Object.keys(obj)) {
                const r = deepFind(obj[key], depth + 1);
                if (r) return r;
              }
            }
            return null;
          }
        },
      });
      return results?.[0]?.result ?? null;
    } catch {
      return null;
    }
  }

  private static async fetchTokenViaApi(
    tabId: number,
    apiKey: string,
    context: object,
    videoId: string
  ): Promise<string | null> {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (key: string, ctx: any, vid: string) => {
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          try {
            const m = document.cookie.match(/SAPISID=([^;]+)/) ||
                      document.cookie.match(/__Secure-3PAPISID=([^;]+)/);
            if (m) {
              const ts = Math.floor(Date.now() / 1000);
              const buf = await crypto.subtle.digest(
                'SHA-1', new TextEncoder().encode(`${ts} ${m[1]} https://www.youtube.com`));
              const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
              headers['Authorization'] = `SAPISIDHASH ${ts}_${hex}`;
              headers['X-Origin'] = 'https://www.youtube.com';
              headers['X-Goog-AuthUser'] = '0';
            }
          } catch {}

          const resp = await fetch(
            `https://www.youtube.com/youtubei/v1/next?prettyPrint=false${key ? `&key=${key}` : ''}`,
            { method: 'POST', headers, body: JSON.stringify({ context: ctx, videoId: vid }) }
          );
          if (!resp.ok) return null;
          const data = await resp.json();
          return findCommentToken(data, 0);
        } catch {
          return null;
        }

        function findCommentToken(obj: any, depth: number): string | null {
          if (depth > 20 || !obj || typeof obj !== 'object') return null;
          if (obj.itemSectionRenderer?.sectionIdentifier === 'comment-item-section') {
            for (const c of obj.itemSectionRenderer.contents || []) {
              const tok = c?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
              if (tok) return tok;
            }
          }
          if (obj.continuationEndpoint?.continuationCommand?.token) {
            return obj.continuationEndpoint.continuationCommand.token;
          }
          if (Array.isArray(obj)) {
            for (const item of obj) { const r = findCommentToken(item, depth + 1); if (r) return r; }
          } else {
            for (const k of Object.keys(obj)) { const r = findCommentToken(obj[k], depth + 1); if (r) return r; }
          }
          return null;
        }
      },
      args: [apiKey, context, videoId],
    });
    return results?.[0]?.result ?? null;
  }

  /**
   * Fetch one page of comments via InnerTube /next.
   * Handles both legacy commentRenderer and new commentViewModel formats.
   */
  private static async fetchCommentsPage(
    tabId: number,
    apiKey: string,
    context: object,
    continuationToken: string,
    sortBy: 'top' | 'newest' = 'top'
  ): Promise<PageResult> {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (key: string, ctx: any, token: string, sort: string) => {
        try {
          // --- SAPISIDHASH auth ---
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          try {
            const m = document.cookie.match(/SAPISID=([^;]+)/) ||
                      document.cookie.match(/__Secure-3PAPISID=([^;]+)/);
            if (m) {
              const ts = Math.floor(Date.now() / 1000);
              const buf = await crypto.subtle.digest(
                'SHA-1', new TextEncoder().encode(`${ts} ${m[1]} https://www.youtube.com`));
              const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
              headers['Authorization'] = `SAPISIDHASH ${ts}_${hex}`;
              headers['X-Origin'] = 'https://www.youtube.com';
              headers['X-Goog-AuthUser'] = '0';
            }
          } catch {}

          const resp = await fetch(
            `https://www.youtube.com/youtubei/v1/next?prettyPrint=false${key ? `&key=${key}` : ''}`,
            { method: 'POST', headers, body: JSON.stringify({ context: ctx, continuation: token }) }
          );
          if (!resp.ok) {
            return { error: `HTTP ${resp.status}`, comments: [], nextContinuation: null };
          }

          const data = await resp.json();

          // --- Build entity map from frameworkUpdates (new commentViewModel format) ---
          const entityMap: Record<string, any> = {};
          const mutations = data?.frameworkUpdates?.entityBatchUpdate?.mutations;
          if (Array.isArray(mutations)) {
            for (const mutation of mutations) {
              if (mutation.payload?.commentEntityPayload) {
                const entity = mutation.payload.commentEntityPayload;
                const entityKey = entity.key || mutation.entityKey;
                if (entityKey) entityMap[entityKey] = entity;
              }
            }
          }

          // --- Helpers ---
          const getPath = (obj: any, ...keys: string[]): any => {
            let cur = obj;
            for (const k of keys) {
              if (cur == null || typeof cur !== 'object') return undefined;
              cur = cur[k];
            }
            return cur;
          };

          const parseRuns = (runs: any): string => {
            if (!Array.isArray(runs)) return '';
            return runs.map((r: any) => r?.text || '').join('');
          };

          // Parse legacy commentRenderer
          const parseLegacyComment = (renderer: any) => ({
            id: renderer.commentId || '',
            author:
              parseRuns(getPath(renderer, 'authorText', 'runs')) ||
              getPath(renderer, 'authorText', 'simpleText') || '',
            text: parseRuns(getPath(renderer, 'contentText', 'runs')),
            likeCount: parseInt(
              String(
                getPath(renderer, 'voteCount', 'simpleText') ||
                getPath(renderer, 'voteCount', 'accessibility', 'accessibilityData', 'label') || '0'
              ).replace(/[^0-9]/g, '') || '0', 10),
            publishedAt:
              getPath(renderer, 'publishedTimeText', 'runs', '0', 'text') ||
              getPath(renderer, 'publishedTimeText', 'simpleText') || '',
          });

          // Parse new commentViewModel via entity map
          const parseViewModelComment = (vm: any) => {
            const commentKey = vm.commentKey || vm.commentId || '';
            const entity = entityMap[commentKey];

            if (entity) {
              const props = entity.properties || {};
              const author = entity.author || {};
              const toolbar = entity.toolbar || {};

              return {
                id: props.commentId || commentKey,
                author: author.displayName || '',
                text: props.content?.content || '',
                likeCount: parseInt(
                  String(toolbar.likeCountNotliked || toolbar.likeCountLiked || '0')
                    .replace(/[^0-9]/g, '') || '0', 10),
                publishedAt: props.publishedTime || '',
              };
            }

            // Fallback: try to extract inline data from the viewModel itself
            return {
              id: vm.commentId || commentKey,
              author: vm.authorText?.content || vm.authorText?.simpleText || '',
              text: vm.contentText?.content || vm.contentText?.simpleText || '',
              likeCount: parseInt(
                String(vm.likeCount || vm.voteCount || '0')
                  .replace(/[^0-9]/g, '') || '0', 10),
              publishedAt: vm.publishedTime || vm.publishedTimeText || '',
            };
          };

          // --- Parse response ---
          const comments: any[] = [];
          let nextContinuation: string | null = null;

          const endpoints = data?.onResponseReceivedEndpoints;
          if (Array.isArray(endpoints)) {
            for (const endpoint of endpoints) {
              const items =
                endpoint.appendContinuationItemsAction?.continuationItems ||
                endpoint.reloadContinuationItemsCommand?.continuationItems;
              if (!Array.isArray(items)) continue;

              for (const item of items) {
                const thread = item.commentThreadRenderer;
                if (thread) {
                  let parsed: any = null;

                  // Legacy format: thread.comment.commentRenderer
                  const cr = thread.comment?.commentRenderer;
                  if (cr) {
                    parsed = parseLegacyComment(cr);
                  }

                  // New format: thread.commentViewModel.commentViewModel
                  if (!parsed && thread.commentViewModel) {
                    const vm = thread.commentViewModel.commentViewModel || thread.commentViewModel;
                    if (vm) {
                      parsed = parseViewModelComment(vm);
                    }
                  }

                  if (parsed) {
                    comments.push(parsed);
                  }
                }

                // commentsHeaderRenderer — extract sort menu continuation
                const header = item.commentsHeaderRenderer;
                if (header && !nextContinuation) {
                  const sortItems =
                    header.sortMenu?.sortFilterSubMenuRenderer?.subMenuItems;
                  if (Array.isArray(sortItems) && sortItems.length >= 2) {
                    const sortIndex = sort === 'newest' ? 1 : 0;
                    const tok = sortItems[sortIndex]?.serviceEndpoint?.continuationCommand?.token;
                    if (tok) nextContinuation = tok;
                  }
                  // Fallback: try first item
                  if (!nextContinuation && Array.isArray(sortItems)) {
                    for (const si of sortItems) {
                      const tok = si.serviceEndpoint?.continuationCommand?.token;
                      if (tok) { nextContinuation = tok; break; }
                    }
                  }
                  // Deep search fallback
                  if (!nextContinuation) {
                    const df = (obj: any, d: number): string | null => {
                      if (d > 10 || !obj || typeof obj !== 'object') return null;
                      if (obj.continuationCommand?.token) return obj.continuationCommand.token;
                      if (Array.isArray(obj)) {
                        for (const x of obj) { const r = df(x, d+1); if (r) return r; }
                      } else {
                        for (const k of Object.keys(obj)) { const r = df(obj[k], d+1); if (r) return r; }
                      }
                      return null;
                    };
                    nextContinuation = df(header, 0);
                  }
                }

                // continuationItemRenderer — next page token
                const ci = item.continuationItemRenderer;
                if (ci) {
                  const tok =
                    getPath(ci, 'continuationEndpoint', 'continuationCommand', 'token') ||
                    getPath(ci, 'button', 'buttonRenderer', 'command', 'continuationCommand', 'token');
                  if (tok) nextContinuation = tok;
                }
              }
            }
          }

          return { comments, nextContinuation, error: null };
        } catch (err) {
          return { comments: [], nextContinuation: null, error: String(err) };
        }
      },
      args: [apiKey, context, continuationToken, sortBy],
    });

    const result = results?.[0]?.result;
    if (!result) throw new Error('Failed to fetch comments page');
    if (result.error) throw new Error(`InnerTube error: ${result.error}`);

    const comments: Comment[] = (result.comments || []).map((c: any) => ({
      id: c.id || '',
      author: c.author || '',
      text: c.text || '',
      likeCount: c.likeCount || 0,
      publishedAt: c.publishedAt || '',
    }));

    return { comments, nextContinuation: result.nextContinuation };
  }

  private static formatAsMarkdown(
    comments: Comment[],
    meta: VideoMeta,
    videoId: string,
  ): string {
    const lines: string[] = [];
    const parsedDate = new Date().toISOString().split('T')[0];

    lines.push(`# Comments: ${meta.title}`);
    if (meta.channelName) lines.push(`**Channel:** ${meta.channelName}`);
    lines.push(`**URL:** https://www.youtube.com/watch?v=${videoId}`);
    lines.push(`**Parsed:** ${parsedDate}`);
    lines.push(`**Total loaded:** ${comments.length} comments`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (let i = 0; i < comments.length; i++) {
      const c = comments[i];
      const likes = c.likeCount > 0 ? ` (${c.likeCount.toLocaleString()} likes)` : '';
      const date = c.publishedAt ? ` — ${c.publishedAt}` : '';
      lines.push(`## ${i + 1}. ${c.author}${likes}${date}`);
      lines.push('');
      lines.push(c.text.trim());
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }
}
