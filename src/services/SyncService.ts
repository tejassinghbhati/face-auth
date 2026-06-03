/**
 * SyncService — AWS synchronisation when connectivity is restored.
 *
 * Strategy:
 *  1. NetInfo detects network availability
 *  2. Upload un-synced user embeddings to DynamoDB (encrypted)
 *  3. Upload attendance records to DynamoDB
 *  4. Upload captured photos to S3
 *  5. Mark synced records in SQLite
 *  6. Optionally purge synced data from local SQLite
 *
 * AWS credentials are stored in EncryptedStorage (AES-256 on Android,
 * Keychain on iOS). The app can work entirely without credentials
 * in fully offline mode.
 */

import NetInfo from '@react-native-community/netinfo';
import EncryptedStorage from 'react-native-encrypted-storage';
import {DynamoDBClient, PutItemCommand, BatchWriteItemCommand} from '@aws-sdk/client-dynamodb';
import {S3Client, PutObjectCommand} from '@aws-sdk/client-s3';
import RNFS from 'react-native-fs';

import {DEFAULT_CONFIG, STORAGE_KEYS} from '../utils/constants';
import {logger} from '../utils/logger';
import {
  getUnsyncedUsers,
  getUnsyncedAttendance,
  markUserSynced,
  markAttendanceSynced,
  logSync,
} from './DatabaseService';
import type {SyncStatus, User, AttendanceRecord} from '../types';

const TAG = 'SyncService';

// ─── State ────────────────────────────────────────────────────────────────────

let _syncStatus: SyncStatus = {
  lastSyncAt: null,
  pendingUsers: 0,
  pendingAttendance: 0,
  isOnline: false,
  isSyncing: false,
};

let _statusListeners: Array<(status: SyncStatus) => void> = [];

export function subscribeSyncStatus(cb: (status: SyncStatus) => void): () => void {
  _statusListeners.push(cb);
  cb(_syncStatus); // emit current status immediately
  return () => {
    _statusListeners = _statusListeners.filter(l => l !== cb);
  };
}

function updateStatus(partial: Partial<SyncStatus>): void {
  _syncStatus = {..._syncStatus, ...partial};
  _statusListeners.forEach(l => l(_syncStatus));
}

// ─── Network Monitoring ───────────────────────────────────────────────────────

export function startNetworkMonitoring(autoSync: boolean = true): () => void {
  const unsubscribe = NetInfo.addEventListener(state => {
    const isOnline = state.isConnected === true && state.isInternetReachable === true;
    const wasOffline = !_syncStatus.isOnline;

    updateStatus({isOnline});
    logger.info(TAG, `Network status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);

    // Auto-trigger sync when coming online
    if (isOnline && wasOffline && autoSync) {
      logger.info(TAG, 'Network restored — triggering auto-sync');
      syncAll().catch(err => logger.error(TAG, 'Auto-sync failed', err));
    }
  });

  return unsubscribe;
}

// ─── AWS Client Factories ─────────────────────────────────────────────────────

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

async function loadCredentials(): Promise<AwsCredentials | null> {
  try {
    const stored = await EncryptedStorage.getItem(STORAGE_KEYS.AWS_CREDENTIALS);
    if (!stored) return null;
    return JSON.parse(stored) as AwsCredentials;
  } catch {
    return null;
  }
}

export async function saveCredentials(creds: AwsCredentials): Promise<void> {
  await EncryptedStorage.setItem(STORAGE_KEYS.AWS_CREDENTIALS, JSON.stringify(creds));
  logger.info(TAG, 'AWS credentials saved securely');
}

export async function clearCredentials(): Promise<void> {
  await EncryptedStorage.removeItem(STORAGE_KEYS.AWS_CREDENTIALS);
}

function createDynamoClient(creds: AwsCredentials): DynamoDBClient {
  return new DynamoDBClient({
    region: DEFAULT_CONFIG.awsRegion,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
  });
}

function createS3Client(creds: AwsCredentials): S3Client {
  return new S3Client({
    region: DEFAULT_CONFIG.awsRegion,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
  });
}

// ─── Sync Operations ──────────────────────────────────────────────────────────

async function syncUsers(
  dynamo: DynamoDBClient,
  users: User[],
): Promise<{synced: string[]; failed: string[]}> {
  const synced: string[] = [];
  const failed: string[] = [];

  // DynamoDB BatchWriteItem processes up to 25 items at a time
  const chunks = chunkArray(users, 25);

  for (const chunk of chunks) {
    try {
      const requestItems = {
        [DEFAULT_CONFIG.dynamoTableName + '_users']: chunk.map(user => ({
          PutRequest: {
            Item: {
              PK: {S: `USER#${user.id}`},
              SK: {S: 'PROFILE'},
              name: {S: user.name},
              employeeId: {S: user.employeeId},
              department: {S: user.department},
              designation: {S: user.designation},
              // Note: we do NOT upload raw embeddings — only metadata
              // Embeddings remain on-device for privacy
              enrolledAt: {N: String(user.enrolledAt)},
              syncedAt: {N: String(Date.now())},
            },
          },
        })),
      };

      await dynamo.send(new BatchWriteItemCommand({RequestItems: requestItems}));
      chunk.forEach(u => synced.push(u.id));
    } catch (err) {
      logger.error(TAG, 'Failed to sync user batch', err);
      chunk.forEach(u => failed.push(u.id));
    }
  }

  return {synced, failed};
}

