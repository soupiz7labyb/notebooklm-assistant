import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { NotebookLMService } from '@/services/notebooklm-api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  FileText,
  Globe,
  Youtube,
  Type,
  Loader2,
  Download,
  Search,
  Filter,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { ExportDialog } from '@/components/ExportDialog';
import type { Source, UploadItem } from '@/types';
import type { SourceContent, SourceFilterType } from '@/types/export';

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'file':
    case 'pdf':
      return <FileText className="h-4 w-4" />;
    case 'url':
    case 'page':
    case 'gdrive':
      return <Globe className="h-4 w-4" />;
    case 'youtube':
    case 'video':
      return <Youtube className="h-4 w-4" />;
    case 'text':
    case 'note':
    case 'mindmap':
      return <Type className="h-4 w-4" />;
    case 'image':
      return <FileText className="h-4 w-4" />;
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

const SOURCE_TYPE_FILTERS: { value: SourceFilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pdf', label: 'PDF' },
  { value: 'url', label: 'Web' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'text', label: 'Text' },
  { value: 'note', label: 'Note' },
  { value: 'gdrive', label: 'Drive' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'file', label: 'Files' },
];

export function SourcesList() {
  const { selectedNotebookId, notebooks, uploadQueue } = useStore();
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilterRaw] = useState<SourceFilterType>('all');
  const [showFilters, setShowFilters] = useState(false);

  // When filter changes, clear selected sources
  const setSourceFilter = (filter: SourceFilterType) => {
    setSourceFilterRaw(filter);
    setSelectedSources(new Set());
  };
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
    // Clear previous notebook's state when switching
    setSources([]);
    setSelectedSources(new Set());
    setShowExport(false);
    setSearchQuery('');
    setSourceFilterRaw('all');

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
    if (selectedSources.size === filteredSources.length) {
      setSelectedSources(new Set());
    } else {
      setSelectedSources(new Set(filteredSources.map((s) => s.id)));
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

  // Filter sources
  const filteredSources = sources.filter((source) => {
    // Type filter (with grouping: 'file' matches gdrive, image, video too)
    if (sourceFilter !== 'all') {
      if (sourceFilter === 'file') {
        if (!['file', 'gdrive', 'image', 'video'].includes(source.type)) return false;
      } else if (sourceFilter === 'youtube') {
        if (!['youtube', 'video'].includes(source.type)) return false;
      } else if (source.type !== sourceFilter) {
        return false;
      }
    }
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return (
        source.title.toLowerCase().includes(query) ||
        (source.url && source.url.toLowerCase().includes(query)) ||
        source.type.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Get current notebook title
  const currentNotebook = notebooks.find((n) => n.id === selectedNotebookId);
  const notebookTitle = currentNotebook?.name || 'Notebook';

  // Convert sources to SourceContent for export
  const sourcesForExport: SourceContent[] = sources.map((s) => ({
    id: s.id,
    title: s.title,
    type: s.type,
    typeCode: s.typeCode,
    url: s.url,
    status: s.status,
  }));

  if (!selectedNotebookId) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Select a notebook to view sources
      </div>
    );
  }

  // Show Export Dialog as full overlay
  if (showExport) {
    return (
      <ExportDialog
        notebookId={selectedNotebookId}
        notebookTitle={notebookTitle}
        onClose={() => setShowExport(false)}
        initialSources={sourcesForExport}
      />
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
        {/* Header with Export button */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">All Sources ({sources.length})</h3>
          <div className="flex items-center gap-2">
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExport(true)}
              title="Export notebook content"
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        {sources.length > 0 && (
          <div className="space-y-2 mb-3">
            {/* Search Bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search sources..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <Button
                variant={showFilters ? 'secondary' : 'outline'}
                size="sm"
                className="h-8 px-2"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Type Filters */}
            {showFilters && (
              <div className="flex items-center gap-1 flex-wrap">
                {SOURCE_TYPE_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      sourceFilter === filter.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                    onClick={() => setSourceFilter(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {filteredSources.length === 0 && sources.length > 0 ? (
          <div className="text-center text-sm text-muted-foreground py-4">
            No sources match your search
          </div>
        ) : sources.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            No sources in this notebook
          </div>
        ) : (
          <div className="space-y-2">
            {/* Select All */}
            <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card">
              <Checkbox
                checked={selectedSources.size === filteredSources.length && filteredSources.length > 0}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm text-muted-foreground">
                Select all{sourceFilter !== 'all' || searchQuery ? ` (${filteredSources.length} shown)` : ''}
              </span>
            </div>

            {/* Sources List */}
            {filteredSources.map((source) => {
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
                      <span className="text-[10px] text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded">
                        {source.type}
                      </span>
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
