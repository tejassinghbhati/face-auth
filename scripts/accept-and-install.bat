@echo off
set SDK=C:\Users\HP\AppData\Local\Android\Sdk
set MGR=%SDK%\cmdline-tools\latest\bin\sdkmanager.bat

echo Accepting all SDK licenses (sending y for each of 7 prompts)...
(echo y& echo y& echo y& echo y& echo y& echo y& echo y& echo y& echo y& echo y) | "%MGR%" --sdk_root="%SDK%" --licenses
echo Licenses step done.

echo.
echo Installing platform-tools...
"%MGR%" --sdk_root="%SDK%" platform-tools
echo [platform-tools exit code: %ERRORLEVEL%]

echo.
echo Installing build-tools;34.0.0...
"%MGR%" --sdk_root="%SDK%" "build-tools;34.0.0"
echo [build-tools exit code: %ERRORLEVEL%]

echo.
echo Installing platforms;android-34...
"%MGR%" --sdk_root="%SDK%" "platforms;android-34"
echo [android-34 exit code: %ERRORLEVEL%]

echo.
echo Installing ndk;25.1.8937393 (large ~1.2GB, please wait)...
"%MGR%" --sdk_root="%SDK%" "ndk;25.1.8937393"
echo [ndk exit code: %ERRORLEVEL%]

echo.
echo ============ VERIFICATION ============
if exist "%SDK%\platform-tools\adb.exe"  (echo [OK] platform-tools)  else (echo [MISSING] platform-tools)
if exist "%SDK%\build-tools\34.0.0"      (echo [OK] build-tools 34)  else (echo [MISSING] build-tools 34)
if exist "%SDK%\platforms\android-34"    (echo [OK] android-34)       else (echo [MISSING] android-34)
if exist "%SDK%\ndk\25.1.8937393"        (echo [OK] NDK 25.1.8937393) else (echo [MISSING] NDK)
echo ======================================
echo.
echo DONE. Now run in a NEW PowerShell window:
echo   cd "E:\NHAI Hackathon\android"
echo   .\gradlew assembleDebug
