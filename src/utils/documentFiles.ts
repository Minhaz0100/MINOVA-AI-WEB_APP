import { jsPDF } from 'jspdf';
import mammoth from 'mammoth';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker using CDN matching installed pdfjs-dist version or fake worker fallback
try {
  const version = (pdfjsLib as any).version || '5.4.624';
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
} catch {
  // ignore worker config error
}

export interface ExtractedFileResult {
  fileName: string;
  fileType: 'pdf' | 'docx' | 'text';
  sizeBytes: number;
  pageCount?: number;
  wordCount: number;
  charCount: number;
  content: string;
}

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'tsv',
  'ts',
  'tsx',
  'js',
  'jsx',
  'py',
  'kt',
  'kts',
  'java',
  'cpp',
  'c',
  'h',
  'hpp',
  'rs',
  'go',
  'sql',
  'xml',
  'yaml',
  'yml',
  'html',
  'htm',
  'css',
  'scss',
  'log',
  'sh',
  'gradle',
  'properties',
  'toml',
  'ini',
]);

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Extracts text from PDF (.pdf), Word (.docx), and text/code/data files directly in the browser.
 */
export async function extractTextFromFile(
  file: File
): Promise<ExtractedFileResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (file.size > 10 * 1024 * 1024) {
    throw new Error(
      'File exceeds the 10 MB browser processing limit. Please select a smaller document.'
    );
  }

  // 1. Handle PDF files client-side via pdfjs-dist
  if (ext === 'pdf' || file.type === 'application/pdf') {
    const arrayBuffer = await file.arrayBuffer();
    try {
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
      });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      const pageTexts: string[] = [];

      const maxPagesToRead = Math.min(numPages, 40);
      for (let pageNum = 1; pageNum <= maxPagesToRead; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageStr = (textContent.items as Array<{ str?: string }>)
          .map((item) => item.str || '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (pageStr) {
          pageTexts.push(`[Page ${pageNum}]\n${pageStr}`);
        }
      }

      const fullText = pageTexts.join('\n\n').trim();
      if (!fullText) {
        throw new Error(
          'This PDF appears to contain scanned images without selectable text. Server-side OCR (/api/files/upload) returns 501 Not Implemented on the backend.'
        );
      }

      return {
        fileName: file.name,
        fileType: 'pdf',
        sizeBytes: file.size,
        pageCount: numPages,
        wordCount: countWords(fullText),
        charCount: fullText.length,
        content: fullText,
      };
    } catch (err) {
      if (err instanceof Error && err.message.includes('scanned images')) {
        throw err;
      }
      throw new Error(
        `Unable to parse PDF in browser: ${
          err instanceof Error ? err.message : 'Invalid or encrypted PDF file.'
        }`
      );
    }
  }

  // 2. Handle Word .docx files client-side via mammoth
  if (
    ext === 'docx' ||
    file.type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const fullText = (result.value || '').trim();

    if (!fullText) {
      throw new Error('The selected .docx file contains no extractable text.');
    }

    return {
      fileName: file.name,
      fileType: 'docx',
      sizeBytes: file.size,
      wordCount: countWords(fullText),
      charCount: fullText.length,
      content: fullText,
    };
  }

  // 3. Handle Text, Markdown, JSON, CSV, and Source Code files
  if (TEXT_EXTENSIONS.has(ext) || file.type.startsWith('text/')) {
    const fullText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () =>
        reject(new Error('Failed to read text file in browser.'));
      reader.readAsText(file);
    });

    if (!fullText.trim()) {
      throw new Error('The selected file is empty.');
    }

    return {
      fileName: file.name,
      fileType: 'text',
      sizeBytes: file.size,
      wordCount: countWords(fullText),
      charCount: fullText.length,
      content: fullText,
    };
  }

  throw new Error(
    `Unsupported binary format (.${ext || 'unknown'}). Client-side extraction supports .pdf, .docx, .md, .txt, .csv, .json, and source code files. Server binary upload (POST /api/files/upload) returns 501 Not Implemented on the backend.`
  );
}

/**
 * Generates and downloads a real formatted PDF (.pdf) document from Markdown/text content.
 */
export function exportDocumentAsPdf(
  title: string,
  markdownContent: string,
  baseFileName = 'minova-ai-document'
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const usableWidth = pageWidth - margin * 2;
  let cursorY = margin;

  // Brand Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(6, 182, 212);
  doc.text('MINOVA AI  ·  Developed by Minhaz', margin, cursorY);
  cursorY += 20;

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(title || 'MINOVA AI Document', usableWidth);
  doc.text(titleLines, margin, cursorY);
  cursorY += titleLines.length * 20 + 6;

  // Divider line
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.75);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 18;

  // Body lines
  const rawLines = markdownContent.split(/\r?\n/);

  for (const rawLine of rawLines) {
    const cleanLine = rawLine
      .replace(/^\s*###\s+/, '')
      .replace(/^\s*##\s+/, '')
      .replace(/^\s*#\s+/, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');

    const isHeading = /^\s*#{1,3}\s+/.test(rawLine);

    if (isHeading) {
      cursorY += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(30, 41, 59);
    }

    if (!cleanLine.trim()) {
      cursorY += 8;
      continue;
    }

    const wrapped = doc.splitTextToSize(cleanLine, usableWidth);
    for (const wLine of wrapped) {
      if (cursorY > pageHeight - margin - 24) {
        doc.addPage();
        cursorY = margin;
      }
      doc.text(wLine, margin, cursorY);
      cursorY += isHeading ? 16 : 14;
    }
  }

  // Page footers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Generated by MINOVA AI · Page ${i} of ${totalPages}`,
      margin,
      pageHeight - 24
    );
  }

  const safeName =
    baseFileName
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-|-$/g, '') || 'minova-document';

  doc.save(`${safeName}.pdf`);
}

/**
 * Generates and downloads a real Microsoft Word (.docx) binary file from Markdown/text content.
 */
export async function exportDocumentAsDocx(
  title: string,
  markdownContent: string,
  baseFileName = 'minova-ai-document'
): Promise<void> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: title || 'MINOVA AI Document',
          bold: true,
          size: 32,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated by MINOVA AI · Developed by Minhaz · ${new Date().toLocaleDateString()}`,
          italics: true,
          color: '64748B',
          size: 20,
        }),
      ],
    }),
    new Paragraph({ text: '' }),
  ];

  const lines = markdownContent.split(/\r?\n/);
  for (const line of lines) {
    if (/^\s*#\s+/.test(line)) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [
            new TextRun({
              text: line.replace(/^\s*#\s+/, '').replace(/\*\*/g, ''),
              bold: true,
            }),
          ],
        })
      );
    } else if (/^\s*##\s+/.test(line)) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: line.replace(/^\s*##\s+/, '').replace(/\*\*/g, ''),
              bold: true,
            }),
          ],
        })
      );
    } else if (/^\s*###\s+/.test(line)) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [
            new TextRun({
              text: line.replace(/^\s*###\s+/, '').replace(/\*\*/g, ''),
              bold: true,
            }),
          ],
        })
      );
    } else {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line.replace(/\*\*(.*?)\*\*/g, '$1'),
              size: 22,
            }),
          ],
        })
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName =
    baseFileName
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-|-$/g, '') || 'minova-document';
  a.href = url;
  a.download = `${safeName}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
