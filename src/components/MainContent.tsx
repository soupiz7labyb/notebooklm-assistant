import { useState, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { UploadQueue } from '@/services/upload-queue';
import { ContentParser } from '@/services/content-parser';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { FileProcessor } from '@/services/file-processor';
import { YouTubeOptionsDialog } from '@/components/YouTubeOptionsDialog';
import { Globe, Type, Upload } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import type { UploadItem } from '@/types';

export function MainContent() {
  const { auth, selectedNotebookId } = useStore();
  const [quickNote, setQuickNote] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showYouTubeDialog, setShowYouTubeDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  if (!auth.isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-muted-foreground">Please authenticate to use NotebookLM Assistant</p>
      </div>
    );
  }

  if (!selectedNotebookId) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-muted-foreground">Please select or create a notebook</p>
      </div>
    );
  }

  const handleAddCurrentPage = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.url) {
        throw new Error('No active tab found');
      }

      const url = tab.url;
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
      
      if (isYouTube) {
        // Check if it's a channel page - if so, add just the channel URL, not all videos
        const isChannelPage = url.includes('/@') || url.includes('/channel/') || url.includes('/c/');
        
        if (isChannelPage) {
          // For channel pages, add just the channel URL
          const item: UploadItem = {
            id: crypto.randomUUID(),
            type: 'page',
            title: tab.title || 'YouTube Channel',
            content: '',
            url: url,
            status: 'pending',
            notebookId: selectedNotebookId,
          };
          await UploadQueue.addAndProcess(item);
          toast({
            title: 'Added to queue',
            description: 'Channel page will be uploaded shortly',
          });
        } else {
          // For video/playlist pages, show YouTube options dialog
          setShowYouTubeDialog(true);
        }
      } else {
        const content = await ContentParser.parseCurrentPage();
        const item: UploadItem = {
          id: crypto.randomUUID(),
          type: 'page',
          title: content.title,
          content: content.text,
          url: content.url,
          status: 'pending',
          notebookId: selectedNotebookId,
        };
        await UploadQueue.addAndProcess(item);
        toast({
          title: 'Added to queue',
          description: 'Content will be uploaded shortly',
        });
      }
    } catch (error) {
      console.error('Error adding page:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add page',
        variant: 'destructive',
      });
    }
  };

  const handleYouTubeOptionSelect = async (option: 'video' | 'playlist' | 'channel', videoUrls: string[]) => {
    try {
      if (option === 'video' && videoUrls.length > 0) {
        // Single video
        const videoInfo = await ContentParser.getYouTubeInfo();
        const item: UploadItem = {
          id: crypto.randomUUID(),
          type: 'youtube',
          title: videoInfo.title,
          url: videoUrls[0],
          status: 'pending',
          notebookId: selectedNotebookId,
        };
        await UploadQueue.addAndProcess(item);
        toast({
          title: 'Added to queue',
          description: 'Video will be uploaded shortly',
        });
      } else if (option === 'playlist' && videoUrls.length > 0) {
        // Add all playlist videos to queue (they will be processed sequentially)
        for (let i = 0; i < videoUrls.length; i++) {
          const videoUrl = videoUrls[i];
          const item: UploadItem = {
            id: crypto.randomUUID(),
            type: 'youtube',
            title: `Playlist Video ${i + 1}`,
            url: videoUrl,
            status: 'pending',
            notebookId: selectedNotebookId,
          };
          // Add to queue without processing immediately - queue will handle it
          useStore.getState().addToQueue(item);
        }
        // Start processing queue
        UploadQueue.processQueue();
        toast({
          title: 'Added to queue',
          description: `Added ${videoUrls.length} videos from playlist`,
        });
      } else if (option === 'channel' && videoUrls.length > 0) {
        // Add all channel videos to queue (they will be processed sequentially)
        for (let i = 0; i < videoUrls.length; i++) {
          const videoUrl = videoUrls[i];
          const item: UploadItem = {
            id: crypto.randomUUID(),
            type: 'youtube',
            title: `Channel Video ${i + 1}`,
            url: videoUrl,
            status: 'pending',
            notebookId: selectedNotebookId,
          };
          // Add to queue without processing immediately - queue will handle it
          useStore.getState().addToQueue(item);
        }
        // Start processing queue
        UploadQueue.processQueue();
        toast({
          title: 'Added to queue',
          description: `Added ${videoUrls.length} videos from channel`,
        });
      }
    } catch (error) {
      console.error('Error adding YouTube content:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add YouTube content',
        variant: 'destructive',
      });
    }
  };

  const handleAddQuickNote = async () => {
    if (!quickNote.trim() || !noteTitle.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter both title and note content',
        variant: 'destructive',
      });
      return;
    }

    try {
      const item: UploadItem = {
        id: crypto.randomUUID(),
        type: 'note',
        title: noteTitle,
        content: quickNote,
        status: 'pending',
        notebookId: selectedNotebookId,
      };

      await UploadQueue.addAndProcess(item);
      setQuickNote('');
      setNoteTitle('');
      toast({
        title: 'Added to queue',
        description: 'Note will be uploaded shortly',
      });
    } catch (error) {
      console.error('Error adding note:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add note',
        variant: 'destructive',
      });
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      try {
        const processed = await FileProcessor.processFile(file);
        const item: UploadItem = {
          id: crypto.randomUUID(),
          type: 'file',
          title: file.name,
          file,
          status: 'pending',
          notebookId: selectedNotebookId,
          chunks: processed.needsChunking ? processed.chunks?.length : undefined,
        };

        await UploadQueue.addAndProcess(item);
      } catch (error) {
        console.error('Error processing file:', error);
        toast({
          title: 'Error',
          description: `Failed to process ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: 'destructive',
        });
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  return (
    <>
      <YouTubeOptionsDialog
        isOpen={showYouTubeDialog}
        onClose={() => setShowYouTubeDialog(false)}
        onSelect={handleYouTubeOptionSelect}
      />
      <div className="flex flex-col gap-4 p-4">
        {/* Main Actions */}
        <div className="space-y-3">
          <Button
            onClick={handleAddCurrentPage}
            className="w-full"
            size="lg"
          >
            <Globe className="mr-2 h-4 w-4" />
            Add Current Page
          </Button>

          {/* Quick Note */}
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4" />
            <h3 className="font-semibold">Quick Note</h3>
          </div>
          <Input
            placeholder="Note title..."
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
          />
          <Textarea
            placeholder="Enter your note here..."
            value={quickNote}
            onChange={(e) => setQuickNote(e.target.value)}
            rows={4}
          />
          <Button onClick={handleAddQuickNote} className="w-full" variant="outline">
            Add Note
          </Button>
          </div>

          {/* File Upload */}
          <div
          className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border bg-card hover:border-primary/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-2">
            Drag & drop files here, or click to select
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Supports: PDF, TXT, MD, DOCX
          </p>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            Select Files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.markdown,.docx"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </div>
        </div>
      </div>
    </>
  );
}
