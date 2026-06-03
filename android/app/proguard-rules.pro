# TensorFlow Lite — keep all TFLite classes from being stripped
-keep class org.tensorflow.** { *; }
-keep class com.google.** { *; }

# React Native
-keep class com.facebook.react.** { *; }

# AWS SDK
-keep class software.amazon.** { *; }
-keep class aws.sdk.** { *; }

# Keep model-related native methods
-keepclassmembers class * {
    native <methods>;
}
