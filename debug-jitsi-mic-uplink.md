# Debug Session: jitsi-mic-uplink
- **Status**: [OPEN]
- **Issue**: The mobile app can join the Jitsi room and display video, but the web participant still cannot hear the microphone audio coming from the mobile app.
- **Debug Server**: http://192.168.1.6:7777/event
- **Log File**: .dbg/trae-debug-log-jitsi-mic-uplink.ndjson

## Reproduction Steps
1. Open the installed Android APK.
2. Join a consultation room from the mobile app.
3. Join the same room from the web side.
4. Confirm that the call connects and video may appear.
5. Speak from the mobile app and observe that the web side still cannot hear the mobile participant.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | The injected WebView JS interferes with Jitsi conference lifecycle and blocks or destabilizes local audio publication | High | Medium | Pending |
| B | Android permission is granted at app level, but the Jitsi page inside the WebView does not actually get a usable microphone track | High | Medium | Pending |
| C | A WebView media/capture setting is incomplete for Android, causing one-way media behavior | Medium | Medium | Pending |
| D | The room loads before permission state is fully settled, so Jitsi joins without a valid local mic track | Medium | Low | Pending |
| E | Jitsi creates the local audio track but starts muted or in a failed state after join | Medium | Medium | Pending |

## Log Evidence
- Instrumentation added in `components/Video/VideoCallScreen.jsx` to report:
  - Android runtime permission result
  - WebView permission requests
  - WebView load start/end
  - WebView page snapshots from inside Jitsi
  - Jitsi local track snapshots relayed through `onMessage`

## Verification Conclusion
Pending
