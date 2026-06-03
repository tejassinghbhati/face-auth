/**
 * useLiveness — React hook for managing liveness challenge sequences.
 *
 * Orchestrates multiple timed challenges (blink, smile, head turn),
 * tracks pass/fail state, and provides real-time feedback to the UI.
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {
  analyzeLivenessFrame,
  checkChallengeCompletion,
  resetLivenessState,
  resetChallengeCounters,
} from '../services/LivenessService';
import {ALL_CHALLENGES, DEFAULT_CONFIG} from '../utils/constants';
import {logger} from '../utils/logger';
import type {LivenessChallenge, LivenessFrameResult, LivenessState} from '../types';

const TAG = 'useLiveness';

export type LivenessStatus =
  | 'idle'
  | 'calibrating'
  | 'waiting'     // Waiting for user to start
  | 'active'      // Challenge in progress
  | 'passed'      // All challenges passed
  | 'failed'      // Timeout or too many failures
  | 'error';

export interface LivenessHookResult {
  status: LivenessStatus;
  livenessState: LivenessState;
  currentFrameResult: LivenessFrameResult | null;
  overallScore: number;
  /** Start the liveness challenge sequence */
  startChallenges: (challenges?: LivenessChallenge[]) => void;
  /** Process a single camera frame */
  processFrame: (
    faceBuffer: Float32Array,
    frameWidth: number,
    frameHeight: number,
  ) => Promise<void>;
  /** Reset everything */
  reset: () => void;
}

function pickRandomChallenges(
  count: number,
  available: LivenessChallenge[] = ALL_CHALLENGES,
): LivenessChallenge[] {
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, available.length));
}

function createInitialState(challenges: LivenessChallenge[]): LivenessState {
  return {
    currentChallenge: challenges[0] ?? null,
    challengeIndex: 0,
    totalChallenges: challenges.length,
    challengesPassed: new Array(challenges.length).fill(false),
    isComplete: false,
    overallScore: 0,
    timeoutMs: DEFAULT_CONFIG.livenessTimeoutMs,
  };
}

