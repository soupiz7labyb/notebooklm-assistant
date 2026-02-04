import { TextSplitter } from '@/lib/text-splitter';
import { CHUNK_SIZE } from '@/lib/constants';

/**
 * Service for processing and reading files
 */
export class FileProcessor {
  /**
   * Read text file
   */
  static async readTextFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as string);
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  /**
   * Read file as base64
   */
  static async readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Process file and determine if it needs chunking
   */
  static async processFile(file: File): Promise<{
    content: string;
    needsChunking: boolean;
    chunks?: Array<{ text: string; index: number }>;
  }> {
    const extension = file.name.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'txt':
      case 'md':
      case 'markdown': {
        const text = await this.readTextFile(file);
        const needsChunking = text.length > CHUNK_SIZE;

        if (needsChunking) {
          const splitter = new TextSplitter(CHUNK_SIZE);
          const chunks = splitter.splitText(text);
          return {
            content: text,
            needsChunking: true,
            chunks: chunks.map((chunk) => ({
              text: chunk.text,
              index: chunk.index,
            })),
          };
        }

        return {
          content: text,
          needsChunking: false,
        };
      }

      case 'pdf': {
        // Extract text from PDF using pdfjs-dist
        // For Chrome Extensions, we need to use worker from extension resources
        try {
          const pdfjsLib = await import('pdfjs-dist');
          
          // Use worker from extension resources
          // Worker file is copied to public/ and will be available in dist/
          const workerUrl = chrome.runtime.getURL('pdf.worker.min.js');
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
          
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ 
            data: arrayBuffer,
            useWorkerFetch: false,
            isEvalSupported: false,
            useSystemFonts: false,
            verbosity: 0,
            disableAutoFetch: true,
            disableStream: true,
          }).promise;
          
          let fullText = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .map((item: any) => item.str)
              .join(' ');
            fullText += pageText + '\n\n';
          }
          
          const needsChunking = fullText.length > CHUNK_SIZE;
          
          if (needsChunking) {
            const splitter = new TextSplitter(CHUNK_SIZE);
            const chunks = splitter.splitText(fullText);
            return {
              content: fullText,
              needsChunking: true,
              chunks: chunks.map((chunk) => ({
                text: chunk.text,
                index: chunk.index,
              })),
            };
          }
          
          return {
            content: fullText,
            needsChunking: false,
          };
        } catch (error) {
          console.error('Error extracting text from PDF:', error);
          throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      case 'docx': {
        // DOCX requires special parsing - for now, convert to base64
        // In production, you might want to use a library like mammoth
        const base64 = await this.readFileAsBase64(file);
        return {
          content: base64,
          needsChunking: false,
        };
      }

      default:
        throw new Error(`Unsupported file type: ${extension}`);
    }
  }

  /**
   * Get MIME type for file
   */
  static getMimeType(file: File): string {
    const extension = file.name.split('.').pop()?.toLowerCase();

    const mimeTypes: Record<string, string> = {
      txt: 'text/plain',
      md: 'text/markdown',
      markdown: 'text/markdown',
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    return mimeTypes[extension || ''] || file.type || 'application/octet-stream';
  }
}
