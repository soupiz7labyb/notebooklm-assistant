/**
 * Export Format Generators
 * Converts notebook content into various file formats
 */

import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import type {
  SourceContent,
  NoteContent,
  ChatMessage,
  Flashcard,
  DataTable,
  SlideContent,
  MindmapContent,
  MindmapNode,
} from '@/types/export';
import type { ExtractedSlideImage } from './dom-extractor';
import { downloadBlob, downloadText, sanitizeFilename, getTimestamp } from '@/lib/download';

// ─── Markdown Generators ───────────────────────────────────────────

export function sourcesToMarkdown(sources: SourceContent[], notebookTitle: string): string {
  const lines: string[] = [
    `# ${notebookTitle} — Sources`,
    '',
    `> Exported on ${new Date().toLocaleString()}`,
    `> Total sources: ${sources.length}`,
    '',
    '---',
    '',
  ];

  for (const source of sources) {
    lines.push(`## ${source.title}`);
    lines.push('');
    lines.push(`- **Type:** ${source.type}`);
    if (source.url) {
      lines.push(`- **URL:** [${source.url}](${source.url})`);
    }
    lines.push(`- **Status:** ${source.status === 2 ? 'Ready' : 'Processing'}`);
    if (source.content) {
      lines.push('');
      lines.push('### Content');
      lines.push('');
      lines.push(source.content);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function notesToMarkdown(notes: NoteContent[], notebookTitle: string): string {
  const lines: string[] = [
    `# ${notebookTitle} — Notes & Reports`,
    '',
    `> Exported on ${new Date().toLocaleString()}`,
    `> Total notes: ${notes.length}`,
    '',
    '---',
    '',
  ];

  for (const note of notes) {
    lines.push(`## ${note.title}`);
    if (note.createdAt) {
      lines.push(`*Created: ${note.createdAt}*`);
    }
    lines.push('');
    lines.push(note.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function chatToMarkdown(messages: ChatMessage[], notebookTitle: string): string {
  const actualMessages = messages.filter((m) => m.role !== 'date');
  const lines: string[] = [
    `# ${notebookTitle} — Chat History`,
    '',
    `> Exported on ${new Date().toLocaleString()}`,
    `> Total messages: ${actualMessages.length}`,
    '',
    '---',
    '',
  ];

  for (const msg of messages) {
    if (msg.role === 'date') {
      // Date separator
      lines.push(`## ${msg.content}`);
      lines.push('');
      continue;
    }

    const role = msg.role === 'user' ? '**You**' : '**NotebookLM**';
    if (msg.timestamp) {
      lines.push(`### ${role} — ${msg.timestamp}`);
    } else {
      lines.push(`### ${role}`);
    }
    lines.push('');
    lines.push(msg.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function flashcardsToMarkdown(flashcards: Flashcard[], notebookTitle: string): string {
  const lines: string[] = [
    `# ${notebookTitle} — Flashcards`,
    '',
    `> Exported on ${new Date().toLocaleString()}`,
    `> Total flashcards: ${flashcards.length}`,
    '',
    '---',
    '',
  ];

  for (let i = 0; i < flashcards.length; i++) {
    const fc = flashcards[i];
    lines.push(`## Card ${i + 1}`);
    lines.push('');
    lines.push(`**Q:** ${fc.front}`);
    lines.push('');
    lines.push(`**A:** ${fc.back}`);
    if (fc.tags && fc.tags.length > 0) {
      lines.push('');
      lines.push(`*Tags: ${fc.tags.join(', ')}*`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function tablesToMarkdown(tables: DataTable[], notebookTitle: string): string {
  const lines: string[] = [
    `# ${notebookTitle} — Data Tables`,
    '',
    `> Exported on ${new Date().toLocaleString()}`,
    `> Total tables: ${tables.length}`,
    '',
    '---',
    '',
  ];

  for (const table of tables) {
    lines.push(`## ${table.title}`);
    lines.push('');

    // Header row
    lines.push(`| ${table.headers.join(' | ')} |`);
    lines.push(`| ${table.headers.map(() => '---').join(' | ')} |`);

    // Data rows
    for (const row of table.rows) {
      lines.push(`| ${row.join(' | ')} |`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function mindmapToMarkdown(mindmap: MindmapContent): string {
  const lines: string[] = [
    `# ${mindmap.title}`,
    '',
    `> Exported on ${new Date().toLocaleString()}`,
    '',
  ];

  function renderNode(node: MindmapNode, depth: number): void {
    const indent = '  '.repeat(depth);
    const bullet = depth === 0 ? '#' : '-';
    if (depth === 0) {
      lines.push(`${bullet} ${node.label}`);
    } else {
      lines.push(`${indent}${bullet} ${node.label}`);
    }
    for (const child of node.children) {
      renderNode(child, depth + 1);
    }
  }

  renderNode(mindmap.rootNode, 0);

  return lines.join('\n');
}

export function slidesToMarkdown(slides: SlideContent[], notebookTitle: string): string {
  const lines: string[] = [
    `# ${notebookTitle} — Slides`,
    '',
    `> Exported on ${new Date().toLocaleString()}`,
    `> Total slides: ${slides.length}`,
    '',
    '---',
    '',
  ];

  for (const slide of slides) {
    lines.push(`## Slide ${slide.slideNumber}: ${slide.title}`);
    lines.push('');
    lines.push(slide.content);
    if (slide.imageUrl) {
      lines.push('');
      lines.push(`![Slide ${slide.slideNumber}](${slide.imageUrl})`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// ─── CSV Generators ────────────────────────────────────────────────

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function sourcesToCSV(sources: SourceContent[]): string {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const header = 'Title,Type,URL,Status,Content';
  const rows = sources.map(
    (s) =>
      `${escapeCSV(s.title)},${escapeCSV(s.type)},${escapeCSV(s.url || '')},${s.status === 2 ? 'Ready' : 'Processing'},${escapeCSV(s.content || '')}`
  );
  return BOM + [header, ...rows].join('\n');
}

export function flashcardsToCSV(flashcards: Flashcard[]): string {
  const BOM = '\uFEFF';
  const header = 'Front,Back,Tags';
  const rows = flashcards.map(
    (fc) =>
      `${escapeCSV(fc.front)},${escapeCSV(fc.back)},${escapeCSV((fc.tags || []).join(';'))}`
  );
  return BOM + [header, ...rows].join('\n');
}

export function flashcardsToAnki(flashcards: Flashcard[]): string {
  // Anki import format: tab-separated, front\tback\ttags
  const rows = flashcards.map(
    (fc) =>
      `${fc.front.replace(/\t/g, ' ')}\t${fc.back.replace(/\t/g, ' ')}\t${(fc.tags || []).join(' ')}`
  );
  return rows.join('\n');
}

export function tablesToCSV(table: DataTable): string {
  const BOM = '\uFEFF';
  const header = table.headers.map(escapeCSV).join(',');
  const rows = table.rows.map((row) => row.map(escapeCSV).join(','));
  return BOM + [header, ...rows].join('\n');
}

// ─── Plain Text Generators ────────────────────────────────────────

export function sourcesToText(sources: SourceContent[], notebookTitle: string): string {
  const lines: string[] = [
    `${notebookTitle} — Sources`,
    `Exported on ${new Date().toLocaleString()}`,
    `Total sources: ${sources.length}`,
    '═'.repeat(50),
    '',
  ];

  for (const source of sources) {
    lines.push(`Title: ${source.title}`);
    lines.push(`Type: ${source.type}`);
    if (source.url) {
      lines.push(`URL: ${source.url}`);
    }
    lines.push(`Status: ${source.status === 2 ? 'Ready' : 'Processing'}`);
    if (source.content) {
      lines.push('');
      lines.push('Content:');
      lines.push(source.content);
    }
    lines.push('─'.repeat(50));
    lines.push('');
  }

  return lines.join('\n');
}

export function chatToText(messages: ChatMessage[], notebookTitle: string): string {
  const lines: string[] = [
    `${notebookTitle} — Chat History`,
    `Exported on ${new Date().toLocaleString()}`,
    '═'.repeat(50),
    '',
  ];

  for (const msg of messages) {
    if (msg.role === 'date') {
      lines.push(`═══ ${msg.content} ═══`);
      lines.push('');
      continue;
    }
    const role = msg.role === 'user' ? 'You' : 'NotebookLM';
    lines.push(`[${role}]${msg.timestamp ? ` ${msg.timestamp}` : ''}`);
    lines.push(msg.content);
    lines.push('─'.repeat(50));
    lines.push('');
  }

  return lines.join('\n');
}

// ─── PDF Generators (Unicode/Cyrillic support via html2canvas) ────

/**
 * Create a PDF from text content with full Unicode support.
 * Uses html2canvas to render text via the browser's text engine,
 * which supports Cyrillic, CJK, and all other scripts.
 */
async function createPDFAsync(title: string, content: string): Promise<jsPDF> {
  const { default: html2canvas } = await import('html2canvas');

  // Create a hidden container with styled content
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed; left: -9999px; top: 0;
    width: 595px; padding: 40px;
    font-family: "Segoe UI", "Noto Sans", "Roboto", "Arial", sans-serif;
    background: white; color: black;
    line-height: 1.6; font-size: 12px;
  `;

  // Build HTML content
  const escapedTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedContent = content
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  container.innerHTML = `
    <h1 style="font-size:20px; margin:0 0 8px 0;">${escapedTitle}</h1>
    <p style="font-size:10px; color:#888; margin:0 0 12px 0;">Exported on ${new Date().toLocaleString()}</p>
    <hr style="border:none; border-top:1px solid #ddd; margin:0 0 12px 0;">
    <div style="font-size:11px; white-space:pre-wrap; word-wrap:break-word;">${escapedContent}</div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      width: 595,
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgWidth = 210; // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const pageHeight = 297; // A4 height in mm

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    return pdf;
  } finally {
    document.body.removeChild(container);
  }
}

export async function sourcesToPDF(sources: SourceContent[], notebookTitle: string): Promise<jsPDF> {
  const content = sources
    .map((s) => {
      let text = `${s.title}\nType: ${s.type}`;
      if (s.url) text += `\nURL: ${s.url}`;
      if (s.content) text += `\n\n${s.content}`;
      return text + '\n\n---\n\n';
    })
    .join('');

  return createPDFAsync(`${notebookTitle} — Sources`, content);
}

export async function notesToPDF(notes: NoteContent[], notebookTitle: string): Promise<jsPDF> {
  const content = notes
    .map((n) => `${n.title}\n${n.createdAt ? `Created: ${n.createdAt}\n` : ''}\n${n.content}\n\n---\n\n`)
    .join('');

  return createPDFAsync(`${notebookTitle} — Notes & Reports`, content);
}

export async function chatToPDF(messages: ChatMessage[], notebookTitle: string): Promise<jsPDF> {
  const content = messages
    .map((m) => {
      if (m.role === 'date') return `\n═══ ${m.content} ═══\n\n`;
      return `[${m.role === 'user' ? 'You' : 'NotebookLM'}]${m.timestamp ? ` ${m.timestamp}` : ''}\n${m.content}\n\n---\n\n`;
    })
    .join('');

  return createPDFAsync(`${notebookTitle} — Chat History`, content);
}

export async function flashcardsToPDF(flashcards: Flashcard[], notebookTitle: string): Promise<jsPDF> {
  const content = flashcards
    .map((fc, i) => `Card ${i + 1}\nQ: ${fc.front}\nA: ${fc.back}\n${fc.tags?.length ? `Tags: ${fc.tags.join(', ')}\n` : ''}\n---\n\n`)
    .join('');

  return createPDFAsync(`${notebookTitle} — Flashcards`, content);
}

export async function tablesToPDF(tables: DataTable[], notebookTitle: string): Promise<jsPDF> {
  const content = tables
    .map((t) => {
      const headerRow = t.headers.join(' | ');
      const dataRows = t.rows.map((r) => r.join(' | ')).join('\n');
      return `${t.title}\n\n${headerRow}\n${'─'.repeat(headerRow.length)}\n${dataRows}\n\n---\n\n`;
    })
    .join('');

  return createPDFAsync(`${notebookTitle} — Data Tables`, content);
}

// ─── DOCX Generators ──────────────────────────────────────────────

function createDocx(title: string, sections: { heading?: string; content: string }[]): Document {
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
    })
  );

  // Timestamp
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Exported on ${new Date().toLocaleString()}`,
          italics: true,
          color: '888888',
          size: 18,
        }),
      ],
    })
  );

  children.push(new Paragraph({ text: '' }));

  // Sections
  for (const section of sections) {
    if (section.heading) {
      children.push(
        new Paragraph({
          text: section.heading,
          heading: HeadingLevel.HEADING_2,
        })
      );
    }

    // Split content into paragraphs
    const paragraphs = section.content.split('\n');
    for (const para of paragraphs) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: para, size: 22 })],
        })
      );
    }

    children.push(new Paragraph({ text: '' }));
  }

  return new Document({
    sections: [{ children }],
  });
}

export async function sourcesToDocx(sources: SourceContent[], notebookTitle: string): Promise<Blob> {
  const sections = sources.map((s) => {
    let content = `Type: ${s.type}`;
    if (s.url) content += `\nURL: ${s.url}`;
    content += `\nStatus: ${s.status === 2 ? 'Ready' : 'Processing'}`;
    if (s.content) content += `\n\n${s.content}`;
    return { heading: s.title, content };
  });

  const doc = createDocx(`${notebookTitle} — Sources`, sections);
  return await Packer.toBlob(doc);
}

export async function notesToDocx(notes: NoteContent[], notebookTitle: string): Promise<Blob> {
  const sections = notes.map((n) => ({
    heading: n.title,
    content: (n.createdAt ? `Created: ${n.createdAt}\n\n` : '') + n.content,
  }));

  const doc = createDocx(`${notebookTitle} — Notes & Reports`, sections);
  return await Packer.toBlob(doc);
}

export async function chatToDocx(messages: ChatMessage[], notebookTitle: string): Promise<Blob> {
  // Build sections with date separators as headings
  const sections: Array<{ heading: string; content: string }> = [];
  for (const msg of messages) {
    if (msg.role === 'date') {
      sections.push({ heading: msg.content, content: '' });
    } else {
      sections.push({
        heading: `${msg.role === 'user' ? 'You' : 'NotebookLM'}${msg.timestamp ? ` — ${msg.timestamp}` : ''}`,
        content: msg.content,
      });
    }
  }

  const doc = createDocx(`${notebookTitle} — Chat History`, sections);
  return await Packer.toBlob(doc);
}

export async function flashcardsToDocx(flashcards: Flashcard[], notebookTitle: string): Promise<Blob> {
  const sections = flashcards.map((fc, i) => ({
    heading: `Card ${i + 1}`,
    content: `Q: ${fc.front}\n\nA: ${fc.back}${fc.tags?.length ? `\n\nTags: ${fc.tags.join(', ')}` : ''}`,
  }));

  const doc = createDocx(`${notebookTitle} — Flashcards`, sections);
  return await Packer.toBlob(doc);
}

export async function tablesToDocx(tables: DataTable[], notebookTitle: string): Promise<Blob> {
  const sections = tables.map((t) => {
    const headerRow = t.headers.join(' | ');
    const dataRows = t.rows.map((r) => r.join(' | ')).join('\n');
    return {
      heading: t.title,
      content: `${headerRow}\n${'─'.repeat(headerRow.length)}\n${dataRows}`,
    };
  });

  const doc = createDocx(`${notebookTitle} — Data Tables`, sections);
  return await Packer.toBlob(doc);
}

// ─── ZIP Batch Export ──────────────────────────────────────────────

export async function createZipFromFiles(
  files: { name: string; content: string | Blob | Uint8Array }[]
): Promise<Blob> {
  const zip = new JSZip();

  for (const file of files) {
    if (typeof file.content === 'string') {
      zip.file(file.name, file.content);
    } else {
      zip.file(file.name, file.content);
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}

// ─── Image Export Helpers ──────────────────────────────────────────

/**
 * Download an image from a URL and return as a Blob.
 * Tries multiple fetch strategies for CORS/auth compatibility.
 */
async function fetchImageBlob(url: string): Promise<Blob | null> {
  // Strategy 1: Fetch with credentials (for authenticated Google URLs)
  try {
    const response = await fetch(url, { credentials: 'include' });
    if (response.ok) {
      const blob = await response.blob();
      if (blob.size > 0) return blob;
    }
  } catch (e) {
    console.log('Fetch with credentials failed:', e);
  }

  // Strategy 2: Fetch without credentials (for public CDN URLs)
  try {
    const response = await fetch(url, { credentials: 'omit' });
    if (response.ok) {
      const blob = await response.blob();
      if (blob.size > 0) return blob;
    }
  } catch (e) {
    console.log('Fetch without credentials failed:', e);
  }

  // Strategy 3: Try no-cors mode (opaque response, might still work for download)
  try {
    const response = await fetch(url, { mode: 'no-cors' });
    if (response.type === 'opaque') {
      // Can't check .ok on opaque responses, just try to get blob
      const blob = await response.blob();
      if (blob.size > 0) return blob;
    }
  } catch (e) {
    console.log('No-cors fetch failed:', e);
  }

  console.error('All fetch strategies failed for:', url);
  return null;
}

/**
 * Export image-type sources in the requested image format.
 * For each image source:
 *  1. Try to download from source.url (original image URL from API)
 *  2. Try to fetch via the image content URL from API response
 *  3. Fall back to exporting text content
 */
async function exportSourceImages(
  sources: SourceContent[],
  format: string,
  safeTitle: string,
  timestamp: string
): Promise<void> {
  const ext = format;

  // Collect image blobs from sources
  const imageFiles: { name: string; blob: Blob }[] = [];

  for (const source of sources) {
    let blob: Blob | null = null;

    // Try source URL
    if (source.url) {
      blob = await fetchImageBlob(source.url);
    }

    // Try content if it looks like a URL (some image sources store the URL in content)
    if (!blob && source.content && source.content.startsWith('http')) {
      blob = await fetchImageBlob(source.content);
    }

    if (blob) {
      imageFiles.push({
        name: `${sanitizeFilename(source.title)}.${ext}`,
        blob,
      });
    }
  }

  if (imageFiles.length === 0) {
    throw new Error('Could not download any images. The image URLs may require direct browser access.');
  }

  if (imageFiles.length === 1) {
    downloadBlob(imageFiles[0].blob, imageFiles[0].name);
  } else {
    // Multiple images → ZIP
    const files = imageFiles.map((f) => ({ name: f.name, content: f.blob }));
    const zipBlob = await createZipFromFiles(files);
    downloadBlob(zipBlob, `${safeTitle}_images_${timestamp}.zip`);
  }
}

// ─── Slide Deck Export ─────────────────────────────────────────────

/**
 * Convert a data URL to a Uint8Array
 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Export slide images in various formats.
 * Formats: pdf (images in PDF), png (ZIP of PNGs), pptx (images as PPT slides), zip, markdown
 */
export async function exportSlides(
  slideImages: ExtractedSlideImage[],
  format: string,
  safeTitle: string,
  timestamp: string,
): Promise<void> {
  if (slideImages.length === 0) {
    throw new Error('No slide images to export');
  }

  switch (format) {
    case 'pdf': {
      // Create PDF with each slide as a page
      const firstSlide = slideImages[0];
      const pdf = new jsPDF({
        orientation: firstSlide.width > firstSlide.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [firstSlide.width, firstSlide.height],
      });

      for (let i = 0; i < slideImages.length; i++) {
        const slide = slideImages[i];
        if (i > 0) {
          pdf.addPage([slide.width, slide.height], slide.width > slide.height ? 'landscape' : 'portrait');
        }

        if (slide.dataUrl.startsWith('data:')) {
          pdf.addImage(slide.dataUrl, 'PNG', 0, 0, slide.width, slide.height);
        } else {
          // If it's a URL, try to fetch and add
          try {
            const response = await fetch(slide.dataUrl, { credentials: 'include' });
            const blob = await response.blob();
            const reader = new FileReader();
            const dataUrl = await new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            pdf.addImage(dataUrl, 'PNG', 0, 0, slide.width, slide.height);
          } catch (e) {
            console.error(`Failed to add slide ${i} to PDF:`, e);
          }
        }
      }

      downloadBlob(pdf.output('blob'), `${safeTitle}_slides_${timestamp}.pdf`);
      break;
    }

    case 'png': {
      // Export individual PNGs in ZIP
      const zip = new JSZip();
      for (let i = 0; i < slideImages.length; i++) {
        const slide = slideImages[i];
        if (slide.dataUrl.startsWith('data:')) {
          const imgData = dataUrlToUint8Array(slide.dataUrl);
          zip.file(`slide_${i + 1}.png`, imgData);
        } else {
          try {
            const response = await fetch(slide.dataUrl, { credentials: 'include' });
            const blob = await response.blob();
            zip.file(`slide_${i + 1}.png`, blob);
          } catch (e) {
            console.error(`Failed to add slide ${i}:`, e);
          }
        }
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, `${safeTitle}_slides_${timestamp}.zip`);
      break;
    }

    case 'pptx': {
      // Create a PPTX with images — use jsPDF as PDF and rename to avoid dependency
      // Actually, build a minimal PPTX (Office Open XML) using JSZip
      const pptxBlob = await createPptxFromImages(slideImages, safeTitle);
      downloadBlob(pptxBlob, `${safeTitle}_slides_${timestamp}.pptx`);
      break;
    }

    case 'zip': {
      // Same as PNG but explicitly named as ZIP
      const zip = new JSZip();
      for (let i = 0; i < slideImages.length; i++) {
        const slide = slideImages[i];
        if (slide.dataUrl.startsWith('data:')) {
          const imgData = dataUrlToUint8Array(slide.dataUrl);
          zip.file(`slide_${i + 1}.png`, imgData);
        } else {
          try {
            const response = await fetch(slide.dataUrl, { credentials: 'include' });
            const blob = await response.blob();
            zip.file(`slide_${i + 1}.png`, blob);
          } catch (e) {
            console.error(`Failed to add slide ${i}:`, e);
          }
        }
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, `${safeTitle}_slides_${timestamp}.zip`);
      break;
    }

    case 'markdown': {
      // Export as markdown with embedded image references
      let md = `# ${safeTitle} - Slides\n\n`;
      for (let i = 0; i < slideImages.length; i++) {
        md += `## Slide ${i + 1}\n\n`;
        md += `![Slide ${i + 1}](slide_${i + 1}.png)\n\n`;
      }
      downloadText(md, `${safeTitle}_slides_${timestamp}.md`, 'text/markdown');
      break;
    }
  }
}

/**
 * Create a minimal PPTX file from slide images.
 * PPTX is Office Open XML — essentially a ZIP of XML files.
 * Each slide has one image covering the full slide area.
 */
async function createPptxFromImages(
  slideImages: ExtractedSlideImage[],
  _title: string,
): Promise<Blob> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  // 16:9 slide in inches for LAYOUT_WIDE
  const slideWidthIn = 13.333;
  const slideHeightIn = 7.5;

  for (const slide of slideImages) {
    let dataUrl = slide.dataUrl;
    if (!dataUrl.startsWith('data:')) {
      try {
        const response = await fetch(slide.dataUrl, { credentials: 'include' });
        const blob = await response.blob();
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('FileReader error'));
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.error('Failed to fetch slide image for PPTX:', e);
        continue;
      }
    }

    const s = pptx.addSlide();
    s.addImage({ data: dataUrl, x: 0, y: 0, w: slideWidthIn, h: slideHeightIn });
  }

  return pptx.write({ outputType: 'blob' }) as Promise<Blob>;
}

// ─── Export Dispatcher ─────────────────────────────────────────────

export async function exportSources(
  sources: SourceContent[],
  format: string,
  notebookTitle: string,
  batchMode: 'individual' | 'combined'
): Promise<void> {
  const timestamp = getTimestamp();
  const safeTitle = sanitizeFilename(notebookTitle);

  if (batchMode === 'combined' || sources.length === 1) {
    switch (format) {
      case 'markdown': {
        const md = sourcesToMarkdown(sources, notebookTitle);
        downloadText(md, `${safeTitle}_sources_${timestamp}.md`, 'text/markdown');
        break;
      }
      case 'txt': {
        const txt = sourcesToText(sources, notebookTitle);
        downloadText(txt, `${safeTitle}_sources_${timestamp}.txt`);
        break;
      }
      case 'csv': {
        const csv = sourcesToCSV(sources);
        downloadText(csv, `${safeTitle}_sources_${timestamp}.csv`, 'text/csv');
        break;
      }
      case 'pdf': {
        const pdf = await sourcesToPDF(sources, notebookTitle);
        downloadBlob(pdf.output('blob'), `${safeTitle}_sources_${timestamp}.pdf`);
        break;
      }
      case 'docx': {
        const docxBlob = await sourcesToDocx(sources, notebookTitle);
        downloadBlob(docxBlob, `${safeTitle}_sources_${timestamp}.docx`);
        break;
      }
      case 'json': {
        const json = JSON.stringify(sources, null, 2);
        downloadText(json, `${safeTitle}_sources_${timestamp}.json`, 'application/json');
        break;
      }
      case 'zip': {
        const files = sources.map((s) => ({
          name: `${sanitizeFilename(s.title)}.md`,
          content: sourcesToMarkdown([s], s.title),
        }));
        const zipBlob = await createZipFromFiles(files);
        downloadBlob(zipBlob, `${safeTitle}_sources_${timestamp}.zip`);
        break;
      }
      case 'png':
      case 'jpg':
      case 'webp':
      case 'svg': {
        // Image export: download image sources by their URL
        await exportSourceImages(sources, format, safeTitle, timestamp);
        break;
      }
    }
  } else {
    // Individual: export each source as a separate file, bundled in ZIP
    const files: { name: string; content: string | Blob }[] = [];

    for (const source of sources) {
      const safeName = sanitizeFilename(source.title);
      switch (format) {
        case 'markdown':
          files.push({ name: `${safeName}.md`, content: sourcesToMarkdown([source], source.title) });
          break;
        case 'txt':
          files.push({ name: `${safeName}.txt`, content: sourcesToText([source], source.title) });
          break;
        case 'csv':
          files.push({ name: `${safeName}.csv`, content: sourcesToCSV([source]) });
          break;
        case 'pdf': {
          const pdf = await sourcesToPDF([source], source.title);
          files.push({ name: `${safeName}.pdf`, content: pdf.output('blob') });
          break;
        }
        case 'docx': {
          const docxBlob = await sourcesToDocx([source], source.title);
          files.push({ name: `${safeName}.docx`, content: docxBlob });
          break;
        }
        case 'json':
          files.push({ name: `${safeName}.json`, content: JSON.stringify(source, null, 2) });
          break;
        default:
          files.push({ name: `${safeName}.md`, content: sourcesToMarkdown([source], source.title) });
      }
    }

    const zipBlob = await createZipFromFiles(files);
    downloadBlob(zipBlob, `${safeTitle}_sources_individual_${timestamp}.zip`);
  }
}

export async function exportNotes(
  notes: NoteContent[],
  format: string,
  notebookTitle: string,
  batchMode: 'individual' | 'combined'
): Promise<void> {
  const timestamp = getTimestamp();
  const safeTitle = sanitizeFilename(notebookTitle);

  if (batchMode === 'combined' || notes.length === 1) {
    switch (format) {
      case 'markdown': {
        const md = notesToMarkdown(notes, notebookTitle);
        downloadText(md, `${safeTitle}_notes_${timestamp}.md`, 'text/markdown');
        break;
      }
      case 'pdf': {
        const pdf = await notesToPDF(notes, notebookTitle);
        downloadBlob(pdf.output('blob'), `${safeTitle}_notes_${timestamp}.pdf`);
        break;
      }
      case 'docx': {
        const blob = await notesToDocx(notes, notebookTitle);
        downloadBlob(blob, `${safeTitle}_notes_${timestamp}.docx`);
        break;
      }
    }
  } else {
    const files: { name: string; content: string }[] = [];
    for (const note of notes) {
      const safeName = sanitizeFilename(note.title);
      files.push({ name: `${safeName}.md`, content: notesToMarkdown([note], note.title) });
    }
    const zipBlob = await createZipFromFiles(files);
    downloadBlob(zipBlob, `${safeTitle}_notes_individual_${timestamp}.zip`);
  }
}

export async function exportChat(
  messages: ChatMessage[],
  format: string,
  notebookTitle: string,
): Promise<void> {
  const timestamp = getTimestamp();
  const safeTitle = sanitizeFilename(notebookTitle);

  switch (format) {
    case 'markdown': {
      const md = chatToMarkdown(messages, notebookTitle);
      downloadText(md, `${safeTitle}_chat_${timestamp}.md`, 'text/markdown');
      break;
    }
    case 'txt': {
      const txt = chatToText(messages, notebookTitle);
      downloadText(txt, `${safeTitle}_chat_${timestamp}.txt`);
      break;
    }
    case 'pdf': {
      const pdf = await chatToPDF(messages, notebookTitle);
      downloadBlob(pdf.output('blob'), `${safeTitle}_chat_${timestamp}.pdf`);
      break;
    }
    case 'docx': {
      const blob = await chatToDocx(messages, notebookTitle);
      downloadBlob(blob, `${safeTitle}_chat_${timestamp}.docx`);
      break;
    }
  }
}

export async function exportFlashcards(
  flashcards: Flashcard[],
  format: string,
  notebookTitle: string,
  batchMode: 'individual' | 'combined'
): Promise<void> {
  const timestamp = getTimestamp();
  const safeTitle = sanitizeFilename(notebookTitle);

  if (batchMode === 'combined' || flashcards.length <= 1) {
    switch (format) {
      case 'markdown': {
        const md = flashcardsToMarkdown(flashcards, notebookTitle);
        downloadText(md, `${safeTitle}_flashcards_${timestamp}.md`, 'text/markdown');
        break;
      }
      case 'csv': {
        const csv = flashcardsToCSV(flashcards);
        downloadText(csv, `${safeTitle}_flashcards_${timestamp}.csv`, 'text/csv');
        break;
      }
      case 'anki': {
        const anki = flashcardsToAnki(flashcards);
        downloadText(anki, `${safeTitle}_flashcards_${timestamp}.txt`);
        break;
      }
      case 'pdf': {
        const pdf = await flashcardsToPDF(flashcards, notebookTitle);
        downloadBlob(pdf.output('blob'), `${safeTitle}_flashcards_${timestamp}.pdf`);
        break;
      }
      case 'docx': {
        const blob = await flashcardsToDocx(flashcards, notebookTitle);
        downloadBlob(blob, `${safeTitle}_flashcards_${timestamp}.docx`);
        break;
      }
    }
  } else {
    const files = flashcards.map((fc, i) => ({
      name: `card_${i + 1}.md`,
      content: `# Card ${i + 1}\n\n**Q:** ${fc.front}\n\n**A:** ${fc.back}${fc.tags?.length ? `\n\n*Tags: ${fc.tags.join(', ')}*` : ''}`,
    }));
    const zipBlob = await createZipFromFiles(files);
    downloadBlob(zipBlob, `${safeTitle}_flashcards_individual_${timestamp}.zip`);
  }
}

export async function exportTables(
  tables: DataTable[],
  format: string,
  notebookTitle: string,
  batchMode: 'individual' | 'combined'
): Promise<void> {
  const timestamp = getTimestamp();
  const safeTitle = sanitizeFilename(notebookTitle);

  if (batchMode === 'combined' || tables.length === 1) {
    switch (format) {
      case 'markdown': {
        const md = tablesToMarkdown(tables, notebookTitle);
        downloadText(md, `${safeTitle}_tables_${timestamp}.md`, 'text/markdown');
        break;
      }
      case 'csv': {
        // For combined, merge all tables
        const csv = tables.map((t) => `# ${t.title}\n${tablesToCSV(t)}`).join('\n\n');
        downloadText(csv, `${safeTitle}_tables_${timestamp}.csv`, 'text/csv');
        break;
      }
      case 'pdf': {
        const pdf = await tablesToPDF(tables, notebookTitle);
        downloadBlob(pdf.output('blob'), `${safeTitle}_tables_${timestamp}.pdf`);
        break;
      }
      case 'docx': {
        const blob = await tablesToDocx(tables, notebookTitle);
        downloadBlob(blob, `${safeTitle}_tables_${timestamp}.docx`);
        break;
      }
    }
  } else {
    const files = tables.map((t) => ({
      name: `${sanitizeFilename(t.title)}.csv`,
      content: tablesToCSV(t),
    }));
    const zipBlob = await createZipFromFiles(files);
    downloadBlob(zipBlob, `${safeTitle}_tables_individual_${timestamp}.zip`);
  }
}
