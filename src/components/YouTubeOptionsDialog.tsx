import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ContentParser } from '@/services/content-parser';
import { Youtube, List, User, MessageSquare } from 'lucide-react';

export type CommentSort = 'top' | 'newest';
export type CommentLimit = 100 | 500 | 1000 | 0; // 0 = all

interface YouTubeOptionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (
    option: 'video' | 'playlist' | 'channel' | 'comments',
    videoUrls: string[],
    opts?: {
      videoTitles?: string[];
      maxComments?: CommentLimit;
      commentSort?: CommentSort;
    }
  ) => void;
}

export function YouTubeOptionsDialog({ isOpen, onClose, onSelect }: YouTubeOptionsDialogProps) {
  const [youtubeInfo, setYoutubeInfo] = useState<{
    type: 'video' | 'playlist' | 'playlist_video' | 'channel' | null;
    videoUrls?: string[];
    videoTitles?: string[];
    title?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [maxComments, setMaxComments] = useState<CommentLimit>(500);
  const [commentSort, setCommentSort] = useState<CommentSort>('top');

  useEffect(() => {
    if (isOpen) {
      loadYouTubeInfo();
    }
  }, [isOpen]);

  const loadYouTubeInfo = async () => {
    setIsLoading(true);
    try {
      const info = await ContentParser.detectYouTubePageType();
      setYoutubeInfo(info);
    } catch (error) {
      console.error('Error loading YouTube info:', error);
      setYoutubeInfo({ type: 'video', videoUrls: [], videoTitles: [] });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSelect = async (option: 'video' | 'playlist' | 'channel' | 'comments') => {
    if (!youtubeInfo) return;

    if (option === 'comments') {
      onSelect('comments', [], { maxComments, commentSort });
      onClose();
      return;
    }

    let videoUrls: string[] = [];
    let videoTitles: string[] = [];

    if (option === 'video') {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab.url) {
          const url = new URL(tab.url);
          const videoId = url.searchParams.get('v');
          if (videoId) {
            videoUrls = [`https://www.youtube.com/watch?v=${videoId}`];
          } else {
            videoUrls = [tab.url];
          }
          videoTitles = [youtubeInfo.title || tab.title || ''];
        }
      } catch (error) {
        console.error('Error getting current video URL:', error);
        videoUrls = youtubeInfo.videoUrls || [];
        videoTitles = youtubeInfo.videoTitles || [];
      }
    } else if (option === 'playlist' && youtubeInfo.videoUrls) {
      videoUrls = youtubeInfo.videoUrls;
      videoTitles = youtubeInfo.videoTitles || [];
    } else if (option === 'channel' && youtubeInfo.videoUrls) {
      videoUrls = youtubeInfo.videoUrls;
      videoTitles = youtubeInfo.videoTitles || [];
    }

    onSelect(option, videoUrls, { videoTitles });
    onClose();
  };

  if (isLoading || youtubeInfo === null) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4">
          <p className="text-center">Loading YouTube information...</p>
        </div>
      </div>
    );
  }

  if (!youtubeInfo.type) {
    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={onClose}
      >
        <div
          className="bg-card rounded-lg p-6 max-w-md w-full mx-4 border border-border shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-center text-muted-foreground mb-4">
            This page is not a YouTube video or playlist.
          </p>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  const { type, videoUrls = [], title } = youtubeInfo;
  const hasPlaylist = type === 'playlist' || type === 'playlist_video';
  const hasChannel = type === 'channel';
  const isVideoPage = type === 'video' || type === 'playlist_video';
  const playlistCount = hasPlaylist ? videoUrls.length : 0;
  const channelCount = hasChannel ? videoUrls.length : 0;

  const commentLimits: { value: CommentLimit; label: string }[] = [
    { value: 100, label: '100' },
    { value: 500, label: '500' },
    { value: 1000, label: '1000' },
    { value: 0, label: 'All' },
  ];

  const sortOptions: { value: CommentSort; label: string }[] = [
    { value: 'top', label: 'Top' },
    { value: 'newest', label: 'Newest' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-card rounded-lg p-6 max-w-md w-full mx-4 border border-border shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">Select YouTube Action</h3>
        {title && <p className="text-sm text-muted-foreground mb-4">{title}</p>}

        <div className="space-y-3">
          {/* Option 1: Current Video */}
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => handleSelect('video')}
          >
            <Youtube className="mr-2 h-4 w-4" />
            <div className="flex-1 text-left">
              <div className="font-medium">Add current video</div>
              <div className="text-xs text-muted-foreground">This video only</div>
            </div>
          </Button>

          {/* Option 2: Playlist */}
          {hasPlaylist && playlistCount > 0 && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleSelect('playlist')}
            >
              <List className="mr-2 h-4 w-4" />
              <div className="flex-1 text-left">
              <div className="font-medium">Add entire playlist</div>
              <div className="text-xs text-muted-foreground">
                {playlistCount} {playlistCount === 1 ? 'video' : 'videos'}
              </div>
              </div>
            </Button>
          )}

          {/* Option 3: Channel */}
          {hasChannel && channelCount > 0 && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleSelect('channel')}
            >
              <User className="mr-2 h-4 w-4" />
              <div className="flex-1 text-left">
              <div className="font-medium">Add all channel videos</div>
              <div className="text-xs text-muted-foreground">
                {channelCount} {channelCount === 1 ? 'video' : 'videos'}
              </div>
              </div>
            </Button>
          )}

          {/* Option 4: Import Comments */}
          {isVideoPage && (
            <div className="border-t border-border pt-3 space-y-3">
              {/* Sort order */}
              <div className="flex items-center gap-2 px-1">
                <span className="text-sm text-muted-foreground w-12 shrink-0">Sort:</span>
                <div className="flex gap-1 flex-1">
                  {sortOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setCommentSort(opt.value)}
                      className={`flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        commentSort === opt.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border hover:bg-accent'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment count */}
              <div className="flex items-center gap-2 px-1">
                <span className="text-sm text-muted-foreground w-12 shrink-0">Count:</span>
                <div className="flex gap-1 flex-1">
                  {commentLimits.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setMaxComments(opt.value)}
                      className={`flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        maxComments === opt.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border hover:bg-accent'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Import button */}
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleSelect('comments')}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                <div className="flex-1 text-left">
                  <div className="font-medium">Import Comments</div>
                  <div className="text-xs text-muted-foreground">
                    {commentSort === 'top' ? 'Top' : 'Newest'} {maxComments === 0 ? 'all' : maxComments} comments
                  </div>
                </div>
              </Button>
            </div>
          )}
        </div>

        <Button variant="ghost" className="w-full mt-4" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
