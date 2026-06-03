const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Allow importing .tflite model files as assets
    assetExts: ['tflite', 'bin', 'txt', 'png', 'jpg', 'ttf', 'otf', 'db'],
    sourceExts: ['js', 'jsx', 'ts', 'tsx', 'json', 'cjs'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
