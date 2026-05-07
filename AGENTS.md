# Agent Workflow

## Sync To Main

When the user says `sync to main` or `synt to main`, they mean:

1. Fetch `origin/main`.
2. Rebase the current branch on `origin/main`.
3. Push the current HEAD directly to `main` with a normal push, for example:
   `git push origin HEAD:main`

Do not force push for this workflow.

# Local Build Rules

- Android local debug builds must use `APP_ENV=development`.
- Android local debug package name must be `com.slopus.happy.dev`.
- Android local debug app label must be `HappyD`.
- Android local release builds must use `APP_ENV=release`.
- Android local release package name must be `com.slopus.happy.release`.
- Android local release app label must be `HappyR`.
- During troubleshooting, debugging, and functional verification, always build and install the debug variant first.
- Only generate and hand off a release APK after the debug variant has been verified as working.
- Preferred local Android build commands:
  - Debug APK: `cd packages/happy-app/android && APP_ENV=development ./gradlew assembleDebug`
  - Release APK: `cd packages/happy-app/android && APP_ENV=release ./gradlew assembleRelease`
- Expected APK output paths:
  - Debug: `packages/happy-app/android/app/build/outputs/apk/debug/app-debug.apk`
  - Release: `packages/happy-app/android/app/build/outputs/apk/release/app-release.apk`