async function syncAttendance(
  dynamo: DynamoDBClient,
  records: AttendanceRecord[],
): Promise<{synced: string[]; failed: string[]}> {
  const synced: string[] = [];
  const failed: string[] = [];

  const chunks = chunkArray(records, 25);

  for (const chunk of chunks) {
    try {
      const requestItems = {
        [DEFAULT_CONFIG.dynamoTableName]: chunk.map(record => ({
          PutRequest: {
            Item: {
              PK: {S: `ATTENDANCE#${record.id}`},
              SK: {S: `USER#${record.userId}`},
              userId: {S: record.userId},
              userName: {S: record.userName},
              timestamp: {N: String(record.timestamp)},
              livenessScore: {N: String(record.livenessScore)},
              confidence: {N: String(record.recognitionConfidence)},
              livenessChallengePassed: {BOOL: record.livenessChallengePassed},
              challengeTypes: {S: JSON.stringify(record.challengeType)},
              ...(record.location
                ? {
                    latitude: {N: String(record.location.latitude)},
                    longitude: {N: String(record.location.longitude)},
                  }
                : {}),
            },
          },
        })),
      };

      await dynamo.send(new BatchWriteItemCommand({RequestItems: requestItems}));
      chunk.forEach(r => synced.push(r.id));
    } catch (err) {
      logger.error(TAG, 'Failed to sync attendance batch', err);
      chunk.forEach(r => failed.push(r.id));
    }
  }

  return {synced, failed};
}

async function syncPhotosToS3(
  s3: S3Client,
  records: AttendanceRecord[],
): Promise<void> {
  const recordsWithPhotos = records.filter(r => r.capturedPhotoPath);

  for (const record of recordsWithPhotos) {
    try {
      const photoPath = record.capturedPhotoPath!;
      const exists = await RNFS.exists(photoPath);
      if (!exists) continue;

      const base64 = await RNFS.readFile(photoPath, 'base64');
      const buffer = Buffer.from(base64, 'base64');
      const key = `attendance-photos/${record.userId}/${record.id}.jpg`;

      await s3.send(
        new PutObjectCommand({
          Bucket: DEFAULT_CONFIG.s3BucketName,
          Key: key,
          Body: buffer,
          ContentType: 'image/jpeg',
        }),
      );
    } catch (err) {
      logger.warn(TAG, `Failed to upload photo for record ${record.id}`, err);
    }
  }
}

// ─── Main Sync Orchestrator ────────────────────────────────────────────────────

export async function syncAll(options: {purgeAfterSync?: boolean} = {}): Promise<SyncStatus> {
  if (_syncStatus.isSyncing) {
    logger.warn(TAG, 'Sync already in progress');
    return _syncStatus;
  }

  if (!_syncStatus.isOnline) {
    logger.warn(TAG, 'Cannot sync: offline');
    return _syncStatus;
  }

  const creds = await loadCredentials();
  if (!creds) {
    logger.warn(TAG, 'Cannot sync: no AWS credentials configured');
    updateStatus({pendingUsers: 0, pendingAttendance: 0});
    return _syncStatus;
  }

  updateStatus({isSyncing: true});
  logger.info(TAG, 'Starting sync to AWS');

  const dynamo = createDynamoClient(creds);
  const s3 = createS3Client(creds);

  let usersSynced = 0;
  let attendanceSynced = 0;
  let syncStatus: 'success' | 'partial' | 'failed' = 'success';
  let errorMessage: string | undefined;

  try {
    // 1. Sync users
    const pendingUsers = await getUnsyncedUsers();
    if (pendingUsers.length > 0) {
      const {synced, failed} = await syncUsers(dynamo, pendingUsers);
      for (const id of synced) await markUserSynced(id);
      usersSynced = synced.length;
      if (failed.length > 0) syncStatus = 'partial';
      logger.info(TAG, `Users synced: ${synced.length}/${pendingUsers.length}`);
    }

    // 2. Sync attendance
    const pendingAttendance = await getUnsyncedAttendance();
    if (pendingAttendance.length > 0) {
      const {synced, failed} = await syncAttendance(dynamo, pendingAttendance);
      await markAttendanceSynced(synced);
      attendanceSynced = synced.length;
      if (failed.length > 0) syncStatus = 'partial';
      logger.info(TAG, `Attendance synced: ${synced.length}/${pendingAttendance.length}`);

      // 3. Sync photos to S3
      await syncPhotosToS3(s3, pendingAttendance.filter(r => synced.includes(r.id)));
    }

    // 4. Optionally purge synced data
    if (options.purgeAfterSync) {
      const {purgeSyncedData} = await import('./DatabaseService');
      await purgeSyncedData();
      logger.info(TAG, 'Synced data purged from local storage');
    }
  } catch (err) {
    logger.error(TAG, 'Sync failed', err);
    syncStatus = 'failed';
    errorMessage = String(err);
  } finally {
    await logSync(usersSynced, attendanceSynced, syncStatus, errorMessage);

    updateStatus({
      isSyncing: false,
      lastSyncAt: Date.now(),
      pendingUsers: 0,
      pendingAttendance: 0,
    });
  }

  return _syncStatus;
}

export function getSyncStatus(): SyncStatus {
  return _syncStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
