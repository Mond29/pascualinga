# Debug Session: video-webview-media
- **Status**: [OPEN]
- **Issue**: Jitsi room connects in the mobile app, audio from the remote participant can be heard, but local camera/microphone capture is unreliable and remote video is not rendered in Expo Go.
- **Debug Server**: Not started yet
- **Log File**: .dbg/trae-debug-log-video-webview-media.ndjson

## Reproduction Steps
1. Start the Expo app in Expo Go.
2. Join a working Jitsi room from the mobile app.
3. Join the same room from web as the second participant.
4. Observe that audio may work, but local camera does not open and remote video is not shown on the app.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Expo Go WebView media capture/rendering is limiting Jitsi camera/video behavior on Android | High | Low | Pending |
| B | Android runtime permissions are not fully granted at app/runtime level | Medium | Low | Pending |
| C | Android System WebView / codec compatibility is preventing remote video rendering | Medium | Medium | Pending |
| D | Current Jitsi WebView config still has an incompatibility for video paths while audio succeeds | Medium | Medium | Pending |
| E | Device-specific camera/mic restrictions are interfering with embedded WebView capture | Low | Medium | Pending |

## Log Evidence
Pending

## Verification Conclusion
Current evidence:
- Room matching is already fixed because both sides join the same consultation.
- App now has local camera preview in APK builds, so base camera permission is available.
- Web audio reaches the app, so at least one remote media path is alive.
- Web still cannot hear/see the app, and app still cannot see remote video.
- Same symptoms persist on another device, so this is not limited to a single phone.

Working hypotheses now:
- A = Partially rejected as the only cause. APK improved permission behavior, but not the full two-way media path.
- B = Partially rejected. Basic permission access exists because local preview now appears.
- C = Still plausible.
- D = High likelihood. The app-generated Jitsi URL appends an aggressive config hash that is also reused by the browser fallback, so even browser tests can inherit media-breaking flags.
- E = Lower likelihood after reproducing on another device.
