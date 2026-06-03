import {Platform} from 'react-native';
import RNFS from 'react-native-fs';
import type {BoundingBox} from '../types';

// ─── Image Preprocessing for TFLite Models ────────────────────────────────────

/**
 * Normalize pixel values from [0, 255] to [-1, 1].
 * MobileFaceNet expects this normalization.
 */
export function normalizePixel(value: number): number {
  return (value / 127.5) - 1.0;
}

/**
 * Normalize a raw frame buffer to float32 [-1, 1] for MobileFaceNet.
 * Input: Uint8Array with RGBA/RGB pixels
 * Output: Float32Array [H, W, 3] in CHW or HWC layout
 */
export function preprocessFaceRGB(
  rgbaBuffer: Uint8Array,
  width: number,
  height: number,
  targetSize: number = 112,
): Float32Array {
  // For now assumes input is already cropped to targetSize × targetSize
  // Real implementation needs resizing — handled by native TFLite preprocessing
  const result = new Float32Array(targetSize * targetSize * 3);
  let outIdx = 0;

  for (let y = 0; y < height && y < targetSize; y++) {
    for (let x = 0; x < width && x < targetSize; x++) {
      const srcIdx = (y * width + x) * 4; // RGBA
      result[outIdx++] = normalizePixel(rgbaBuffer[srcIdx]);     // R
      result[outIdx++] = normalizePixel(rgbaBuffer[srcIdx + 1]); // G
      result[outIdx++] = normalizePixel(rgbaBuffer[srcIdx + 2]); // B
      // Skip alpha channel
    }
  }

  return result;
}

/**
 * Scale a bounding box by a padding factor (adds margin around detected face).
 */
export function padBoundingBox(
  box: BoundingBox,
  padFactor: number,
  frameWidth: number,
  frameHeight: number,
): BoundingBox {
  const paddingW = box.width * padFactor;
  const paddingH = box.height * padFactor;

  return {
    x: Math.max(0, box.x - paddingW / 2),
    y: Math.max(0, box.y - paddingH / 2),
    width: Math.min(frameWidth - box.x, box.width + paddingW),
    height: Math.min(frameHeight - box.y, box.height + paddingH),
  };
}

/**
 * Convert a relative bounding box (0–1 normalized) to pixel coordinates.
 */
export function relativeToPixelBBox(
  relBox: BoundingBox,
  frameWidth: number,
  frameHeight: number,
): BoundingBox {
  return {
    x: relBox.x * frameWidth,
    y: relBox.y * frameHeight,
    width: relBox.width * frameWidth,
    height: relBox.height * frameHeight,
  };
}

/**
 * Check if a bounding box has valid, non-zero area.
 */
export function isBBoxValid(box: BoundingBox): boolean {
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.x >= 0 &&
    box.y >= 0 &&
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height)
  );
}

/**
 * Get the face area as a fraction of total frame area.
 * Used to ensure the face is close enough to the camera.
 */
export function getFaceAreaRatio(box: BoundingBox, frameW: number, frameH: number): number {
  return (box.width * box.height) / (frameW * frameH);
}

// ─── File System Helpers ──────────────────────────────────────────────────────

/** Get the app's document directory path */
export function getDocumentDir(): string {
  return Platform.OS === 'ios' ? RNFS.DocumentDirectoryPath : RNFS.ExternalDirectoryPath ?? RNFS.DocumentDirectoryPath;
}

/** Get the models directory path */
export function getModelsDir(): string {
  // On Android, models are bundled in assets and accessed via RNFS.DocumentDirectoryPath after copy
  return `${RNFS.DocumentDirectoryPath}/models`;
}

/** Get the photos directory path (enrollment/attendance captures) */
export function getPhotosDir(): string {
  return `${RNFS.DocumentDirectoryPath}/photos`;
}

/** Ensure a directory exists, creating it if needed */
export async function ensureDir(path: string): Promise<void> {
  const exists = await RNFS.exists(path);
  if (!exists) {
    await RNFS.mkdir(path);
  }
}

/** Save a base64-encoded JPEG to the photos directory */
export async function savePhoto(base64Jpeg: string, fileName: string): Promise<string> {
  await ensureDir(getPhotosDir());
  const filePath = `${getPhotosDir()}/${fileName}.jpg`;
  await RNFS.writeFile(filePath, base64Jpeg, 'base64');
  return filePath;
}

/** Delete a photo file */
export async function deletePhoto(filePath: string): Promise<void> {
  const exists = await RNFS.exists(filePath);
  if (exists) {
    await RNFS.unlink(filePath);
  }
}

/** Calculate folder size in bytes */
export async function getFolderSizeBytes(dirPath: string): Promise<number> {
  try {
    const items = await RNFS.readDir(dirPath);
    let total = 0;
    for (const item of items) {
      total += item.size;
    }
    return total;
  } catch {
    return 0;
  }
}

// ─── BlazeFace Anchor Generation ─────────────────────────────────────────────
/**
 * Generate SSD-style anchors for BlazeFace short-range model.
 * These are used to decode the model's raw bounding box predictions.
 */
export function generateAnchors(
  inputSize: number = 128,
  strides: number[] = [8, 16],
  anchorsPerStride: number = 2,
): Array<{x: number; y: number}> {
  const anchors: Array<{x: number; y: number}> = [];

  for (const stride of strides) {
    const gridSize = Math.ceil(inputSize / stride);
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        for (let a = 0; a < anchorsPerStride; a++) {
          anchors.push({
            x: (x + 0.5) / gridSize,
            y: (y + 0.5) / gridSize,
          });
        }
      }
    }
  }

  return anchors;
}

/** Non-maximum suppression to remove duplicate detections */
export function nms(
  boxes: Array<BoundingBox & {score: number}>,
  iouThreshold: number = 0.3,
): Array<BoundingBox & {score: number}> {
  if (boxes.length === 0) return [];

  // Sort by score descending
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: Array<BoundingBox & {score: number}> = [];

  for (const box of sorted) {
    let suppress = false;
    for (const keptBox of kept) {
      if (computeIOU(box, keptBox) > iouThreshold) {
        suppress = true;
        break;
      }
    }
    if (!suppress) kept.push(box);
  }

  return kept;
}

function computeIOU(a: BoundingBox, b: BoundingBox): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  const interX1 = Math.max(a.x, b.x);
  const interY1 = Math.max(a.y, b.y);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);

  if (interX2 <= interX1 || interY2 <= interY1) return 0;

  const interArea = (interX2 - interX1) * (interY2 - interY1);
  const aArea = a.width * a.height;
  const bArea = b.width * b.height;
  const unionArea = aArea + bArea - interArea;

  return unionArea === 0 ? 0 : interArea / unionArea;
}
