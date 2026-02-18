import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';

const RAW_DIR = join(import.meta.dirname, '..', 'data', 'raw');
const DELAY_MS = 2500;

// ──────────────────────────────────────────────
// .env loader
// ──────────────────────────────────────────────
async function loadEnv() {
  try {
    const envPath = join(import.meta.dirname, '..', '.env');
    const content = await readFile(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = value;
      }
    }
  } catch { /* no .env */ }
}

// ──────────────────────────────────────────────
// Firecrawl API
// ──────────────────────────────────────────────
const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1';

async function firecrawlScrape(url) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 3000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'scrape failed');
  return data.data?.markdown || '';
}

async function firecrawlCrawl(url, maxPages = 30) {
  const apiKey = process.env.FIRECRAWL_API_KEY;

  const startRes = await fetch(`${FIRECRAWL_BASE}/crawl`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      limit: maxPages,
      scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
    }),
  });

  if (!startRes.ok) {
    const text = await startRes.text();
    throw new Error(`Crawl start ${startRes.status}: ${text}`);
  }

  const { id: jobId } = await startRes.json();
  console.log(`  Crawl job: ${jobId}`);

  while (true) {
    await sleep(5000);
    const statusRes = await fetch(`${FIRECRAWL_BASE}/crawl/${jobId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!statusRes.ok) continue;

    const status = await statusRes.json();
    console.log(`  Status: ${status.status} (${status.completed || 0}/${status.total || '?'})`);

    if (status.status === 'completed') return status.data || [];
    if (status.status === 'failed') throw new Error('Crawl failed');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────
// Source 1: LearningRadiology
// ──────────────────────────────────────────────
const LEARNING_RADIOLOGY_URLS = [
  { url: 'https://learningradiology.com/misc/mostcommonspage.htm', name: 'most-commons' },
  { url: 'https://learningradiology.com/medstudents/medstudtoc.htm', name: 'student-resources' },
  { url: 'https://learningradiology.com/toc/tocsubsection/toclectures.htm', name: 'lectures' },
  { url: 'https://learningradiology.com/toc/tocsubsection/tocnotes.htm', name: 'notes' },
  { url: 'https://learningradiology.com/toc/tocsubsection/tocimages.htm', name: 'images-index' },
  { url: 'https://learningradiology.com/toc/tocsubsection/tocpictorials.htm', name: 'pictorial-differentials' },
  { url: 'https://learningradiology.com/flashcards/tocflashcards.htm', name: 'flashcards' },
  { url: 'https://learningradiology.com/toc/resources.htm', name: 'resources' },
];

async function scrapeLearningRadiology() {
  const outDir = join(RAW_DIR, 'learningradiology');
  await mkdir(outDir, { recursive: true });

  console.log(`\n[learningradiology] Scraping ${LEARNING_RADIOLOGY_URLS.length} pages...\n`);
  let success = 0;

  for (const page of LEARNING_RADIOLOGY_URLS) {
    process.stdout.write(`  ${page.name}... `);
    try {
      const md = await firecrawlScrape(page.url);
      if (!md || md.length < 50) {
        console.log('TOO SHORT');
        continue;
      }
      await writeFile(join(outDir, `${page.name}.md`), md, 'utf-8');
      console.log(`OK (${md.length} chars)`);
      success++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n[learningradiology] Done: ${success}/${LEARNING_RADIOLOGY_URLS.length} saved`);
}

