import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';

const PROCESSED_DIR = join(import.meta.dirname, '..', 'data', 'processed');
const EMBEDDINGS_DIR = join(import.meta.dirname, '..', 'data', 'embeddings');
const CHUNKS_FILE = join(EMBEDDINGS_DIR, 'chunks.jsonl');

const MAX_CHUNK_TOKENS = 600;
const OVERLAP_TOKENS = 100;
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_CHUNK_CHARS = MAX_CHUNK_TOKENS * APPROX_CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * APPROX_CHARS_PER_TOKEN;

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, body: content };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return { metadata: meta, body: match[2] };
}

function splitIntoSections(text) {
  const sections = [];
  const lines = text.split('\n');
  let currentHeading = '';
  let currentContent = [];

  for (const line of lines) {
    if (/^#{2,4}\s/.test(line)) {
      if (currentContent.length > 0) {
        sections.push({
          heading: currentHeading,
          text: currentContent.join('\n').trim()
        });
      }
      currentHeading = line.replace(/^#+\s*/, '');
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0) {
    sections.push({
      heading: currentHeading,
      text: currentContent.join('\n').trim()
    });
  }

  return sections;
}

function chunkText(text, heading) {
  if (text.length <= MAX_CHUNK_CHARS) {
    return [text];
  }

  const chunks = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = '';

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).length > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push(current.trim());
      // Overlap: keep last portion
      const words = current.split(' ');
      const overlapWords = Math.floor(OVERLAP_CHARS / 5);
      current = words.slice(-overlapWords).join(' ') + ' ' + sentence;
    } else {
      current = current ? current + ' ' + sentence : sentence;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

async function getFiles(dir) {
  const entries = [];
  try {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = join(dir, item.name);
      if (item.isDirectory()) {
        entries.push(...await getFiles(fullPath));
      } else if (item.name.endsWith('.md')) {
        entries.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return entries;
}

async function main() {
  console.log('Chunking processed data for embeddings...\n');

  await mkdir(EMBEDDINGS_DIR, { recursive: true });

  const files = await getFiles(PROCESSED_DIR);
  console.log(`Found ${files.length} processed files.`);

  const allChunks = [];
  let chunkId = 0;

  for (const filePath of files) {
    const content = await readFile(filePath, 'utf-8');
    const { metadata, body } = parseFrontmatter(content);

    if (body.trim().length < 50) continue;

    const sections = splitIntoSections(body);
    const fileSlug = basename(filePath, '.md');

    for (const section of sections) {
      if (section.text.length < 30) continue;

      const textChunks = chunkText(section.text, section.heading);

      for (let i = 0; i < textChunks.length; i++) {
        const chunk = {
          id: `${metadata.source || 'unknown'}_${fileSlug}_${chunkId}`,
          text: textChunks[i],
          metadata: {
            source: metadata.source || 'unknown',
            category: metadata.category || 'general',
            system: metadata.system || 'general',
            modality: metadata.modality || 'all',
            article_title: metadata.title || fileSlug,
            section_heading: section.heading || '',
            chunk_index: i,
            file: basename(filePath)
          }
        };
        allChunks.push(chunk);
        chunkId++;
      }
    }
  }

  // Write as JSONL
  const jsonl = allChunks.map(c => JSON.stringify(c)).join('\n');
  await writeFile(CHUNKS_FILE, jsonl, 'utf-8');

  console.log(`\nDone! Created ${allChunks.length} chunks in ${CHUNKS_FILE}`);
  console.log(`Average chunk size: ${Math.round(allChunks.reduce((sum, c) => sum + c.text.length, 0) / allChunks.length)} chars`);
}

main().catch(console.error);
