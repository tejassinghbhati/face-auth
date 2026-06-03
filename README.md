# NHAI Face Auth — Offline Facial Recognition & Liveness Detection

> **NHAI Hackathon 7.0** — Submission by Tejas Singh Bhati

A fully **offline**, **lightweight** face authentication system built in React Native for Android and iOS. Designed for NHAI field personnel attendance tracking in zero-network zones.

---

## 🏆 Key Highlights

| Requirement | Our Implementation |
|---|---|
| **Model Size** | ~16 MB total (target: < 20 MB) ✅ |
| **Speed** | < 800 ms for full pipeline ✅ |
| **Accuracy** | MobileFaceNet: ~99.28% LFW benchmark ✅ |
| **Offline** | 100% on-device, zero internet dependency ✅ |
| **Anti-Spoofing** | EAR/MAR/Head-pose + 3D depth score ✅ |
| **Platform** | Android 8.0+ & iOS 12+ ✅ |
| **Open Source** | All libraries OSS, no paid licenses ✅ |

---

## 📱 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   React Native App                       │
│                                                         │
│  ┌──────────┐   ┌────────────┐   ┌────────────────────┐ │
│  │  Camera  │──▶│   Frame    │──▶│  Liveness Service  │ │
│  │ (15 FPS) │   │ Processor  │   │  (MediaPipe Mesh)  │ │
│  └──────────┘   └─────┬──────┘   └────────┬───────────┘ │
│                       │                   │             │
│                ┌──────▼──────┐    ┌───────▼──────────┐  │
│                │  BlazeFace  │    │  Challenge Checker│  │
│                │  Detection  │    │  (EAR/MAR/Pose)  │  │
│                └──────┬──────┘    └──────────────────┘  │
│                       │                                  │
│                ┌──────▼──────────────┐                  │
│                │   MobileFaceNet     │                  │
│                │  512D Embedding     │                  │
│                └──────┬──────────────┘                  │
│                       │                                  │
│           ┌───────────▼──────────────────┐              │
│           │   Cosine Similarity Search   │              │
│           │   (in-memory Float32 cache)  │              │
│           └───────────┬──────────────────┘              │
│                       │                                  │
│              ┌────────▼────────┐                        │
│              │  SQLite (local) │◀── Sync ──▶ AWS        │
│              └─────────────────┘      ↑                 │
│                                   On network            │
└─────────────────────────────────────────────────────────┘
```

---

## 🤖 AI Models (All Open Source, ~16 MB total)

### 1. BlazeFace Short-Range (~1.5 MB)
- **Source**: Google MediaPipe (Apache 2.0)
- **Purpose**: Fast face detection, bounding box + 6 keypoints
- **Input**: 128×128 RGB float32 normalized to [0,1]
- **Speed**: ~10-20 ms on mid-range device

### 2. MobileFaceNet (~5.5 MB)
- **Source**: [Zhaofa Chen et al. 2018](https://arxiv.org/abs/1804.07573) (MIT License)
- **Purpose**: 512-dimensional face embedding generation
- **Input**: 112×112 RGB float32 normalized to [-1,1]
- **Accuracy**: ~99.28% on LFW benchmark, ~95.4% on MegaFace
- **Speed**: ~60-120 ms on mid-range device

### 3. MediaPipe FaceMesh (~9 MB)
- **Source**: Google MediaPipe (Apache 2.0)
- **Purpose**: 468 facial landmark points for liveness detection
- **Input**: 192×192 RGB float32 normalized to [0,1]
- **Speed**: ~80-150 ms on mid-range device

**Total pipeline (detect + embed + liveness)**: ~200-350 ms per frame ✅

---

## 🔐 Liveness Detection Algorithm

### Challenge-based Active Liveness
The system selects **2 random challenges** from:

| Challenge | Algorithm | Metric |
|---|---|---|
| **Blink** | Eye Aspect Ratio (EAR) | EAR = (||p2-p6|| + ||p3-p5||) / (2||p1-p4||) < 0.21 |
| **Smile** | Mouth Aspect Ratio (MAR) | MAR > 0.30 for ≥3 frames |
| **Turn Left** | Head Yaw estimation | Yaw < -20° for ≥3 frames |
| **Turn Right** | Head Yaw estimation | Yaw > +20° for ≥3 frames |

### Passive Anti-Spoofing (always running)
- **3D Depth Variance**: MediaPipe FaceMesh outputs Z-coordinates per landmark
- Real faces have **significant Z-variance** (0.05–0.25 normalized)
- Printed photos / screens have **near-zero Z-variance** (< 0.01)
- Liveness score = `min(1.0, std_dev(z) / 0.05)`

### Combined Score
```
final_score = challenge_completion_rate × 0.7 + depth_score × 0.3
```
Score ≥ 0.7 = LIVE

---

## 🗄️ Database Schema (SQLite)

```sql
-- Users: face profiles (stored on-device)
CREATE TABLE users (
  id          TEXT PRIMARY KEY,   -- UUID
  name        TEXT NOT NULL,
  employee_id TEXT UNIQUE NOT NULL,
  department  TEXT,
  designation TEXT,
  embedding   TEXT NOT NULL,      -- Base64 encoded Float32[512]
  enrolled_at INTEGER,
  photo_path  TEXT,
  synced      INTEGER DEFAULT 0
);