export function useLiveness(onComplete?: (passed: boolean, score: number) => void): LivenessHookResult {
  const [status, setStatus] = useState<LivenessStatus>('idle');
  const [livenessState, setLivenessState] = useState<LivenessState>(createInitialState([]));
  const [currentFrameResult, setCurrentFrameResult] = useState<LivenessFrameResult | null>(null);
  const [overallScore, setOverallScore] = useState(0);

  const challengesRef = useRef<LivenessChallenge[]>([]);
  const challengeStartTimeRef = useRef<number>(0);
  const isProcessingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calibrationFramesRef = useRef(0);

  const clearTimeout_ = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const fail = useCallback((reason: string) => {
    logger.warn(TAG, `Liveness FAILED: ${reason}`);
    clearTimeout_();
    setStatus('failed');
    const finalState = {...livenessState, isComplete: true, overallScore: 0};
    setLivenessState(finalState);
    onComplete?.(false, 0);
  }, [livenessState, clearTimeout_, onComplete]);

  const advanceToNextChallenge = useCallback((currentPassed: boolean[], score: number) => {
    const nextIndex = currentPassed.filter(Boolean).length;

    if (nextIndex >= challengesRef.current.length) {
      // All challenges completed
      clearTimeout_();
      logger.info(TAG, `All liveness challenges PASSED! Score: ${score.toFixed(2)}`);
      setStatus('passed');
      setLivenessState(prev => ({...prev, isComplete: true, overallScore: score}));
      setOverallScore(score);
      onComplete?.(true, score);
      return;
    }

    // Move to next challenge
    resetChallengeCounters();
    challengeStartTimeRef.current = Date.now();

    setLivenessState(prev => ({
      ...prev,
      challengeIndex: nextIndex,
      currentChallenge: challengesRef.current[nextIndex],
      challengesPassed: currentPassed,
    }));

    // Reset per-challenge timeout
    clearTimeout_();
    timeoutRef.current = setTimeout(() => {
      fail(`Timeout on challenge: ${challengesRef.current[nextIndex]}`);
    }, DEFAULT_CONFIG.livenessTimeoutMs);

    logger.info(TAG, `Advancing to challenge ${nextIndex + 1}/${challengesRef.current.length}: ${challengesRef.current[nextIndex]}`);
  }, [clearTimeout_, fail, onComplete]);

  const startChallenges = useCallback((challenges?: LivenessChallenge[]) => {
    clearTimeout_();
    resetLivenessState();

    const selected = challenges ?? pickRandomChallenges(DEFAULT_CONFIG.livenessChallengCount);
    challengesRef.current = selected;

    const initialState = createInitialState(selected);
    setLivenessState(initialState);
    setOverallScore(0);
    setCurrentFrameResult(null);
    calibrationFramesRef.current = 0;

    setStatus('calibrating');
    logger.info(TAG, `Starting liveness challenges: ${selected.join(', ')}`);

    // Wait for calibration frames (first 10 frames)
    setTimeout(() => {
      if (selected.length === 0) {
        setStatus('passed');
        onComplete?.(true, 1.0);
        return;
      }

      setStatus('active');
      challengeStartTimeRef.current = Date.now();

      timeoutRef.current = setTimeout(() => {
        fail(`Timeout on first challenge: ${selected[0]}`);
      }, DEFAULT_CONFIG.livenessTimeoutMs);
    }, 2000); // 2 second calibration window
  }, [clearTimeout_, fail, onComplete]);

  const processFrame = useCallback(
    async (
      faceBuffer: Float32Array,
      frameWidth: number,
      frameHeight: number,
    ): Promise<void> => {
      if (isProcessingRef.current) return;
      if (status !== 'active' && status !== 'calibrating') return;

      isProcessingRef.current = true;

      try {
        const frameResult = await analyzeLivenessFrame(faceBuffer, frameWidth, frameHeight);
        if (!frameResult) return;

        setCurrentFrameResult(frameResult);

        if (status === 'calibrating') {
          calibrationFramesRef.current++;
          return;
        }

        if (status !== 'active') return;

        // Get current challenge
        const challenges = challengesRef.current;
        const currentIdx = livenessState.challengeIndex;
        const currentChallenge = challenges[currentIdx];

        if (!currentChallenge) return;

        // Check if passive liveness is OK (depth score)
        if (!frameResult.isLive && frameResult.livenessScore < 0.2) {
          logger.warn(TAG, 'Low depth liveness score — possible spoof attempt');
          // Don't fail immediately — depth estimation isn't perfect.
          // Log a warning but continue for now.
        }

        // Check challenge completion
        const passed = checkChallengeCompletion(
          frameResult,
          currentChallenge,
          DEFAULT_CONFIG,
        );

        if (passed) {
          const newPassed = [...livenessState.challengesPassed];
          newPassed[currentIdx] = true;

          // Compute score: base on depth liveness + challenge completion rate
          const completionRate = newPassed.filter(Boolean).length / challenges.length;
          const score = completionRate * 0.7 + frameResult.livenessScore * 0.3;

          logger.info(TAG, `Challenge PASSED: ${currentChallenge} (score ${score.toFixed(2)})`);
          advanceToNextChallenge(newPassed, score);
        }
      } catch (err) {
        logger.error(TAG, 'Frame analysis error', err);
      } finally {
        isProcessingRef.current = false;
      }
    },
    [status, livenessState, advanceToNextChallenge],
  );

  const reset = useCallback(() => {
    clearTimeout_();
    resetLivenessState();
    challengesRef.current = [];
    setStatus('idle');
    setLivenessState(createInitialState([]));
    setOverallScore(0);
    setCurrentFrameResult(null);
    calibrationFramesRef.current = 0;
    isProcessingRef.current = false;
  }, [clearTimeout_]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout_();
    };
  }, [clearTimeout_]);

  return {
    status,
    livenessState,
    currentFrameResult,
    overallScore,
    startChallenges,
    processFrame,
    reset,
  };
}
