import { readFile } from 'fs/promises';
import { join } from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const CHUNKS_FILE = join(import.meta.dirname, '..', 'data', 'embeddings', 'chunks.jsonl');
const BATCH_SIZE = 100;
const EMBEDDING_MODEL = 'text-embedding-3-small';

async function loadChunks() {
  const content = await readFile(CHUNKS_FILE, 'utf-8');
  return content.trim().split('\n').map(line => JSON.parse(line));
}

async function getEmbeddings(openai, texts) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data.map(d => d.embedding);
}

async function main() {
  // Check env vars
  const requiredEnv = ['PINECONE_API_KEY', 'OPENAI_API_KEY'];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      console.error(`Missing environment variable: ${key}`);
      console.error('Copy .env.example to .env and fill in your keys.');
      process.exit(1);
    }
  }

  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const indexName = process.env.PINECONE_INDEX || 'radiology-assistant';

  // Check if index exists, create if not
  const indexes = await pinecone.listIndexes();
  const indexExists = indexes.indexes?.some(idx => idx.name === indexName);

  if (!indexExists) {
    console.log(`Creating Pinecone index "${indexName}"...`);
    await pinecone.createIndex({
      name: indexName,
      dimension: 1536,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1',
        },
      },
    });
    // Wait for index to be ready
    console.log('Waiting for index to initialize...');
    await new Promise(resolve => setTimeout(resolve, 30000));
  }

  const index = pinecone.index(indexName);

  // Load chunks
  const chunks = await loadChunks();
  console.log(`Loaded ${chunks.length} chunks from ${CHUNKS_FILE}\n`);

  // Process in batches
  let uploaded = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    // Truncate texts to stay within embedding model 8192 token limit (~4 chars/token)
    const MAX_CHARS = 20000;
    const texts = batch.map(c => c.text.length > MAX_CHARS ? c.text.slice(0, MAX_CHARS) : c.text);

    console.log(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}...`);

    const embeddings = await getEmbeddings(openai, texts);

    const vectors = batch.map((chunk, j) => ({
      id: chunk.id,
      values: embeddings[j],
      metadata: {
        ...chunk.metadata,
        // Pinecone limits metadata to 40KB per vector — truncate text to fit
        text: chunk.text.length > 35000 ? chunk.text.slice(0, 35000) : chunk.text,
      },
    }));

    // Upload to default namespace (no namespace) so n8n workflow can query all data
    await index.upsert(vectors);
    uploaded += batch.length;

    console.log(`  Uploaded ${uploaded}/${chunks.length} vectors`);

    // Rate limit: small delay between batches
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\nDone! Uploaded ${uploaded} vectors to Pinecone index "${indexName}"`);
}

main().catch(console.error);
