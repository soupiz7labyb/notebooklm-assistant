// ─── Export Categories ─────────────────────────────────────────────
export type ExportCategory =
  | 'sources'
  | 'notes'
  | 'chat'
  | 'flashcards'
  | 'quiz'
  | 'tables'
  | 'slides'
  | 'mindmaps'
  | 'infographics';

// ─── Export Formats ────────────────────────────────────────────────
export type ExportFormat =
  | 'markdown'
  | 'docx'
  | 'pdf'
  | 'csv'
  | 'txt'
  | 'json'
  | 'png'
  | 'jpg'
  | 'webp'
  | 'svg'
  | 'pptx'
  | 'mp4'
  | 'anki'
  | 'zip';

// ─── Batch Mode ────────────────────────────────────────────────────
export type BatchMode = 'individual' | 'combined';

// ─── Source Filter Types ───────────────────────────────────────────
export type SourceFilterType = 'all' | 'pdf' | 'url' | 'youtube' | 'text' | 'audio' | 'file' | 'gdrive' | 'image' | 'video' | 'note' | 'mindmap';

// ─── Export Request ────────────────────────────────────────────────
export interface ExportRequest {
  category: ExportCategory;
  format: ExportFormat;
  itemIds: string[];
  batchMode: BatchMode;
  notebookId: string;
  notebookTitle: string;
}

// ─── Category Configuration ────────────────────────────────────────
export interface CategoryConfig {
  id: ExportCategory;
  label: string;
  icon: string;
  formats: FormatOption[];
  supportsBatch: boolean;
  description: string;
}

export interface FormatOption {
  format: ExportFormat;
  label: string;
  extension: string;
  mimeType: string;
}

// ─── Notebook Content Types ────────────────────────────────────────
export interface SourceContent {
  id: string;
  title: string;
  type: string;
  typeCode?: number;
  url?: string | null;
  status: number;
  content?: string; // Text content if available
}

export interface NoteContent {
  id: string;
  title: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'date';
  content: string;
  timestamp?: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  tags?: string[];
}

export interface DataTable {
  id: string;
  title: string;
  headers: string[];
  rows: string[][];
}

export interface SlideContent {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  pdfUrl?: string;   // URL to download the full slide deck as PDF
  slideNumber: number;
}

export interface MindmapNode {
  id: string;
  label: string;
  children: MindmapNode[];
}

export interface MindmapContent {
  id: string;
  title: string;
  rootNode: MindmapNode;
}

export interface InfographicContent {
  id: string;
  title: string;
  imageUrl?: string;
  svgContent?: string;
}

// ─── Artifact Metadata ────────────────────────────────────────────
export interface ArtifactMeta {
  id: string;
  type: string;
  typeCode: number;
  title: string;
  status: number;
}

// ─── Full Notebook Content ─────────────────────────────────────────
export interface NotebookFullContent {
  id: string;
  title: string;
  sources: SourceContent[];
  notes: NoteContent[];
  chatHistory: ChatMessage[];
  flashcards: Flashcard[];
  quizzes: Flashcard[];
  tables: DataTable[];
  slides: SlideContent[];
  mindmaps: MindmapContent[];
  infographics: InfographicContent[];
  artifacts?: ArtifactMeta[];
}

// ─── Export Progress ───────────────────────────────────────────────
export interface ExportProgress {
  status: 'idle' | 'loading' | 'exporting' | 'done' | 'error';
  message?: string;
  progress?: number;
}

// ─── Image Stitching Layout ───────────────────────────────────────
export type StitchLayout = 'vertical' | 'grid' | 'a4';
