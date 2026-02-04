import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ContentParser } from '@/services/content-parser';
import { Youtube, List, User } from 'lucide-react';

interface YouTubeOptionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (option: 'video' | 'playlist' | 'channel', videoUrls: string[]) => void;
}

export function YouTubeOptionsDialog({ isOpen, onClose, onSelect }: YouTubeOptionsDialogProps) {
  const [youtubeInfo, setYoutubeInfo] = useState<{
    type: 'video' | 'playlist' | 'playlist_video' | 'channel' | null;
    videoUrls?: string[];
    title?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
      setYoutubeInfo({ type: 'video', videoUrls: [] });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSelect = async (option: 'video' | 'playlist' | 'channel') => {
    if (!youtubeInfo) return;

    let videoUrls: string[] = [];

    if (option === 'video') {
      // Single video - get current video URL
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
        }
      } catch (error) {
        console.error('Error getting current video URL:', error);
        // Fallback
        videoUrls = youtubeInfo.videoUrls || [];
      }
    } else if (option === 'playlist' && youtubeInfo.videoUrls) {
      videoUrls = youtubeInfo.videoUrls;
    } else if (option === 'channel' && youtubeInfo.videoUrls) {
      videoUrls = youtubeInfo.videoUrls;
    }

    onSelect(option, videoUrls);
    onClose();
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4">
          <p className="text-center">Loading YouTube information...</p>
        </div>
      </div>
    );
  }

  if (!youtubeInfo || !youtubeInfo.type) {
    return null;
  }

  const { type, videoUrls = [], title } = youtubeInfo;
  const hasPlaylist = type === 'playlist' || type === 'playlist_video';
  const hasChannel = type === 'channel';
  const playlistCount = hasPlaylist ? videoUrls.length : 0;
  const channelCount = hasChannel ? videoUrls.length : 0;

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
        </div>

        <Button variant="ghost" className="w-full mt-4" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
