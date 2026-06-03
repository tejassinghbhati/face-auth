/**
 * SplashScreen — App entry, loads TFLite models while showing branding.
 */

import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {COLORS} from '../utils/constants';
import {loadAllModels} from '../services/ModelService';
import {initDatabase} from '../services/DatabaseService';
import {startNetworkMonitoring} from '../services/SyncService';
import {logger} from '../utils/logger';
import type {RootStackParamList} from '../types';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Splash'>;
}

export const SplashScreen: React.FC<Props> = ({navigation}) => {
  const [statusText, setStatusText] = useState('Initializing…');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Logo entrance animation
    Animated.parallel([
      Animated.spring(logoScale, {toValue: 1, friction: 8, useNativeDriver: true}),
      Animated.timing(logoOpacity, {toValue: 1, duration: 500, useNativeDriver: true}),
    ]).start();

    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const animateProgress = (value: number) => {
    Animated.timing(progressAnim, {
      toValue: value,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setProgress(value);
  };

  const init = async () => {
    try {
      // Step 1: Init database
      setStatusText('Opening local database…');
      animateProgress(0.1);
      await initDatabase();
      animateProgress(0.25);

      // Step 2: Start network monitoring (background)
      startNetworkMonitoring(true);

      // Step 3: Load AI models
      await loadAllModels((label, index, total) => {
        setStatusText(label);
        animateProgress(0.25 + (index / total) * 0.65);
      });

      animateProgress(1);
      setStatusText('Ready!');
      logger.info('SplashScreen', 'Initialization complete');

      // Navigate after a brief pause
      setTimeout(() => {
        navigation.replace('Home');
      }, 600);
    } catch (err) {
      logger.error('SplashScreen', 'Initialization failed', err);
      setError(`Initialization failed: ${String(err)}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      <View style={styles.content}>
        {/* Logo */}
        <Animated.View
          style={[
            styles.logoContainer,
            {transform: [{scale: logoScale}], opacity: logoOpacity},
          ]}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🛡️</Text>
          </View>
          <Text style={styles.appName}>NHAI Face Auth</Text>
          <Text style={styles.version}>v1.0.0 — Offline AI Edition</Text>
        </Animated.View>

        {/* Loading Status */}
        <View style={styles.loadingContainer}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>⚠️ Startup Failed</Text>
              <Text style={styles.errorMessage}>{error}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.statusText}>{statusText}</Text>
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
              <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
            </>
          )}
        </View>

        {/* Model Info */}
        <View style={styles.modelInfo}>
          <Text style={styles.modelInfoTitle}>On-device AI Models</Text>
          <View style={styles.modelRow}>
            <Text style={styles.modelBadge}>BlazeFace</Text>
            <Text style={styles.modelDetail}>Face Detection · ~1.5 MB</Text>
          </View>
          <View style={styles.modelRow}>
            <Text style={styles.modelBadge}>MobileFaceNet</Text>
            <Text style={styles.modelDetail}>Recognition · ~5.5 MB</Text>
          </View>
          <View style={styles.modelRow}>
            <Text style={styles.modelBadge}>FaceMesh</Text>
            <Text style={styles.modelDetail}>Liveness · ~9 MB</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          All AI processing happens entirely on-device.{'\n'}No data leaves your device without permission.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 32,
    paddingTop: 60,
    paddingBottom: 40,
  },
  logoContainer: {alignItems: 'center'},
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: COLORS.primaryLight,
  },
  logoEmoji: {fontSize: 44},
  appName: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  version: {color: COLORS.textSecondary, fontSize: 13, marginTop: 4},
  loadingContainer: {width: '100%', alignItems: 'center', gap: 12},
  statusText: {color: COLORS.textSecondary, fontSize: 14, textAlign: 'center'},
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: COLORS.surface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 3,
  },
  progressPct: {color: COLORS.textMuted, fontSize: 12},
  errorBox: {
    backgroundColor: `${COLORS.error}22`,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.error,
    alignItems: 'center',
  },
  errorTitle: {color: COLORS.error, fontWeight: '700', fontSize: 15, marginBottom: 6},
  errorMessage: {color: COLORS.textSecondary, fontSize: 13, textAlign: 'center'},
  modelInfo: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  modelInfoTitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  modelRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  modelBadge: {
    backgroundColor: `${COLORS.primaryLight}44`,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    minWidth: 110,
    textAlign: 'center',
  },
  modelDetail: {color: COLORS.textSecondary, fontSize: 12},
  footer: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 18,
  },
});
