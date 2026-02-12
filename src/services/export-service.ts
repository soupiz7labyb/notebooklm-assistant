/**
 * Export Service
 * Orchestrates content retrieval from NotebookLM and format conversion
 */

import type {
  ExportCategory,
  NotebookFullContent,
  SourceContent,
  NoteContent,
  ChatMessage,
  Flashcard,
  DataTable,
  SlideContent,
  MindmapContent,
  InfographicContent,
  CategoryConfig,
  BatchMode,
} from '@/types/export';
import {
  exportSources,
  exportNotes,
  exportChat,
  exportFlashcards,
  exportTables,
  exportSlides,
  slidesToMarkdown,
  mindmapToMarkdown,
} from './export-formats';
import { downloadText, downloadBlob } from '@/lib/download';
import { sanitizeFilename, getTimestamp } from '@/lib/download';
import { NotebookLMService } from './notebooklm-api';
import { DOMExtractor } from './dom-extractor';

// ─── Category Configurations ──────────────────────────────────────

export const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    id: 'sources',
    label: 'Sources',
    icon: '📄',
    description: 'Batch download, Bulk delete',
    supportsBatch: true,
    formats: [
      { format: 'markdown', label: 'Markdown', extension: '.md', mimeType: 'text/markdown' },
      { format: 'pdf', label: 'PDF', extension: '.pdf', mimeType: 'application/pdf' },
      { format: 'txt', label: 'Text', extension: '.txt', mimeType: 'text/plain' },
      { format: 'csv', label: 'CSV', extension: '.csv', mimeType: 'text/csv' },
      { format: 'docx', label: 'Word', extension: '.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { format: 'json', label: 'JSON', extension: '.json', mimeType: 'application/json' },
      { format: 'zip', label: 'ZIP (batch)', extension: '.zip', mimeType: 'application/zip' },
    ],
  },
  {
    id: 'notes',
    label: 'Notes & Reports',
    icon: '📝',
    description: 'Batch Export supported',
    supportsBatch: true,
    formats: [
      { format: 'markdown', label: 'Markdown', extension: '.md', mimeType: 'text/markdown' },
      { format: 'docx', label: 'Word (.docx)', extension: '.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { format: 'pdf', label: 'PDF', extension: '.pdf', mimeType: 'application/pdf' },
    ],
  },
  {
    id: 'slides',
    label: 'Slides',
    icon: '📊',
    description: 'PDF, PNG, PPT, Markdown',
    supportsBatch: false,
    formats: [
      { format: 'pdf', label: 'PDF', extension: '.pdf', mimeType: 'application/pdf' },
      { format: 'png', label: 'PNG', extension: '.png', mimeType: 'image/png' },
      { format: 'pptx', label: 'PPTX', extension: '.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      { format: 'markdown', label: 'Markdown', extension: '.md', mimeType: 'text/markdown' },
    ],
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    icon: '🃏',
    description: 'CSV, Markdown, Anki format',
    supportsBatch: true,
    formats: [
      { format: 'csv', label: 'CSV', extension: '.csv', mimeType: 'text/csv' },
      { format: 'markdown', label: 'Markdown', extension: '.md', mimeType: 'text/markdown' },
      { format: 'anki', label: 'Anki', extension: '.txt', mimeType: 'text/plain' },
      { format: 'docx', label: 'Word (.docx)', extension: '.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { format: 'pdf', label: 'PDF', extension: '.pdf', mimeType: 'application/pdf' },
    ],
  },
  {
    id: 'quiz',
    label: 'Quiz',
    icon: '❓',
    description: 'Question bank export',
    supportsBatch: true,
    formats: [
      { format: 'csv', label: 'CSV', extension: '.csv', mimeType: 'text/csv' },
      { format: 'markdown', label: 'Markdown', extension: '.md', mimeType: 'text/markdown' },
      { format: 'docx', label: 'Word (.docx)', extension: '.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { format: 'pdf', label: 'PDF', extension: '.pdf', mimeType: 'application/pdf' },
    ],
  },
  {
    id: 'tables',
    label: 'Data Tables',
    icon: '📊',
    description: 'CSV, Markdown, Word, PDF',
    supportsBatch: true,
    formats: [
      { format: 'csv', label: 'CSV', extension: '.csv', mimeType: 'text/csv' },
      { format: 'markdown', label: 'Markdown', extension: '.md', mimeType: 'text/markdown' },
      { format: 'docx', label: 'Word (.docx)', extension: '.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { format: 'pdf', label: 'PDF', extension: '.pdf', mimeType: 'application/pdf' },
    ],
  },
  {
    id: 'infographics',
    label: 'Infographics',
    icon: '🎨',
    description: 'PNG export only',
    supportsBatch: false,
    formats: [
      { format: 'png', label: 'PNG', extension: '.png', mimeType: 'image/png' },
    ],
  },
  {
    id: 'chat',
    label: 'Chat History',
    icon: '💬',
    description: 'Markdown, Word, PDF',
    supportsBatch: false,
    formats: [
      { format: 'markdown', label: 'Markdown', extension: '.md', mimeType: 'text/markdown' },
      { format: 'docx', label: 'Word (.docx)', extension: '.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { format: 'pdf', label: 'PDF', extension: '.pdf', mimeType: 'application/pdf' },
    ],
  },
];

// ─── Export Service Class ──────────────────────────────────────────

export class ExportService {
  /**
   * Load full notebook content for export
   * Gets sources from the API and loads their text content via RPC hizoJc
   */
  static async loadNotebookContent(notebookId: string): Promise<NotebookFullContent> {
    // Tell DOM extractor which notebook we're targeting
    DOMExtractor.setNotebookId(notebookId);

    try {
      const notebook = await NotebookLMService.getNotebook(notebookId);

      // Map sources to SourceContent (without text content initially)
      const sources: SourceContent[] = notebook.sources.map((s) => ({
        id: s.id,
        title: s.title,
        type: s.type,
        typeCode: (s as any).typeCode,
        url: (s as any).url || null,
        status: s.status,
        content: undefined,
      }));

      // Try to get extended notebook data (notes, chat, artifacts)
      let notes: NoteContent[] = [];
      let chatHistory: ChatMessage[] = [];
      let flashcards: Flashcard[] = [];
      let quizzes: Flashcard[] = [];
      let tables: DataTable[] = [];
      let slides: SlideContent[] = [];
      let mindmaps: MindmapContent[] = [];
      let infographics: InfographicContent[] = [];
      let artifactsMeta: any[] | undefined;

      try {
        const extendedData = await NotebookLMService.getNotebookExtendedContent(notebookId);
        if (extendedData) {
          notes = extendedData.notes || [];
          chatHistory = extendedData.chatHistory || [];
          flashcards = extendedData.flashcards || [];
          tables = extendedData.tables || [];
          slides = extendedData.slides || [];
          mindmaps = extendedData.mindmaps || [];
          infographics = extendedData.infographics || [];

          // Store artifact metadata for async flashcard loading
          artifactsMeta = extendedData.artifacts;

          // Log what we found
          console.log('Extended content loaded:', {
            notes: notes.length,
            chat: chatHistory.length,
            flashcards: flashcards.length,
            quizzes: quizzes.length,
            tables: tables.length,
            slides: slides.length,
            mindmaps: mindmaps.length,
            infographics: infographics.length,
            artifacts: extendedData.artifacts?.length || 0,
          });

          // ── DOM extraction (chat + slides) ──
          // Each operation has its own timeout so a single hang doesn't
          // block the entire load.  Overall timeout is generous (20s)
          // because ensureNotebookOpen alone can take 17s when navigating.
          const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T | null> =>
            Promise.race([
              p,
              new Promise<null>((resolve) =>
                setTimeout(() => { console.log(`${label}: timed out after ${ms}ms`); resolve(null); }, ms)
              ),
            ]);

          // 1. Ensure the correct notebook tab is open (max 18s — includes
          //    navigation + Angular bootstrap if the tab needs to be redirected)
          const chatTab = await withTimeout(
            DOMExtractor.ensureNotebookOpen(notebookId), 18000, 'ensureNotebookOpen',
          );

          // 2. Chat extraction (extractChatHistory now clicks the Chat tab
          //    internally and waits for render, so no external delay needed)
          if (chatTab) {
            const domChat = await withTimeout(
              DOMExtractor.extractChatHistory(), 12000, 'extractChatHistory',
            );
            if (domChat && domChat.length > 0) {
              chatHistory = domChat.map((m, i) => ({
                id: `dom-chat-${i}`,
                role: m.role,
                content: m.content,
              }));
              console.log(`Loaded ${chatHistory.length} chat messages from DOM`);
            } else {
              console.log('DOM chat extraction returned 0 messages (chat tab may be empty)');
            }
          }

          // 3. Slides: if RPC didn't find them, try DOM artifact list
          if (slides.length === 0) {
            const domArtifactsWithIds = await withTimeout(
              DOMExtractor.extractArtifactsWithIds(), 5000, 'extractArtifactsWithIds',
            );
            if (domArtifactsWithIds) {
              const slideArtifacts = domArtifactsWithIds.filter(a => a.type === 'slide_deck');
              for (const sa of slideArtifacts) {
                slides.push({
                  id: sa.artifactId,
                  title: sa.title,
                  content: '',
                  slideNumber: slides.length + 1,
                });
              }
            }
          }

          console.log('Content ready, returning to UI');
        }
      } catch (error) {
        console.log('Extended content not available:', error);
      }

      return {
        id: notebookId,
        title: notebook.title,
        sources,
        notes,
        chatHistory,
        flashcards,
        quizzes,
        tables,
        slides,
        mindmaps,
        infographics,
        artifacts: artifactsMeta,
      };
    } catch (error) {
      console.error('Error loading notebook content:', error);
      throw error;
    }
  }

  /**
   * Load flashcards/quiz data asynchronously via background tabs.
   * This is called AFTER the main content is displayed, so it doesn't block the UI.
   * Opens each flashcard/quiz artifact in a background tab, reads data-app-data, closes tab.
   *
   * @param notebookId - Notebook ID
   * @param artifactsMeta - Already-loaded artifact metadata (avoids redundant RPC)
   * @returns Array of extracted flashcards (empty if none found)
   */
  static async loadFlashcardsAsync(
    notebookId: string,
    artifactsMeta?: Array<{ id: string; type: string; typeCode: number; title: string; status: number }>,
  ): Promise<{
    flashcards: Flashcard[];
    quizzes: Flashcard[];
    tables: DataTable[];
    notes: NoteContent[];
    infographics: InfographicContent[];
  }> {
    const flashcards: Flashcard[] = [];
    const quizzes: Flashcard[] = [];
    const tables: DataTable[] = [];
    const notes: NoteContent[] = [];
    const infographics: InfographicContent[] = [];

    try {
      // Use provided metadata or fetch (fallback)
      let interactiveArtifacts: typeof artifactsMeta = [];
      if (artifactsMeta && artifactsMeta.length > 0) {
        interactiveArtifacts = artifactsMeta.filter(
          (a) =>
            [2, 4, 7, 9].includes(a.typeCode) &&
            (a.status === 3 || a.status === 0)
        );
      } else {
        const extendedData = await NotebookLMService.getNotebookExtendedContent(notebookId);
        if (!extendedData?.artifacts) return { flashcards, quizzes, tables, notes, infographics };
        interactiveArtifacts = extendedData.artifacts.filter(
          (a: any) =>
            [2, 4, 7, 9].includes(a.typeCode) &&
            (a.status === 3 || a.status === 0)
        );
      }

      if (interactiveArtifacts.length === 0) return { flashcards, quizzes, tables, notes, infographics };

      console.log(`[Artifacts] Found ${interactiveArtifacts.length} interactive artifacts`);

      const CONCURRENCY = 2;
      let cursor = 0;

      const workers = Array.from({ length: Math.min(CONCURRENCY, interactiveArtifacts.length) }).map(async () => {
        while (cursor < interactiveArtifacts.length) {
          const idx = cursor++;
          const fa = interactiveArtifacts[idx];
          if (!fa) break;

        try {
          console.log(`[Flashcards] Extracting "${fa.title}" (${fa.type}) via background tab...`);
          const appData = await DOMExtractor.extractDataFromBackgroundTab(notebookId, fa.id, 20000);

          if (appData) {
            // Parse flashcards from data-app-data
            if (Array.isArray(appData.flashcards)) {
              for (let i = 0; i < appData.flashcards.length; i++) {
                const card = appData.flashcards[i];
                flashcards.push({
                  id: `${fa.id}-card-${i}`,
                  front: card.f || card.front || '',
                  back: card.b || card.back || '',
                });
              }
              console.log(`[Flashcards] Extracted ${appData.flashcards.length} flashcards from "${fa.title}"`);
            }
            // Parse quiz from data-app-data
            const quizItems = Array.isArray(appData.quiz)
              ? appData.quiz
              : Array.isArray(appData.questions)
                ? appData.questions
                : [];
            if (quizItems.length > 0) {
              for (let i = 0; i < quizItems.length; i++) {
                const q = quizItems[i];
                const answers = (q.answerOptions || [])
                  .map((a: any) => `${a.isCorrect ? '✓' : '✗'} ${a.text}`)
                  .join('\n');
                quizzes.push({
                  id: `${fa.id}-q-${i}`,
                  front: q.question || '',
                  back: answers + (q.hint ? `\n\nHint: ${q.hint}` : ''),
                });
              }
              console.log(`[Flashcards] Extracted ${quizItems.length} quiz questions from "${fa.title}"`);
            }

            // Parse data table from DOM fallback
            if (appData.kind === 'table' && (Array.isArray(appData.headers) || Array.isArray(appData.rows))) {
              tables.push({
                id: fa.id,
                title: fa.title || 'Data Table',
                headers: Array.isArray(appData.headers) ? appData.headers : [],
                rows: Array.isArray(appData.rows) ? appData.rows : [],
              });
              console.log(`[Artifacts] Extracted data table from "${fa.title}"`);
            }

            // Parse report text from DOM fallback
            if (appData.kind === 'report' && typeof appData.content === 'string' && appData.content.trim()) {
              notes.push({
                id: fa.id,
                title: fa.title || 'Report',
                content: appData.content,
              });
              console.log(`[Artifacts] Extracted report text from "${fa.title}"`);
            }

            // Parse infographic image URL from DOM fallback
            if (appData.kind === 'infographic' && typeof appData.imageUrl === 'string' && appData.imageUrl) {
              infographics.push({
                id: fa.id,
                title: fa.title || 'Infographic',
                imageUrl: appData.imageUrl,
              });
              console.log(`[Artifacts] Extracted infographic image URL from "${fa.title}"`);
            }
          } else {
            console.log(`[Flashcards] No data-app-data found for "${fa.title}"`);
          }
        } catch (e) {
          console.log(`[Flashcards] Failed for "${fa.title}":`, e);
        }
        }
      });

      await Promise.all(workers);
    } catch (e) {
      console.log('[Flashcards] Error in async flashcard loading:', e);
    }

    return { flashcards, quizzes, tables, notes, infographics };
  }

  /**
   * Check if a notebook has flashcard/quiz artifacts that need async loading.
   */
  static hasFlashcardArtifacts(content: NotebookFullContent): boolean {
    // If we already have flashcards, no need to check
    if (content.flashcards.length > 0) return false;
    // Check via the extended data artifacts - but we don't store them in NotebookFullContent.
    // Instead, we check if there were type 4 artifacts in the RPC.
    // For now, return false — the ExportDialog will trigger async loading.
    return false;
  }

  /**
   * Load text content for all (or selected) sources in a notebook.
   * Uses the hizoJc RPC to fetch the actual text of each source.
   *
   * @param notebookId - The notebook ID
   * @param sources    - Array of sources to load content for
   * @param onProgress - Optional callback for progress updates
   * @returns Updated sources with content filled in
   */
  static async loadSourceContents(
    notebookId: string,
    sources: SourceContent[],
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<SourceContent[]> {
    const sourceIds = sources.map((s) => s.id).filter(Boolean);
    if (sourceIds.length === 0) return sources;

    console.log(`Loading content for ${sourceIds.length} sources...`);

    // Load all source contents in parallel (concurrency = 3)
    const contentsMap = await NotebookLMService.loadMultipleSourceContents(
      notebookId,
      sourceIds,
      3,
    );

    let loaded = 0;
    const updated = sources.map((s) => {
      const content = contentsMap.get(s.id);
      loaded++;
      onProgress?.(loaded, sources.length);
      return {
        ...s,
        content: content || undefined,
      };
    });

    const withContent = updated.filter((s) => s.content).length;
    console.log(`Loaded content for ${withContent}/${sources.length} sources`);

    return updated;
  }

  /**
   * Get count of items in each category
   */
  static getCategoryCounts(content: NotebookFullContent): Record<ExportCategory, number> {
    return {
      sources: content.sources.length,
      notes: content.notes.length,
      chat: content.chatHistory.length,
      flashcards: content.flashcards.length,
      quiz: content.quizzes.length,
      tables: content.tables.length,
      slides: content.slides.length,
      mindmaps: content.mindmaps.length,
      infographics: content.infographics.length,
    };
  }

  /**
   * Execute export for a category with given format and options
   */
  static async executeExport(
    category: ExportCategory,
    format: string,
    content: NotebookFullContent,
    batchMode: BatchMode = 'combined',
    selectedIds?: string[]
  ): Promise<void> {
    const notebookTitle = content.title || 'Notebook';

    switch (category) {
      case 'sources': {
        const items = selectedIds
          ? content.sources.filter((s) => selectedIds.includes(s.id))
          : content.sources;
        await exportSources(items, format, notebookTitle, batchMode);
        break;
      }
      case 'notes': {
        const items = selectedIds
          ? content.notes.filter((n) => selectedIds.includes(n.id))
          : content.notes;
        if (items.length === 0) throw new Error('No notes available to export');
        await exportNotes(items, format, notebookTitle, batchMode);
        break;
      }
      case 'chat': {
        if (content.chatHistory.length === 0) throw new Error('No chat history available to export');
        await exportChat(content.chatHistory, format, notebookTitle);
        break;
      }
      case 'flashcards': {
        const items = selectedIds
          ? content.flashcards.filter((f) =>
              selectedIds.some((artifactId) => f.id.startsWith(`${artifactId}-`))
            )
          : content.flashcards;
        if (items.length === 0) throw new Error('No flashcards available to export');
        await exportFlashcards(items, format, notebookTitle, batchMode);
        break;
      }
      case 'quiz': {
        const items = selectedIds
          ? content.quizzes.filter((q) =>
              selectedIds.some((artifactId) => q.id.startsWith(`${artifactId}-`))
            )
          : content.quizzes;
        if (items.length === 0) throw new Error('No quiz items available to export');
        await exportFlashcards(items, format, `${notebookTitle} Quiz`, batchMode);
        break;
      }
      case 'tables': {
        const items = selectedIds
          ? content.tables.filter((t) => selectedIds.includes(t.id))
          : content.tables;
        if (items.length === 0) throw new Error('No data tables available to export');
        await exportTables(items, format, notebookTitle, batchMode);
        break;
      }
      case 'slides': {
        // If specific slides are selected, filter to only those
        const slidesToExport = selectedIds
          ? content.slides.filter((s) => selectedIds.includes(s.id))
          : content.slides;
        if (slidesToExport.length === 0) throw new Error('No slides available to export');

        // Create a filtered content copy for slide export
        const slideContent = { ...content, slides: slidesToExport };
        const isPartialSelection = !!selectedIds && selectedIds.length < content.slides.length;
        const effectiveBatchMode = selectedIds && selectedIds.length > 1 ? 'individual' : batchMode;
        await this.exportSlidesWithImages(
          slideContent,
          format,
          notebookTitle,
          effectiveBatchMode,
          isPartialSelection
        );
        break;
      }
      case 'mindmaps': {
        if (content.mindmaps.length === 0) throw new Error('No mindmaps available to export');
        for (const mm of content.mindmaps) {
          const mmMd = mindmapToMarkdown(mm);
          downloadText(mmMd, `${sanitizeFilename(mm.title)}_mindmap_${getTimestamp()}.md`, 'text/markdown');
        }
        break;
      }
      case 'infographics': {
        const items = selectedIds
          ? content.infographics.filter((i) => selectedIds.includes(i.id))
          : content.infographics;
        if (items.length === 0) throw new Error('No infographics available to export');
        if (format !== 'png') {
          throw new Error('Infographics support PNG only.');
        }

        let started = 0;
        for (const item of items) {
          if (!item.imageUrl) continue;
          const downloadId = await DOMExtractor.downloadViaChrome(item.imageUrl);
          if (downloadId !== null) started++;
        }

        if (started === 0) {
          throw new Error('Could not start infographic download.');
        }
        break;
      }
      default:
        throw new Error(`Unknown category: ${category}`);
    }
  }

  /**
   * Export slides using image URLs from the API, with DOM fallback.
   * Supports: PDF (direct download or from images), PNG (ZIP), PPTX, Markdown
   *
   * URL types from the API:
   * - lh3.googleusercontent.com/notebooklm/... → individual slide images
   * - contribution.usercontent.google.com/download?... → full PDF of the slide deck
   *
   * IMPORTANT: Image URLs require Google cookies, so we fetch them via
   * chrome.scripting.executeScript inside the NotebookLM tab context.
   */
  private static async exportSlidesWithImages(
    content: NotebookFullContent,
    format: string,
    notebookTitle: string,
    batchMode: BatchMode = 'combined',
    isPartialSelection: boolean = false,
  ): Promise<void> {
    const safeTitle = sanitizeFilename(notebookTitle);
    const timestamp = getTimestamp();

    // Collect URLs
    const pdfUrl = content.slides.find((s) => s.pdfUrl)?.pdfUrl;
    const slidesWithImages = content.slides.filter((s) => s.imageUrl);

    // =============================================
    // PDF format
    // =============================================
    if (format === 'pdf') {
      // INDIVIDUAL mode OR partial selection: each slide as a separate PDF in a ZIP
      if ((batchMode === 'individual' || isPartialSelection) && slidesWithImages.length >= 1) {
        console.log(`Downloading ${slidesWithImages.length} slides as individual PDFs`);
        const slideImages = await this.downloadSlideImages(slidesWithImages);
        if (slideImages.length > 0) {
          if (slideImages.length === 1) {
            // Single slide — just download as PDF directly
            const { jsPDF } = await import('jspdf');
            const slide = slideImages[0];
            const pdf = new jsPDF({
              orientation: slide.width > slide.height ? 'landscape' : 'portrait',
              unit: 'px',
              format: [slide.width, slide.height],
            });
            pdf.addImage(slide.dataUrl, 'PNG', 0, 0, slide.width, slide.height);
            downloadBlob(pdf.output('blob'), `${safeTitle}_slide_${slide.index + 1}_${timestamp}.pdf`);
          } else {
            // Multiple slides — ZIP
            const JSZip = (await import('jszip')).default;
            const { jsPDF } = await import('jspdf');
            const zip = new JSZip();

            for (const slide of slideImages) {
              const pdf = new jsPDF({
                orientation: slide.width > slide.height ? 'landscape' : 'portrait',
                unit: 'px',
                format: [slide.width, slide.height],
              });
              pdf.addImage(slide.dataUrl, 'PNG', 0, 0, slide.width, slide.height);
              zip.file(`slide_${slide.index + 1}.pdf`, pdf.output('blob'));
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            downloadBlob(zipBlob, `${safeTitle}_slides_${timestamp}.zip`);
          }
          return;
        }
      }

      // COMBINED mode (all slides): download full PDF directly
      if (pdfUrl && !isPartialSelection) {
        // Strategy A: Use chrome.downloads API (most reliable, uses browser cookies natively)
        try {
          console.log('Downloading slide deck PDF via chrome.downloads...');
          const downloadId = await DOMExtractor.downloadViaChrome(
            pdfUrl,
            `${safeTitle}_slides_${timestamp}.pdf`
          );
          if (downloadId !== null) {
            console.log(`PDF download started (downloadId: ${downloadId})`);
            return;
          }
        } catch (e) {
          console.log('chrome.downloads failed:', e);
        }

        // Strategy B: Fetch file directly
        try {
          console.log('Downloading slide deck PDF via direct fetch...');
          const dataUrl = await DOMExtractor.fetchFileInTabContext(pdfUrl);
          if (dataUrl) {
            const blob = await (await fetch(dataUrl)).blob();
            downloadBlob(blob, `${safeTitle}_slides_${timestamp}.pdf`);
            return;
          }
        } catch (e) {
          console.log('PDF fetch failed:', e);
        }
      }

      // Strategy C: Build PDF from individual slide images
      if (slidesWithImages.length > 0) {
        const slideImages = await this.downloadSlideImages(slidesWithImages);
        if (slideImages.length > 0) {
          await exportSlides(slideImages, 'pdf', safeTitle, timestamp);
          return;
        }
      }

      throw new Error('Could not download slide deck PDF. Try Markdown format.');
    }

    // =============================================
    // PNG, PPTX: download individual slide images via tab context (MAIN world)
    // =============================================
    if (format === 'png' || format === 'pptx') {
      let slideImages: Array<{ index: number; dataUrl: string; width: number; height: number }> = [];

      // Strategy 1: Fetch individual images via background tabs
      if (slidesWithImages.length > 0) {
        console.log(`Downloading ${slidesWithImages.length} slide images via background tabs...`);
        slideImages = await this.downloadSlideImages(slidesWithImages);
      }

      // Strategy 2: DOM extraction fallback
      if (slideImages.length === 0) {
        try {
          const domSlideImages = await DOMExtractor.extractSlideImages();
          if (domSlideImages.length > 0) {
            console.log(`Extracted ${domSlideImages.length} slide images from DOM`);
            slideImages = domSlideImages;
          }
        } catch (e) {
          console.log('DOM slide extraction failed:', e);
        }
      }

      if (slideImages.length > 0) {
        await exportSlides(slideImages, format, safeTitle, timestamp);
        return;
      }

      throw new Error(
        'Could not download slide images. Try PDF format or Markdown.'
      );
    }

    // =============================================
    // Markdown: always works (includes image URLs)
    // =============================================
    const slidesMd = slidesToMarkdown(content.slides, notebookTitle);
    downloadText(slidesMd, `${safeTitle}_slides_${timestamp}.md`, 'text/markdown');
  }

  /**
   * Download individual slide images using tab context (MAIN world for Google cookies).
   * Images are fetched SEQUENTIALLY (one at a time) to avoid IPC message size limits.
   * Falls back to direct fetch if tab context isn't available.
   */
  private static async downloadSlideImages(
    slides: SlideContent[]
  ): Promise<Array<{ index: number; dataUrl: string; width: number; height: number }>> {
    const slideImages: Array<{ index: number; dataUrl: string; width: number; height: number }> = [];

    const slidesWithUrls = slides.filter((s) => s.imageUrl);
    if (slidesWithUrls.length === 0) return slideImages;

    console.log(`Fetching ${slidesWithUrls.length} slide images via background tabs...`);

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      if (!slide.imageUrl) continue;

      console.log(`Slide ${i + 1}/${slides.length}: fetching...`);

      const dataUrl = await DOMExtractor.fetchImageInTabContext(slide.imageUrl);

      if (dataUrl) {
        // Parse actual dimensions from the data URL (default 1376x768)
        let width = 1376;
        let height = 768;
        try {
          const sizeMatch = slide.imageUrl.match(/=w(\d+)-h(\d+)/);
          if (sizeMatch) {
            width = parseInt(sizeMatch[1], 10);
            height = parseInt(sizeMatch[2], 10);
          }
        } catch { /* use defaults */ }

        slideImages.push({ index: i, dataUrl, width, height });
        console.log(`Slide ${i + 1}: OK (${width}x${height})`);
      } else {
        console.warn(`Slide ${i + 1}: all fetch strategies failed`);
      }
    }

    console.log(`Successfully fetched ${slideImages.length}/${slides.length} slide images`);
    return slideImages;
  }

}
