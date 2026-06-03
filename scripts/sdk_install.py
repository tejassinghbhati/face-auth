"""
sdk_install.py
Installs Android SDK components by piping 'y' responses to sdkmanager
via subprocess.communicate() — the only stdin method Java respects on Windows.
"""
import subprocess
import sys
import os

SDK  = r"C:\Users\HP\AppData\Local\Android\Sdk"
MGR  = os.path.join(SDK, "cmdline-tools", "latest", "bin", "sdkmanager.bat")

def run(args, feed_yes=False):
    cmd = [MGR, f"--sdk_root={SDK}"] + args
    print(f"\n>>> {' '.join(args)}")
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=None,   # inherit — print live to console
        stderr=None,
        text=True,
        shell=False,
    )
    stdin_data = ("y\n" * 20) if feed_yes else None
    proc.communicate(input=stdin_data)
    return proc.returncode

# 1. Accept licenses
print("=" * 50)
print("Step 1: Accepting licenses")
print("=" * 50)
rc = run(["--licenses"], feed_yes=True)
print(f"Licenses exit code: {rc}")

# 2. Install components
components = [
    "platform-tools",
    "build-tools;34.0.0",
    "platforms;android-34",
    "ndk;25.1.8937393",
]
print("\n" + "=" * 50)
print("Step 2: Installing SDK components")
print("=" * 50)
results = {}
for comp in components:
    rc = run([comp])
    results[comp] = rc

# 3. Verify
print("\n" + "=" * 50)
print("Verification")
print("=" * 50)
checks = {
    "platform-tools": os.path.join(SDK, "platform-tools", "adb.exe"),
    "build-tools 34": os.path.join(SDK, "build-tools", "34.0.0"),
    "android-34":     os.path.join(SDK, "platforms", "android-34"),
    "NDK 25":         os.path.join(SDK, "ndk", "25.1.8937393"),
}
all_ok = True
for name, path in checks.items():
    ok = os.path.exists(path)
    print(f"  {'[OK]     ' if ok else '[MISSING]'} {name}")
    if not ok:
        all_ok = False

print("=" * 50)
if all_ok:
    print("\nSUCCESS. Open a NEW PowerShell and run:")
    print('  cd "E:\\NHAI Hackathon\\android"')
    print("  .\\gradlew assembleDebug")
else:
    print("\nSome components missing. Re-run or check errors above.")
    sys.exit(1)
