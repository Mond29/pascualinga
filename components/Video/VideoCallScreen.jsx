import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { View, ActivityIndicator, Text, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar, Image, Switch, Platform, PermissionsAndroid, Alert, Linking } from 'react-native'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'

let WebView;
try {
  WebView = require('react-native-webview').WebView;
} catch (e) {
  console.warn('WebView not found. Please install react-native-webview');
}

const requestRuntimePermissions = async () => {
  if (Platform.OS !== 'android') return true
  try {
    const perms = [
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]
    const result = await PermissionsAndroid.requestMultiple(perms)
    const allGranted = perms.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED)
    if (!allGranted) {
      Alert.alert(
        'Permissions Required',
        'Camera and Microphone access are required to join video consultations. Please enable them in App Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              try { Linking.openSettings() } catch (_) {}
            },
          },
        ],
        { cancelable: false },
      )
    }
    return allGranted
  } catch (e) {
    console.warn('[VideoCall] Permission request failed:', e?.message || e)
    return false
  }
}

// ════════════════════════════════════════════════════════════════
// ALLOWED HOSTS FOR VIDEO CALL — any nav outside this list is BLOCKED
// to prevent opening Chrome / external browser / Jitsi Meet app store.
// ════════════════════════════════════════════════════════════════
const ALLOWED_VIDEO_HOSTS = [
  'meet.jit.si',
  'framatalk.org',
  'jitsi.riot.im',
  'jitsi.fsf.org',
  'meet.8x8.vc',
  '8x8.vc',
  'daily.co',
  '.daily.co',
]

const hostAllowed = (url: string) => {
  try {
    const u = new URL(url)
    const h = u.hostname.toLowerCase()
    return ALLOWED_VIDEO_HOSTS.some((p) => h === p || h.endsWith(p.replace(/^\./, '.')))
  } catch (_) { return false }
}


