/**
 * FaceFrame — Animated face guide overlay drawn over the camera preview.
 * Shows a rounded rectangle guide with corner brackets that pulse green on success.
 */

import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';
import {COLORS} from '../../utils/constants';
import type {BoundingBox} from '../../types';

type FrameState = 'idle' | 'detecting' | 'liveness' | 'success' | 'failure';

interface Props {
  state: FrameState;
  detectedBBox?: BoundingBox | null;
  frameWidth: number;
  frameHeight: number;
}

const GUIDE_SIZE = 260;
const CORNER_SIZE = 24;
const CORNER_WIDTH = 3;

const STATE_COLORS: Record<FrameState, string> = {
  idle: COLORS.faceFrame.idle,
  detecting: COLORS.faceFrame.detecting,
  liveness: COLORS.faceFrame.liveness,
  success: COLORS.faceFrame.success,
  failure: COLORS.faceFrame.failure,
};

export const FaceFrame: React.FC<Props> = ({state}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const colorAnim = useRef(new Animated.Value(0)).current;

  const color = STATE_COLORS[state];

  useEffect(() => {
    if (state === 'detecting' || state === 'liveness') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {toValue: 1.04, duration: 800, useNativeDriver: true}),
          Animated.timing(pulseAnim, {toValue: 1, duration: 800, useNativeDriver: true}),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      Animated.spring(pulseAnim, {toValue: 1, useNativeDriver: true}).start();
    }
  }, [state, pulseAnim]);

  const cornerStyle = {borderColor: color};

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Dim overlay with hole */}
      <View style={styles.overlay} />

      {/* Animated guide rectangle */}
      <Animated.View
        style={[
          styles.guideBox,
          {transform: [{scale: pulseAnim}]},
        ]}>
        {/* Top-left corner */}
        <View style={[styles.cornerTL, styles.cornerH, cornerStyle]} />
        <View style={[styles.cornerTL, styles.cornerV, cornerStyle]} />

        {/* Top-right corner */}
        <View style={[styles.cornerTR, styles.cornerH, cornerStyle]} />
        <View style={[styles.cornerTR, styles.cornerV, cornerStyle]} />

        {/* Bottom-left corner */}
        <View style={[styles.cornerBL, styles.cornerH, cornerStyle]} />
        <View style={[styles.cornerBL, styles.cornerV, cornerStyle]} />

        {/* Bottom-right corner */}
        <View style={[styles.cornerBR, styles.cornerH, cornerStyle]} />
        <View style={[styles.cornerBR, styles.cornerV, cornerStyle]} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  guideBox: {
    width: GUIDE_SIZE,
    height: GUIDE_SIZE * 1.2,
    borderRadius: 16,
    // Cut hole in overlay by using a transparent background
    backgroundColor: 'transparent',
  },

  // Corner bracket pieces
  cornerTL: {position: 'absolute', top: 0, left: 0},
  cornerTR: {position: 'absolute', top: 0, right: 0},
  cornerBL: {position: 'absolute', bottom: 0, left: 0},
  cornerBR: {position: 'absolute', bottom: 0, right: 0},

  cornerH: {
    width: CORNER_SIZE,
    height: CORNER_WIDTH,
    backgroundColor: 'transparent',
    borderTopWidth: CORNER_WIDTH,
    borderColor: COLORS.faceFrame.idle,
  },
  cornerV: {
    width: CORNER_WIDTH,
    height: CORNER_SIZE,
    backgroundColor: 'transparent',
    borderLeftWidth: CORNER_WIDTH,
    borderColor: COLORS.faceFrame.idle,
  },
});
