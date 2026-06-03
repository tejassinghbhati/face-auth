/**
 * Math utilities for face recognition and liveness detection
 */

// ─── Vector Math ──────────────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two embedding vectors.
 * Returns 0–1 where 1 = identical, 0 = completely different.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding length mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  // Clamp to [0, 1] — raw cosine can be negative for very different faces
  return Math.max(0, dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)));
}

/**
 * L2-normalize a Float32Array in place.
 */
export function l2Normalize(v: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return v;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

// ─── Euclidean Distance ────────────────────────────────────────────────────────

export function euclideanDistance(
  a: {x: number; y: number; z?: number},
  b: {x: number; y: number; z?: number},
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ─── Eye Aspect Ratio (EAR) ────────────────────────────────────────────────────
/**
 * EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
 *
 * p1 = outer corner, p4 = inner corner
 * p2, p3 = upper lid points
 * p5, p6 = lower lid points
 *
 * When eye is open EAR ≈ 0.3, blink brings it below 0.21
 */
export function computeEAR(
  p1: {x: number; y: number},
  p2: {x: number; y: number},
  p3: {x: number; y: number},
  p4: {x: number; y: number},
  p5: {x: number; y: number},
  p6: {x: number; y: number},
): number {
  const vertical1 = euclideanDistance(p2, p6);
  const vertical2 = euclideanDistance(p3, p5);
  const horizontal = euclideanDistance(p1, p4);
  if (horizontal === 0) return 0;
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

// ─── Mouth Aspect Ratio (MAR) ─────────────────────────────────────────────────
/**
 * MAR = (||p2-p8|| + ||p3-p7|| + ||p4-p6||) / (2 * ||p1-p5||)
 * A higher MAR indicates open mouth or smile.
 */
export function computeMAR(
  p1: {x: number; y: number}, // left corner
  p2: {x: number; y: number}, // upper lip left
  p3: {x: number; y: number}, // upper lip top
  p4: {x: number; y: number}, // upper lip right
  p5: {x: number; y: number}, // right corner
  p6: {x: number; y: number}, // lower lip right
  p7: {x: number; y: number}, // lower lip bottom
  p8: {x: number; y: number}, // lower lip left
): number {
  const v1 = euclideanDistance(p2, p8);
  const v2 = euclideanDistance(p3, p7);
  const v3 = euclideanDistance(p4, p6);
  const horizontal = euclideanDistance(p1, p5);
  if (horizontal === 0) return 0;
  return (v1 + v2 + v3) / (2.0 * horizontal);
}

// ─── Head Pose Estimation (simplified PnP) ────────────────────────────────────
/**
 * Estimate rough yaw from the horizontal symmetry of facial landmarks.
 * Returns degrees: positive = face turned right, negative = turned left.
 */
export function estimateYaw(
  noseTip: {x: number},
  leftTemple: {x: number},
  rightTemple: {x: number},
  frameWidth: number,
): number {
  const faceCenter = (leftTemple.x + rightTemple.x) / 2;
  const faceWidth = Math.abs(rightTemple.x - leftTemple.x);
  if (faceWidth === 0) return 0;
  const offset = (noseTip.x - faceCenter) / (faceWidth / 2);
  // Map [-1, 1] offset to roughly [-45°, 45°]
  return offset * 45;
}

/**
 * Estimate rough pitch from nose-to-chin vs nose-to-forehead ratio.
 * Returns degrees: positive = looking up, negative = looking down.
 */
export function estimatePitch(
  noseBridge: {y: number},
  noseTip: {y: number},
  chin: {y: number},
): number {
  const noseLen = Math.abs(noseTip.y - noseBridge.y);
  const chinLen = Math.abs(chin.y - noseTip.y);
  if (noseLen + chinLen === 0) return 0;
  const ratio = (noseLen - chinLen) / (noseLen + chinLen);
  return ratio * 30; // approximate degrees
}

// ─── Utility Helpers ──────────────────────────────────────────────────────────

/** Clamp a number to [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Linearly interpolate */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/** Convert Float32Array to base64 string for storage */
export function float32ToBase64(arr: Float32Array): string {
  const uint8 = new Uint8Array(arr.buffer);
  let binary = '';
  for (let i = 0; i < uint8.byteLength; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

/** Convert base64 string back to Float32Array */
export function base64ToFloat32(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}

/** Average multiple embeddings into one (for enrollment from multiple frames) */
export function averageEmbeddings(embeddings: Float32Array[]): Float32Array {
  if (embeddings.length === 0) throw new Error('No embeddings to average');
  const dim = embeddings[0].length;
  const result = new Float32Array(dim);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) result[i] += emb[i];
  }
  for (let i = 0; i < dim; i++) result[i] /= embeddings.length;
  return l2Normalize(result);
}
