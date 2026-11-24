import { Injectable } from '@nestjs/common';
import type { ExtractedPage } from './extraction.service';

export interface DetectedChapter {
  title: string;
  orderIndex: number;
  pageFrom: number;
  pageTo: number;
  body: string;
}

export interface StructuredDocument {
  chapters: DetectedChapter[];
  chunks: { chapterIndex: number; page: number; content: string; orderIndex: number }[];
  structureWarnings: string[];
}

const CHAPTER_PATTERNS = [
  /^\s*(chapitre|chapter|module|partie|section|unité|unite)\s+([0-9IVXLC]+)\b[.:\s-]*(.*)$/i,
  /^\s*([IVXLC]{1,5})\.\s+([A-ZÀ-Ý][^\n]{2,80})$/,
  /^\s*([0-9]{1,2})\.\s+([A-ZÀ-Ý][^\n]{2,80})$/,
];

const CHUNK_TARGET_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 150;

/**
 * Détection de structure et découpage en chunks indexables.
 *
 * Règles :
 *  - un titre est reconnu par motif (Chapitre X, 1. Titre, I. Titre) ou par
 *    typographie (ligne courte, isolée, sans ponctuation finale en majuscules) ;
 *  - chaque chunk conserve sa page et son chapitre d'origine pour la citation ;
 *  - les tableaux sont conservés en texte brut aligné (pas de perte de contenu) ;
 *  - si aucun chapitre n'est détecté, un chapitre unique « Document complet »
 *    est créé et l'ambiguïté est signalée à l'utilisateur.
 */
@Injectable()
export class StructureService {
  structure(pages: ExtractedPage[], documentTitle: string): StructuredDocument {
    const warnings: string[] = [];
    const lines: { text: string; page: number }[] = [];

    for (const page of pages) {
      for (const rawLine of page.text.split(/\r?\n/)) {
        lines.push({ text: rawLine, page: page.pageNumber });
      }
    }

    const headings: { index: number; title: string; page: number }[] = [];
    lines.forEach((line, index) => {
      const text = line.text.trim();
      if (text.length === 0 || text.length > 120) return;
      for (const pattern of CHAPTER_PATTERNS) {
        const match = pattern.exec(text);
        if (match) {
          const title = text.replace(/\s+/g, ' ').trim();
          // Évite de répéter un titre identique (en-têtes de page récurrents).
          const previous = headings.at(-1);
          if (!previous || previous.title.toLowerCase() !== title.toLowerCase()) {
            headings.push({ index, title, page: line.page });
          }
          return;
        }
      }
      // Titre typographique : ligne courte, débutant par une majuscule,
      // sans point final, entourée de lignes vides.
      const prev = lines[index - 1]?.text.trim() ?? '';
      const next = lines[index + 1]?.text.trim() ?? '';
      if (
        text.length >= 6 &&
        text.length <= 70 &&
        /^[A-ZÀ-Ý0-9]/.test(text) &&
        !/[.;:,]$/.test(text) &&
        prev === '' &&
        next === '' &&
        // exclut les formules et les lignes majoritairement numériques
        (text.match(/[A-Za-zÀ-ÿ]/g) ?? []).length > text.length * 0.5
      ) {
        const previous = headings.at(-1);
        if (!previous || previous.title.toLowerCase() !== text.toLowerCase()) {
          headings.push({ index, title: text, page: line.page });
        }
      }
    });

    const chapters: DetectedChapter[] = [];
    if (headings.length === 0) {
      warnings.push(
        "Aucun découpage par chapitre n'a pu être identifié : le document est traité comme un chapitre unique. Vous pouvez renommer les sections manuellement après import.",
      );
      const body = lines.map((l) => l.text).join('\n');
      chapters.push({
        title: documentTitle,
        orderIndex: 0,
        pageFrom: pages[0]?.pageNumber ?? 1,
        pageTo: pages.at(-1)?.pageNumber ?? 1,
        body,
      });
    } else {
      // Contenu avant le premier titre : conservé sous « Introduction ».
      const firstHeading = headings[0];
      if (firstHeading && firstHeading.index > 5) {
        const prelude = lines.slice(0, firstHeading.index).map((l) => l.text).join('\n').trim();
        if (prelude.length > 0) {
          chapters.push({
            title: 'Introduction',
            orderIndex: 0,
            pageFrom: pages[0]?.pageNumber ?? 1,
            pageTo: firstHeading.page,
            body: prelude,
          });
        }
      }

      headings.forEach((heading, position) => {
        const end = headings[position + 1]?.index ?? lines.length;
        const body = lines
          .slice(heading.index, end)
          .map((l) => l.text)
          .join('\n')
          .trim();
        if (body.length === 0) return;
        const pageSlice = lines.slice(heading.index, end).map((l) => l.page);
        chapters.push({
          title: heading.title,
          orderIndex: chapters.length,
          pageFrom: Math.min(...pageSlice),
          pageTo: Math.max(...pageSlice),
          body,
        });
      });
    }

    const chunks: StructuredDocument['chunks'] = [];
    let orderIndex = 0;
    chapters.forEach((chapter, chapterIndex) => {
      if (chapter.body.length <= CHUNK_TARGET_CHARS) {
        chunks.push({
          chapterIndex,
          page: chapter.pageFrom,
          content: chapter.body,
          orderIndex: orderIndex++,
        });
        return;
      }
      // Découpage par paragraphes, avec chevauchement pour ne pas couper une idée.
      const paragraphs = chapter.body.split(/\n{2,}/).filter((p) => p.trim().length > 0);
      let buffer = '';
      for (const paragraph of paragraphs) {
        if (buffer.length + paragraph.length > CHUNK_TARGET_CHARS && buffer.length > 0) {
          chunks.push({
            chapterIndex,
            page: chapter.pageFrom,
            content: buffer.trim(),
            orderIndex: orderIndex++,
          });
          buffer = buffer.slice(Math.max(0, buffer.length - CHUNK_OVERLAP_CHARS));
        }
        buffer += `${paragraph}\n\n`;
      }
      if (buffer.trim().length > 0) {
        chunks.push({
          chapterIndex,
          page: chapter.pageFrom,
          content: buffer.trim(),
          orderIndex: orderIndex++,
        });
      }
    });

    return { chapters, chunks, structureWarnings: warnings };
  }
}
