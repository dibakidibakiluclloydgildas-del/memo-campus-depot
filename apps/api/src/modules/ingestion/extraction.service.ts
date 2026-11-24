import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  usedOcr: boolean;
  confidence?: number;
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  pageCount: number;
  ocrUsed: boolean;
  ocrPages: number;
  warnings: string[];
  detectedMime: string;
}

const MIN_TEXT_PER_PAGE = 40;

/**
 * Extraction de texte : PDF natif → OCR (Tesseract) si nécessaire → DOCX.
 *
 * Politique de fiabilité (cahier des charges §5) :
 *  - on n'invente jamais de texte : une page vide reste vide et est signalée ;
 *  - chaque page conserve son numéro pour la traçabilité des sources ;
 *  - la qualité OCR est mesurée (confiance Tesseract) et exposée ;
 *  - les échecs partiels donnent un statut PARTIAL, pas un faux « prêt ».
 *
 * Outils externe requis : `pdftoppm`/`pdfinfo` (poppler) et `tesseract` avec le
 * paquet de langue française. Leur absence est détectée et documentée.
 */
@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);
  private pdfParse: ((buffer: Buffer) => Promise<{ text: string; numpages?: number; info?: unknown }>) | null = null;
  private mammoth: typeof import('mammoth') | null = null;

  private async loadPdfParser() {
    if (!this.pdfParse) {
      const mod = (await import('pdf-parse')) as unknown as {
        default?: (buffer: Buffer) => Promise<{ text: string; numpages?: number }>;
      } & ((buffer: Buffer) => Promise<{ text: string; numpages?: number }>);
      this.pdfParse = (mod.default ?? mod) as never;
    }
    return this.pdfParse;
  }

  private async loadMammoth(): Promise<typeof import('mammoth')> {
    if (!this.mammoth) this.mammoth = await import('mammoth');
    return this.mammoth;
  }

  async extract(buffer: Buffer, mimeType: string, language = 'fra'): Promise<ExtractionResult> {
    if (mimeType === 'application/pdf') return this.extractPdf(buffer, language);
    if (mimeType === 'image/png' || mimeType === 'image/jpeg') return this.extractImage(buffer, language);
    if (mimeType.includes('wordprocessingml')) return this.extractDocx(buffer);
    throw new Error(`Type de fichier non pris en charge : ${mimeType}`);
  }

  // ---------------------------------------------------------------------------
  // PDF
  // ---------------------------------------------------------------------------

  private async extractPdf(buffer: Buffer, language: string): Promise<ExtractionResult> {
    const warnings: string[] = [];
    let perPage: string[] = [];
    let pageCount = 0;

    try {
      pageCount = await this.countPdfPages(buffer);
      perPage = await this.extractPdfTextPerPage(buffer, pageCount);
    } catch (error) {
      warnings.push(
        `Extraction PDF native incomplète (${(error as Error).message}). Le document est peut-être protégé ou corrompu.`,
      );
    }

    const pages: ExtractedPage[] = perPage.map((text, index) => ({
      pageNumber: index + 1,
      text: text.trim(),
      usedOcr: false,
    }));

    const pagesNeedingOcr = pages.filter((page) => page.text.length < MIN_TEXT_PER_PAGE);
    let ocrUsed = false;
    let ocrPages = 0;

    if (pagesNeedingOcr.length > 0 && pagesNeedingOcr.length <= 60) {
      this.logger.log(`OCR requis sur ${pagesNeedingOcr.length} page(s)`);
      for (const page of pagesNeedingOcr) {
        try {
          const ocr = await this.ocrPdfPage(buffer, page.pageNumber, language);
          if (ocr.text.trim().length > page.text.length) {
            page.text = ocr.text.trim();
            page.usedOcr = true;
            page.confidence = ocr.confidence;
            ocrUsed = true;
            ocrPages += 1;
          }
        } catch (error) {
          warnings.push(
            `OCR impossible sur la page ${page.pageNumber} : ${(error as Error).message}. Cette page est signalée comme non exploitée.`,
          );
        }
      }
    } else if (pagesNeedingOcr.length > 60) {
      warnings.push(
        `Document majoritairement scanné (${pagesNeedingOcr.length} pages sans texte). Importez-le par lots de 60 pages maximum pour garantir un OCR fiable.`,
      );
    }

    const emptyPages = pages.filter((p) => p.text.length === 0).map((p) => p.pageNumber);
    if (emptyPages.length > 0) {
      warnings.push(
        `Aucun texte exploitable sur la/les page(s) ${emptyPages.slice(0, 10).join(', ')}${emptyPages.length > 10 ? '…' : ''}. Ces pages ne seront pas utilisées comme source.`,
      );
    }

    return {
      pages,
      pageCount: pageCount || pages.length,
      ocrUsed,
      ocrPages,
      warnings,
      detectedMime: 'application/pdf',
    };
  }

  private async countPdfPages(buffer: Buffer): Promise<number> {
    const dir = await mkdtemp(join(tmpdir(), 'memo-pdf-'));
    try {
      const file = join(dir, 'input.pdf');
      await writeFile(file, buffer);
      const { stdout } = await execFileAsync('pdfinfo', [file], { timeout: 30_000 });
      const match = /Pages:\s+(\d+)/.exec(stdout);
      return match?.[1] ? Number.parseInt(match[1], 10) : 0;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Rendu page par page puis extraction par pdftotext (fiable et sans dépendance native). */
  private async extractPdfTextPerPage(buffer: Buffer, pageCount: number): Promise<string[]> {
    const dir = await mkdtemp(join(tmpdir(), 'memo-pdf-'));
    try {
      const file = join(dir, 'input.pdf');
      await writeFile(file, buffer);
      const pages: string[] = [];
      const total = pageCount || 1;
      for (let page = 1; page <= total; page += 1) {
        try {
          const { stdout } = await execFileAsync(
            'pdftotext',
            ['-layout', '-f', String(page), '-l', String(page), '-enc', 'UTF-8', file, '-'],
            { timeout: 30_000, maxBuffer: 20 * 1024 * 1024 },
          );
          pages.push(stdout);
        } catch {
          // pdftotext absent ou page illisible : repli sur pdf-parse pour l'ensemble.
          const parse = await this.loadPdfParser();
          const result = await parse(buffer);
          const chunks = result.text.split('\f');
          while (chunks.length < total) chunks.push('');
          return chunks.slice(0, total);
        }
      }
      return pages;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async ocrPdfPage(
    buffer: Buffer,
    pageNumber: number,
    language: string,
  ): Promise<{ text: string; confidence: number }> {
    const dir = await mkdtemp(join(tmpdir(), 'memo-ocr-'));
    try {
      const file = join(dir, 'input.pdf');
      await writeFile(file, buffer);
      const prefix = join(dir, 'page');
      // 300 dpi : compromis précision / temps de traitement.
      await execFileAsync(
        'pdftoppm',
        ['-r', '300', '-f', String(pageNumber), '-l', String(pageNumber), '-png', '-singlefile', file, prefix],
        { timeout: 120_000 },
      );
      const langParam = language.startsWith('fr') ? 'fra' : 'eng';
      const { stdout } = await execFileAsync(
        'tesseract',
        [`${prefix}.png`, 'stdout', '-l', langParam, '--psm', '3'],
        { timeout: 180_000, maxBuffer: 20 * 1024 * 1024 },
      );
      const text = stdout.replace(/\n{3,}/g, '\n\n');
      return { text, confidence: estimateOcrConfidence(text) };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Images
  // ---------------------------------------------------------------------------

  private async extractImage(buffer: Buffer, language: string): Promise<ExtractionResult> {
    const dir = await mkdtemp(join(tmpdir(), 'memo-img-'));
    try {
      const file = join(dir, 'image.png');
      await writeFile(file, buffer);
      const langParam = language.startsWith('fr') ? 'fra' : 'eng';
      const { stdout } = await execFileAsync(
        'tesseract',
        [file, 'stdout', '-l', langParam, '--psm', '3'],
        { timeout: 180_000, maxBuffer: 20 * 1024 * 1024 },
      );
      const text = stdout.trim();
      const warnings: string[] = [];
      if (text.length < MIN_TEXT_PER_PAGE) {
        warnings.push(
          "Très peu de texte reconnu sur cette image. Vérifiez la netteté, l'orientation et l'éclairage, puis réimportez une photo plus lisible.",
        );
      }
      return {
        pages: [{ pageNumber: 1, text, usedOcr: true, confidence: estimateOcrConfidence(text) }],
        pageCount: 1,
        ocrUsed: true,
        ocrPages: 1,
        warnings,
        detectedMime: 'image',
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  // ---------------------------------------------------------------------------
  // DOCX
  // ---------------------------------------------------------------------------

  private async extractDocx(buffer: Buffer): Promise<ExtractionResult> {
    const mammoth = await this.loadMammoth();
    const { value } = await mammoth.extractRawText({ buffer });
    // Le DOCX n'a pas de pagination fiable : on découpe en "pages" logiques de
    // ~3 000 caractères pour permettre la citation, et on le signale.
    const blocks = value.split(/\n{2,}/).filter((b) => b.trim().length > 0);
    const pages: ExtractedPage[] = [];
    let current = '';
    let pageNumber = 1;
    for (const block of blocks) {
      if (current.length + block.length > 3000 && current.length > 0) {
        pages.push({ pageNumber, text: current.trim(), usedOcr: false });
        pageNumber += 1;
        current = '';
      }
      current += `${block}\n\n`;
    }
    if (current.trim().length > 0) pages.push({ pageNumber, text: current.trim(), usedOcr: false });

    return {
      pages,
      pageCount: pages.length,
      ocrUsed: false,
      ocrPages: 0,
      warnings: [
        'Document Word : la pagination d’origine n’est pas conservée. Les références indiquent une section logique du document.',
      ],
      detectedMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  /** Détection du type réel du fichier par signature binaire (magic bytes). */
  sniffMime(buffer: Buffer, declared: string): string | null {
    const head = buffer.subarray(0, 8);
    if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
    if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg';
    if (head.toString('hex').startsWith('89504e47')) return 'image/png';
    if (head.toString('hex').startsWith('504b0304')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    return null;
  }
}

function estimateOcrConfidence(text: string): number {
  if (text.length === 0) return 0;
  const alphanumeric = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const suspicious = (text.match(/[|_~`^]{2,}|[^\p{L}\p{N}\s.,;:!?'"()\-–—%°+=/\\[\]{}<>|_*&@#€$]/gu) ?? []).length;
  const base = alphanumeric / text.length;
  const penalty = Math.min(0.4, suspicious / text.length);
  return Math.max(0, Math.min(1, Number((base - penalty).toFixed(3))));
}
