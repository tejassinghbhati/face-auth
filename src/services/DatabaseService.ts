/**
 * DatabaseService — SQLite persistence layer.
 *
 * All data is stored locally on-device with zero network dependency.
 * Tables:
 *   users       — enrolled face profiles
 *   attendance  — authentication logs
 *   sync_log    — record of AWS sync operations
 */

import SQLite, {SQLiteDatabase, ResultSet} from 'react-native-sqlite-storage';
import {DB_NAME} from '../utils/constants';
import {logger} from '../utils/logger';
import type {User, AttendanceRecord, DatabaseStats, GeoLocation} from '../types';
import {v4 as uuidv4} from 'uuid';

const TAG = 'DatabaseService';

SQLite.enablePromise(true);
SQLite.DEBUG(false);

let _db: SQLiteDatabase | null = null;

// ─── Schema ───────────────────────────────────────────────────────────────────

const CREATE_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    employee_id TEXT UNIQUE NOT NULL,
    department  TEXT NOT NULL DEFAULT '',
    designation TEXT NOT NULL DEFAULT '',
    embedding   TEXT NOT NULL,
    enrolled_at INTEGER NOT NULL,
    photo_path  TEXT,
    synced      INTEGER NOT NULL DEFAULT 0
  );
`;

const CREATE_ATTENDANCE_TABLE = `
  CREATE TABLE IF NOT EXISTS attendance (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    user_name         TEXT NOT NULL,
    timestamp         INTEGER NOT NULL,
    latitude          REAL,
    longitude         REAL,
    location_accuracy REAL,
    liveness_score    REAL NOT NULL DEFAULT 0,
    confidence        REAL NOT NULL DEFAULT 0,
    photo_path        TEXT,
    liveness_passed   INTEGER NOT NULL DEFAULT 0,
    challenge_types   TEXT NOT NULL DEFAULT '',
    synced            INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`;

const CREATE_SYNC_LOG_TABLE = `
  CREATE TABLE IF NOT EXISTS sync_log (
    id               TEXT PRIMARY KEY,
    synced_at        INTEGER NOT NULL,
    users_synced     INTEGER NOT NULL DEFAULT 0,
    attendance_synced INTEGER NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'success',
    error_message    TEXT
  );
`;

// ─── Initialization ───────────────────────────────────────────────────────────

export async function initDatabase(): Promise<void> {
  if (_db) return; // Already initialized

  logger.info(TAG, `Opening database: ${DB_NAME}`);

  _db = await SQLite.openDatabase({
    name: DB_NAME,
    location: 'default',
  });

  // Create tables
  await _db.executeSql(CREATE_USERS_TABLE);
  await _db.executeSql(CREATE_ATTENDANCE_TABLE);
  await _db.executeSql(CREATE_SYNC_LOG_TABLE);

  // Create indexes for performance
  await _db.executeSql('CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance(timestamp DESC);');
  await _db.executeSql('CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id);');
  await _db.executeSql('CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);');

  logger.info(TAG, 'Database initialized successfully');
}

function getDb(): SQLiteDatabase {
  if (!_db) throw new Error('Database not initialized. Call initDatabase() first.');
  return _db;
}

// ─── Helper: parse ResultSet rows ─────────────────────────────────────────────

function parseRows<T>(result: ResultSet): T[] {
  const rows: T[] = [];
  for (let i = 0; i < result.rows.length; i++) {
    rows.push(result.rows.item(i) as T);
  }
  return rows;
}

// ─── User CRUD ────────────────────────────────────────────────────────────────

export async function insertUser(
  data: Omit<User, 'id' | 'synced'>,
): Promise<User> {
  const db = getDb();
  const id = uuidv4();
  const now = Date.now();

  await db.executeSql(
    `INSERT INTO users (id, name, employee_id, department, designation, embedding, enrolled_at, photo_path, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, data.name, data.employeeId, data.department, data.designation, data.embedding, data.enrolledAt ?? now, data.enrollmentPhoto ?? null],
  );

  logger.info(TAG, `User enrolled: ${data.name} (${data.employeeId})`);

  return {
    ...data,
    id,
    enrolledAt: data.enrolledAt ?? now,
    synced: false,
  };
}

export async function getUserById(id: string): Promise<User | null> {
  const db = getDb();
  const [result] = await db.executeSql('SELECT * FROM users WHERE id = ?', [id]);
  const rows = parseRows<any>(result);
  if (rows.length === 0) return null;
  return dbRowToUser(rows[0]);
}

export async function getUserByEmployeeId(employeeId: string): Promise<User | null> {
  const db = getDb();
  const [result] = await db.executeSql('SELECT * FROM users WHERE employee_id = ?', [employeeId]);
  const rows = parseRows<any>(result);
  if (rows.length === 0) return null;
  return dbRowToUser(rows[0]);
}

export async function getAllUsers(): Promise<User[]> {
  const db = getDb();
  const [result] = await db.executeSql('SELECT * FROM users ORDER BY enrolled_at DESC');
  return parseRows<any>(result).map(dbRowToUser);
}

export async function getUnsyncedUsers(): Promise<User[]> {
  const db = getDb();
  const [result] = await db.executeSql('SELECT * FROM users WHERE synced = 0');
  return parseRows<any>(result).map(dbRowToUser);
}

