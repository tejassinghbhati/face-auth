/**
 * downloadModels.js — Downloads the three TFLite models.
 * Run: node scripts/downloadModels.js
 *
 * Models used:
 *  1. BlazeFace (face detection)     ~200 KB
 *  2. FaceNet 512 (face recognition) ~5.1 MB  — MobileFaceNet architecture
 *  3. FaceLandmark (liveness mesh)   ~3.1 MB  — MediaPipe 468-point
 * Total: ~8.4 MB — well under the 20 MB target
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ANDROID_ASSETS = path.join(__dirname, '../android/app/src/main/assets/models');
const IOS_BUNDLE = path.join(__dirname, '../ios/NHAIFaceAuth/models');

const MODELS = [
  {
    name: 'blazeface_short.tflite',
    urls: [
      'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
    ],
    description: 'BlazeFace short-range face detector',
  },
  {
    name: 'mobilefacenet.tflite',
    // FaceNet 512 — open source face recognition model compatible with 112×112 input
    // Source: https://github.com/shubham0204/FaceRecognition_With_FaceNet_Android
    urls: [
      'https://raw.githubusercontent.com/shubham0204/FaceRecognition_With_FaceNet_Android/master/app/src/main/assets/facenet_512.tflite',
      'https://github.com/shubham0204/FaceRecognition_With_FaceNet_Android/raw/master/app/src/main/assets/facenet_512.tflite',
    ],
    description: 'FaceNet 512D face recognition (MobileFaceNet compatible)',
  },
  {
    name: 'face_mesh.tflite',
    urls: [
      // MediaPipe FaceMesh — 468 landmark points
      'https://storage.googleapis.com/mediapipe-assets/face_landmark_with_attention.tflite',
      'https://storage.googleapis.com/mediapipe-assets/face_landmark.tflite',
    ],
    description: 'MediaPipe FaceMesh 468 landmarks (liveness detection)',
  },
];

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    let downloaded = 0;

    proto.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        try { fs.unlinkSync(destPath); } catch {}
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(destPath); } catch {}
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', chunk => {
        downloaded += chunk.length;
        if (total > 0) {
          process.stdout.write(`\r    ${((downloaded / total) * 100).toFixed(0)}% (${(downloaded / 1024).toFixed(0)} KB)`);
        } else {
          process.stdout.write(`\r    ${(downloaded / 1024).toFixed(0)} KB downloaded`);
        }
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); process.stdout.write('\n'); resolve(); });
    }).on('error', err => {
      try { fs.unlinkSync(destPath); } catch {}
      reject(err);
    });
  });
}

async function tryDownload(urls, destPath, name) {
  for (const url of urls) {
    process.stdout.write(`  ⬇️  Trying: ${url.split('/').slice(-1)[0]}...\n`);
    try {
      await downloadFile(url, destPath);
      const size = fs.statSync(destPath).size;
      if (size < 1000) {
        // Suspiciously small — likely a 404 HTML page, not a real model
        fs.unlinkSync(destPath);
        throw new Error(`Downloaded file too small (${size} bytes) — likely not a model`);
      }
      return true;
    } catch (err) {
      console.log(`    ✗ Failed: ${err.message}`);
    }
  }
  return false;
}

async function main() {
  console.log('\n🤖 NHAI Face Auth — Model Downloader');
  console.log('=====================================\n');

  await ensureDir(ANDROID_ASSETS);
  await ensureDir(IOS_BUNDLE);

  let allGood = true;

  for (const model of MODELS) {
    const androidDest = path.join(ANDROID_ASSETS, model.name);
    console.log(`📦 ${model.description}`);
    console.log(`   → ${model.name}`);

    if (fs.existsSync(androidDest)) {
      const size = fs.statSync(androidDest).size;
      if (size > 1000) {
        console.log(`  ✅ Already downloaded (${(size / 1024).toFixed(0)} KB)\n`);
        // Ensure iOS copy exists
        const iosDest = path.join(IOS_BUNDLE, model.name);
        if (!fs.existsSync(iosDest)) fs.copyFileSync(androidDest, iosDest);
        continue;
      }
      fs.unlinkSync(androidDest); // remove invalid file
    }

    const ok = await tryDownload(model.urls, androidDest, model.name);
    if (ok) {
      const size = fs.statSync(androidDest).size;
      console.log(`  ✅ Downloaded: ${(size / 1024).toFixed(0)} KB`);
      // Copy to iOS
      const iosDest = path.join(IOS_BUNDLE, model.name);
      fs.copyFileSync(androidDest, iosDest);
      console.log(`  ✅ Copied to iOS bundle`);
    } else {
      console.log(`  ❌ All URLs failed for ${model.name}`);
      allGood = false;
    }
    console.log('');
  }

  // Total size
  let total = 0;
  for (const m of MODELS) {
    const p = path.join(ANDROID_ASSETS, m.name);
    if (fs.existsSync(p)) total += fs.statSync(p).size;
  }

  console.log('=====================================');
  console.log(`📊 Total model size: ${(total / 1024 / 1024).toFixed(2)} MB (target: < 20 MB)`);

  if (!allGood) {
    console.log('\n⚠️  Some downloads failed. Manual download instructions:');
    console.log('\n  MobileFaceNet (face recognition):');
    console.log('  → https://github.com/shubham0204/FaceRecognition_With_FaceNet_Android/');
    console.log('  → Download: app/src/main/assets/facenet_512.tflite');
    console.log(`  → Rename to: mobilefacenet.tflite`);
    console.log(`  → Place in:  android/app/src/main/assets/models/`);
    console.log('\n  FaceMesh (liveness):');
    console.log('  → https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker');
    console.log('  → Download the TFLite model and rename to face_mesh.tflite');
    process.exit(1);
  }

  console.log('\n✅ All models ready! Now install the Android SDK and build:\n');
  console.log('  1. Install Android Studio: https://developer.android.com/studio');
  console.log('  2. npm run setup:sdk');
  console.log('  3. cd android && .\\gradlew assembleDebug');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
