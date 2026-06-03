/**
 * AdminScreen — View enrolled users, attendance logs, sync dashboard.
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  Alert,
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {COLORS} from '../utils/constants';
import {
  getAllUsers,
  getAttendanceRecords,
  getDatabaseStats,
  purgeSyncedData,
  deleteUser,
} from '../services/DatabaseService';
import {syncAll, getSyncStatus, startNetworkMonitoring} from '../services/SyncService';
import {removeFromCache} from '../services/FaceRecognitionService';
import type {RootStackParamList, User, AttendanceRecord, DatabaseStats, SyncStatus} from '../types';
import {format} from 'date-fns';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Admin'>;
}

type Tab = 'users' | 'attendance' | 'sync';

export const AdminScreen: React.FC<Props> = ({navigation}) => {
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [u, a, s] = await Promise.all([
        getAllUsers(),
        getAttendanceRecords(50),
        getDatabaseStats(),
      ]);
      setUsers(u);
      setAttendance(a);
      setStats(s);
      setSyncStatus(getSyncStatus());
    } catch (err) {
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsub = startNetworkMonitoring(false);
    return unsub;
  }, [loadData]);

  const handleSync = async () => {
    if (!syncStatus.isOnline) {
      Alert.alert('Offline', 'Cannot sync — no internet connection');
      return;
    }
    setIsSyncing(true);
    try {
      await syncAll({purgeAfterSync: false});
      setSyncStatus(getSyncStatus());
      await loadData();
      Alert.alert('Sync Complete', 'All data synced to AWS successfully');
    } catch {
      Alert.alert('Sync Failed', 'Could not sync to AWS. Check credentials.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePurge = () => {
    Alert.alert(
      'Purge Synced Data',
      'This will delete all synced attendance records from the device. Unsynced records will be kept.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Purge',
          style: 'destructive',
          onPress: async () => {
            await purgeSyncedData();
            await loadData();
          },
        },
      ],
    );
  };

  const handleDeleteUser = (user: User) => {
    Alert.alert(
      'Delete User',
      `Are you sure you want to delete ${user.name}?\nThis will also remove their attendance records.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteUser(user.id);
            removeFromCache(user.id);
            await loadData();
          },
        },
      ],
    );
  };

  const renderUserItem = ({item}: {item: User}) => (
    <View style={styles.listItem}>
      <View style={styles.listItemAvatar}>
        <Text style={styles.avatarText}>{item.name[0]}</Text>
      </View>
      <View style={styles.listItemContent}>
        <Text style={styles.listItemTitle}>{item.name}</Text>
        <Text style={styles.listItemSubtitle}>{item.employeeId} · {item.department}</Text>
        <Text style={styles.listItemMeta}>{format(item.enrolledAt, 'dd MMM yyyy')}</Text>
      </View>
      <View style={styles.listItemActions}>
        <View style={[styles.syncDot, item.synced ? styles.syncDotGreen : styles.syncDotOrange]} />
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteUser(item)}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAttendanceItem = ({item}: {item: AttendanceRecord}) => (
    <View style={styles.listItem}>
      <View style={[styles.listItemAvatar, item.livenessChallengePassed ? styles.avatarSuccess : styles.avatarFailure]}>
        <Text style={styles.avatarText}>{item.userName[0]}</Text>
      </View>
      <View style={styles.listItemContent}>
        <Text style={styles.listItemTitle}>{item.userName}</Text>
        <Text style={styles.listItemSubtitle}>
          {format(item.timestamp, 'dd MMM HH:mm:ss')}
        </Text>
        <Text style={styles.listItemMeta}>
          Confidence: {(item.recognitionConfidence * 100).toFixed(1)}% ·
          Liveness: {(item.livenessScore * 100).toFixed(0)}%
        </Text>
      </View>
      <View style={styles.listItemActions}>
        <View style={[styles.syncDot, item.synced ? styles.syncDotGreen : styles.syncDotOrange]} />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <View style={styles.ph} />
      </View>

      {/* Stats Row */}
      {stats && (
        <View style={styles.statsRow}>
          <StatBadge label="Users" value={stats.totalUsers} />
          <StatBadge label="Records" value={stats.totalAttendance} />
          <StatBadge label="Unsynced" value={stats.unsyncedAttendance} warn={stats.unsyncedAttendance > 0} />
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['users', 'attendance', 'sync'] as Tab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'users' ? `👥 Users (${users.length})` :
               tab === 'attendance' ? `📋 Logs (${attendance.length})` :
               '☁️ Sync'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingView}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <>
          {activeTab === 'users' && (
            <FlatList
              data={users}
              keyExtractor={item => item.id}
              renderItem={renderUserItem}
              contentContainerStyle={styles.list}
              ListEmptyComponent={<EmptyState message="No users enrolled yet" />}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />
              }
            />
          )}

          {activeTab === 'attendance' && (
            <FlatList
              data={attendance}
              keyExtractor={item => item.id}
              renderItem={renderAttendanceItem}
              contentContainerStyle={styles.list}
              ListEmptyComponent={<EmptyState message="No attendance records yet" />}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />
              }
            />
          )}

          {activeTab === 'sync' && (
            <View style={styles.syncPanel}>
              <View style={styles.syncStatusCard}>
                <View style={[styles.onlineDot, syncStatus.isOnline ? styles.dotOnline : styles.dotOffline]} />
                <Text style={styles.syncStatusText}>
                  {syncStatus.isOnline ? 'Connected to Internet' : 'Offline — data saved locally'}
                </Text>
              </View>

              {syncStatus.lastSyncAt && (
                <Text style={styles.lastSyncText}>
                  Last sync: {format(syncStatus.lastSyncAt, 'dd MMM yyyy, HH:mm')}
                </Text>
              )}

              <Text style={styles.syncInfo}>
                {stats?.unsyncedUsers ?? 0} user records · {stats?.unsyncedAttendance ?? 0} attendance records pending upload
              </Text>

              <TouchableOpacity
                style={[styles.syncBtn, (!syncStatus.isOnline || isSyncing) && styles.syncBtnDisabled]}
                onPress={handleSync}
                disabled={!syncStatus.isOnline || isSyncing}>
                {isSyncing ? (
                  <ActivityIndicator color={COLORS.text} />
                ) : (
                  <Text style={styles.syncBtnText}>☁️ Sync Now to AWS</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.purgeBtn} onPress={handlePurge}>
                <Text style={styles.purgeBtnText}>🗑️ Purge Synced Records</Text>
              </TouchableOpacity>

              <View style={styles.syncNote}>
                <Text style={styles.syncNoteText}>
                  ℹ️ Face embeddings are never uploaded to the cloud.{'\n'}
                  Only metadata (name, ID, timestamps) is synced.
                </Text>
              </View>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
};

const StatBadge: React.FC<{label: string; value: number; warn?: boolean}> = ({label, value, warn}) => (
  <View style={styles.statBadge}>
    <Text style={[styles.statValue, warn && styles.statValueWarn]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const EmptyState: React.FC<{message: string}> = ({message}) => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyStateText}>{message}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: COLORS.background},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backText: {color: COLORS.primary, fontSize: 16},
  headerTitle: {color: COLORS.text, fontSize: 17, fontWeight: '700'},
  ph: {width: 50},
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statBadge: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: {color: COLORS.text, fontSize: 20, fontWeight: '700'},
  statValueWarn: {color: COLORS.warning},
  statLabel: {color: COLORS.textSecondary, fontSize: 11, marginTop: 2},
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {borderBottomColor: COLORS.accent},
  tabText: {color: COLORS.textSecondary, fontSize: 12, fontWeight: '500'},
  tabTextActive: {color: COLORS.text, fontWeight: '700'},
  loadingView: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  list: {padding: 16, gap: 12, paddingBottom: 80},
  listItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listItemAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSuccess: {backgroundColor: `${COLORS.success}44`},
  avatarFailure: {backgroundColor: `${COLORS.error}44`},
  avatarText: {color: COLORS.text, fontSize: 18, fontWeight: '700'},
  listItemContent: {flex: 1},
  listItemTitle: {color: COLORS.text, fontSize: 15, fontWeight: '600'},
  listItemSubtitle: {color: COLORS.textSecondary, fontSize: 12, marginTop: 1},
  listItemMeta: {color: COLORS.textMuted, fontSize: 11, marginTop: 2},
  listItemActions: {alignItems: 'flex-end', gap: 6},
  syncDot: {width: 8, height: 8, borderRadius: 4},
  syncDotGreen: {backgroundColor: COLORS.success},
  syncDotOrange: {backgroundColor: COLORS.warning},
  deleteBtn: {
    backgroundColor: `${COLORS.error}22`,
    borderRadius: 12,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {color: COLORS.error, fontSize: 12, fontWeight: '700'},
  emptyState: {padding: 40, alignItems: 'center'},
  emptyStateText: {color: COLORS.textMuted, fontSize: 14},
  syncPanel: {padding: 20, gap: 14},
  syncStatusCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  onlineDot: {width: 10, height: 10, borderRadius: 5},
  dotOnline: {backgroundColor: COLORS.success},
  dotOffline: {backgroundColor: COLORS.warning},
  syncStatusText: {color: COLORS.text, fontSize: 14, fontWeight: '500'},
  lastSyncText: {color: COLORS.textSecondary, fontSize: 13},
  syncInfo: {color: COLORS.textMuted, fontSize: 13},
  syncBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  syncBtnDisabled: {opacity: 0.5},
  syncBtnText: {color: COLORS.text, fontSize: 15, fontWeight: '700'},
  purgeBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  purgeBtnText: {color: COLORS.error, fontSize: 14, fontWeight: '600'},
  syncNote: {
    backgroundColor: `${COLORS.primary}22`,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: `${COLORS.primaryLight}44`,
  },
  syncNoteText: {color: COLORS.textSecondary, fontSize: 12, lineHeight: 18},
});
