/**
 * frameProcessor.ts — VisionCamera Frame Processor Plugin.
 *
 * This module bridges the native camera frame to the JS-side ML pipeline.
 * The frame processor runs on a dedicated camera thread at 15 FPS.
 *
 * Architecture:
 *   Native Camera Thread → Frame Buffer → (resize + crop in worklet) → JS ML Thread
 *
 * For production, the resize/crop operations should be implemented
 * as a native VisionCamera Frame Processor Plugin (C++/Kotlin/Swift)
 * to avoid crossing the JSI boundary with large pixel buffers.
 *
 * Reference implementation using VisionCamera v4 Frame Processors.
 */

import {VisionCameraProxy, Frame} from 'react-native-vision-camera';

// ── Frame Processor Plugin Registration ──────────────────────────────────────
// This calls the native C++/Java/Swift plugin registered as 'nhaiFaceProcessor'
// See android/app/src/main/cpp/NHAIFaceProcessor.cpp for the native implementation.

const plugin = VisionCameraProxy.initFrameProcessorPlugin('nhaiFaceProcessor', {});

/**
 * Resize a camera frame to the target dimensions and return an RGBA buffer.
 * This is meant to be called inside a `useFrameProcessor` worklet.
 *
 * @worklet
 */
export function resizeFrameToBuffer(
  frame: Frame,
  targetWidth: number,
  targetHeight: number,
): Uint8Array | null {
  'worklet';
  if (!plugin) {
    // Fallback: return empty buffer if plugin not loaded
    return null;
  }
  const result = plugin.call(frame, {width: targetWidth, height: targetHeight});
  if (!result) return null;
  return result as unknown as Uint8Array;
}

/**
 * Converts a raw RGBA Uint8Array buffer to a Float32 tensor normalized to [0, 1].
 * @worklet
 */
export function rgbaToFloat32(
  buffer: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  'worklet';
  const size = width * height;
  const out = new Float32Array(size * 3);
  for (let i = 0; i < size; i++) {
    out[i * 3] = buffer[i * 4] / 255.0;
    out[i * 3 + 1] = buffer[i * 4 + 1] / 255.0;
    out[i * 3 + 2] = buffer[i * 4 + 2] / 255.0;
  }
  return out;
}

/**
 * Converts a raw RGBA Uint8Array buffer to a Float32 tensor normalized to [-1, 1].
 * Used for MobileFaceNet input.
 * @worklet
 */
export function rgbaToFloat32Normalized(
  buffer: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  'worklet';
  const size = width * height;
  const out = new Float32Array(size * 3);
  for (let i = 0; i < size; i++) {
    out[i * 3] = (buffer[i * 4] / 127.5) - 1.0;
    out[i * 3 + 1] = (buffer[i * 4 + 1] / 127.5) - 1.0;
    out[i * 3 + 2] = (buffer[i * 4 + 2] / 127.5) - 1.0;
  }
  return out;
}
