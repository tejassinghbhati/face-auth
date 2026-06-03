/**
 * useFaceRecognition — React hook for the face recognition pipeline.
 *
 * Manages the full pipeline: frame capture → face detection → embedding → matching.
 * Designed to be called once per camera frame at ~15 FPS.
 */

import {useCallback, useRef, useState} from 'react';
import {detectFaces, selectBestFace, checkFaceQuality} from '../services/FaceDetectionService';
import {
  generateEmbedding,
  findBestMatch,
  populateCache,
  getCacheSize,
} from '../services/FaceRecognitionService';
import {preprocessFaceRGB} from '../utils/imageUtils';
import {MODEL_CONFIG, DEFAULT_CONFIG} from '../utils/constants';
import {logger} from '../utils/logger';
import type {DetectedFace, RecognitionResult, User} from '../types';

const TAG = 'useFaceRecognition';

export type PipelineState =
  | 'idle'
  | 'detecting'
  | 'processing'
  | 'recognized'
  | 'unknown'
  | 'error';

export interface FaceRecognitionHookResult {
  /** Current pipeline state */
  state: PipelineState;
  /** Last detected face bounding box */
  detectedFace: DetectedFace | null;
  /** Last recognition result */
  recognitionResult: RecognitionResult | null;
  /** Quality feedback message for the user */
  qualityMessage: string | null;
  /** Processing time for the last frame */
  lastFrameMs: number;
  /** Process a single camera frame */
  processFrame: (
    frameBuffer: Uint8Array,
    frameWidth: number,
    frameHeight: number,
  ) => Promise<RecognitionResult | null>;
  /** Load users into the in-memory cache */
  loadUsers: (users: User[]) => void;
  /** Reset state */
  reset: () => void;
}

export function useFaceRecognition(
  userMap: Map<string, User>,
  threshold?: number,
): FaceRecognitionHookResult {
  const [state, setState] = useState<PipelineState>('idle');
  const [detectedFace, setDetectedFace] = useState<DetectedFace | null>(null);
  const [recognitionResult, setRecognitionResult] = useState<RecognitionResult | null>(null);
  const [qualityMessage, setQualityMessage] = useState<string | null>(null);
  const [lastFrameMs, setLastFrameMs] = useState(0);

  const isProcessingRef = useRef(false);

  const loadUsers = useCallback((users: User[]) => {
    populateCache(users);
    logger.info(TAG, `Cache loaded with ${getCacheSize()} users`);
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setDetectedFace(null);
    setRecognitionResult(null);
    setQualityMessage(null);
    setLastFrameMs(0);
    isProcessingRef.current = false;
  }, []);

  const processFrame = useCallback(
    async (
      frameBuffer: Uint8Array,
      frameWidth: number,
      frameHeight: number,
    ): Promise<RecognitionResult | null> => {
      // Drop frame if already processing (prevent pipeline backup)
      if (isProcessingRef.current) return null;
      isProcessingRef.current = true;

      const t0 = Date.now();

      try {
        setState('detecting');

        // ── Step 1: Preprocess frame for BlazeFace (128×128, [0,1]) ──────────
        const detectionInputSize = MODEL_CONFIG.FACE_DETECTION.INPUT_SIZE;
        // In a real implementation, this resize happens in native code via
        // react-native-vision-camera frame processors for performance.
        // Here we build the float32 buffer assuming the frame has been
        // downscaled to 128×128 before being passed to this hook.
        const detectionBuffer = new Float32Array(
          detectionInputSize * detectionInputSize * 3,
        );
        // Normalize RGBA → RGB float [0,1]
        for (let i = 0; i < detectionInputSize * detectionInputSize; i++) {
          detectionBuffer[i * 3] = frameBuffer[i * 4] / 255;
          detectionBuffer[i * 3 + 1] = frameBuffer[i * 4 + 1] / 255;
          detectionBuffer[i * 3 + 2] = frameBuffer[i * 4 + 2] / 255;
        }

        // ── Step 2: Detect faces ──────────────────────────────────────────────
        const faces = await detectFaces(detectionBuffer, frameWidth, frameHeight);
        const bestFace = selectBestFace(faces, frameWidth, frameHeight);

        if (!bestFace) {
          setState('idle');
          setDetectedFace(null);
          setQualityMessage('Position your face in the frame');
          return null;
        }

        setDetectedFace(bestFace);

        // ── Step 3: Quality check ─────────────────────────────────────────────
        const qualityErr = checkFaceQuality(bestFace, frameWidth, frameHeight);
        if (qualityErr) {
          setState('idle');
          setQualityMessage(qualityErr);
          return null;
        }

        setQualityMessage(null);
        setState('processing');

        // ── Step 4: Crop & preprocess face for MobileFaceNet (112×112, [-1,1]) ─
        // In production, the native frame processor crops & resizes.
        // Here we simulate with a simple slice/normalize of the center region.
        const recogInputSize = MODEL_CONFIG.FACE_RECOGNITION.INPUT_SIZE;
        const faceBuffer = preprocessFaceRGB(
          frameBuffer,
          frameWidth,
          frameHeight,
          recogInputSize,
        );

        // ── Step 5: Generate embedding ────────────────────────────────────────
        const embedding = await generateEmbedding(faceBuffer);

        // ── Step 6: Match against cache ───────────────────────────────────────
        const matchResult = findBestMatch(
          embedding,
          userMap,
          threshold ?? DEFAULT_CONFIG.recognitionThreshold,
        );

        const processingTimeMs = Date.now() - t0;
        setLastFrameMs(processingTimeMs);

        const result: RecognitionResult = {
          ...matchResult,
          processingTimeMs,
        };

        setRecognitionResult(result);
        setState(matchResult.matched ? 'recognized' : 'unknown');

        logger.debug(
          TAG,
          `Frame processed in ${processingTimeMs}ms — ${matchResult.matched ? 'MATCH' : 'NO MATCH'}`,
        );

        return result;
      } catch (err) {
        logger.error(TAG, 'Frame processing error', err);
        setState('error');
        setQualityMessage('Processing error — please try again');
        return null;
      } finally {
        isProcessingRef.current = false;
      }
    },
    [userMap, threshold],
  );

  return {
    state,
    detectedFace,
    recognitionResult,
    qualityMessage,
    lastFrameMs,
    processFrame,
    loadUsers,
    reset,
  };
}