export async function markUserSynced(id: string): Promise<void> {
  const db = getDb();
  await db.executeSql('UPDATE users SET synced = 1 WHERE id = ?', [id]);
}

export async function deleteUser(id: string): Promise<void> {
  const db = getDb();
  await db.executeSql('DELETE FROM users WHERE id = ?', [id]);
  await db.executeSql('DELETE FROM attendance WHERE user_id = ?', [id]);
  logger.info(TAG, `User deleted: ${id}`);
}

function dbRowToUser(row: any): User {
  return {
    id: row.id,
    name: row.name,
    employeeId: row.employee_id,
    department: row.department,
    designation: row.designation,
    embedding: row.embedding,
    enrolledAt: row.enrolled_at,
    enrollmentPhoto: row.photo_path ?? undefined,
    synced: row.synced === 1,
  };
}

// ─── Attendance CRUD ──────────────────────────────────────────────────────────

export async function insertAttendance(
  data: Omit<AttendanceRecord, 'id' | 'synced'>,
): Promise<AttendanceRecord> {
  const db = getDb();
  const id = uuidv4();

  await db.executeSql(
    `INSERT INTO attendance
      (id, user_id, user_name, timestamp, latitude, longitude, location_accuracy,
       liveness_score, confidence, photo_path, liveness_passed, challenge_types, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      data.userId,
      data.userName,
      data.timestamp,
      data.location?.latitude ?? null,
      data.location?.longitude ?? null,
      data.location?.accuracy ?? null,
      data.livenessScore,
      data.recognitionConfidence,
      data.capturedPhotoPath ?? null,
      data.livenessChallengePassed ? 1 : 0,
      JSON.stringify(data.challengeType),
    ],
  );

  logger.info(TAG, `Attendance recorded: ${data.userName} at ${new Date(data.timestamp).toISOString()}`);

  return {...data, id, synced: false};
}

export async function getAttendanceRecords(
  limit: number = 100,
  userId?: string,
): Promise<AttendanceRecord[]> {
  const db = getDb();
  let query = 'SELECT * FROM attendance';
  const params: any[] = [];

  if (userId) {
    query += ' WHERE user_id = ?';
    params.push(userId);
  }

  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  const [result] = await db.executeSql(query, params);
  return parseRows<any>(result).map(dbRowToAttendance);
}

export async function getUnsyncedAttendance(): Promise<AttendanceRecord[]> {
  const db = getDb();
  const [result] = await db.executeSql('SELECT * FROM attendance WHERE synced = 0');
  return parseRows<any>(result).map(dbRowToAttendance);
}

export async function markAttendanceSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.executeSql(`UPDATE attendance SET synced = 1 WHERE id IN (${placeholders})`, ids);
}

export async function purgeAllData(): Promise<void> {
  const db = getDb();
  await db.executeSql('DELETE FROM attendance');
  await db.executeSql('DELETE FROM users');
  await db.executeSql('DELETE FROM sync_log');
  logger.info(TAG, 'All data purged from database');
}

export async function purgeSyncedData(): Promise<void> {
  const db = getDb();
  await db.executeSql('DELETE FROM attendance WHERE synced = 1');
  logger.info(TAG, 'Synced attendance records purged');
}

function dbRowToAttendance(row: any): AttendanceRecord {
  const location: GeoLocation | undefined =
    row.latitude != null
      ? {latitude: row.latitude, longitude: row.longitude, accuracy: row.location_accuracy}
      : undefined;

  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    timestamp: row.timestamp,
    location,
    livenessScore: row.liveness_score,
    recognitionConfidence: row.confidence,
    capturedPhotoPath: row.photo_path ?? undefined,
    livenessChallengePassed: row.liveness_passed === 1,
    challengeType: JSON.parse(row.challenge_types || '[]'),
    synced: row.synced === 1,
  };
}

// ─── Sync Log ─────────────────────────────────────────────────────────────────

export async function logSync(
  usersSynced: number,
  attendanceSynced: number,
  status: 'success' | 'partial' | 'failed',
  errorMessage?: string,
): Promise<void> {
  const db = getDb();
  await db.executeSql(
    `INSERT INTO sync_log (id, synced_at, users_synced, attendance_synced, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), Date.now(), usersSynced, attendanceSynced, status, errorMessage ?? null],
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getDatabaseStats(): Promise<DatabaseStats> {
  const db = getDb();

  const [[usersResult]] = await db.executeSql('SELECT COUNT(*) as count FROM users');
  const [[attendanceResult]] = await db.executeSql('SELECT COUNT(*) as count FROM attendance');
  const [[unsyncedUsersResult]] = await db.executeSql('SELECT COUNT(*) as count FROM users WHERE synced = 0');
  const [[unsyncedAttResult]] = await db.executeSql('SELECT COUNT(*) as count FROM attendance WHERE synced = 0');

  return {
    totalUsers: usersResult.rows.item(0).count,
    totalAttendance: attendanceResult.rows.item(0).count,
    unsyncedUsers: unsyncedUsersResult.rows.item(0).count,
    unsyncedAttendance: unsyncedAttResult.rows.item(0).count,
    dbSizeKB: 0, // Would need RNFS.stat(dbPath) for actual size
  };
}

export async function closeDatabase(): Promise<void> {
  if (_db) {
    await _db.close();
    _db = null;
    logger.info(TAG, 'Database closed');
  }
}
