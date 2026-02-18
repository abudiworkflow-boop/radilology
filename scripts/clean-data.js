import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';

const RAW_DIR = join(import.meta.dirname, '..', 'data', 'raw');
const PROCESSED_DIR = join(import.meta.dirname, '..', 'data', 'processed');

function cleanMarkdown(raw) {
  let text = raw;

  // Remove common navigation/chrome patterns
  text = text.replace(/^#{1,2}\s*(Navigation|Menu|Sidebar|Footer|Header|Search|Log\s*in|Sign\s*up).*$/gim, '');
  text = text.replace(/\[Skip to .*?\]\(.*?\)/gi, '');
  text = text.replace(/\[Home\]\(.*?\)/gi, '');
  text = text.replace(/^\s*[-*]\s*(Home|About|Contact|Privacy|Terms|FAQ|Help)\s*$/gim, '');

  // Remove ad-like patterns
  text = text.replace(/^\s*Advertisement\s*$/gim, '');
  text = text.replace(/^\s*Sponsored\s*$/gim, '');

  // Remove excessive blank lines (3+ → 2)
  text = text.replace(/\n{3,}/g, '\n\n');

  // Remove leading/trailing whitespace
  text = text.trim();

  return text;
}

function extractMetadata(content, filePath, source) {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : basename(filePath, '.md');

  // Try to detect category from content
  let category = 'general';
  const lowerContent = content.toLowerCase();

  if (/template|report\s+format|structured\s+report/.test(lowerContent)) {
    category = 'report-template';
  } else if (/anatomy|anatomic|anatomical/.test(lowerContent)) {
    category = 'anatomy';
  } else if (/fracture|tumor|infection|patholog|disease|syndrome|abnormal/.test(lowerContent)) {
    category = 'pathology';
  } else if (/technique|protocol|imaging|modality|acquisition/.test(lowerContent)) {
    category = 'imaging-technique';
  } else if (/definition|glossary|terminology/.test(lowerContent)) {
    category = 'radiology-term';
  }

  // Detect body system
  let system = 'general';
  if (/chest|lung|pulmonary|cardiac|heart|thorax|thoracic|mediastin/.test(lowerContent)) {
    system = 'chest';
  } else if (/brain|head|skull|cranial|neuro|intracranial/.test(lowerContent)) {
    system = 'head-neck';
  } else if (/abdomen|abdominal|liver|spleen|kidney|renal|pancrea|bowel|gi\b|gastrointestinal/.test(lowerContent)) {
    system = 'abdomen-pelvis';
  } else if (/spine|spinal|vertebr|cervical|lumbar|thoracic\s+spine|disc/.test(lowerContent)) {
    system = 'spine';
  } else if (/shoulder|humerus|elbow|wrist|hand|finger|upper\s+extremity/.test(lowerContent)) {
    system = 'upper-extremity';
  } else if (/hip|femur|knee|tibia|ankle|foot|toe|lower\s+extremity/.test(lowerContent)) {
    system = 'lower-extremity';
  }

  // Detect modality
  let modality = 'all';
  if (/\bx-ray\b|\bxray\b|\bradiograph\b|\bplain\s+film\b/.test(lowerContent)) {
    modality = 'xray';
  } else if (/\bct\b|\bcomputed\s+tomography\b/.test(lowerContent)) {
    modality = 'ct';
  } else if (/\bmri\b|\bmagnetic\s+resonance\b/.test(lowerContent)) {
    modality = 'mri';
  } else if (/\bultrasound\b|\bsonograph\b|\bus\b/.test(lowerContent)) {
    modality = 'ultrasound';
  }

  return { title, category, system, modality, source };
}

async function getFiles(dir) {
  const entries = [];
  try {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = join(dir, item.name);
      if (item.isDirectory()) {
        entries.push(...await getFiles(fullPath));
      } else if (item.name.endsWith('.md') || item.name.endsWith('.json')) {
        entries.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist yet
  }
  return entries;
}

async function main() {
  console.log('Cleaning raw scraped data...\n');

  const sources = ['radreport', 'learningradiology', 'medpix', 'statpearls', 'eurorad'];
  let totalCleaned = 0;

  for (const source of sources) {
    const sourceDir = join(RAW_DIR, source);
    const files = await getFiles(sourceDir);

    if (files.length === 0) {
      console.log(`  [${source}] No files found, skipping.`);
      continue;
    }

    console.log(`  [${source}] Found ${files.length} files`);

    for (const filePath of files) {
      const raw = await readFile(filePath, 'utf-8');
      const cleaned = cleanMarkdown(raw);

      if (cleaned.length < 50) {
        console.log(`    Skipping ${basename(filePath)} (too short after cleaning)`);
        continue;
      }

      const metadata = extractMetadata(cleaned, filePath, source);

      // Determine output directory based on category and system
      let outDir;
      if (metadata.category === 'report-template') {
        const subDir = metadata.modality !== 'all'
          ? `${metadata.modality}-${metadata.system}`
          : metadata.system;
        outDir = join(PROCESSED_DIR, 'report-templates', subDir);
      } else if (metadata.category === 'anatomy') {
        outDir = join(PROCESSED_DIR, 'anatomy', metadata.system);
      } else if (metadata.category === 'pathology') {
        outDir = join(PROCESSED_DIR, 'pathology');
      } else if (metadata.category === 'imaging-technique') {
        outDir = join(PROCESSED_DIR, 'imaging-techniques', metadata.modality);
      } else if (metadata.category === 'radiology-term') {
        outDir = join(PROCESSED_DIR, 'radiology-terms');
      } else {
        outDir = join(PROCESSED_DIR, 'general');
      }

      await mkdir(outDir, { recursive: true });

      // Write cleaned file with metadata header
      const slug = basename(filePath, '.md')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const output = `---
title: ${metadata.title}
source: ${metadata.source}
category: ${metadata.category}
system: ${metadata.system}
modality: ${metadata.modality}
---

${cleaned}`;

      const outPath = join(outDir, `${slug}.md`);
      await writeFile(outPath, output, 'utf-8');
      totalCleaned++;
    }

    console.log(`  [${source}] Cleaned and categorized.`);
  }

  console.log(`\nDone! Cleaned ${totalCleaned} files into ${PROCESSED_DIR}`);
}

main().catch(console.error);
