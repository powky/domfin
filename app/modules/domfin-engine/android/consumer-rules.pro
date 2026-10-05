# gomobile's bindings are called from Go through JNI: keep them when the app
# shrinks its code.
-keep class go.** { *; }
-keep class mobile.** { *; }
