/**
 * FaceRecognitionService — MobileFaceNet-based face embedding & matching.
 *
 * Pipeline:
 *  1. Receive cropped & aligned face image (112×112 RGB)
 *  2. Normalize to [-1, 1]
 *  3. Run MobileFaceNet → 512D L2-normalized embedding
 *  4. Compare with stored embeddings via cosine similarity
 *
 * MobileFaceNet achieves ~99.28% accuracy on LFW benchmark at only 5.5 MB.
 */

import {runFaceRecognition} from './ModelService';
import {
  cosineSimilarity,
  l2Normalize,
  float32ToBase64,
  base64ToFloat32,
  averageEmbeddings,
} from '../utils/mathUtils';
import {logger} from '../utils/logger';
import {DEFAULT_CONFIG, MODEL_CONFIG} from '../utils/constants';
import type {User, RecognitionResult, FaceEmbedding} from '../types';

const TAG = 'FaceRecognitionService';

/** In-memory cache of all enrolled user embeddings for fast lookup */
let _embeddingCache: Array<{userId: string; embedding: Float32Array}> = [];

// ─── Embedding Generation ─────────────────────────────────────────────────────

/**
 * Generate a 512D face embedding from a preprocessed face crop.
 *
 * @param faceBuffer Float32Array [112×112×3] normalized to [-1,1]
 * @returns 512D L2-normalized embedding
 */
export async function generateEmbedding(
  faceBuffer: Float32Array,
): Promise<FaceEmbedding> {
  const t0 = Date.now();

  // Verify input dimensions
  const expectedSize = MODEL_CONFIG.FACE_RECOGNITION.INPUT_SIZE ** 2 * 3;
  if (faceBuffer.length !== expectedSize) {
    throw new Error(
      `Invalid face buffer size: expected ${expectedSize}, got ${faceBuffer.length}`,
    );
  }

  const rawEmbedding = await runFaceRecognition(faceBuffer);

  // L2-normalize (MobileFaceNet usually outputs pre-normalized, but ensure it)
  const normalized = l2Normalize(new Float32Array(rawEmbedding));

  logger.debug(TAG, `Embedding generated in ${Date.now() - t0}ms`);
  return normalized;
}

/**
 * Generate a robust embedding by averaging multiple frames.
 * Enrollment should capture 5–10 frames for better accuracy.
 *
 * @param faceBuffers Array of preprocessed face frames
 * @returns Averaged & re-normalized 512D embedding
 */
export async function generateRobustEmbedding(
  faceBuffers: Float32Array[],
): Promise<FaceEmbedding> {
  if (faceBuffers.length === 0) {
    throw new Error('No face frames provided for embedding generation');
  }

  logger.info(TAG, `Generating robust embedding from ${faceBuffers.length} frames`);

  const embeddings: Float32Array[] = [];
  for (const buf of faceBuffers) {
    try {
      const emb = await generateEmbedding(buf);
      embeddings.push(emb);
    } catch (err) {
      logger.warn(TAG, 'Skipping frame due to embedding error', err);
    }
  }

  if (embeddings.length === 0) {
    throw new Error('All frames failed to generate embeddings');
  }

  return averageEmbeddings(embeddings);
}

// ─── Embedding Serialization ──────────────────────────────────────────────────

/** Serialize a Float32Array embedding to base64 for SQLite storage */
export function serializeEmbedding(embedding: Float32Array): string {
  return float32ToBase64(embedding);
}

/** Deserialize a base64 string back to Float32Array */
export function deserializeEmbedding(base64: string): Float32Array {
  return base64ToFloat32(base64);
}

// ─── Cache Management ─────────────────────────────────────────────────────────

/**
 * Populate the in-memory embedding cache from a list of users.
 * Should be called after loading users from SQLite at startup.
 */
export function populateCache(users: User[]): void {
  _embeddingCache = users.map(u => ({
    userId: u.id,
    embedding: deserializeEmbedding(u.embedding),
  }));
  logger.info(TAG, `Embedding cache populated with ${users.length} users`);
}

/** Add a single user to the cache */
export function addToCache(userId: string, embeddingBase64: string): void {
  // Remove existing entry for this user if any
  removeFromCache(userId);
  _embeddingCache.push({
    userId,
    embedding: deserializeEmbedding(embeddingBase64),
  });
}

/** Remove a user from the cache */
export function removeFromCache(userId: string): void {
  _embeddingCache = _embeddingCache.filter(e => e.userId !== userId);
}

/** Clear the entire cache */
export function clearCache(): void {
  _embeddingCache = [];
}

/** Get cache size */
export function getCacheSize(): number {
  return _embeddingCache.length;
}

// ─── Recognition / Matching ───────────────────────────────────────────────────

/**
 * Find the best matching user for a given query embedding.
 * Performs a linear scan against all cached embeddings (O(n)).
 * For large deployments (>10k users) this should be replaced with
 * approximate nearest-neighbor search (e.g., FAISS).
 *
 * @param queryEmbedding  The live face embedding to match
 * @param users           Map of userId → User for lookups
 * @param threshold       Minimum cosine similarity for a positive match
 * @returns RecognitionResult with match status and confidence
 */
export function findBestMatch(
  queryEmbedding: Float32Array,
  users: Map<string, User>,
  threshold: number = DEFAULT_CONFIG.recognitionThreshold,
): Omit<RecognitionResult, 'processingTimeMs'> {
  if (_embeddingCache.length === 0) {
    return {matched: false, confidence: 0};
  }

  let bestScore = -1;
  let bestUserId: string | null = null;

  for (const {userId, embedding} of _embeddingCache) {
    const score = cosineSimilarity(queryEmbedding, embedding);
    if (score > bestScore) {
      bestScore = score;
      bestUserId = userId;
    }
  }

  if (bestScore >= threshold && bestUserId) {
    const user = users.get(bestUserId);
    return {
      matched: true,
      user,
      confidence: bestScore,
    };
  }

  return {
    matched: false,
    confidence: bestScore,
  };
}

/**
 * Full recognition pipeline:
 * embedding → cache search → result with timing
 */
export async function recognizeFace(
  faceBuffer: Float32Array,
  users: Map<string, User>,
  threshold?: number,
): Promise<RecognitionResult> {
  const t0 = Date.now();

  try {
    const queryEmbedding = await generateEmbedding(faceBuffer);
    const matchResult = findBestMatch(queryEmbedding, users, threshold);
    const processingTimeMs = Date.now() - t0;

    logger.info(
      TAG,
      `Recognition: ${matchResult.matched ? '✓ MATCH' : '✗ NO MATCH'} ` +
        `confidence=${matchResult.confidence.toFixed(3)} time=${processingTimeMs}ms`,
    );

    return {...matchResult, processingTimeMs};
  } catch (err) {
    logger.error(TAG, 'Recognition pipeline failed', err);
    return {
      matched: false,
      confidence: 0,
      processingTimeMs: Date.now() - t0,
    };
  }
}