// ──────────────────────────────────────────────
// Source 2: RadReport (RSNA report templates)
// ──────────────────────────────────────────────
async function scrapeRadReport() {
  const outDir = join(RAW_DIR, 'radreport');
  await mkdir(outDir, { recursive: true });

  console.log('\n[radreport] Crawling radreport.org (up to 30 pages)...\n');

  try {
    const pages = await firecrawlCrawl('https://radreport.org', 30);
    let saved = 0;

    for (const page of pages) {
      const md = page.markdown || '';
      if (md.length < 100) continue;

      const urlSlug = (page.metadata?.sourceURL || page.url || `page-${saved}`)
        .replace(/https?:\/\//, '')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);

      await writeFile(join(outDir, `${urlSlug}.md`), md, 'utf-8');
      saved++;
    }

    console.log(`\n[radreport] Done: ${saved} pages saved`);
  } catch (err) {
    console.log(`[radreport] FAILED: ${err.message}`);
  }
}

// ──────────────────────────────────────────────
// Source 3: Radiology Assistant (radiologyassistant.nl)
// ──────────────────────────────────────────────
const RADIOLOGY_ASSISTANT_URLS = [
  // Chest
  { url: 'https://radiologyassistant.nl/chest/chest-x-ray/lung-disease', name: 'chest-lung-disease' },
  { url: 'https://radiologyassistant.nl/chest/chest-x-ray/heart-failure', name: 'chest-heart-failure' },
  { url: 'https://radiologyassistant.nl/chest/chest-x-ray/mediastinum', name: 'chest-mediastinum' },
  { url: 'https://radiologyassistant.nl/chest/chest-x-ray/basic-interpretation', name: 'chest-xray-basics' },
  { url: 'https://radiologyassistant.nl/chest/pulmonary-nodule-solid', name: 'pulmonary-nodule' },
  { url: 'https://radiologyassistant.nl/chest/lung-cancer-tnm', name: 'lung-cancer-staging' },
  { url: 'https://radiologyassistant.nl/chest/hrct-basic-interpretation', name: 'hrct-basics' },

  // Abdomen
  { url: 'https://radiologyassistant.nl/abdomen/acute-abdomen', name: 'acute-abdomen' },
  { url: 'https://radiologyassistant.nl/abdomen/bowel-obstruction', name: 'bowel-obstruction' },
  { url: 'https://radiologyassistant.nl/abdomen/liver-masses', name: 'liver-masses' },
  { url: 'https://radiologyassistant.nl/abdomen/pancreas/acute-pancreatitis', name: 'acute-pancreatitis' },

  // MSK
  { url: 'https://radiologyassistant.nl/musculoskeletal/bone-tumors/differential-diagnosis', name: 'bone-tumors-ddx' },
  { url: 'https://radiologyassistant.nl/musculoskeletal/fractures/wrist', name: 'wrist-fractures' },
  { url: 'https://radiologyassistant.nl/musculoskeletal/fractures/ankle', name: 'ankle-fractures' },
  { url: 'https://radiologyassistant.nl/musculoskeletal/fractures/hip', name: 'hip-fractures' },
  { url: 'https://radiologyassistant.nl/musculoskeletal/shoulder/instability', name: 'shoulder-instability' },
  { url: 'https://radiologyassistant.nl/musculoskeletal/knee/meniscal-pathology', name: 'knee-meniscus' },

  // Neuro
  { url: 'https://radiologyassistant.nl/neuroradiology/brain-ischemia/imaging-in-acute-stroke', name: 'acute-stroke' },
  { url: 'https://radiologyassistant.nl/neuroradiology/brain-tumor/systematic-approach', name: 'brain-tumor-approach' },
  { url: 'https://radiologyassistant.nl/neuroradiology/traumatic-brain-injury', name: 'traumatic-brain-injury' },

  // Spine
  { url: 'https://radiologyassistant.nl/spine/disc-herniation', name: 'disc-herniation' },
  { url: 'https://radiologyassistant.nl/spine/lumbar-disc-nomenclature', name: 'lumbar-disc-nomenclature' },
];

async function scrapeRadiologyAssistant() {
  const outDir = join(RAW_DIR, 'medpix'); // reuse medpix dir since that source is down
  await mkdir(outDir, { recursive: true });

  console.log(`\n[radiology-assistant] Scraping ${RADIOLOGY_ASSISTANT_URLS.length} articles...\n`);
  let success = 0;

  for (const page of RADIOLOGY_ASSISTANT_URLS) {
    process.stdout.write(`  ${page.name}... `);
    try {
      const md = await firecrawlScrape(page.url);
      if (!md || md.length < 100) {
        console.log('TOO SHORT');
        continue;
      }
      await writeFile(join(outDir, `${page.name}.md`), md, 'utf-8');
      console.log(`OK (${md.length} chars)`);
      success++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n[radiology-assistant] Done: ${success}/${RADIOLOGY_ASSISTANT_URLS.length} saved`);
}

// ──────────────────────────────────────────────
// Main — run one source at a time
// ──────────────────────────────────────────────
// ──────────────────────────────────────────────
// Source 4: StatPearls (NCBI) — clinical-grade
// ──────────────────────────────────────────────
const STATPEARLS_URLS = [
  // Chest — most common hospital cases
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK441885/', name: 'pneumothorax' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK532266/', name: 'pleural-effusion' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK525774/', name: 'pneumonia-imaging' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK560551/', name: 'pulmonary-embolism' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK470256/', name: 'chest-xray-interpretation' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK545316/', name: 'atelectasis' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK542296/', name: 'cardiomegaly' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK532257/', name: 'pericardial-effusion' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK441916/', name: 'tuberculosis-pulmonary' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK559281/', name: 'copd-imaging' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK513255/', name: 'lung-abscess' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK482337/', name: 'pulmonary-edema' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK482186/', name: 'aortic-dissection' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK430685/', name: 'lung-cancer' },

  // Abdomen
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK459101/', name: 'appendicitis-imaging' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK441975/', name: 'bowel-obstruction' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK448086/', name: 'cholecystitis' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK482468/', name: 'pancreatitis-acute' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK470328/', name: 'kidney-stones' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK499964/', name: 'diverticulitis' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK430748/', name: 'abdominal-aortic-aneurysm' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK551648/', name: 'free-air-pneumoperitoneum' },

  // Neuro
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK537005/', name: 'ischemic-stroke-imaging' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK559173/', name: 'hemorrhagic-stroke' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK518982/', name: 'subarachnoid-hemorrhage' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK518824/', name: 'epidural-hematoma' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK532961/', name: 'subdural-hematoma' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK441874/', name: 'hydrocephalus' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK470226/', name: 'ct-head-interpretation' },

  // MSK / Fractures
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK526038/', name: 'colles-fracture' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK536907/', name: 'scaphoid-fracture' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK535364/', name: 'hip-fracture' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK556088/', name: 'ankle-fracture' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK441950/', name: 'osteoarthritis' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK507702/', name: 'osteomyelitis' },

  // Spine
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK441822/', name: 'disc-herniation' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK441989/', name: 'spinal-stenosis' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK559093/', name: 'cauda-equina' },
  { url: 'https://www.ncbi.nlm.nih.gov/books/NBK448152/', name: 'compression-fracture' },
];

async function scrapeStatPearls() {
  const outDir = join(RAW_DIR, 'statpearls');
  await mkdir(outDir, { recursive: true });

  console.log(`\n[statpearls] Scraping ${STATPEARLS_URLS.length} clinical articles via Firecrawl...\n`);
  let success = 0;

  for (const page of STATPEARLS_URLS) {
    process.stdout.write(`  ${page.name}... `);
    try {
      const md = await firecrawlScrape(page.url);
      if (!md || md.length < 200) {
        console.log('TOO SHORT');
        continue;
      }
      await writeFile(join(outDir, `${page.name}.md`), md, 'utf-8');
      console.log(`OK (${md.length} chars)`);
      success++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n[statpearls] Done: ${success}/${STATPEARLS_URLS.length} saved`);
}

// ──────────────────────────────────────────────
// Source 5: Eurorad — real peer-reviewed cases
// ──────────────────────────────────────────────
const EURORAD_URLS = [
  // Chest cases
  { url: 'https://www.eurorad.org/case/18404', name: 'chest-pneumothorax-case' },
  { url: 'https://www.eurorad.org/case/17658', name: 'chest-pleural-effusion-case' },
  { url: 'https://www.eurorad.org/case/15994', name: 'chest-pulmonary-embolism-case' },
  { url: 'https://www.eurorad.org/case/17143', name: 'chest-pneumonia-case' },
  { url: 'https://www.eurorad.org/case/16888', name: 'chest-lung-cancer-case' },
  { url: 'https://www.eurorad.org/case/18122', name: 'chest-tuberculosis-case' },
  { url: 'https://www.eurorad.org/case/17456', name: 'chest-aortic-dissection-case' },
  { url: 'https://www.eurorad.org/case/16234', name: 'chest-sarcoidosis-case' },

  // Abdomen cases
  { url: 'https://www.eurorad.org/case/17890', name: 'abdomen-appendicitis-case' },
  { url: 'https://www.eurorad.org/case/16567', name: 'abdomen-bowel-obstruction-case' },
  { url: 'https://www.eurorad.org/case/18001', name: 'abdomen-pancreatitis-case' },
  { url: 'https://www.eurorad.org/case/17234', name: 'abdomen-cholecystitis-case' },
  { url: 'https://www.eurorad.org/case/16789', name: 'abdomen-kidney-stone-case' },
  { url: 'https://www.eurorad.org/case/17567', name: 'abdomen-diverticulitis-case' },

  // Neuro cases
  { url: 'https://www.eurorad.org/case/18200', name: 'neuro-stroke-case' },
  { url: 'https://www.eurorad.org/case/17345', name: 'neuro-subdural-hematoma-case' },
  { url: 'https://www.eurorad.org/case/16890', name: 'neuro-brain-tumor-case' },
  { url: 'https://www.eurorad.org/case/17678', name: 'neuro-subarachnoid-case' },

  // MSK cases
  { url: 'https://www.eurorad.org/case/17123', name: 'msk-fracture-case' },
  { url: 'https://www.eurorad.org/case/16345', name: 'msk-osteomyelitis-case' },
];

async function scrapeEurorad() {
  const outDir = join(RAW_DIR, 'eurorad');
  await mkdir(outDir, { recursive: true });

  console.log(`\n[eurorad] Scraping ${EURORAD_URLS.length} teaching cases via Firecrawl...\n`);
  let success = 0;

  for (const page of EURORAD_URLS) {
    process.stdout.write(`  ${page.name}... `);
    try {
      const md = await firecrawlScrape(page.url);
      if (!md || md.length < 200) {
        console.log('TOO SHORT');
        continue;
      }
      await writeFile(join(outDir, `${page.name}.md`), md, 'utf-8');
      console.log(`OK (${md.length} chars)`);
      success++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n[eurorad] Done: ${success}/${EURORAD_URLS.length} saved`);
}

// ──────────────────────────────────────────────
// Source registry
// ──────────────────────────────────────────────
const SOURCES = {
  learningradiology: scrapeLearningRadiology,
  radreport: scrapeRadReport,
  radiologyassistant: scrapeRadiologyAssistant,
  statpearls: scrapeStatPearls,
  eurorad: scrapeEurorad,
};

async function main() {
  await loadEnv();

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey || apiKey === 'your_firecrawl_api_key') {
    console.error('ERROR: FIRECRAWL_API_KEY not set. Add it to .env');
    process.exit(1);
  }

  const source = process.argv[2];

  if (!source || !SOURCES[source]) {
    console.log('Usage: node scripts/scrape-data.js <source>\n');
    console.log('Available sources:');
    console.log('  learningradiology  — Educational radiology content (8 pages)');
    console.log('  radreport          — RSNA report templates (crawl ~30 pages)');
    console.log('  radiologyassistant — Radiology Assistant articles (22 articles)');
    console.log('  statpearls         — NCBI clinical articles (38 articles)');
    console.log('  eurorad            — Peer-reviewed teaching cases (20 cases)');
    console.log('\nExample: node scripts/scrape-data.js statpearls');
    process.exit(0);
  }

  console.log(`=== RadAssist Scraper — ${source} ===`);
  await SOURCES[source]();
  console.log('\nDone!');
}

main().catch(console.error);