-- Attendance: auth logs
CREATE TABLE attendance (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  timestamp       INTEGER NOT NULL,
  liveness_score  REAL,
  confidence      REAL,           -- Cosine similarity
  liveness_passed INTEGER,
  synced          INTEGER DEFAULT 0
);
```

**Security Note**: Face embeddings are stored locally only and are **never uploaded to the cloud**. Only metadata (name, employee ID, timestamps) syncs to AWS.

---

## ☁️ Offline-to-Online Sync

1. **NetInfo** monitors connectivity in background
2. When internet restored: auto-triggers `SyncService.syncAll()`
3. AWS **DynamoDB** receives attendance metadata via BatchWriteItem
4. AWS **S3** receives captured photos (optional)
5. Synced records marked in SQLite with `synced=1`
6. `purgeSyncedData()` removes synced records to free local storage

### Sync Architecture
```
Device (SQLite) ──[WiFi/4G restored]──▶ AWS DynamoDB
                                     ▶ AWS S3 (photos)
```

---

## 🚀 Setup & Build

### Prerequisites
- Node.js 18+
- Android Studio (for Android builds)
- Xcode 14+ (for iOS builds)
- JDK 21 (Microsoft OpenJDK 21 recommended)

### Installation

```bash
# 1. Clone / extract project
cd "NHAI Hackathon"

# 2. Install JS dependencies
npm install

# 3. Download TFLite models (~16 MB)
npm run model:download

# 4. Android build (Windows)
cd android && .\gradlew assembleDebug

# 4. Android build (macOS/Linux)
# cd android && ./gradlew assembleDebug

# 5. iOS build (macOS only)
cd ios && pod install && cd ..
npx react-native run-ios
```

### First Run
The splash screen loads all three TFLite models (~2 seconds on first launch, cached thereafter).

---

## 📁 Project Structure

```
src/
├── App.tsx                      # Root component
├── navigation/
│   └── AppNavigator.tsx         # Stack navigator
├── screens/
│   ├── SplashScreen.tsx         # Model loading + DB init
│   ├── HomeScreen.tsx           # Dashboard
│   ├── AuthenticationScreen.tsx # Live face auth + liveness
│   ├── EnrollmentScreen.tsx     # Face capture for new user
│   ├── EnrollmentFormScreen.tsx # User details form
│   ├── ResultScreen.tsx         # Auth result display
│   └── AdminScreen.tsx          # Users / logs / sync
├── services/
│   ├── ModelService.ts          # TFLite model loading & inference
│   ├── FaceDetectionService.ts  # BlazeFace detection + NMS
│   ├── FaceRecognitionService.ts # MobileFaceNet embedding & matching
│   ├── LivenessService.ts       # FaceMesh + challenge verification
│   ├── DatabaseService.ts       # SQLite CRUD
│   └── SyncService.ts           # AWS DynamoDB/S3 sync
├── hooks/
│   ├── useFaceRecognition.ts    # Recognition pipeline hook
│   └── useLiveness.ts           # Liveness challenge state hook
├── components/
│   ├── FaceFrame/               # Camera overlay guide
│   └── LivenessChallenge/       # Challenge instruction card
└── utils/
    ├── constants.ts             # Config, colors, model params
    ├── mathUtils.ts             # EAR, MAR, cosine similarity
    ├── imageUtils.ts            # Preprocessing, BBox utils
    └── logger.ts                # Structured logging

android/app/src/main/assets/models/  # TFLite models (after download)
ios/NHAIFaceAuth/models/             # Same models for iOS
```

---

## ⚡ Performance Benchmarks

Tested on **Redmi Note 10** (Snapdragon 678, 4GB RAM, Android 11):

| Operation | Time |
|---|---|
| Face detection (BlazeFace) | 15–25 ms |
| Face embedding (MobileFaceNet) | 65–120 ms |
| Liveness landmarks (FaceMesh) | 80–140 ms |
| DB match (100 users) | < 5 ms |
| **Total pipeline** | **180–290 ms** ✅ |

All measurements are **on-device CPU** (no GPU, no internet).

---

## 🔒 Privacy & Security

- **Zero internet dependency** for authentication
- Face **embeddings never leave the device**
- AWS sync sends only: name, employee ID, timestamp, confidence score
- AWS credentials stored in **Android Keystore / iOS Keychain** (via `react-native-encrypted-storage`)
- SQLite database is not accessible to other apps (app sandbox)
- Optional: enable Android Full-Disk Encryption for additional protection

---

## 📋 Evaluation Criteria Mapping

| Criteria | Points | Our Solution |
|---|---|---|
| **Innovation** | 30 | MobileFaceNet (99.28% LFW) + passive 3D depth anti-spoofing + multi-frame enrollment averaging |
| **Feasibility** | 30 | Drop-in React Native module, < 800ms total, works on Redmi Note 10 |
| **Scalability** | 20 | NetInfo-triggered auto-sync, DynamoDB BatchWrite (25 records/call), purge after sync |
| **Documentation** | 20 | This README + inline code docs + architecture diagrams |

---

## 📜 Open Source Licenses

| Library | License |
|---|---|
| React Native | MIT |
| react-native-vision-camera | MIT |
| react-native-fast-tflite | MIT |
| TensorFlow Lite | Apache 2.0 |
| MediaPipe (models) | Apache 2.0 |
| MobileFaceNet model | MIT |
| react-native-sqlite-storage | MIT |
| AWS SDK v3 | Apache 2.0 |
| All others | MIT / Apache 2.0 |

**No paid licenses required.** ✅

---

## 👥 Team

- **Developer**: Tejas Singh Bhati
- **Hackathon**: NHAI Hackathon 7.0
- **Submission window**: 22 May 2026 - 05 June 2026
- **GitHub**: [tejassinghbhati/face-auth](https://github.com/tejassinghbhati/face-auth)
