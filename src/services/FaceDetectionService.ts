/**
 * FaceDetectionService — BlazeFace-based face detection.
 *
 * Processes a camera frame and returns the best detected face bounding box
 * along with 6 key landmarks.  Uses BlazeFace short-range TFLite model.
 *
 * Model input:  [1, 128, 128, 3] float32 in [0, 1]
 * Model output: boxes [1, 896, 16] and scores [1, 896, 1]
 */

import {MODEL_CONFIG} from '../utils/constants';
import {runFaceDetection} from './ModelService';
import {
  generateAnchors,
  nms,
  relativeToPixelBBox,
  padBoundingBox,
} from '../utils/imageUtils';
import {logger} from '../utils/logger';
import type {DetectedFace, BoundingBox} from '../types';

const TAG = 'FaceDetectionService';

// Pre-generate anchors once (896 anchors for BlazeFace 128 model)
const ANCHORS = generateAnchors(128, [8, 16], 6);

/** BlazeFace detection confidence threshold */
const SCORE_THRESHOLD = 0.65;
const NMS_IOU_THRESHOLD = 0.3;

/**
 * Decode raw BlazeFace model outputs into bounding boxes + landmarks.
 *
 * Each anchor has 16 outputs:
 *   [0-3]:  bounding box (cx, cy, w, h) deltas relative to anchor
 *   [4-15]: 6 keypoint (x, y) pairs
 */
function decodeBoxes(
  rawBoxes: Float32Array,   // [896, 16]
  rawScores: Float32Array,  // [896, 1]
  inputSize: number,
): Array<{box: BoundingBox; landmarks: Array<{x: number; y: number}>; score: number}> {
  const results: Array<{
    box: BoundingBox;
    landmarks: Array<{x: number; y: number}>;
    score: number;
  }> = [];

  const numAnchors = ANCHORS.length;

  for (let i = 0; i < numAnchors; i++) {
    // Sigmoid of raw score
    const score = 1 / (1 + Math.exp(-rawScores[i]));
    if (score < SCORE_THRESHOLD) continue;

    const anchor = ANCHORS[i];
    const offset = i * 16;

    // Box center + size (normalized to input size)
    const cx = anchor.x + rawBoxes[offset] / inputSize;
    const cy = anchor.y + rawBoxes[offset + 1] / inputSize;
    const w = rawBoxes[offset + 2] / inputSize;
    const h = rawBoxes[offset + 3] / inputSize;

    const box: BoundingBox = {
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
    };

    // 6 keypoint landmarks
    const landmarks: Array<{x: number; y: number}> = [];
    for (let k = 0; k < 6; k++) {
      landmarks.push({
        x: anchor.x + rawBoxes[offset + 4 + k * 2] / inputSize,
        y: anchor.y + rawBoxes[offset + 5 + k * 2] / inputSize,
      });
    }

    results.push({box, landmarks, score});
  }

  return results;
}

/**
 * Detect faces in a preprocessed float32 frame buffer.
 *
 * @param inputBuffer Float32Array [128×128×3] normalized to [0,1]
 * @param frameWidth  Original frame width in pixels
 * @param frameHeight Original frame height in pixels
 * @returns Array of detected faces, sorted by confidence descending
 */
export async function detectFaces(
  inputBuffer: Float32Array,
  frameWidth: number,
  frameHeight: number,
): Promise<DetectedFace[]> {
  const t0 = Date.now();

  try {
    const {boxes: rawBoxes, scores: rawScores} = await runFaceDetection(inputBuffer);

    const inputSize = MODEL_CONFIG.FACE_DETECTION.INPUT_SIZE;

    // Reshape flat outputs: boxes [896×16], scores [896×1]
    const decoded = decodeBoxes(rawBoxes, rawScores, inputSize);

    // Non-maximum suppression
    const nmsInput = decoded.map(d => ({...d.box, score: d.score}));
    const kept = nms(nmsInput, NMS_IOU_THRESHOLD);
    const keptSet = new Set(kept.map((_, i) => i));

    const faces: DetectedFace[] = [];

    for (let i = 0; i < decoded.length; i++) {
      if (!keptSet.has(i)) continue; // suppressed

      const {box, landmarks, score} = decoded[i];

      // Add 20% padding around detected face
      const paddedBox = padBoundingBox(box, 0.2, 1, 1);

      // Convert from normalized [0,1] to pixel coordinates
      const pixelBox = relativeToPixelBBox(paddedBox, frameWidth, frameHeight);
      const pixelLandmarks = landmarks.map(lm => ({
        x: lm.x * frameWidth,
        y: lm.y * frameHeight,
      }));

      faces.push({
        boundingBox: pixelBox,
        confidence: score,
        landmarks: pixelLandmarks,
      });
    }

    // Sort by confidence
    faces.sort((a, b) => b.confidence - a.confidence);

    logger.debug(TAG, `Detected ${faces.length} face(s) in ${Date.now() - t0}ms`);
    return faces;
  } catch (err) {
    logger.error(TAG, 'Face detection failed', err);
    return [];
  }
}

/**
 * Pick the "best" (most centered, largest, highest confidence) face
 * from a list of candidates.
 */
export function selectBestFace(
  faces: DetectedFace[],
  frameWidth: number,
  frameHeight: number,
): DetectedFace | null {
  if (faces.length === 0) return null;
  if (faces.length === 1) return faces[0];

  const cx = frameWidth / 2;
  const cy = frameHeight / 2;

  return faces.reduce((best, face) => {
    const faceCX = face.boundingBox.x + face.boundingBox.width / 2;
    const faceCY = face.boundingBox.y + face.boundingBox.height / 2;
    const dist = Math.hypot(faceCX - cx, faceCY - cy);

    const bestFaceCX = best.boundingBox.x + best.boundingBox.width / 2;
    const bestFaceCY = best.boundingBox.y + best.boundingBox.height / 2;
    const bestDist = Math.hypot(bestFaceCX - cx, bestFaceCY - cy);

    // Prefer face that is closer to center and has higher confidence
    const score = face.confidence * 0.6 - dist / frameWidth * 0.4;
    const bestScore = best.confidence * 0.6 - bestDist / frameWidth * 0.4;

    return score > bestScore ? face : best;
  });
}

/**
 * Quality check: is the detected face suitable for recognition?
 * Returns an error string or null if OK.
 */
export function checkFaceQuality(
  face: DetectedFace,
  frameWidth: number,
  frameHeight: number,
): string | null {
  const {boundingBox: bb} = face;

  // Too small (< 15% of frame dimension)
  const minSize = Math.min(frameWidth, frameHeight) * 0.15;
  if (bb.width < minSize || bb.height < minSize) {
    return 'Move closer to the camera';
  }

  // Too far from center
  const cx = frameWidth / 2;
  const cy = frameHeight / 2;
  const faceCX = bb.x + bb.width / 2;
  const faceCY = bb.y + bb.height / 2;
  const distFromCenter = Math.hypot(faceCX - cx, faceCY - cy);
  if (distFromCenter > Math.min(frameWidth, frameHeight) * 0.35) {
    return 'Center your face in the frame';
  }

  // Low confidence
  if (face.confidence < 0.75) {
    return 'Ensure good lighting on your face';
  }

  return null; // all good
}
