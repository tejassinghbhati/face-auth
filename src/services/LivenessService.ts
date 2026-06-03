/**
 * LivenessService — Anti-spoofing via MediaPipe Face Mesh landmarks.
 *
 * Detects:
 *  • Blink    — Eye Aspect Ratio (EAR) drops below threshold
 *  • Smile    — Mouth Aspect Ratio (MAR) rises above threshold
 *  • Turn L/R — Head yaw angle exceeds ±20°
 *  • Nod      — Head pitch exceeds ±15°
 *
 * Also performs texture-based passive anti-spoofing scoring using
 * face mesh 3D depth variance (flat photos have near-zero z-variance).
 */

import {runFaceMesh} from './ModelService';
import {MODEL_CONFIG, FACE_LANDMARKS, DEFAULT_CONFIG} from '../utils/constants';
import {
  computeEAR,
  computeMAR,
  estimateYaw,
  estimatePitch,
} from '../utils/mathUtils';
import {logger} from '../utils/logger';
import type {
  FaceMesh,
  EyeMetrics,
  MouthMetrics,
  HeadPose,
  LivenessFrameResult,
  LivenessChallenge,
} from '../types';

const TAG = 'LivenessService';

// ─── State for multi-frame challenge detection ─────────────────────────────────

interface ChallengeState {
  blinkFrameCount: number;
  smileFrameCount: number;
  headTurnFrameCount: number;
  lastYaw: number;
  baselineEAR: number;
  baselineMAR: number;
  baselineYaw: number;
  calibrated: boolean;
  frameCount: number;
}

let _state: ChallengeState = createInitialState();

function createInitialState(): ChallengeState {
  return {
    blinkFrameCount: 0,
    smileFrameCount: 0,
    headTurnFrameCount: 0,
    lastYaw: 0,
    baselineEAR: 0.3,
    baselineMAR: 0.1,
    baselineYaw: 0,
    calibrated: false,
    frameCount: 0,
  };
}

export function resetLivenessState(): void {
  _state = createInitialState();
  logger.debug(TAG, 'Liveness state reset');
}

// ─── FaceMesh Processing ──────────────────────────────────────────────────────

/**
 * Parse the raw 1404-element flat array from MediaPipe Face Mesh into
 * a structured list of 468 {x, y, z} landmark objects.
 *
 * The model outputs landmarks in [0, 192] range — we normalize to [0, 1].
 */
function parseLandmarks(flat: Float32Array, inputSize: number): FaceMesh['landmarks'] {
  const lm: FaceMesh['landmarks'] = [];
  for (let i = 0; i < 468; i++) {
    lm.push({
      x: flat[i * 3] / inputSize,
      y: flat[i * 3 + 1] / inputSize,
      z: flat[i * 3 + 2] / inputSize,
    });
  }
  return lm;
}

/**
 * Run FaceMesh model on a preprocessed frame buffer.
 *
 * @param faceBuffer Float32Array [192×192×3] normalized to [0,1]
 */
export async function getFaceMeshLandmarks(
  faceBuffer: Float32Array,
): Promise<FaceMesh | null> {
  try {
    const {landmarks: raw, confidence} = await runFaceMesh(faceBuffer);

    // Face presence confidence
    const facePresent = confidence[0] > 0.5;
    if (!facePresent) return null;

    const inputSize = MODEL_CONFIG.FACE_MESH.INPUT_SIZE;
    const landmarks = parseLandmarks(raw, inputSize);
    return {landmarks};
  } catch (err) {
    logger.error(TAG, 'FaceMesh inference failed', err);
    return null;
  }
}

// ─── Metric Computation from Landmarks ────────────────────────────────────────

/**
 * Compute Eye Aspect Ratio for both eyes from 468 face landmarks.
 */
