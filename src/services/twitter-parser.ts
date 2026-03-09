/**
 * Service for extracting tweets/replies from Twitter/X pages.
 * Parses the DOM of the currently loaded page — no API calls needed.
 * Only scrapes what the user has already loaded by scrolling.
 */

interface Tweet {
  author: string;
  handle: string;
  text: string;
  date: string;
  likes: string;
  retweets: string;
  replies: string;
  isMainTweet: boolean;
}

export interface TwitterParseResult {
  text: string;
  title: string;
  tweetCount: number;
}

export class TwitterParser {
  static isTweetPage(url: string): boolean {
    return (url.includes('twitter.com/') || url.includes('x.com/')) &&
      url.includes('/status/');
  }

  static async parseFromPage(tabId: number): Promise<TwitterParseResult> {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const tweets: any[] = [];
        const currentPath = window.location.pathname;
        const statusMatch = currentPath.match(/\/status\/(\d+)/);
        const statusId = statusMatch ? statusMatch[1] : null;

        // Find ALL article elements — Twitter wraps both the focal tweet
        // and replies in <article> tags
        const articles = document.querySelectorAll('article');

        for (const el of articles) {
          try {
            // Author & handle from User-Name
            const userNameEl = el.querySelector('[data-testid="User-Name"]');
            let author = '';
            let handle = '';
            if (userNameEl) {
              const spans = userNameEl.querySelectorAll('span');
              for (const span of spans) {
                const t = span.textContent?.trim() || '';
                if (t.startsWith('@') && !handle) {
                  handle = t;
                } else if (t && !t.includes('·') && !t.includes('…') &&
                           t.length > 1 && !author && !t.startsWith('@')) {
                  author = t;
                }
              }
              if (!handle) {
                const links = userNameEl.querySelectorAll('a[href]');
                for (const link of links) {
                  const href = link.getAttribute('href') || '';
                  if (href.match(/^\/[A-Za-z0-9_]+$/)) {
                    handle = '@' + href.slice(1);
                    break;
                  }
                }
              }
            }

            // Tweet text
            const textEl = el.querySelector('[data-testid="tweetText"]');
            const text = textEl?.textContent?.trim() || '';

            // Date
            const timeEl = el.querySelector('time');
            const date = timeEl?.getAttribute('datetime') || timeEl?.textContent?.trim() || '';

            // Is this the focal tweet? Check if it has a link to the current status
            let isFocal = false;
            if (statusId) {
              const statusLink = el.querySelector(`a[href*="/status/${statusId}"]`);
              if (statusLink) isFocal = true;
            }

            // Metrics — try aria-label on role="group" first (focal tweet format)
            let likes = '0', retweets = '0', repliesCount = '0';
            const metricsGroup = el.querySelector('[role="group"][aria-label]');
            if (metricsGroup) {
              const label = metricsGroup.getAttribute('aria-label') || '';
              // Focal format: "304 replies, 158 reposts, 845 likes, 65 bookmarks, 192907 views"
              const lm = label.match(/([\d,.KMkm]+)\s+like/i);
              const rm = label.match(/([\d,.KMkm]+)\s+repost/i);
              const pm = label.match(/([\d,.KMkm]+)\s+repl/i);
              if (lm) likes = lm[1];
              if (rm) retweets = rm[1];
              if (pm) repliesCount = pm[1];
            }

            // Fallback: button aria-labels (reply format: "845 Likes. Like")
            if (likes === '0' && retweets === '0') {
              const getMetric = (testId: string): string => {
                const btn = el.querySelector(`[data-testid="${testId}"]`);
                if (!btn) return '0';
                const ariaLabel = btn.getAttribute('aria-label') || '';
                const match = ariaLabel.match(/^([\d,.KMkm]+)/);
                if (match) return match[1];
                return '0';
              };
              likes = getMetric('like');
              retweets = getMetric('retweet');
              repliesCount = getMetric('reply');
            }

            if (text || author) {
              tweets.push({
                author, handle, text, date, likes, retweets,
                replies: repliesCount, isMainTweet: isFocal,
              });
            }
          } catch {
            // skip
          }
        }

        // Deduplicate by text
        const seen = new Set<string>();
        const unique: any[] = [];
        for (const t of tweets) {
          const key = t.text.substring(0, 100);
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(t);
          }
        }

        // Ensure focal tweet is first
        const focalIdx = unique.findIndex((t: any) => t.isMainTweet);
        if (focalIdx > 0) {
          const [focal] = unique.splice(focalIdx, 1);
          unique.unshift(focal);
        }

        return { tweets: unique };
      },
    });

    const result = results?.[0]?.result;
    if (!result || !result.tweets || result.tweets.length === 0) {
      throw new Error('No tweets found on this page. Make sure you are on a tweet page and replies are loaded.');
    }

    const tweets: Tweet[] = result.tweets;
    const mainTweet = tweets.find(t => t.isMainTweet) || tweets[0];
    const replies = tweets.filter(t => t !== mainTweet);

    // Format as markdown
    const lines: string[] = [];
    const parsedDate = new Date().toISOString().split('T')[0];

    const title = `Twitter: ${mainTweet.author || mainTweet.handle} — ${mainTweet.text.substring(0, 60)}${mainTweet.text.length > 60 ? '...' : ''}`;

    lines.push(`# ${mainTweet.author} ${mainTweet.handle}`);
    if (mainTweet.date) lines.push(`**Date:** ${mainTweet.date}`);
    lines.push(`**Parsed:** ${parsedDate}`);
    lines.push(`**Replies loaded:** ${replies.length}`);
    lines.push('');
    lines.push(mainTweet.text);
    if (mainTweet.likes !== '0' || mainTweet.retweets !== '0') {
      lines.push('');
      lines.push(`*${mainTweet.likes} likes · ${mainTweet.retweets} retweets · ${mainTweet.replies} replies*`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    for (let i = 0; i < replies.length; i++) {
      const r = replies[i];
      const likes = r.likes !== '0' ? ` (${r.likes} likes)` : '';
      const date = r.date ? ` — ${r.date}` : '';
      lines.push(`## ${i + 1}. ${r.author} ${r.handle}${likes}${date}`);
      lines.push('');
      lines.push(r.text);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return {
      text: lines.join('\n'),
      title,
      tweetCount: tweets.length,
    };
  }
}
