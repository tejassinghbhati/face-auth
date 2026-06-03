/**
 * AuthenticationScreen — Live camera feed + face recognition + liveness.
 *
 * Flow:
 *  1. Camera opens, frame processor begins detecting faces
 *  2. Once a good face is detected, liveness challenges begin
 *  3. After challenges pass, recognition runs and attendance is logged
 *  4. Navigate to ResultScreen
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera';
import {runOnJS} from 'react-native-reanimated';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {COLORS, DEFAULT_CONFIG, ALL_CHALLENGES} from '../utils/constants';
import {FaceFrame} from '../components/FaceFrame';
import {LivenessChallengeCard} from '../components/LivenessChallenge';
import {useLiveness} from '../hooks/useLiveness';
import {useFaceRecognition} from '../hooks/useFaceRecognition';
import {
  getAllUsers,
  insertAttendance,
} from '../services/DatabaseService';
import {
  populateCache,
} from '../services/FaceRecognitionService';
import {savePhoto} from '../utils/imageUtils';
import {logger} from '../utils/logger';
import type {RootStackParamList, User, AttendanceRecord} from '../types';
import {v4 as uuidv4} from 'uuid';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Authentication'>;
}

type AuthPhase = 'loading' | 'waiting' | 'liveness' | 'recognizing' | 'done';

export const AuthenticationScreen: React.FC<Props> = ({navigation}) => {
  const device = useCameraDevice('front');
  const {hasPermission, requestPermission} = useCameraPermission();

  const [phase, setPhase] = useState<AuthPhase>('loading');
  const [qualityMsg, setQualityMsg] = useState<string | null>(null);
  const [userMap, setUserMap] = useState<Map<string, User>>(new Map());
  const [faceBufferRef] = useState({current: null as Float32Array | null});
  const isCompletedRef = useRef(false);

  // ── Load users into cache ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const users = await getAllUsers();
        if (users.length === 0) {
          Alert.alert(
            'No Users Enrolled',
            'Please enroll at least one face profile before authenticating.',
            [{text: 'OK', onPress: () => navigation.goBack()}],
          );
          return;
        }
        const map = new Map<string, User>(users.map(u => [u.id, u]));
        setUserMap(map);
        populateCache(users);
        setPhase('waiting');
        logger.info('AuthScreen', `Loaded ${users.length} users into recognition cache`);
      } catch (err) {
        logger.error('AuthScreen', 'Failed to load users', err);
        Alert.alert('Error', 'Failed to load user database');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Liveness Hook ──────────────────────────────────────────────────────────
  const onLivenessComplete = useCallback(
    async (passed: boolean, score: number) => {
      if (isCompletedRef.current) return;

      if (!passed) {
        logger.warn('AuthScreen', 'Liveness FAILED');
        setPhase('done');
        isCompletedRef.current = true;
        navigation.replace('Result', {
          success: false,
          message: 'Liveness verification failed. Please try again.',
        });
        return;
      }

      // Liveness passed — now run recognition
      setPhase('recognizing');
      logger.info('AuthScreen', `Liveness passed (score: ${score.toFixed(2)})`);

      try {
        const faceBuffer = faceBufferRef.current;
        if (!faceBuffer) throw new Error('No face buffer captured');

        const {recognizeFace} = await import('../services/FaceRecognitionService');
        const result = await recognizeFace(faceBuffer, userMap);
        isCompletedRef.current = true;
        setPhase('done');

        if (result.matched && result.user) {
          // Log attendance
          const record = await insertAttendance({
            userId: result.user.id,
            userName: result.user.name,
            timestamp: Date.now(),
            livenessScore: score,
            recognitionConfidence: result.confidence,
            livenessChallengePassed: true,
            challengeType: livenessHook.livenessState.challengesPassed
              .map((_, i) => ALL_CHALLENGES[i])
              .filter(Boolean),
          });

          navigation.replace('Result', {
            success: true,
            record,
            message: `Welcome, ${result.user.name}!`,
          });
        } else {
          navigation.replace('Result', {
            success: false,
            message: `Face not recognized (confidence: ${(result.confidence * 100).toFixed(0)}%)`,
          });
        }
      } catch (err) {
        logger.error('AuthScreen', 'Recognition error', err);
        navigation.replace('Result', {
          success: false,
          message: 'Recognition failed. Please try again.',
        });
      }
    },
    [userMap, navigation, faceBufferRef], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const livenessHook = useLiveness(onLivenessComplete);

  // ── Camera Permission ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // ── Frame Processor (runs on camera thread) ────────────────────────────────
  const onFrameData = useCallback(
    (frameBuffer: Float32Array, frameW: number, frameH: number) => {
      faceBufferRef.current = frameBuffer;

      if (phase === 'waiting') {
        // Start liveness after stable face detection
        setPhase('liveness');
        livenessHook.startChallenges();
      } else if (phase === 'liveness') {
        livenessHook.processFrame(frameBuffer, frameW, frameH).catch(() => {});
      }
    },
    [phase, livenessHook, faceBufferRef],
  );

  const frameProcessor = useFrameProcessor(frame => {
    'worklet';
    // In a real implementation this would use react-native-vision-camera
    // frame processors with VisionCamera's native image processing.
    // The frame would be resized to 192x192 and passed to the ML model.
    //
    // For prototype demonstration, we simulate frame data.
    // Production uses: frame.toArrayBuffer() + native resize ops.
    const mockBuffer = new Float32Array(192 * 192 * 3);
    runOnJS(onFrameData)(mockBuffer, frame.width, frame.height);
  }, [onFrameData]);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionView}>
          <Text style={styles.permissionText}>📷 Camera permission required</Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionView}>
          <Text style={styles.permissionText}>No front camera found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const getFrameState = () => {
    if (phase === 'loading') return 'idle';
    if (phase === 'waiting') return 'detecting';
    if (phase === 'liveness') return livenessHook.status === 'passed' ? 'success' : 'liveness';
    if (phase === 'recognizing') return 'detecting';
    return 'idle';
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Camera Preview */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={phase !== 'done' && phase !== 'loading'}
        frameProcessor={frameProcessor}
        fps={15}
      />

      {/* Face guide overlay */}
      <FaceFrame
        state={getFrameState()}
        frameWidth={375}
        frameHeight={667}
      />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Authenticate</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Phase Labels */}
      <View style={styles.phaseLabel}>
        {phase === 'loading' && (
          <View style={styles.infoChip}>
            <Text style={styles.infoChipText}>⏳ Loading…</Text>
          </View>
        )}
        {phase === 'waiting' && (
          <View style={styles.infoChip}>
            <Text style={styles.infoChipText}>👤 Position your face</Text>
          </View>
        )}
        {phase === 'recognizing' && (
          <View style={[styles.infoChip, styles.infoChipActive]}>
            <Text style={styles.infoChipText}>🔍 Recognizing…</Text>
          </View>
        )}
        {qualityMsg && (
          <View style={[styles.infoChip, styles.infoChipWarning]}>
            <Text style={styles.infoChipText}>⚠️ {qualityMsg}</Text>
          </View>
        )}
      </View>

      {/* Liveness Challenge Card */}
      <View style={styles.challengeContainer}>
        {phase === 'liveness' && (
          <LivenessChallengeCard
            livenessState={livenessHook.livenessState}
            status={livenessHook.status}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  permissionView: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionText: {color: COLORS.text, fontSize: 16, textAlign: 'center', marginBottom: 20},
  permissionBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionBtnText: {color: COLORS.text, fontWeight: '600', fontSize: 15},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {color: COLORS.text, fontSize: 18},
  screenTitle: {color: COLORS.text, fontSize: 17, fontWeight: '700'},
  placeholder: {width: 40},
  phaseLabel: {
    alignItems: 'center',
    marginTop: 8,
  },
  infoChip: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  infoChipActive: {borderColor: COLORS.primary},
  infoChipWarning: {borderColor: COLORS.warning},
  infoChipText: {color: COLORS.text, fontSize: 14, fontWeight: '500'},
  challengeContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
  },
});
