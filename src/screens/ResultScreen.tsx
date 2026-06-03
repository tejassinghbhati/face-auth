/**
 * ResultScreen — Shows authentication result (success/failure).
 */

import React, {useEffect, useRef} from 'react';
import {
  Animated,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';
import {COLORS} from '../utils/constants';
import type {RootStackParamList} from '../types';
import {format} from 'date-fns';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Result'>;
  route: RouteProp<RootStackParamList, 'Result'>;
}

export const ResultScreen: React.FC<Props> = ({navigation, route}) => {
  const {success, record, message} = route.params;

  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={[styles.container, success ? styles.successBg : styles.failureBg]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <Animated.View
        style={[
          styles.card,
          {transform: [{scale: scaleAnim}], opacity: opacityAnim},
        ]}>
        {/* Result Icon */}
        <View style={[styles.iconCircle, success ? styles.iconCircleSuccess : styles.iconCircleFailure]}>
          <Text style={styles.icon}>{success ? '✓' : '✗'}</Text>
        </View>

        {/* Title */}
        <Text style={[styles.title, success ? styles.titleSuccess : styles.titleFailure]}>
          {success ? 'Authenticated!' : 'Not Recognized'}
        </Text>

        {/* Message */}
        <Text style={styles.message}>{message}</Text>

        {/* Record Details (on success) */}
        {success && record && (
          <View style={styles.details}>
            <DetailRow label="Time" value={format(record.timestamp, 'dd MMM yyyy, hh:mm:ss a')} />
            <DetailRow label="Confidence" value={`${(record.recognitionConfidence * 100).toFixed(1)}%`} />
            <DetailRow
              label="Liveness"
              value={`${(record.livenessScore * 100).toFixed(0)}% — ${record.livenessChallengePassed ? 'Passed ✓' : 'Failed ✗'}`}
            />
            {record.challengeType?.length > 0 && (
              <DetailRow
                label="Challenges"
                value={record.challengeType.join(', ')}
              />
            )}
          </View>
        )}
      </Animated.View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('Authentication')}>
          <Text style={styles.primaryBtnText}>
            {success ? 'Done' : 'Try Again'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('Home')}>
          <Text style={styles.secondaryBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const DetailRow: React.FC<{label: string; value: string}> = ({label, value}) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  successBg: {backgroundColor: COLORS.background},
  failureBg: {backgroundColor: COLORS.background},
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconCircleSuccess: {backgroundColor: `${COLORS.success}33`, borderWidth: 3, borderColor: COLORS.success},
  iconCircleFailure: {backgroundColor: `${COLORS.error}33`, borderWidth: 3, borderColor: COLORS.error},
  icon: {fontSize: 36, fontWeight: '700'},
  title: {fontSize: 26, fontWeight: '800', marginBottom: 8},
  titleSuccess: {color: COLORS.success},
  titleFailure: {color: COLORS.error},
  message: {
    color: COLORS.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  details: {
    width: '100%',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 16,
  },
  detailRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  detailLabel: {color: COLORS.textSecondary, fontSize: 13},
  detailValue: {color: COLORS.text, fontSize: 13, fontWeight: '600', maxWidth: '60%', textAlign: 'right'},
  actions: {gap: 12, width: '100%'},
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {color: COLORS.text, fontSize: 16, fontWeight: '700'},
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: {color: COLORS.textSecondary, fontSize: 15},
});
