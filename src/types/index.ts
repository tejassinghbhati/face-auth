// ─── Core Domain Types ────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  employeeId: string;
  department: string;
  designation: string;
  /** 512-dimensional face embedding stored as Float32Array serialized to base64 */
  embedding: string;
  enrolledAt: number; // Unix timestamp ms
  enrollmentPhoto?: string; // local file path
  synced: boolean;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  timestamp: number;
  location?: GeoLocation;
  livenessScore: number;    // 0–1
  recognitionConfidence: number; // 0–1 (cosine similarity)
  capturedPhotoPath?: string;
  livenessChallengePassed: boolean;
  challengeType: LivenessChallenge[];
  synced: boolean;
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

// ─── ML / Model Types ─────────────────────────────────────────────────────────

/** Bounding box in pixel coordinates */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Detected face from BlazeFace model */
export interface DetectedFace {
  boundingBox: BoundingBox;
  /** Confidence score 0–1 */
  confidence: number;
  /** 6 key landmark points: [rightEye, leftEye, nose, mouth, rightEar, leftEar] */
  landmarks: Array<{x: number; y: number}>;
}

/** 468-point face mesh from MediaPipe FaceMesh */
export interface FaceMesh {
  landmarks: Array<{x: number; y: number; z: number}>;
}

/** Face embedding vector (512 dimensions from MobileFaceNet) */
export type FaceEmbedding = Float32Array;

/** Recognition result after comparing embeddings */
export interface RecognitionResult {
  matched: boolean;
  user?: User;
  confidence: number; // cosine similarity 0–1
  processingTimeMs: number;
}

// ─── Liveness Detection Types ─────────────────────────────────────────────────

export type LivenessChallenge =
  | 'BLINK'
  | 'SMILE'
  | 'TURN_LEFT'
  | 'TURN_RIGHT'
  | 'NOD';

export interface LivenessState {
  currentChallenge: LivenessChallenge | null;
  challengeIndex: number;
  totalChallenges: number;
  challengesPassed: boolean[];
  isComplete: boolean;
  overallScore: number;
  timeoutMs: number;
}

export interface EyeMetrics {
  /** Eye Aspect Ratio — below threshold means blink */
  leftEAR: number;
  rightEAR: number;
  blinkDetected: boolean;
}

export interface MouthMetrics {
  /** Mouth Aspect Ratio — above threshold means smile/open */
  MAR: number;
  smileDetected: boolean;
  mouthOpenDetected: boolean;
}

export interface HeadPose {
  /** Degrees: positive = looking right */
  yaw: number;
  /** Degrees: positive = looking up */
  pitch: number;
  /** Degrees: positive = head tilted right */
  roll: number;
}

export interface LivenessFrameResult {
  eyeMetrics: EyeMetrics;
  mouthMetrics: MouthMetrics;
  headPose: HeadPose;
  facePresent: boolean;
  isLive: boolean;
  livenessScore: number;
}

// ─── App Navigation Types ─────────────────────────────────────────────────────

export type RootStackParamList = {
  Splash: undefined;
  Home: undefined;
  Enrollment: undefined;
  EnrollmentForm: {capturedPhotoUri: string; embedding: string};
  Authentication: undefined;
  LivenessChallenge: {
    embedding?: string;
    challenges: LivenessChallenge[];
    mode: 'enrollment' | 'authentication';
  };
  Result: {
    success: boolean;
    record?: AttendanceRecord;
    message: string;
  };
  Admin: undefined;
  SyncDashboard: undefined;
};

// ─── Service Response Types ────────────────────────────────────────────────────

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SyncStatus {
  lastSyncAt: number | null;
  pendingUsers: number;
  pendingAttendance: number;
  isOnline: boolean;
  isSyncing: boolean;
}

export interface DatabaseStats {
  totalUsers: number;
  totalAttendance: number;
  unsyncedUsers: number;
  unsyncedAttendance: number;
  dbSizeKB: number;
}

// ─── Config / Settings ────────────────────────────────────────────────────────

export interface AppConfig {
  /** Cosine similarity threshold for a positive match (0–1) */
  recognitionThreshold: number;
  /** EAR threshold below which a blink is detected */
  blinkEARThreshold: number;
  /** MAR threshold above which a smile is detected */
  smileMarThreshold: number;
  /** Yaw degrees threshold for head turn detection */
  headTurnThreshold: number;
  /** Number of liveness challenges per session */
  livenessChallengCount: number;
  /** Max time (ms) for a liveness challenge before failure */
  livenessTimeoutMs: number;
  /** AWS Region */
  awsRegion: string;
  /** S3 bucket name for sync */
  s3BucketName: string;
  /** DynamoDB table for attendance */
  dynamoTableName: string;
}