export function computeEyeMetrics(
  lm: FaceMesh['landmarks'],
  config = DEFAULT_CONFIG,
): EyeMetrics {
  const RE = FACE_LANDMARKS.RIGHT_EYE;
  const LE = FACE_LANDMARKS.LEFT_EYE;

  const rightEAR = computeEAR(
    lm[RE.OUTER],
    lm[RE.TOP_1],
    lm[RE.TOP_2],
    lm[RE.INNER],
    lm[RE.BOTTOM_2],
    lm[RE.BOTTOM_1],
  );

  const leftEAR = computeEAR(
    lm[LE.OUTER],
    lm[LE.TOP_1],
    lm[LE.TOP_2],
    lm[LE.INNER],
    lm[LE.BOTTOM_2],
    lm[LE.BOTTOM_1],
  );

  const avgEAR = (rightEAR + leftEAR) / 2;
  const blinkDetected = avgEAR < config.blinkEARThreshold;

  return {leftEAR, rightEAR, blinkDetected};
}

/**
 * Compute Mouth Aspect Ratio from 468 face landmarks.
 */
export function computeMouthMetrics(
  lm: FaceMesh['landmarks'],
  config = DEFAULT_CONFIG,
): MouthMetrics {
  const M = FACE_LANDMARKS.MOUTH;

  const MAR = computeMAR(
    lm[M.CORNER_LEFT],
    lm[M.UPPER_LIP_LEFT],
    lm[M.OUTER_TOP],
    lm[M.UPPER_LIP_RIGHT],
    lm[M.CORNER_RIGHT],
    lm[M.INNER_BOTTOM],
    lm[M.OUTER_BOTTOM],
    lm[M.INNER_TOP],
  );

  return {
    MAR,
    smileDetected: MAR > config.smileMarThreshold,
    mouthOpenDetected: MAR > config.smileMarThreshold * 1.5,
  };
}

/**
 * Estimate head pose (yaw, pitch) from facial landmarks.
 */
export function computeHeadPose(
  lm: FaceMesh['landmarks'],
  frameWidth: number,
  frameHeight: number,
): HeadPose {
  const noseTip = lm[FACE_LANDMARKS.NOSE_TIP];
  const leftTemple = lm[FACE_LANDMARKS.LEFT_TEMPLE];
  const rightTemple = lm[FACE_LANDMARKS.RIGHT_TEMPLE];
  const noseBridge = lm[FACE_LANDMARKS.NOSE_BRIDGE];
  const chin = lm[FACE_LANDMARKS.CHIN];

  // Scale normalized coords back to pixel-space for angular estimation
  const scale = (p: {x: number; y: number; z: number}) => ({
    x: p.x * frameWidth,
    y: p.y * frameHeight,
    z: p.z * frameWidth, // approximate z scaling
  });

  const yaw = estimateYaw(
    scale(noseTip),
    scale(leftTemple),
    scale(rightTemple),
    frameWidth,
  );

  const pitch = estimatePitch(
    scale(noseBridge),
    scale(noseTip),
    scale(chin),
  );

  return {yaw, pitch, roll: 0}; // roll estimation needs more complex PnP
}

// ─── Passive Anti-Spoofing ─────────────────────────────────────────────────────

/**
 * Compute a "liveness score" based on the variance of z-depth across
 * face mesh landmarks. A printed photo or screen replay has near-zero
 * z-variance (flat surface), while a real 3D face has significant variance.
 *
 * Returns 0–1: higher = more likely to be a real face.
 */
export function computeDepthLivenessScore(lm: FaceMesh['landmarks']): number {
  if (lm.length === 0) return 0;

  const zValues = lm.map(p => p.z);
  const mean = zValues.reduce((a, b) => a + b, 0) / zValues.length;
  const variance = zValues.reduce((a, b) => a + (b - mean) ** 2, 0) / zValues.length;
  const stdDev = Math.sqrt(variance);

  // Real face: stdDev typically 0.05–0.25 in normalized coords
  // Flat photo: stdDev typically < 0.01
  // Cap at 1.0
  return Math.min(1.0, stdDev / 0.05);
}

// ─── Full Frame Analysis ───────────────────────────────────────────────────────

/**
 * Analyze a single frame and return all liveness metrics.
 * This is called per-frame during liveness challenge.
 */
