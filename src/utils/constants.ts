import type {AppConfig, LivenessChallenge} from '../types';

// ─── Model File Names (bundled in assets/models/) ─────────────────────────────
export const MODEL_FILES = {
  /** BlazeFace short-range detector — ~1.5 MB */
  FACE_DETECTION: 'blazeface_short.tflite',
  /** MobileFaceNet — ~5.5 MB */
  FACE_RECOGNITION: 'mobilefacenet.tflite',
  /** MediaPipe Face Mesh — ~9 MB */
  FACE_MESH: 'face_mesh.tflite',
} as const;

// ─── Model Input/Output Dimensions ────────────────────────────────────────────
export const MODEL_CONFIG = {
  FACE_DETECTION: {
    /** Input image size for BlazeFace short-range model */
    INPUT_SIZE: 128,
    /** Number of anchors generated */
    NUM_ANCHORS: 896,
  },
  FACE_RECOGNITION: {
    /** MobileFaceNet input size */
    INPUT_SIZE: 112,
    /** Embedding dimension */
    EMBEDDING_DIM: 512,
  },
  FACE_MESH: {
    /** FaceMesh input size */
    INPUT_SIZE: 192,
    /** Total landmark points */
    NUM_LANDMARKS: 468,
  },
} as const;

// ─── MediaPipe Face Mesh Landmark Indices ─────────────────────────────────────
// Reference: https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png

export const FACE_LANDMARKS = {
  // Right eye (from model's perspective = person's left eye)
  RIGHT_EYE: {
    OUTER: 33,
    INNER: 133,
    TOP_1: 160,
    TOP_2: 158,
    BOTTOM_1: 144,
    BOTTOM_2: 153,
  },
  // Left eye (from model's perspective = person's right eye)
  LEFT_EYE: {
    OUTER: 362,
    INNER: 263,
    TOP_1: 387,
    TOP_2: 385,
    BOTTOM_1: 373,
    BOTTOM_2: 380,
  },
  // Mouth
  MOUTH: {
    OUTER_TOP: 13,
    OUTER_BOTTOM: 14,
    CORNER_LEFT: 61,
    CORNER_RIGHT: 291,
    INNER_TOP: 82,
    INNER_BOTTOM: 87,
    UPPER_LIP_LEFT: 40,
    UPPER_LIP_RIGHT: 270,
  },
  // Nose tip for head pose
  NOSE_TIP: 4,
  CHIN: 152,
  LEFT_TEMPLE: 127,
  RIGHT_TEMPLE: 356,
  // 3D head pose reference points
  NOSE_BRIDGE: 168,
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,
} as const;

// ─── Default App Configuration ────────────────────────────────────────────────
export const DEFAULT_CONFIG: AppConfig = {
  recognitionThreshold: 0.72,   // Cosine similarity ≥ 0.72 = match
  blinkEARThreshold: 0.21,      // EAR < 0.21 = blink detected
  smileMarThreshold: 0.3,       // MAR > 0.3 = smile detected
  headTurnThreshold: 20,         // ±20° yaw = head turned
  livenessChallengCount: 2,      // 2 random challenges per session
  livenessTimeoutMs: 8000,       // 8 seconds per challenge
  awsRegion: 'ap-south-1',       // Mumbai region
  s3BucketName: 'nhai-faceauth-photos',
  dynamoTableName: 'nhai-attendance',
};

// ─── Liveness Challenge Config ─────────────────────────────────────────────────
export const ALL_CHALLENGES: LivenessChallenge[] = [
  'BLINK',
  'SMILE',
  'TURN_LEFT',
  'TURN_RIGHT',
];

export const CHALLENGE_INSTRUCTIONS: Record<LivenessChallenge, string> = {
  BLINK: 'Please blink your eyes',
  SMILE: 'Please smile at the camera',
  TURN_LEFT: 'Please slowly turn your head to the left',
  TURN_RIGHT: 'Please slowly turn your head to the right',
  NOD: 'Please nod your head slowly',
};

export const CHALLENGE_ICONS: Record<LivenessChallenge, string> = {
  BLINK: '👁️',
  SMILE: '😊',
  TURN_LEFT: '⬅️',
  TURN_RIGHT: '➡️',
  NOD: '↕️',
};

// ─── Colors ───────────────────────────────────────────────────────────────────
export const COLORS = {
  primary: '#1E3A5F',        // Deep navy (NHAI brand)
  primaryLight: '#2B5F8E',
  accent: '#FF6B35',         // Orange
  success: '#27AE60',
  warning: '#F39C12',
  error: '#E74C3C',
  background: '#0D1B2A',
  surface: '#1A2B3C',
  surfaceLight: '#243447',
  text: '#FFFFFF',
  textSecondary: '#A0B4C8',
  textMuted: '#607080',
  border: '#2A3F55',
  overlay: 'rgba(0,0,0,0.7)',
  faceFrame: {
    idle: '#607080',
    detecting: '#F39C12',
    liveness: '#3498DB',
    success: '#27AE60',
    failure: '#E74C3C',
  },
} as const;

// ─── SQLite Database ───────────────────────────────────────────────────────────
export const DB_NAME = 'nhai_faceauth.db';
export const DB_VERSION = 1;

// ─── Async Storage Keys ────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  APP_CONFIG: '@nhai:app_config',
  LAST_SYNC: '@nhai:last_sync',
  AWS_CREDENTIALS: '@nhai:aws_credentials',
  ONBOARDING_DONE: '@nhai:onboarding_done',
} as const;

// ─── Performance Targets ──────────────────────────────────────────────────────
export const PERF = {
  /** Target latency for full pipeline (detect + embed + match) */
  TARGET_LATENCY_MS: 800,
  /** Frame rate for camera processing */
  CAMERA_FPS: 15,
  /** Max concurrent face processing jobs */
  MAX_CONCURRENT_JOBS: 1,
} as const;
