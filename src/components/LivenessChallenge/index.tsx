/**
 * LivenessChallenge — Animated challenge instruction card.
 * Shows the current challenge with an icon, instruction text,
 * a countdown progress bar, and pass/fail state.
 */

import React, {useEffect, useRef} from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {COLORS, CHALLENGE_INSTRUCTIONS, CHALLENGE_ICONS} from '../../utils/constants';
import type {LivenessChallenge as Challenge, LivenessState} from '../../types';

interface Props {
  livenessState: LivenessState;
  status: 'calibrating' | 'active' | 'passed' | 'failed' | 'idle' | 'waiting' | 'error';
  timeoutMs?: number;
}

export const LivenessChallengeCard: React.FC<Props> = ({
  livenessState,
  status,
  timeoutMs = 8000,
}) => {
  const progressAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const {currentChallenge, challengeIndex, totalChallenges, challengesPassed} = livenessState;

  // Slide in on challenge change
  useEffect(() => {
    if (status !== 'active') return;

    slideAnim.setValue(30);
    opacityAnim.setValue(0);

    Animated.parallel([
      Animated.spring(slideAnim, {toValue: 0, useNativeDriver: true}),
      Animated.timing(opacityAnim, {toValue: 1, duration: 300, useNativeDriver: true}),
    ]).start();

    // Countdown progress bar
    progressAnim.setValue(1);
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: timeoutMs,
      useNativeDriver: false,
    }).start();
  }, [challengeIndex, status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'idle') return null;

  if (status === 'calibrating') {
    return (
      <View style={[styles.card, styles.calibratingCard]}>
        <Text style={styles.calibratingText}>📷 Calibrating…</Text>
        <Text style={styles.calibratingSubtext}>Keep your face in the frame</Text>
      </View>
    );
  }

  if (status === 'passed') {
    return (
      <View style={[styles.card, styles.successCard]}>
        <Text style={styles.resultIcon}>✅</Text>
        <Text style={styles.resultText}>Liveness Verified!</Text>
      </View>
    );
  }

  if (status === 'failed') {
    return (
      <View style={[styles.card, styles.failureCard]}>
        <Text style={styles.resultIcon}>❌</Text>
        <Text style={styles.resultText}>Liveness Check Failed</Text>
        <Text style={styles.resultSubtext}>Please try again</Text>
      </View>
    );
  }

  if (!currentChallenge) return null;

  const instruction = CHALLENGE_INSTRUCTIONS[currentChallenge];
  const icon = CHALLENGE_ICONS[currentChallenge];

  return (
    <Animated.View
      style={[
        styles.card,
        {
          transform: [{translateY: slideAnim}],
          opacity: opacityAnim,
        },
      ]}>
      {/* Step dots */}
      <View style={styles.stepDots}>
        {Array.from({length: totalChallenges}).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              challengesPassed[i] ? styles.dotPassed : i === challengeIndex ? styles.dotActive : styles.dotPending,
            ]}
          />
        ))}
      </View>

      {/* Challenge icon */}
      <Text style={styles.challengeIcon}>{icon}</Text>

      {/* Challenge text */}
      <Text style={styles.challengeText}>{instruction}</Text>
      <Text style={styles.stepText}>
        Step {challengeIndex + 1} of {totalChallenges}
      </Text>

      {/* Countdown progress bar */}
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
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginHorizontal: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  calibratingCard: {
    borderColor: COLORS.warning,
  },
  successCard: {
    borderColor: COLORS.success,
    backgroundColor: `${COLORS.success}22`,
  },
  failureCard: {
    borderColor: COLORS.error,
    backgroundColor: `${COLORS.error}22`,
  },
  calibratingText: {
    color: COLORS.warning,
    fontSize: 16,
    fontWeight: '600',
  },
  calibratingSubtext: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  stepDots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotPending: {
    backgroundColor: COLORS.textMuted,
  },
  dotActive: {
    backgroundColor: COLORS.accent,
    width: 20,
  },
  dotPassed: {
    backgroundColor: COLORS.success,
  },
  challengeIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  challengeText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  stepText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 16,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  resultIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  resultText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  resultSubtext: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
});
