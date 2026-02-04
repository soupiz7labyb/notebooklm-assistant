/**
 * Smart text splitter that splits text into chunks without cutting words
 * Similar to langchain's text splitter
 */

export interface Chunk {
  text: string;
  index: number;
  start: number;
  end: number;
}

export class TextSplitter {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(chunkSize: number = 500000, chunkOverlap: number = 1000) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  splitText(text: string): Chunk[] {
    if (text.length <= this.chunkSize) {
      return [{ text, index: 0, start: 0, end: text.length }];
    }

    const chunks: Chunk[] = [];
    let start = 0;
    let index = 0;

    while (start < text.length) {
      let end = start + this.chunkSize;

      // If not the last chunk, try to break at a word boundary
      if (end < text.length) {
        // Look for a good break point (sentence end, paragraph, or word boundary)
        const searchStart = Math.max(start, end - 200); // Look back 200 chars
        const searchEnd = Math.min(text.length, end + 200); // Look forward 200 chars
        const searchText = text.substring(searchStart, searchEnd);

        // Prefer paragraph break
        let breakPoint = searchText.lastIndexOf('\n\n');
        if (breakPoint === -1) {
          // Then sentence break
          breakPoint = searchText.lastIndexOf('. ');
          if (breakPoint === -1) {
            // Then word break
            breakPoint = searchText.lastIndexOf(' ');
          }
        }

        if (breakPoint !== -1) {
          end = searchStart + breakPoint + (breakPoint === searchText.lastIndexOf('\n\n') ? 2 : 1);
        }
      } else {
        end = text.length;
      }

      const chunkText = text.substring(start, end);
      chunks.push({
        text: chunkText,
        index,
        start,
        end,
      });

      // Move start position with overlap
      start = Math.max(start + 1, end - this.chunkOverlap);
      index++;
    }

    return chunks;
  }
}
