/**
 * EnrollmentScreen — Capture multiple face frames and register a new user.
 *
 * Flow:
 *  1. Camera opens, user centers face
 *  2. Auto-capture 8 frames over 3 seconds
 *  3. Average embeddings for robustness
 *  4. Navigate to EnrollmentForm to fill in details
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  Animated,
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

import {COLORS, MODEL_CONFIG} from '../utils/constants';
import {FaceFrame} from '../components/FaceFrame';
import {detectFaces, selectBestFace, checkFaceQuality} from '../services/FaceDetectionService';
import {generateEmbedding, averageEmbeddings, serializeEmbedding} from '../services/FaceRecognitionService';
import {preprocessFaceRGB} from '../utils/imageUtils';
import {logger} from '../utils/logger';
import type {RootStackParamList} from '../types';
import {averageEmbeddings as avgEmb} from '../utils/mathUtils';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Enrollment'>;
}

const REQUIRED_FRAMES = 8;
const CAPTURE_INTERVAL_MS = 400;

export const EnrollmentScreen: React.FC<Props> = ({navigation}) => {
  const device = useCameraDevice('front');
  const {hasPermission, requestPermission} = useCameraPermission();

  const [phase, setPhase] = useState<'waiting' | 'capturing' | 'processing' | 'done'>('waiting');
  const [capturedCount, setCapturedCount] = useState(0);
  const [qualityMsg, setQualityMsg] = useState<string | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const capturedEmbeddingsRef = useRef<Float32Array[]>([]);
  const lastCaptureTimeRef = useRef<number>(0);
  const isCapturingRef = useRef(false);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // Animate progress bar as frames are captured
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: capturedCount / REQUIRED_FRAMES,
      duration: 200,
      useNativeDriver: false,
    }).start();

    if (capturedCount >= REQUIRED_FRAMES && !isCapturingRef.current) {
      isCapturingRef.current = true;
      finalizeEnrollment();
    }
  }, [capturedCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const finalizeEnrollment = async () => {
    setPhase('processing');

    try {
      const embeddings = capturedEmbeddingsRef.current;
      if (embeddings.length < 3) {
        throw new Error('Not enough valid frames captured');
      }

      logger.info('EnrollmentScreen', `Averaging ${embeddings.length} embeddings`);
      const avgEmbedding = avgEmb(embeddings);
      const embeddingBase64 = serializeEmbedding(avgEmbedding);

      setPhase('done');

      navigation.replace('EnrollmentForm', {
        capturedPhotoUri: '', // photo captured separately
        embedding: embeddingBase64,
      });
    } catch (err) {
      logger.error('EnrollmentScreen', 'Enrollment failed', err);
      Alert.alert(
        'Enrollment Failed',
        'Could not process face data. Please ensure good lighting and try again.',
        [{text: 'Retry', onPress: () => resetCapture()}],
      );
    }
  };

  const resetCapture = () => {
    capturedEmbeddingsRef.current = [];
    lastCaptureTimeRef.current = 0;
    isCapturingRef.current = false;
    setCapturedCount(0);
    setPhase('waiting');
    progressAnim.setValue(0);
  };

  const onFrame = useCallback(
    async (frameBuffer: Float32Array, frameW: number, frameH: number) => {
      if (phase !== 'waiting' && phase !== 'capturing') return;
      if (capturedEmbeddingsRef.current.length >= REQUIRED_FRAMES) return;

      const now = Date.now();
      if (now - lastCaptureTimeRef.current < CAPTURE_INTERVAL_MS) return;
      lastCaptureTimeRef.current = now;

      try {
        // Build detection input (128x128)
        const detSize = MODEL_CONFIG.FACE_DETECTION.INPUT_SIZE;
        const detBuffer = new Float32Array(detSize * detSize * 3);
        for (let i = 0; i < detSize * detSize; i++) {
          detBuffer[i * 3] = frameBuffer[i * 3] / 255;
          detBuffer[i * 3 + 1] = frameBuffer[i * 3 + 1] / 255;
          detBuffer[i * 3 + 2] = frameBuffer[i * 3 + 2] / 255;
        }

        const faces = await detectFaces(detBuffer, frameW, frameH);
        const bestFace = selectBestFace(faces, frameW, frameH);

        if (!bestFace) {
          setQualityMsg('Position your face in the center');
          return;
        }

        const qualityErr = checkFaceQuality(bestFace, frameW, frameH);
        if (qualityErr) {
          setQualityMsg(qualityErr);
          return;
        }

        setQualityMsg(null);

        if (phase === 'waiting') setPhase('capturing');

        // Generate embedding for this frame
        const recogSize = MODEL_CONFIG.FACE_RECOGNITION.INPUT_SIZE;
        const faceBuffer = preprocessFaceRGB(
          new Uint8Array(frameBuffer.buffer),
          frameW,
          frameH,
          recogSize,
        );
        const embedding = await generateEmbedding(faceBuffer);

        capturedEmbeddingsRef.current.push(embedding);
        setCapturedCount(capturedEmbeddingsRef.current.length);
      } catch (err) {
        logger.error('EnrollmentScreen', 'Frame processing error', err);
      }
    },
    [phase],
  );

  const frameProcessor = useFrameProcessor(frame => {
    'worklet';
    const mockBuffer = new Float32Array(frame.width * frame.height * 3);
    runOnJS(onFrame)(mockBuffer, frame.width, frame.height);
  }, [onFrame]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.permText}>Camera permission needed</Text>
          <TouchableOpacity style={styles.btn} onPress={requestPermission}>
            <Text style={styles.btnText}>Grant Access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {device && (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={phase !== 'done'}
          frameProcessor={frameProcessor}
          fps={10}
        />
      )}

      <FaceFrame
        state={phase === 'capturing' ? 'liveness' : 'detecting'}
        frameWidth={375}
        frameHeight={667}
      />

      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Enroll New Face</Text>
        <View style={styles.ph} />
      </View>

      {/* Instructions */}
      <View style={styles.instructionBox}>
        <Text style={styles.instructionText}>
          {phase === 'waiting' && '👤 Center your face in the frame'}
          {phase === 'capturing' && '📸 Hold still — capturing…'}
          {phase === 'processing' && '⚙️ Processing your face data…'}
        </Text>
        {qualityMsg && phase !== 'capturing' && (
          <Text style={styles.qualityMsg}>⚠️ {qualityMsg}</Text>
        )}
      </View>

      {/* Progress Bar */}
      {(phase === 'capturing' || phase === 'processing') && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressLabel}>
            {phase === 'capturing'
              ? `Capturing frame ${capturedCount}/${REQUIRED_FRAMES}`
              : 'Building face model…'}
          </Text>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Tip */}
      <View style={styles.tipBox}>
        <Text style={styles.tipText}>
          💡 For best results: face the camera directly, ensure even lighting,
          remove sunglasses.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permText: {color: COLORS.text, fontSize: 16, marginBottom: 20},
  btn: {backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12},
  btnText: {color: COLORS.text, fontWeight: '600'},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  closeBtn: {
    width: 40, height: 40,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {color: COLORS.text, fontSize: 18},
  title: {color: COLORS.text, fontSize: 17, fontWeight: '700'},
  ph: {width: 40},
  instructionBox: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 8,
  },
  instructionText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  qualityMsg: {
    color: COLORS.warning,
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 140,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  progressLabel: {color: COLORS.textSecondary, fontSize: 13, marginBottom: 8},
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 3,
  },
  tipBox: {
    position: 'absolute',
    bottom: 60,
    left: 24,
    right: 24,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 12,
    padding: 12,
  },
  tipText: {color: COLORS.textSecondary, fontSize: 12, textAlign: 'center', lineHeight: 18},
});