export async function analyzeLivenessFrame(
  faceBuffer: Float32Array,
  frameWidth: number,
  frameHeight: number,
): Promise<LivenessFrameResult | null> {
  const mesh = await getFaceMeshLandmarks(faceBuffer);
  if (!mesh) {
    return {
      eyeMetrics: {leftEAR: 0, rightEAR: 0, blinkDetected: false},
      mouthMetrics: {MAR: 0, smileDetected: false, mouthOpenDetected: false},
      headPose: {yaw: 0, pitch: 0, roll: 0},
      facePresent: false,
      isLive: false,
      livenessScore: 0,
    };
  }

  const {landmarks} = mesh;

  const eyeMetrics = computeEyeMetrics(landmarks);
  const mouthMetrics = computeMouthMetrics(landmarks);
  const headPose = computeHeadPose(landmarks, frameWidth, frameHeight);
  const depthScore = computeDepthLivenessScore(landmarks);

  // Calibrate baseline on first 10 frames
  _state.frameCount++;
  if (!_state.calibrated && _state.frameCount <= 10) {
    const avgEAR = (eyeMetrics.leftEAR + eyeMetrics.rightEAR) / 2;
    _state.baselineEAR = (_state.baselineEAR * (_state.frameCount - 1) + avgEAR) / _state.frameCount;
    _state.baselineMAR = (_state.baselineMAR * (_state.frameCount - 1) + mouthMetrics.MAR) / _state.frameCount;
    _state.baselineYaw = (_state.baselineYaw * (_state.frameCount - 1) + headPose.yaw) / _state.frameCount;
    if (_state.frameCount === 10) _state.calibrated = true;
  }

  // Overall liveness: depth > 0.3 is a good sign
  const isLive = depthScore > 0.3;

  return {
    eyeMetrics,
    mouthMetrics,
    headPose,
    facePresent: true,
    isLive,
    livenessScore: depthScore,
  };
}

// ─── Challenge Verification ────────────────────────────────────────────────────

/**
 * Check if the current frame satisfies a specific liveness challenge.
 * Uses the calibrated baseline to detect relative changes.
 */
export function checkChallengeCompletion(
  frameResult: LivenessFrameResult,
  challenge: LivenessChallenge,
  config = DEFAULT_CONFIG,
): boolean {
  const {eyeMetrics, mouthMetrics, headPose} = frameResult;

  switch (challenge) {
    case 'BLINK': {
      // Blink = EAR drops significantly below baseline (at least 30% drop)
      const avgEAR = (eyeMetrics.leftEAR + eyeMetrics.rightEAR) / 2;
      const blinkThreshold = Math.min(
        config.blinkEARThreshold,
        _state.baselineEAR * 0.65,
      );
      if (avgEAR < blinkThreshold) {
        _state.blinkFrameCount++;
        // Require blink sustained for at least 2 frames to avoid noise
        return _state.blinkFrameCount >= 2;
      } else {
        // Eye re-opened, reset counter (only count fresh blinks)
        if (_state.blinkFrameCount >= 2) return true; // already passed
        _state.blinkFrameCount = 0;
      }
      return false;
    }

    case 'SMILE': {
      // Smile = MAR rises significantly above baseline
      const smileThreshold = Math.max(
        config.smileMarThreshold,
        _state.baselineMAR * 1.8,
      );
      if (mouthMetrics.MAR > smileThreshold) {
        _state.smileFrameCount++;
        return _state.smileFrameCount >= 3; // hold for 3 frames
      }
      return false;
    }

    case 'TURN_LEFT': {
      // Head turned left = yaw significantly negative relative to baseline
      const relYaw = headPose.yaw - _state.baselineYaw;
      if (relYaw < -config.headTurnThreshold) {
        _state.headTurnFrameCount++;
        return _state.headTurnFrameCount >= 3;
      }
      return false;
    }

    case 'TURN_RIGHT': {
      // Head turned right = yaw significantly positive relative to baseline
      const relYaw = headPose.yaw - _state.baselineYaw;
      if (relYaw > config.headTurnThreshold) {
        _state.headTurnFrameCount++;
        return _state.headTurnFrameCount >= 3;
      }
      return false;
    }

    case 'NOD': {
      // Nod = pitch changes significantly
      return Math.abs(headPose.pitch) > 15;
    }

    default:
      return false;
  }
}

/** Reset per-challenge counters when moving to a new challenge */
export function resetChallengeCounters(): void {
  _state.blinkFrameCount = 0;
  _state.smileFrameCount = 0;
  _state.headTurnFrameCount = 0;
}
