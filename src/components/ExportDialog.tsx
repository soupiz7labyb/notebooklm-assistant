import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import {
  ArrowLeft,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  Loader2,
  FileText,
  Globe,
  Youtube,
  Type,
  Trash2,
  Package,
  Filter,
  Image,
  Video,
  StickyNote,
  HardDrive,
  Presentation,
} from 'lucide-react';
import type {
  ExportCategory,
  NotebookFullContent,
  SourceContent,
  SourceFilterType,
  BatchMode,
  FormatOption,
} from '@/types/export';
import { CATEGORY_CONFIGS, ExportService } from '@/services/export-service';
import { NotebookLMService } from '@/services/notebooklm-api';

interface ExportDialogProps {
  notebookId: string;
  notebookTitle: string;
  onClose: () => void;
  initialSources?: SourceContent[];
}

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

const getSourceTypeIcon = (type: string) => {
  switch (type) {
    case 'pdf':
      return <FileText className="h-3.5 w-3.5" />;
    case 'url':
      return <Globe className="h-3.5 w-3.5" />;
    case 'youtube':
      return <Youtube className="h-3.5 w-3.5" />;
    case 'text':
      return <Type className="h-3.5 w-3.5" />;
    case 'note':
      return <StickyNote className="h-3.5 w-3.5" />;
    case 'image':
      return <Image className="h-3.5 w-3.5" />;
    case 'video':
      return <Video className="h-3.5 w-3.5" />;
    case 'gdrive':
      return <HardDrive className="h-3.5 w-3.5" />;
    case 'slides':
      return <Presentation className="h-3.5 w-3.5" />;
    default:
      return <FileText className="h-3.5 w-3.5" />;
  }
};

