/**
 * HomeScreen — Main landing page.
 * Two primary actions: Enroll a new face, or Authenticate.
 */

import React, {useEffect, useState} from 'react';
import {
  Animated,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {COLORS} from '../utils/constants';
import {getDatabaseStats} from '../services/DatabaseService';
import {getSyncStatus} from '../services/SyncService';
import type {RootStackParamList, DatabaseStats, SyncStatus} from '../types';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
}

export const HomeScreen: React.FC<Props> = ({navigation}) => {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const fadeAnim = new Animated.Value(0);
  const slideAnim = new Animated.Value(20);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {toValue: 1, duration: 600, useNativeDriver: true}),
      Animated.spring(slideAnim, {toValue: 0, useNativeDriver: true}),
    ]).start();

    loadStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadStats = async () => {
    try {
      const [dbStats, sync] = await Promise.all([
        getDatabaseStats(),
        Promise.resolve(getSyncStatus()),
      ]);
      setStats(dbStats);
      setSyncStatus(sync);
    } catch {
      // Stats are optional
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View style={[styles.header, {opacity: fadeAnim, transform: [{translateY: slideAnim}]}]}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoIcon}>🛡️</Text>
          </View>
          <Text style={styles.appName}>NHAI Face Auth</Text>
          <Text style={styles.tagline}>Secure · Offline · Accurate</Text>

          {/* Network Status */}
          <View style={[styles.badge, syncStatus?.isOnline ? styles.badgeOnline : styles.badgeOffline]}>
            <View style={[styles.dot, syncStatus?.isOnline ? styles.dotOnline : styles.dotOffline]} />
            <Text style={styles.badgeText}>
              {syncStatus?.isOnline ? 'Online' : 'Offline Mode'}
            </Text>
          </View>
        </Animated.View>

        {/* Stats Row */}
        {stats && (
          <Animated.View style={[styles.statsRow, {opacity: fadeAnim}]}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalUsers}</Text>
              <Text style={styles.statLabel}>Enrolled</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalAttendance}</Text>
              <Text style={styles.statLabel}>Records</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCard}>
              <Text style={[styles.statValue, stats.unsyncedAttendance > 0 && styles.statValueWarning]}>
                {stats.unsyncedAttendance}
              </Text>
              <Text style={styles.statLabel}>Unsynced</Text>
            </View>
          </Animated.View>
        )}

        {/* Action Buttons */}
        <Animated.View style={[styles.actions, {opacity: fadeAnim, transform: [{translateY: slideAnim}]}]}>
          {/* Authenticate */}
          <TouchableOpacity
            style={[styles.primaryBtn]}
            onPress={() => navigation.navigate('Authentication')}
            activeOpacity={0.85}>
            <Text style={styles.primaryBtnIcon}>👤</Text>
            <View style={styles.btnTextGroup}>
              <Text style={styles.primaryBtnText}>Authenticate</Text>
              <Text style={styles.primaryBtnSubtext}>Scan face to mark attendance</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          {/* Enroll */}
          <TouchableOpacity
            style={[styles.secondaryBtn]}
            onPress={() => navigation.navigate('Enrollment')}
            activeOpacity={0.85}>
            <Text style={styles.secondaryBtnIcon}>➕</Text>
            <View style={styles.btnTextGroup}>
              <Text style={styles.secondaryBtnText}>Enroll New User</Text>
              <Text style={styles.secondaryBtnSubtext}>Register a new face profile</Text>
            </View>
            <Text style={[styles.chevron, styles.chevronDark]}>›</Text>
          </TouchableOpacity>

          {/* Admin */}
          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={() => navigation.navigate('Admin')}
            activeOpacity={0.85}>
            <Text style={styles.outlineBtnIcon}>⚙️</Text>
            <Text style={styles.outlineBtnText}>Admin Dashboard</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Footer */}
        <Text style={styles.footer}>
          Powered by MobileFaceNet + MediaPipe FaceMesh{'\n'}
          All processing happens on-device
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 24,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: COLORS.primaryLight,
  },
  logoIcon: {
    fontSize: 36,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
    letterSpacing: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 12,
  },
  badgeOnline: {backgroundColor: `${COLORS.success}22`, borderColor: COLORS.success, borderWidth: 1},
  badgeOffline: {backgroundColor: `${COLORS.warning}22`, borderColor: COLORS.warning, borderWidth: 1},
  dot: {width: 8, height: 8, borderRadius: 4},
  dotOnline: {backgroundColor: COLORS.success},
  dotOffline: {backgroundColor: COLORS.warning},
  badgeText: {fontSize: 12, color: COLORS.textSecondary, fontWeight: '500'},

  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statCard: {flex: 1, alignItems: 'center'},
  statDivider: {width: 1, height: 32, backgroundColor: COLORS.border},
  statValue: {fontSize: 22, fontWeight: '700', color: COLORS.text},
  statValueWarning: {color: COLORS.warning},
  statLabel: {fontSize: 11, color: COLORS.textSecondary, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5},

  actions: {gap: 12},
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  primaryBtnIcon: {fontSize: 28},
  btnTextGroup: {flex: 1},
  primaryBtnText: {color: COLORS.text, fontSize: 17, fontWeight: '700'},
  primaryBtnSubtext: {color: COLORS.textSecondary, fontSize: 12, marginTop: 2},
  chevron: {color: COLORS.text, fontSize: 24, fontWeight: '300'},
  chevronDark: {color: COLORS.primary},

  secondaryBtn: {
    backgroundColor: COLORS.text,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  secondaryBtnIcon: {fontSize: 28},
  secondaryBtnText: {color: COLORS.primary, fontSize: 17, fontWeight: '700'},
  secondaryBtnSubtext: {color: COLORS.textMuted, fontSize: 12, marginTop: 2},

  outlineBtn: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  outlineBtnIcon: {fontSize: 18},
  outlineBtnText: {color: COLORS.textSecondary, fontSize: 15, fontWeight: '600'},

  footer: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 32,
    lineHeight: 18,
  },
});
