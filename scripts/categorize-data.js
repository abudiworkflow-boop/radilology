import { readdir, readFile, writeFile, rename, mkdir } from 'fs/promises';
import { join, basename } from 'path';

const PROCESSED_DIR = join(import.meta.dirname, '..', 'data', 'processed');

// Sub-categorization rules for pathology
const PATHOLOGY_SUBCATEGORIES = {
  fractures: /fracture|break|avulsion|dislocation|subluxation|displaced/i,
  tumors: /tumor|tumour|mass|neoplasm|malignant|benign|carcinoma|sarcoma|metastas|lymphoma|lesion/i,
  infections: /infection|abscess|osteomyelitis|pneumonia|tuberculosis|septic|empyema|cellulitis/i,
  inflammatory: /inflammat|arthritis|tendinitis|bursitis|pancreatitis|colitis|pleuritis|pericarditis/i,
  vascular: /vascular|aneurysm|embolism|thrombosis|infarct|hemorrhage|bleed|ischemi|dissection|dvt|pe\b/i,
  degenerative: /degenerative|osteoarthritis|spondylosis|disc\s*(disease|degeneration)|stenosis|osteophyte/i,
  congenital: /congenital|anomaly|dysplasia|atresia|malformation|variant|developmental/i,
};

// Sub-categorization rules for anatomy
const ANATOMY_SYSTEMS = {
  chest: /chest|lung|pulmonary|cardiac|heart|thorax|thoracic|mediastin|pleura|rib|sternum|diaphragm/i,
  'head-neck': /brain|head|skull|cranial|neuro|intracranial|sinus|orbit|neck|thyroid|larynx|pharynx/i,
  'abdomen-pelvis': /abdomen|liver|spleen|kidney|renal|pancrea|bowel|gastrointestinal|bladder|pelvi|uterus|ovary|prostate/i,
  spine: /spine|spinal|vertebr|cervical|lumbar|thoracic\s+spine|disc|cord|sacr/i,
  'upper-extremity': /shoulder|humerus|elbow|wrist|hand|finger|upper\s+extremity|radius|ulna|clavicle|scapula/i,
  'lower-extremity': /hip|femur|knee|tibia|fibula|ankle|foot|toe|lower\s+extremity|patella|calcaneus/i,
};

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, body: content, raw: content };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return { metadata: meta, body: match[2], raw: content };
}

function updateFrontmatter(raw, updates) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return raw;

  let frontmatter = match[1];
  for (const [key, value] of Object.entries(updates)) {
    const lineRegex = new RegExp(`^${key}:.*$`, 'm');
    if (lineRegex.test(frontmatter)) {
      frontmatter = frontmatter.replace(lineRegex, `${key}: ${value}`);
    } else {
      frontmatter += `\n${key}: ${value}`;
    }
  }

  return `---\n${frontmatter}\n---\n${match[2]}`;
}

function detectPathologySubcategory(text) {
  for (const [subcategory, regex] of Object.entries(PATHOLOGY_SUBCATEGORIES)) {
    if (regex.test(text)) return subcategory;
  }
  return 'general';
}

function detectAnatomySystem(text) {
  for (const [system, regex] of Object.entries(ANATOMY_SYSTEMS)) {
    if (regex.test(text)) return system;
  }
  return 'general';
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
  console.log('Categorizing processed data into subcategories...\n');

  const files = await getFiles(PROCESSED_DIR);

  if (files.length === 0) {
    console.log('No processed files found. Run "npm run clean" first.');
    return;
  }

  console.log(`Found ${files.length} processed files.`);

  const manifest = [];
  let moved = 0;

  for (const filePath of files) {
    const content = await readFile(filePath, 'utf-8');
    const { metadata, body, raw } = parseFrontmatter(content);

    const category = metadata.category || 'general';
    const fileName = basename(filePath);
    let newDir = null;
    let subcategory = null;

    // Sub-categorize pathology files
    if (category === 'pathology') {
      subcategory = detectPathologySubcategory(body);
      newDir = join(PROCESSED_DIR, 'pathology', subcategory);
    }

    // Ensure anatomy files are in the right system subdirectory
    if (category === 'anatomy') {
      const system = metadata.system !== 'general'
        ? metadata.system
        : detectAnatomySystem(body);
      newDir = join(PROCESSED_DIR, 'anatomy', system);
      subcategory = system;
    }

    // Move file if needed
    if (newDir) {
      await mkdir(newDir, { recursive: true });
      const newPath = join(newDir, fileName);

      if (filePath !== newPath) {
        const updatedContent = updateFrontmatter(raw, {
          subcategory: subcategory,
        });
        await writeFile(newPath, updatedContent, 'utf-8');

        // Remove old file if it was in a different location
        if (filePath !== newPath) {
          const { unlink } = await import('fs/promises');
          try {
            await unlink(filePath);
          } catch {
            // File might already be at the target location
          }
        }
        moved++;
      }
    }

    // Build manifest entry
    manifest.push({
      file: fileName,
      title: metadata.title || fileName,
      source: metadata.source || 'unknown',
      category: metadata.category || 'general',
      subcategory: subcategory || metadata.category || 'general',
      system: metadata.system || 'general',
      modality: metadata.modality || 'all',
      charCount: body.length,
    });
  }

  // Write manifest
  const manifestPath = join(PROCESSED_DIR, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(`\nMoved/recategorized ${moved} files.`);
  console.log(`Manifest written to ${manifestPath} (${manifest.length} entries)`);

  // Print summary
  const summary = {};
  for (const entry of manifest) {
    const key = `${entry.category}/${entry.subcategory}`;
    summary[key] = (summary[key] || 0) + 1;
  }

  console.log('\nCategory breakdown:');
  for (const [key, count] of Object.entries(summary).sort()) {
    console.log(`  ${key}: ${count}`);
  }
}

main().catch(console.error);