export default function VideoCallScreen({ route }) {
  const navigation = useNavigation();
  const { roomName, displayName, serviceType } = route.params || {}
  const [isInWaitingRoom, setIsWaitingRoom] = useState(true);
  const [useMockCall, setUseMockCall] = useState(false); // Default to real Jitsi, but can be toggled
  const [callDuration, setCallDuration] = useState(0);
  const [permissionsChecked, setPermissionsChecked] = useState(false);
  const [permissionsOk, setPermissionsOk] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const ok = await requestRuntimePermissions()
        setPermissionsOk(!!ok)
      } catch (_) {
        setPermissionsOk(Platform.OS !== 'android')
      } finally {
        setPermissionsChecked(true)
      }
    })()
  }, []);

  // Timer for mock call
  useEffect(() => {
    let interval;
    if (useMockCall && !isInWaitingRoom) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [useMockCall, isInWaitingRoom]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const rawMeetingUrl = useMemo(() => `${roomName || ''}`.trim(), [roomName]);

  const meetingUrl = useMemo(() => {
    const rawRoom = rawMeetingUrl;
    const safeRoom = encodeURIComponent(rawRoom || 'pascualinga-room');
    const displayNameStr = `${displayName || 'Guest'}`.trim() || 'Guest';

    // Daily.co URL — preserve any existing ?t= join token, then append display params.
    if (rawRoom && /^https?:\/\//i.test(rawRoom) && /\.daily\.co/i.test(rawRoom)) {
      try {
        const u = new URL(rawRoom);
        if (!u.searchParams.has('t')) {
          // If someone passed plain URL without a join token in query string,
          // do NOT try to append it (we trust the navigation already passed tokenUrl).
        }
        u.searchParams.set('displayName', displayNameStr);
        u.searchParams.set('custom_launch_page', 'false');
        u.searchParams.set('enable_ui_tray_animation', 'true');
        return u.toString();
      } catch (_) {
        return rawRoom;
      }
    }

    if (rawRoom.toLowerCase().startsWith('http://') || rawRoom.toLowerCase().startsWith('https://')) {
      return rawRoom;
    }

    const rawBase = `${process.env.EXPO_PUBLIC_JITSI_BASE_URL || ''}`.trim();
    const base = (rawBase || 'https://meet.jit.si').replace(/\/+$/, '');
    return `${base}/${safeRoom}`;
  }, [rawMeetingUrl]);

  const showWaitingRoom = isInWaitingRoom || !permissionsChecked;

  const handleEnterConsultation = useCallback(async () => {
    const ok = await requestRuntimePermissions();
    setPermissionsChecked(true);
    setPermissionsOk(!!ok);
    if (!ok) {
      Alert.alert(
        'Camera and Microphone Needed',
        'Please allow camera and microphone access first so your doctor can see and hear you.',
      );
      return;
    }
    setIsWaitingRoom(false);
  }, []);

  const handleOpenInBrowser = useCallback(async () => {
    const targetUrl = `${rawMeetingUrl || meetingUrl || ''}`.trim();
    if (!targetUrl) {
      Alert.alert('Unavailable', 'Meeting link is not ready yet.');
      return;
    }

    try {
      const supported = await Linking.canOpenURL(targetUrl);
      if (!supported) {
        Alert.alert('Unavailable', 'This meeting link cannot be opened on your device right now.');
        return;
      }
      await Linking.openURL(targetUrl);
    } catch (_) {
      Alert.alert('Open Failed', 'Unable to open the meeting in your browser right now.');
    }
  }, [meetingUrl, rawMeetingUrl]);

  if (!WebView) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
        <Text style={styles.errorTitle}>WebView Missing</Text>
        <Text style={styles.errorText}>
          Video call requires the react-native-webview package.
        </Text>
        <TouchableOpacity 
          style={styles.retryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  // 1. Waiting Room UI (Hospital Vibe)
  if (showWaitingRoom) {
    return (
      <SafeAreaView style={styles.waitingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <View style={styles.waitingHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.waitingBack}>
            <Ionicons name="close" size={28} color="#1e293b" />
          </TouchableOpacity>
          <Text style={styles.waitingHeaderTitle}>Secure Waiting Room</Text>
        </View>

        <View style={styles.waitingContent}>
          <View style={styles.logoContainer}>
            <MaterialCommunityIcons name="hospital-marker" size={80} color="#0077B6" />
            <View style={styles.pulseContainer}>
              <View style={styles.pulse} />
            </View>
          </View>

          <Text style={styles.waitingTitle}>Pascualinga Telehealth</Text>
          <Text style={styles.waitingSubtitle}>Ready for your {serviceType || 'Consultation'}</Text>

          <View style={styles.patientCard}>
            <View style={styles.patientAvatar}>
              <Text style={styles.avatarText}>{displayName?.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 15 }}>
              <Text style={styles.patientCardLabel}>Connected as</Text>
              <Text style={styles.patientCardName}>{displayName}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={24} color="#059669" />
          </View>

          {/* Permissions status row */}
          <View style={[styles.permRow, (permissionsOk ? styles.permRowOk : styles.permRowWarn)]}>
            {permissionsChecked ? (
              permissionsOk ? (
                <>
                  <Ionicons name="shield-checkmark" size={20} color="#059669" />
                  <Text style={styles.permRowTextOk}>Camera & Mic permissions granted.</Text>
                </>
              ) : (
                <>
                  <Ionicons name="alert-circle" size={20} color="#d97706" />
                  <Text style={styles.permRowTextWarn}>Permissions may be required in Settings.</Text>
                </>
              )
            ) : (
              <>
                <ActivityIndicator color="#0077B6" size={18} />
                <Text style={styles.permRowTextWarn}>Requesting camera & microphone permissions…</Text>
              </>
            )}
          </View>

          <View style={styles.testModeContainer}>
            <Text style={styles.testModeLabel}>Simulation Mode (for testing)</Text>
            <Switch
              value={useMockCall}
              onValueChange={setUseMockCall}
              trackColor={{ false: "#e2e8f0", true: "#0077B6" }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.instructionsBox}>
            <Text style={styles.instructionItem}>
              {useMockCall 
                ? "• Test the app flow without internet issues" 
                : "• Ensure your camera and mic are on"}
            </Text>
            <Text style={styles.instructionItem}>
              {useMockCall 
                ? "• Reliable for debugging navigation" 
                : "• Find a quiet and well-lit place"}
            </Text>
          </View>
        </View>

        <View style={styles.waitingFooter}>
          <TouchableOpacity 
            style={[
              styles.startCallButton,
              permissionsChecked && !permissionsOk ? styles.startCallButtonDisabled : null,
            ]}
            onPress={handleEnterConsultation}
          >
            <Ionicons name="videocam" size={24} color="#fff" style={{ marginRight: 10 }} />
            <Text style={styles.startCallButtonText}>
              {permissionsChecked && !permissionsOk ? 'Allow Camera & Mic First' : 'Enter Consultation Room'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.encryptedText}>
            <MaterialCommunityIcons name="shield-check" size={14} color="#64748b" /> End-to-end Encrypted
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // 2. Active Consultation UI
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0077B6" />
      
      {/* Hospital Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => setIsWaitingRoom(true)}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Teleconsultation Room</Text>
          <Text style={styles.headerSubtitle}>{serviceType || 'General Consultation'}</Text>
        </View>

        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>LIVE</Text>
        </View>
      </View>

      {/* Video Area */}
      <View style={styles.videoWrapper}>
        {useMockCall ? (
          <View style={styles.mockCallContainer}>
            <View style={styles.mockVideoLarge}>
              <MaterialCommunityIcons name="doctor" size={100} color="#cbd5e1" />
              <Text style={styles.mockVideoLabel}>Doctor's Feed (Simulation)</Text>
              <View style={styles.recordingBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.recordingText}>REC {formatTime(callDuration)}</Text>
              </View>
            </View>
            
            <View style={styles.mockVideoSmall}>
              <View style={styles.mockAvatarSmall}>
                <Text style={styles.avatarTextSmall}>{displayName?.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.mockVideoLabelSmall}>You</Text>
            </View>

            <View style={styles.mockControls}>
              <TouchableOpacity style={styles.mockControlButton}>
                <Ionicons name="mic" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.mockControlButton, { backgroundColor: '#ef4444' }]}
                onPress={() => setIsWaitingRoom(true)}
              >
                <Ionicons name="call" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.mockControlButton}>
                <Ionicons name="videocam" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <WebView
            source={{ uri: meetingUrl, headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' } }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#0077B6" />
                <Text style={styles.loadingText}>Connecting to secure server...</Text>
                <Text style={styles.loadingSubtext}>
                  {meetingUrl && /\.daily\.co/i.test(meetingUrl)
                    ? 'Entering Pascualinga Telehealth (Daily)'
                    : 'Establishing peer-to-peer link'}
                </Text>
              </View>
            )}
            javaScriptEnabled={true}
            javaScriptCanOpenWindowsAutomatically={true}
            domStorageEnabled={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            originWhitelist={['*']}
            onShouldStartLoadWithRequest={(request) => {
              const targetUrl = `${request?.url || ''}`.trim();
              if (!targetUrl) return false;
              if (!/^https?:\/\//i.test(targetUrl)) return false;
              return hostAllowed(targetUrl);
            }}
            onPermissionRequest={(event) => {
              event.request.grant(event.request.resources);
            }}
            onError={(syntheticEvent) => {
              console.warn('[VideoCall] WebView error:', syntheticEvent?.nativeEvent);
            }}
            androidLayerType="hardware"
            mixedContentMode="always"
            allowsFullscreenVideo={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            incognito={false}
            cacheEnabled={true}
            cacheMode="LOAD_DEFAULT"
            allowsProtectedMedia={true}
            allowsBackForwardNavigationGestures={false}
            allowsLinkPreview={false}
            pullToRefreshEnabled={false}
            scalesPageToFit={true}
            bounces={false}
            setSupportMultipleWindows={false}
            style={styles.webview}
          />
        )}
      </View>

      {!useMockCall ? (
        <View style={styles.browserFallbackWrap}>
          <Text style={styles.browserFallbackText}>
            If the in-app call does not fully work, open this same meeting in your browser.
          </Text>
          <TouchableOpacity style={styles.browserFallbackButton} onPress={handleOpenInBrowser}>
            <Ionicons name="open-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.browserFallbackButtonText}>Open in Browser</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Safety Footer */}
      <View style={styles.footer}>
        <MaterialCommunityIcons name="shield-lock" size={16} color="#059669" />
        <Text style={styles.footerText}>Pascualinga Medical Link • Secure Session</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a', // Darker background for call
  },
  waitingContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  waitingHeader: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  waitingBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitingHeaderTitle: {
    marginLeft: 15,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  waitingContent: {
    flex: 1,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    marginBottom: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseContainer: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: '#0077B6',
    opacity: 0.2,
  },
  waitingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0077B6',
    marginBottom: 5,
  },
  waitingSubtitle: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 40,
  },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 15,
    borderRadius: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 30,
  },
  patientAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#0077B6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  permRowOk: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  permRowWarn: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  permRowTextOk: {
    fontSize: 13,
    color: '#047857',
    fontWeight: '600',
  },
  permRowTextWarn: {
    fontSize: 13,
    color: '#92400e',
    fontWeight: '600',
  },
  testModeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#fff7ed',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffedd5',
    marginBottom: 20,
  },
  testModeLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#9a3412',
  },
  mockCallContainer: {
    flex: 1,
    backgroundColor: '#1e293b',
    position: 'relative',
  },
  mockVideoLarge: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#334155',
  },
  mockVideoLabel: {
    color: '#94a3b8',
    marginTop: 15,
    fontSize: 16,
  },
  recordingBadge: {
    position: 'absolute',
    top: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  recordingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  mockVideoSmall: {
    position: 'absolute',
    top: 20,
    left: 20,
    width: 100,
    height: 140,
    backgroundColor: '#475569',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  mockAvatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0077B6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarTextSmall: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  mockVideoLabelSmall: {
    color: '#fff',
    fontSize: 10,
    marginTop: 8,
  },
  mockControls: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  mockControlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  patientCardLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  patientCardName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  instructionsBox: {
    width: '100%',
    padding: 20,
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
  },
  instructionItem: {
    fontSize: 14,
    color: '#0077B6',
    marginBottom: 8,
    fontWeight: '500',
  },
  waitingFooter: {
    padding: 30,
    alignItems: 'center',
  },
  startCallButton: {
    backgroundColor: '#0077B6',
    width: '100%',
    paddingVertical: 18,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#0077B6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  startCallButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  startCallButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  encryptedText: {
    marginTop: 15,
    fontSize: 12,
    color: '#64748b',
  },
  header: {
    backgroundColor: '#0077B6',
    paddingTop: 15,
    paddingBottom: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 15,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: 6,
  },
  statusText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: 'bold',
  },
  videoWrapper: {
    flex: 1,
    marginHorizontal: 10,
    marginVertical: 15,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  browserFallbackWrap: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  browserFallbackText: {
    color: '#cbd5e1',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  browserFallbackButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  browserFallbackButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: '#fff',
    marginTop: 20,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingSubtext: {
    color: '#94a3b8',
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 25,
  },
  footerText: {
    color: '#94a3b8',
    fontSize: 11,
    marginLeft: 6,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#fff',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  retryButton: {
    backgroundColor: '#0077B6',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
