import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { NotebookLMService } from '@/services/notebooklm-api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Clock, XCircle, Trash2, FileText, Globe, Youtube, Type, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import type { Source, UploadItem } from '@/types';

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'file':
    case 'pdf':
      return <FileText className="h-4 w-4" />;
    case 'url':
    case 'page':
      return <Globe className="h-4 w-4" />;
    case 'youtube':
      return <Youtube className="h-4 w-4" />;
    case 'text':
    case 'note':
      return <Type className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

const getStatusIcon = (status: number) => {
  // Status: 0 = pending, 1 = processing, 2 = done, 3 = error
  // For existing sources (status 2), show green checkmark
  switch (status) {
    case 2:
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 3:
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 1:
      return <Clock className="h-4 w-4 text-yellow-500 animate-spin" />;
    default:
      // For status 0 (pending) or unknown, show green checkmark if source exists
      // This means the source is already in the notebook
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  }
};

export function SourcesList() {
  const { selectedNotebookId, uploadQueue } = useStore();
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  // Map upload queue items to sources for display
  const queueItemsMap = new Map<string, UploadItem>();
  uploadQueue.forEach((item) => {
    if (item.status === 'done' || item.status === 'processing') {
      // Try to match by title or URL
      queueItemsMap.set(item.title, item);
    }
  });

  useEffect(() => {
    if (selectedNotebookId) {
      loadSources();
      // Refresh sources every 5 seconds to catch new uploads
      const interval = setInterval(loadSources, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedNotebookId]);

  const loadSources = async () => {
    if (!selectedNotebookId) return;

    setIsLoading(true);
    try {
      const notebook = await NotebookLMService.getNotebook(selectedNotebookId);
      setSources(notebook.sources);
    } catch (error) {
      console.error('Error loading sources:', error);
      toast({
        title: 'Error',
        description: 'Failed to load sources',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSourceSelection = (sourceId: string) => {
    const newSelected = new Set(selectedSources);
    if (newSelected.has(sourceId)) {
      newSelected.delete(sourceId);
    } else {
      newSelected.add(sourceId);
    }
    setSelectedSources(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedSources.size === sources.length) {
      setSelectedSources(new Set());
    } else {
      setSelectedSources(new Set(sources.map((s) => s.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedSources.size === 0) return;

    const count = selectedSources.size;
    const confirmed = confirm(
      `Delete ${count} ${count === 1 ? 'source' : 'sources'}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const sourceIds = Array.from(selectedSources);
      await NotebookLMService.deleteSources(selectedNotebookId!, sourceIds);
      
      toast({
        title: 'Success',
        description: `Successfully deleted ${count} ${count === 1 ? 'source' : 'sources'}`,
      });

      setSelectedSources(new Set());
      await loadSources();
    } catch (error) {
      console.error('Error deleting sources:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete sources',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!selectedNotebookId) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Select a notebook to view sources
      </div>
    );
  }

  if (isLoading && sources.length === 0) {
    return (
      <div className="p-4 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Loading sources...</p>
      </div>
    );
  }

  return (
    <div className="border-t border-border">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">All Sources ({sources.length})</h3>
          {selectedSources.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSelected}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete ({selectedSources.size})
            </Button>
          )}
        </div>

        {sources.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            No sources in this notebook
          </div>
        ) : (
          <div className="space-y-2">
            {/* Select All */}
            <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card">
              <Checkbox
                checked={selectedSources.size === sources.length && sources.length > 0}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm text-muted-foreground">Select all</span>
            </div>

            {/* Sources List */}
            {sources.map((source) => {
              const queueItem = uploadQueue.find(
                (item) =>
                  (item.status === 'processing' || item.status === 'done') &&
                  (item.title === source.title || item.url === source.url)
              );

              return (
                <div
                  key={source.id}
                  className={`rounded-lg border border-border bg-card p-3 space-y-2 ${
                    selectedSources.has(source.id) ? 'ring-2 ring-primary' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <Checkbox
                        checked={selectedSources.has(source.id)}
                        onCheckedChange={() => toggleSourceSelection(source.id)}
                        className="mt-1"
                      />
                      {getTypeIcon(source.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{source.title}</p>
                        {source.url && (
                          <p className="text-xs text-muted-foreground truncate">{source.url}</p>
                        )}
                        {queueItem && queueItem.status === 'processing' && (
                          <p className="text-xs text-yellow-600 mt-1">
                            Uploading... {queueItem.progress !== undefined && `${Math.round(queueItem.progress)}%`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {queueItem ? (
                        queueItem.status === 'processing' ? (
                          <Clock className="h-4 w-4 text-yellow-500 animate-spin" />
                        ) : queueItem.status === 'done' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : null
                      ) : (
                        getStatusIcon(source.status)
                      )}
                    </div>
                  </div>
                  {queueItem && queueItem.progress !== undefined && queueItem.progress < 100 && (
                    <Progress value={queueItem.progress} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