export function ExportDialog({
  notebookId,
  notebookTitle,
  onClose,
  initialSources,
}: ExportDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [content, setContent] = useState<NotebookFullContent | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<ExportCategory>>(
    new Set(['sources'])
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilterRaw] = useState<SourceFilterType>('all');
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());

  // When filter changes, clear selected sources
  const setSourceFilter = (filter: SourceFilterType) => {
    setSourceFilterRaw(filter);
    setSelectedSourceIds(new Set());
  };
  const [exportingCategory, setExportingCategory] = useState<string | null>(null);
  const [batchModes, setBatchModes] = useState<Record<string, BatchMode>>({});
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [selectedSlideIds, setSelectedSlideIds] = useState<Set<string>>(new Set());
  const [selectedInfographicIds, setSelectedInfographicIds] = useState<Set<string>>(new Set());
  const [selectedFlashcardArtifactIds, setSelectedFlashcardArtifactIds] = useState<Set<string>>(new Set());
  const [selectedQuizArtifactIds, setSelectedQuizArtifactIds] = useState<Set<string>>(new Set());
  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(new Set());
  const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set());

  const [isLoadingFlashcards, setIsLoadingFlashcards] = useState(false);
  const loadingRef = useRef(false); // guard against double-calls

  // Load notebook content on mount or notebook change
  useEffect(() => {
    // Reset state when switching notebooks
    setSelectedSourceIds(new Set());
    setSelectedSlideIds(new Set());
    setSelectedInfographicIds(new Set());
    setSelectedFlashcardArtifactIds(new Set());
    setSelectedQuizArtifactIds(new Set());
    setSelectedTableIds(new Set());
    setSelectedReportIds(new Set());
    setSearchQuery('');
    setSourceFilterRaw('all');
    setExpandedCategories(new Set(['sources']));
    setExportingCategory(null);
    setIsLoadingFlashcards(false);
    loadingRef.current = false;
    loadContent();
  }, [notebookId]);

  const loadContent = async () => {
    if (loadingRef.current) {
      console.log('loadContent already in progress, skipping');
      return;
    }
    loadingRef.current = true;
    setIsLoading(true);
    try {
      const fullContent = await ExportService.loadNotebookContent(notebookId);

      // Use initial sources if provided (they have the same data)
      if (initialSources && initialSources.length > 0) {
        fullContent.sources = initialSources;
      }

      setContent(fullContent);
      setIsLoading(false);

      // After main content is displayed, check if we need to load flashcards asynchronously
      const hasFlashcardArtifacts = !!fullContent.artifacts?.some(
        (a) => [2, 4, 7, 9].includes(a.typeCode) && (a.status === 3 || a.status === 0)
      );

      if (hasFlashcardArtifacts) {
        setIsLoadingFlashcards(true);
        try {
          const { flashcards, quizzes, tables, notes, infographics } =
            await ExportService.loadFlashcardsAsync(notebookId, fullContent.artifacts);
          if (flashcards.length > 0 || quizzes.length > 0 || tables.length > 0 || notes.length > 0 || infographics.length > 0) {
            setContent((prev) => prev ? {
              ...prev,
              flashcards: flashcards.length > 0 ? flashcards : prev.flashcards,
              quizzes: quizzes.length > 0 ? quizzes : prev.quizzes,
              tables: tables.length > 0 ? tables : prev.tables,
              notes: notes.length > 0 ? notes : prev.notes,
              infographics: infographics.length > 0 ? infographics : prev.infographics,
            } : prev);
            toast({
              title: 'Artifacts loaded',
              description: `flashcards: ${flashcards.length}, quiz: ${quizzes.length}, tables: ${tables.length}, reports: ${notes.length}, infographics: ${infographics.length}`,
            });
          }
        } catch (e) {
          console.log('Async flashcard loading failed:', e);
        } finally {
          setIsLoadingFlashcards(false);
        }
      }
    } catch (error) {
      console.error('Error loading notebook content:', error);
      toast({
        title: 'Error',
        description: 'Failed to load notebook content',
        variant: 'destructive',
      });
      setIsLoading(false);
    } finally {
      loadingRef.current = false;
    }
  };

  // Filter sources based on search and type filter
  const filteredSources = useMemo(() => {
    if (!content) return [];

    let sources = content.sources;

    // Apply type filter
    if (sourceFilter !== 'all') {
      sources = sources.filter((s) => {
        if (s.type === sourceFilter) return true;
        // Group related types
        if (sourceFilter === 'file') return ['gdrive', 'slides'].includes(s.type);
        if (sourceFilter === 'pdf') return ['pdf'].includes(s.type);
        return false;
      });
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      sources = sources.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          (s.url && s.url.toLowerCase().includes(query)) ||
          s.type.toLowerCase().includes(query)
      );
    }

    return sources;
  }, [content, sourceFilter, searchQuery]);

  // Category counts
  const categoryCounts = useMemo(() => {
    if (!content) return {} as Record<ExportCategory, number>;
    return ExportService.getCategoryCounts(content);
  }, [content]);

  const toggleCategory = (category: ExportCategory) => {
    const next = new Set(expandedCategories);
    if (next.has(category)) {
      next.delete(category);
    } else {
      next.add(category);
    }
    setExpandedCategories(next);
  };

  const toggleSourceSelection = (id: string) => {
    const next = new Set(selectedSourceIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedSourceIds(next);
  };

  const toggleSelectAllSources = () => {
    if (selectedSourceIds.size === filteredSources.length) {
      setSelectedSourceIds(new Set());
    } else {
      setSelectedSourceIds(new Set(filteredSources.map((s) => s.id)));
    }
  };

  // Determine export formats based on selected/filtered source types
  const getSourceExportFormats = (): FormatOption[] => {
    const config = CATEGORY_CONFIGS.find((c) => c.id === 'sources')!;
    const sourcesToCheck = selectedSourceIds.size > 0
      ? filteredSources.filter((s) => selectedSourceIds.has(s.id))
      : filteredSources;

    // If any source is image type, show image-specific formats
    const hasImageSources = sourcesToCheck.some((s) => s.type === 'image');
    // If only image sources are selected/filtered
    const onlyImageSources = sourcesToCheck.length > 0 && sourcesToCheck.every((s) => s.type === 'image');

    if (onlyImageSources) {
      return [
        { format: 'png', label: 'PNG', extension: '.png', mimeType: 'image/png' },
        { format: 'jpg', label: 'JPG', extension: '.jpg', mimeType: 'image/jpeg' },
        { format: 'webp', label: 'WebP', extension: '.webp', mimeType: 'image/webp' },
        { format: 'svg', label: 'SVG', extension: '.svg', mimeType: 'image/svg+xml' },
      ];
    }

    // Mix of types: include text formats + image formats if any images present
    const formats = [...config.formats];
    if (hasImageSources) {
      const imageFormats: FormatOption[] = [
        { format: 'png', label: 'PNG', extension: '.png', mimeType: 'image/png' },
        { format: 'jpg', label: 'JPG', extension: '.jpg', mimeType: 'image/jpeg' },
      ];
      for (const f of imageFormats) {
        if (!formats.some((existing) => existing.format === f.format)) {
          formats.push(f);
        }
      }
    }

    return formats;
  };

  const getBatchMode = (category: string): BatchMode => {
    return batchModes[category] || 'combined';
  };

  const toggleBatchMode = (category: string) => {
    setBatchModes((prev) => ({
      ...prev,
      [category]: prev[category] === 'individual' ? 'combined' : 'individual',
    }));
  };

  const handleExport = async (category: ExportCategory, format: string) => {
    if (!content) return;

    const exportKey = `${category}-${format}`;
    setExportingCategory(exportKey);

    try {
      const mode = getBatchMode(category);
      let selectedIds: string[] | undefined;
      if (category === 'sources' && selectedSourceIds.size > 0) {
        selectedIds = Array.from(selectedSourceIds);
      } else if (category === 'slides' && selectedSlideIds.size > 0) {
        selectedIds = Array.from(selectedSlideIds);
      } else if (category === 'infographics' && selectedInfographicIds.size > 0) {
        selectedIds = Array.from(selectedInfographicIds);
      } else if (category === 'flashcards' && selectedFlashcardArtifactIds.size > 0) {
        selectedIds = Array.from(selectedFlashcardArtifactIds);
      } else if (category === 'quiz' && selectedQuizArtifactIds.size > 0) {
        selectedIds = Array.from(selectedQuizArtifactIds);
      } else if (category === 'tables' && selectedTableIds.size > 0) {
        selectedIds = Array.from(selectedTableIds);
      } else if (category === 'notes' && selectedReportIds.size > 0) {
        selectedIds = Array.from(selectedReportIds);
      }

      // For source exports: load actual text content before exporting
      if (category === 'sources') {
        const sourcesToExport = selectedIds
          ? content.sources.filter((s) => selectedIds.includes(s.id))
          : content.sources;

        // Check if any source is missing content
        const needsContent = sourcesToExport.some((s) => !s.content);
        if (needsContent) {
          toast({ title: 'Loading content...', description: 'Fetching source text from NotebookLM' });

          const updatedSources = await ExportService.loadSourceContents(
            notebookId,
            sourcesToExport,
          );

          // Merge loaded content into the main content object
          const sourceMap = new Map(updatedSources.map((s) => [s.id, s]));
          content.sources = content.sources.map((s) => sourceMap.get(s.id) || s);
          setContent({ ...content });
        }
      }

      await ExportService.executeExport(category, format, content, mode, selectedIds);

      toast({
        title: 'Export complete',
        description: `Successfully exported ${category} as ${format.toUpperCase()}`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Failed to export',
        variant: 'destructive',
      });
    } finally {
      setExportingCategory(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSourceIds.size === 0) return;

    const count = selectedSourceIds.size;
    const confirmed = confirm(
      `Delete ${count} ${count === 1 ? 'source' : 'sources'}? This action cannot be undone.`
    );
    if (!confirmed) return;

    setIsDeletingSelected(true);
    try {
      await NotebookLMService.deleteSources(notebookId, Array.from(selectedSourceIds));
      toast({
        title: 'Deleted',
        description: `Successfully deleted ${count} sources`,
      });
      setSelectedSourceIds(new Set());
      // Reload content
      await loadContent();
    } catch (error) {
      console.error('Error deleting sources:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete sources',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingSelected(false);
    }
  };

  const renderFormatButtons = (
    category: ExportCategory,
    formats: FormatOption[],
    itemCount: number
  ) => {
    const isDisabled = itemCount === 0;

    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {formats.map((fmt) => {
          const exportKey = `${category}-${fmt.format}`;
          const isExporting = exportingCategory === exportKey;

          return (
            <Button
              key={fmt.format}
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5 gap-1"
              disabled={isDisabled || isExporting}
              onClick={() => handleExport(category, fmt.format)}
            >
              {isExporting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              {fmt.label}
            </Button>
          );
        })}
      </div>
    );
  };

  const renderBatchToggle = (category: string, supportsBatch: boolean) => {
    if (category === 'slides' || category === 'infographics') return null;
    if (!supportsBatch) return null;

    const mode = getBatchMode(category);
    return (
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-muted-foreground">Mode:</span>
        <button
          className={`text-xs px-2 py-0.5 rounded ${
            mode === 'combined'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
          onClick={() => toggleBatchMode(category)}
        >
          Combined
        </button>
        <button
          className={`text-xs px-2 py-0.5 rounded ${
            mode === 'individual'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
          onClick={() => toggleBatchMode(category)}
        >
          Individual
        </button>
      </div>
    );
  };

  // ─── Source Category (special rendering with search/filter) ──────

  const renderSourcesCategory = () => {
    const config = CATEGORY_CONFIGS.find((c) => c.id === 'sources')!;
    const isExpanded = expandedCategories.has('sources');
    const count = categoryCounts.sources || 0;

    return (
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Category Header */}
        <button
          className="w-full flex items-center justify-between p-3 bg-card hover:bg-accent/50 transition-colors"
          onClick={() => toggleCategory('sources')}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="text-base">{config.icon}</span>
            <span className="font-medium text-sm">{config.label}</span>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {count}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">{config.description}</span>
        </button>

        {isExpanded && (
          <div className="p-3 border-t border-border space-y-3">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search sources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            {/* Type Filters */}
            <div className="flex items-center gap-1 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
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

            {/* Select All + Bulk Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={
                    filteredSources.length > 0 &&
                    selectedSourceIds.size === filteredSources.length
                  }
                  onCheckedChange={toggleSelectAllSources}
                />
                <span className="text-xs text-muted-foreground">
                  Select all ({filteredSources.length})
                </span>
              </div>
              {selectedSourceIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={isDeletingSelected}
                  onClick={handleBulkDelete}
                >
                  {isDeletingSelected ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="h-3 w-3 mr-1" />
                  )}
                  Delete ({selectedSourceIds.size})
                </Button>
              )}
            </div>

            {/* Sources List */}
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredSources.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {searchQuery || sourceFilter !== 'all' ? 'No matching sources' : 'No sources'}
                </p>
              ) : (
                filteredSources.map((source) => (
                  <div
                    key={source.id}
                    className={`flex items-center gap-2 p-2 rounded border transition-colors ${
                      selectedSourceIds.has(source.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent hover:bg-muted/50'
                    }`}
                  >
                    <Checkbox
                      checked={selectedSourceIds.has(source.id)}
                      onCheckedChange={() => toggleSourceSelection(source.id)}
                    />
                    {getSourceTypeIcon(source.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{source.title}</p>
                      {source.url && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {source.url}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded">
                      {source.type}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Batch Mode Toggle */}
            {renderBatchToggle('sources', true)}

            {/* Export Format Buttons - per-type aware */}
            <div>
              <span className="text-xs text-muted-foreground">
                Export{selectedSourceIds.size > 0 ? ` (${selectedSourceIds.size} selected)` : ' all'} as:
              </span>
              {renderFormatButtons('sources', getSourceExportFormats(), filteredSources.length)}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Generic Category Rendering ─────────────────────────────────

  const renderCategory = (config: (typeof CATEGORY_CONFIGS)[number]) => {
    if (config.id === 'sources') return null; // Rendered separately

    const isExpanded = expandedCategories.has(config.id);
    const count = categoryCounts[config.id] || 0;
    const hasContent = count > 0;

    return (
      <div key={config.id} className="border border-border rounded-lg overflow-hidden">
        {/* Category Header */}
        <button
          className="w-full flex items-center justify-between p-3 bg-card hover:bg-accent/50 transition-colors"
          onClick={() => toggleCategory(config.id)}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="text-base">{config.icon}</span>
            <span className="font-medium text-sm">{config.label}</span>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {count}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">{config.description}</span>
        </button>

        {isExpanded && (
          <div className="p-3 border-t border-border space-y-2">
            {hasContent ? (
              <>
                {/* Slide preview thumbnails with selection */}
                {config.id === 'slides' && content && content.slides.length > 0 && (
                  <div className="space-y-2">
                    {/* Select all / deselect */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {selectedSlideIds.size > 0
                          ? `${selectedSlideIds.size} of ${content.slides.length} slides selected`
                          : `All ${content.slides.length} slides`}
                      </span>
                      <button
                        className="text-[10px] text-primary hover:underline"
                        onClick={() => {
                          if (selectedSlideIds.size === content.slides.length) {
                            setSelectedSlideIds(new Set());
                          } else {
                            setSelectedSlideIds(new Set(content.slides.map((s) => s.id)));
                          }
                        }}
                      >
                        {selectedSlideIds.size === content.slides.length ? 'Deselect all' : 'Select all'}
                      </button>
                    </div>

                    {/* Thumbnail grid */}
                    <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                      {content.slides.map((slide) => {
                        const isSelected = selectedSlideIds.has(slide.id);
                        return (
                          <button
                            key={slide.id}
                            className={`relative rounded border-2 overflow-hidden transition-all ${
                              isSelected
                                ? 'border-primary ring-1 ring-primary/50'
                                : 'border-border hover:border-muted-foreground/50'
                            }`}
                            onClick={() => {
                              const next = new Set(selectedSlideIds);
                              if (next.has(slide.id)) {
                                next.delete(slide.id);
                              } else {
                                next.add(slide.id);
                              }
                              setSelectedSlideIds(next);
                            }}
                            title={`Slide ${slide.slideNumber}: ${slide.title}`}
                          >
                            {slide.imageUrl ? (
                              <img
                                src={slide.imageUrl}
                                alt={`Slide ${slide.slideNumber}`}
                                className="w-full h-auto aspect-video object-cover bg-muted"
                                loading="lazy"
                                onError={(e) => {
                                  // Replace broken images with placeholder
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <div className={`${slide.imageUrl ? 'hidden' : ''} w-full aspect-video bg-muted flex items-center justify-center`}>
                              <Presentation className="h-4 w-4 text-muted-foreground" />
                            </div>
                            {/* Slide number badge */}
                            <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-black/60 text-white px-1 rounded">
                              {slide.slideNumber}
                            </span>
                            {/* Selection checkmark */}
                            {isSelected && (
                              <span className="absolute top-0.5 left-0.5 text-[10px] bg-primary text-primary-foreground w-4 h-4 rounded-full flex items-center justify-center">
                                ✓
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-[10px] text-muted-foreground bg-amber-50 dark:bg-amber-950/30 p-1.5 rounded">
                      Click slides to select specific ones for export. Empty selection exports all.
                    </p>
                  </div>
                )}

                {/* Infographic preview + selection */}
                {config.id === 'infographics' && content && content.infographics.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {selectedInfographicIds.size > 0
                          ? `${selectedInfographicIds.size} of ${content.infographics.length} selected`
                          : `All ${content.infographics.length} selected`}
                      </span>
                      <button
                        className="text-[10px] text-primary hover:underline"
                        onClick={() => {
                          if (selectedInfographicIds.size === content.infographics.length) {
                            setSelectedInfographicIds(new Set());
                          } else {
                            setSelectedInfographicIds(new Set(content.infographics.map((i) => i.id)));
                          }
                        }}
                      >
                        {selectedInfographicIds.size === content.infographics.length ? 'Deselect all' : 'Select all'}
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                      {content.infographics.map((info, index) => {
                        const isSelected = selectedInfographicIds.has(info.id);
                        return (
                          <button
                            key={info.id}
                            className={`relative rounded border-2 overflow-hidden transition-all ${
                              isSelected
                                ? 'border-primary ring-1 ring-primary/50'
                                : 'border-border hover:border-muted-foreground/50'
                            }`}
                            onClick={() => {
                              const next = new Set(selectedInfographicIds);
                              if (next.has(info.id)) next.delete(info.id);
                              else next.add(info.id);
                              setSelectedInfographicIds(next);
                            }}
                            title={`Infographic ${index + 1}: ${info.title}`}
                          >
                            {info.imageUrl ? (
                              <img
                                src={info.imageUrl}
                                alt={info.title}
                                className="w-full h-auto aspect-video object-cover bg-muted"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <div className={`${info.imageUrl ? 'hidden' : ''} w-full aspect-video bg-muted flex items-center justify-center`}>
                              <Image className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-black/60 text-white px-1 rounded">
                              {index + 1}
                            </span>
                            {isSelected && (
                              <span className="absolute top-0.5 left-0.5 text-[10px] bg-primary text-primary-foreground w-4 h-4 rounded-full flex items-center justify-center">
                                ✓
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground bg-amber-50 dark:bg-amber-950/30 p-1.5 rounded">
                      Click infographics to select specific ones for export. Empty selection exports all.
                    </p>
                  </div>
                )}

                {/* Flashcards artifact selection */}
                {config.id === 'flashcards' && content && (content.artifacts?.some((a) => a.type === 'flashcards') || content.flashcards.length > 0) && (
                  <div className="space-y-2">
                    {(() => {
                      const groups = (content.artifacts || []).filter((a) => a.type === 'flashcards');
                      if (groups.length === 0) return null;
                      return (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">
                              {selectedFlashcardArtifactIds.size > 0
                                ? `${selectedFlashcardArtifactIds.size} of ${groups.length} selected`
                                : `All ${groups.length} selected`}
                            </span>
                            <button
                              className="text-[10px] text-primary hover:underline"
                              onClick={() => {
                                if (selectedFlashcardArtifactIds.size === groups.length) {
                                  setSelectedFlashcardArtifactIds(new Set());
                                } else {
                                  setSelectedFlashcardArtifactIds(new Set(groups.map((g) => g.id)));
                                }
                              }}
                            >
                              {selectedFlashcardArtifactIds.size === groups.length ? 'Deselect all' : 'Select all'}
                            </button>
                          </div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {groups.map((g) => (
                              <label key={g.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30 cursor-pointer">
                                <Checkbox
                                  checked={selectedFlashcardArtifactIds.has(g.id)}
                                  onCheckedChange={() => {
                                    const next = new Set(selectedFlashcardArtifactIds);
                                    if (next.has(g.id)) next.delete(g.id);
                                    else next.add(g.id);
                                    setSelectedFlashcardArtifactIds(next);
                                  }}
                                />
                                <span className="truncate">{g.title}</span>
                              </label>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Quiz artifact selection */}
                {config.id === 'quiz' && content && (content.artifacts?.some((a) => a.type === 'quiz') || content.quizzes.length > 0) && (
                  <div className="space-y-2">
                    {(() => {
                      const groups = (content.artifacts || []).filter((a) => a.type === 'quiz');
                      if (groups.length === 0) return null;
                      return (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">
                              {selectedQuizArtifactIds.size > 0
                                ? `${selectedQuizArtifactIds.size} of ${groups.length} selected`
                                : `All ${groups.length} selected`}
                            </span>
                            <button
                              className="text-[10px] text-primary hover:underline"
                              onClick={() => {
                                if (selectedQuizArtifactIds.size === groups.length) {
                                  setSelectedQuizArtifactIds(new Set());
                                } else {
                                  setSelectedQuizArtifactIds(new Set(groups.map((g) => g.id)));
                                }
                              }}
                            >
                              {selectedQuizArtifactIds.size === groups.length ? 'Deselect all' : 'Select all'}
                            </button>
                          </div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {groups.map((g) => (
                              <label key={g.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30 cursor-pointer">
                                <Checkbox
                                  checked={selectedQuizArtifactIds.has(g.id)}
                                  onCheckedChange={() => {
                                    const next = new Set(selectedQuizArtifactIds);
                                    if (next.has(g.id)) next.delete(g.id);
                                    else next.add(g.id);
                                    setSelectedQuizArtifactIds(next);
                                  }}
                                />
                                <span className="truncate">{g.title}</span>
                              </label>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Tables selection */}
                {config.id === 'tables' && content && content.tables.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {content.tables.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30 cursor-pointer">
                        <Checkbox
                          checked={selectedTableIds.has(t.id)}
                          onCheckedChange={() => {
                            const next = new Set(selectedTableIds);
                            if (next.has(t.id)) next.delete(t.id);
                            else next.add(t.id);
                            setSelectedTableIds(next);
                          }}
                        />
                        <span className="truncate">{t.title}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Reports selection */}
                {config.id === 'notes' && content && content.notes.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {content.notes.map((n) => (
                      <label key={n.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30 cursor-pointer">
                        <Checkbox
                          checked={selectedReportIds.has(n.id)}
                          onCheckedChange={() => {
                            const next = new Set(selectedReportIds);
                            if (next.has(n.id)) next.delete(n.id);
                            else next.add(n.id);
                            setSelectedReportIds(next);
                          }}
                        />
                        <span className="truncate">{n.title}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Chat preview */}
                {config.id === 'chat' && content && content.chatHistory.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {content.chatHistory.slice(0, 6).map((msg) => (
                      <div key={msg.id} className="flex gap-2 p-1.5 rounded bg-muted/30">
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {msg.role === 'user' ? '👤' : '🤖'}
                        </span>
                        <p className="text-[10px] text-muted-foreground line-clamp-2">
                          {msg.content.substring(0, 150)}
                          {msg.content.length > 150 ? '...' : ''}
                        </p>
                      </div>
                    ))}
                    {content.chatHistory.length > 6 && (
                      <p className="text-[10px] text-muted-foreground text-center">
                        ...and {content.chatHistory.length - 6} more messages
                      </p>
                    )}
                  </div>
                )}

                {/* Batch Mode Toggle */}
                {renderBatchToggle(config.id, config.supportsBatch)}

                {/* Export Format Buttons */}
                <div>
                  <span className="text-xs text-muted-foreground">Export as:</span>
                  {renderFormatButtons(config.id, config.formats, count)}
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                {config.id === 'flashcards' && isLoadingFlashcards ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      Loading flashcards and quiz...
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Opening artifacts in background tabs to extract data
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      No {config.label.toLowerCase()} found in this notebook.
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {config.id === 'slides'
                        ? 'Create a Slide Deck in NotebookLM Studio first.'
                        : config.id === 'chat'
                        ? 'Start a conversation in NotebookLM chat first.'
                        : 'Content may need to be generated in NotebookLM first.'}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ─── Main Render ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 p-4 border-b border-border bg-card">
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="font-semibold text-sm">Export Notebook</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading notebook content...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm">Export Notebook</h2>
          <p className="text-xs text-muted-foreground truncate">{notebookTitle}</p>
        </div>
        <Package className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Sources (special rendering) */}
        {renderSourcesCategory()}

        {/* Other categories */}
        {CATEGORY_CONFIGS.filter((c) => c.id !== 'sources').map((config) =>
          renderCategory(config)
        )}

      </div>
    </div>
  );
}
