/**
 * ModelService — Loads and manages TFLite models.
 *
 * Models are bundled inside the app as Android assets / iOS bundle resources.
 * On first run they are copied to the app's document directory so
 * react-native-fast-tflite can load them from an absolute file path.
 */
import {Platform} from 'react-native';
import RNFS from 'react-native-fs';
import {loadTensorflowModel, TensorflowModel} from 'react-native-fast-tflite';
import {MODEL_FILES, MODEL_CONFIG} from '../utils/constants';
import {getModelsDir, ensureDir} from '../utils/imageUtils';
import {logger} from '../utils/logger';

const TAG = 'ModelService';

/** Map of model key → loaded model instance */
const _models: Partial<Record<keyof typeof MODEL_FILES, TensorflowModel>> = {};

/**
 * Copy a model from the app bundle / assets to the document directory.
 * On Android, models live in `android/app/src/main/assets/models/`.
 * On iOS, models are added to the Xcode target.
 */
async function copyModelToDocDir(fileName: string): Promise<string> {
  const destDir = getModelsDir();
  await ensureDir(destDir);
  const destPath = `${destDir}/${fileName}`;

  const alreadyExists = await RNFS.exists(destPath);
  if (alreadyExists) {
    logger.debug(TAG, `Model already exists at: ${destPath}`);
    return destPath;
  }

  if (Platform.OS === 'android') {
    // Copy from Android assets folder
    await RNFS.copyFileAssets(`models/${fileName}`, destPath);
  } else {
    // On iOS the model is in the main bundle
    const srcPath = `${RNFS.MainBundlePath}/models/${fileName}`;
    await RNFS.copyFile(srcPath, destPath);
  }

  logger.info(TAG, `Copied model to: ${destPath}`);
  return destPath;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load all three models. Should be called once at app startup.
 * Returns a progress callback so the splash screen can show loading status.
 */
export async function loadAllModels(
  onProgress?: (label: string, index: number, total: number) => void,
): Promise<void> {
  const entries = Object.entries(MODEL_FILES) as Array<[keyof typeof MODEL_FILES, string]>;
  const total = entries.length;

  for (let i = 0; i < entries.length; i++) {
    const [key, fileName] = entries[i];
    onProgress?.(`Loading ${fileName}…`, i + 1, total);
    logger.info(TAG, `Loading model ${key}: ${fileName}`);

    try {
      const filePath = await copyModelToDocDir(fileName);

      // For Android we can also use the asset path directly without copying
      const model = await loadTensorflowModel(
        Platform.OS === 'android'
          ? {url: `file://${filePath}`}
          : {url: `file://${filePath}`},
      );

      _models[key] = model;
      logger.info(TAG, `✓ Model ${key} loaded`);
    } catch (err) {
      logger.error(TAG, `Failed to load model ${key}`, err);
      throw new Error(`Could not load model ${key} (${fileName}): ${String(err)}`);
    }
  }
}

/** Get a loaded model by key. Throws if not yet loaded. */
export function getModel(key: keyof typeof MODEL_FILES): TensorflowModel {
  const model = _models[key];
  if (!model) {
    throw new Error(`Model '${key}' is not loaded. Call loadAllModels() first.`);
  }
  return model;
}

/** Check if all models are loaded */
export function areModelsLoaded(): boolean {
  return Object.keys(MODEL_FILES).every(k => !!_models[k as keyof typeof MODEL_FILES]);
}

/**
 * Run inference on the Face Detection model (BlazeFace).
 * Input: Float32Array [1, 128, 128, 3] normalized to [0, 1]
 * Output: [boxes: [1, 896, 16], scores: [1, 896, 1]]
 */
export async function runFaceDetection(
  inputTensor: Float32Array,
): Promise<{boxes: Float32Array; scores: Float32Array}> {
  const model = getModel('FACE_DETECTION');
  const outputs = await model.run([inputTensor]);
  return {
    boxes: outputs[0] as Float32Array,
    scores: outputs[1] as Float32Array,
  };
}

/**
 * Run inference on the Face Recognition model (MobileFaceNet).
 * Input: Float32Array [1, 112, 112, 3] normalized to [-1, 1]
 * Output: [embedding: [1, 512]] L2-normalized
 */
export async function runFaceRecognition(
  inputTensor: Float32Array,
): Promise<Float32Array> {
  const model = getModel('FACE_RECOGNITION');
  const outputs = await model.run([inputTensor]);
  return outputs[0] as Float32Array;
}

/**
 * Run inference on the Face Mesh model (MediaPipe).
 * Input: Float32Array [1, 192, 192, 3] normalized to [0, 1]
 * Output: [landmarks: [1, 1404], confidence: [1, 1]] — 468 * 3 xyz coords
 */
export async function runFaceMesh(
  inputTensor: Float32Array,
): Promise<{landmarks: Float32Array; confidence: Float32Array}> {
  const model = getModel('FACE_MESH');
  const outputs = await model.run([inputTensor]);
  return {
    landmarks: outputs[0] as Float32Array,
    confidence: outputs[1] as Float32Array,
  };
}

/** Dispose all models to free memory */
export function disposeAllModels(): void {
  for (const key of Object.keys(_models) as Array<keyof typeof MODEL_FILES>) {
    try {
      _models[key]?.dispose?.();
      delete _models[key];
    } catch {
      // ignore
    }
  }
}
