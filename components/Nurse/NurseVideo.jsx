import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'

export default function NurseVideo() {
  const navigation = useNavigation()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [doctorEmail, setDoctorEmail] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [items, setItems] = useState([])

  const getApiBaseUrl = useCallback(() => {
    const fromEnv = `${process.env.EXPO_PUBLIC_API_BASE_URL || ''}`.trim()
    if (fromEnv) return fromEnv.replace(/\/+$/, '')
    return 'https://api.pascualinga.com'
  }, [])

  const getDailyEdgeFnUrl = useCallback(() => {
    const projUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL || ''}`.trim().replace(/\/+$/, '')
    if (projUrl) return `${projUrl}/functions/v1/daily-create-room`
    return 'https://iknkfjzoubkymcwprrux.supabase.co/functions/v1/daily-create-room'
  }, [])

  const callDailyEdgeFn = useCallback(
    async (appointmentId, action, sourceTable = '') => {
      const id = `${appointmentId || ''}`.trim()
      if (!id) return { ok: false, message: 'Missing appointment id' }
      const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase()
      const name = `${(await AsyncStorage.getItem(`userName:${email}`)) || ''}`.trim() || email || 'Doctor'

      const url = getDailyEdgeFnUrl()
      const body = { appointmentId: id, action: action === 'join' ? 'join' : 'start', email, role: 'doctor' }
      if (`${sourceTable || ''}`.trim()) body.sourceTable = `${sourceTable}`.trim()
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-user-role': 'doctor',
          'x-user-email': email,
          'x-user-name': name,
          'Content-Type': 'application/json',
          apikey: `${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrbmtmanpvdWJreW1jd3BycnV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMjg4MDMsImV4cCI6MjA4OTkwNDgwM30.He4eCsEJQdRYQ0Kk2kqTPTyWV3zeS1TCm1UYlXGyixs'}`,
        },
        body: JSON.stringify(body),
      })

      const text = await res.text()
      let json = null
      try { json = text ? JSON.parse(text) : null } catch (_) { json = null }
      if (!res.ok) return { ok: false, message: json?.error || text || 'Failed to prepare call' }
      return { ok: true, json }
    },
    [getDailyEdgeFnUrl],
  )

  const normalizeText = useCallback((v) => `${v || ''}`.trim().toLowerCase(), [])

  const isVideoLike = useCallback(
    (row) => {
      const mode = normalizeText(row?.consultation_mode)
      const type = normalizeText(row?.service_type)
      const reason = normalizeText(row?.reason)
      return mode === 'video' || type.includes('video') || reason.includes('payref:') || reason.includes('video consultation') || reason.includes('[video]') || reason.includes('video call')
    },
    [normalizeText],
  )

  const parseTimeToMinutes = useCallback((timeStr) => {
    const t = `${timeStr || ''}`.trim()
    if (!t) return null
    const m1 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/)
    if (m1) {
      const hh = Number(m1[1])
      const mm = Number(m1[2])
      if (Number.isNaN(hh) || Number.isNaN(mm)) return null
      return hh * 60 + mm
    }
    const m2 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (m2) {
      let hh = Number(m2[1])
      const mm = Number(m2[2])
      const ap = `${m2[3]}`.toUpperCase()
      if (Number.isNaN(hh) || Number.isNaN(mm)) return null
      if (ap === 'PM' && hh < 12) hh += 12
      if (ap === 'AM' && hh === 12) hh = 0
      return hh * 60 + mm
    }
    return null
  }, [])

  const formatTimeDisplay = useCallback((timeStr) => {
    const t = `${timeStr || ''}`.trim()
    if (!t) return ''

    const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (m12) {
      const hh = Number(m12[1])
      const mm = `${m12[2]}`.padStart(2, '0')
      const ap = `${m12[3]}`.toUpperCase()
      if (!Number.isFinite(hh)) return t
      const hh12 = ((hh % 12) || 12)
      return `${`${hh12}`.padStart(2, '0')}:${mm} ${ap}`
    }

    const m24 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (m24) {
      let hh = Number(m24[1])
      const mm = `${m24[2]}`.padStart(2, '0')
      if (!Number.isFinite(hh)) return t
      hh = Math.max(0, Math.min(23, hh))
      const ap = hh >= 12 ? 'PM' : 'AM'
      const hh12 = ((hh % 12) || 12)
      return `${`${hh12}`.padStart(2, '0')}:${mm} ${ap}`
    }

    return t
  }, [])

  const matchDoctor = useCallback(
    (row, name, email) => {
      const doctorNameField = `${row?.doctor_name || row?.doctor || row?.doctor_id || row?.assigned_doctor || row?.assignedDoctor || row?.doctoruuid || ''}`.trim()
      const doctorEmailField = `${row?.doctor_email || row?.doctorEmail || row?.staff_email || row?.assigned_doctor_email || ''}`.trim().toLowerCase()
      const d = normalizeText(doctorNameField)
      const de = doctorEmailField
      const n = normalizeText(name)
      const e = normalizeText(email)
      // If NO doctor assigned (blank), include it for any doctor/nurse to pick up (for video consults)
      if (!d && !de) return true
      if (e && de && e === de) return true
      if (e && d && d.includes(e)) return true
      if (n && d && d.includes(n)) return true
      if (e && `${row?.id || ''}` && `${row?.doctor_uuid || row?.doctorUuid || ''}` === e) return true
      return false
    },
    [normalizeText],
  )

  const startVideoViaApi = useCallback(
    async (appointmentId, sourceTable) => {
      const res = await callDailyEdgeFn(appointmentId, 'start', sourceTable)
      if (!res.ok) return { ok: false, message: res.message }
      const tokenUrl = `${res?.json?.tokenUrl || ''}`.trim()
      const plainUrl = `${res?.json?.url || ''}`.trim()
      const url = tokenUrl || plainUrl
      return { ok: true, json: res.json, url, tokenUrl }
    },
    [callDailyEdgeFn],
  )

  const joinVideoViaApi = useCallback(
    async (appointmentId, sourceTable) => {
      const res = await callDailyEdgeFn(appointmentId, 'join', sourceTable)
      if (!res.ok) {
        if ((res.message || '').toLowerCase().includes('not found') || (res.message || '').toLowerCase().includes('room')) {
          return { ok: false, waiting: true, message: res.message || 'Waiting for room.' }
        }
        return { ok: false, message: res.message }
      }
      const tokenUrl = `${res?.json?.tokenUrl || ''}`.trim()
      const plainUrl = `${res?.json?.url || ''}`.trim()
      const url = tokenUrl || plainUrl
      if (!url) return { ok: false, waiting: true, message: 'Waiting for call to start.' }
      return { ok: true, url, tokenUrl, json: res.json }
    },
    [callDailyEdgeFn],
  )

  const markMeetingStartedIfNeeded = useCallback(async (item) => {
    if (!item) return
    const id = `${item?.id || ''}`.trim()
    if (!id) return
    const rawId = String(id).startsWith('req-') ? String(id).slice(4) : id
    try {
      await supabase
        .from('appointments')
        .update({ meeting_started_at: new Date().toISOString() })
        .eq('id', rawId)
        .is('meeting_started_at', null)
    } catch (_) {}
    try {
      await supabase
        .from('appointment_approval_requests')
        .update({ meeting_started_at: new Date().toISOString() })
        .eq('id', rawId)
        .is('meeting_started_at', null)
    } catch (_) {}
    try {
      await supabase
        .from('service_appointment')
        .update({ meeting_started_at: new Date().toISOString() })
        .eq('id', rawId)
        .is('meeting_started_at', null)
    } catch (_) {}
  }, [])

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase()
      setDoctorEmail(email)
      if (!email) {
        setDoctorName('')
        setItems([])
        return
      }

      let name = `${(await AsyncStorage.getItem(`userName:${email}`)) || ''}`.trim()
      if (!name) {
        try {
          const res = await supabase.from('accounts').select('name').eq('email', email).maybeSingle()
          if (!res.error && res.data?.name) name = `${res.data.name}`.trim()
        } catch (_) {}
      }
      setDoctorName(name || email)

      const videoRows = []

      // Load regular appointments
      try {
        const res1 = await supabase
          .from('appointments')
          .select('*')
          .order('appointment_date', { ascending: false })
          .limit(250)
        if (!res1.error && Array.isArray(res1.data)) {
          res1.data.forEach((r) => videoRows.push({ source: 'appointments', raw: r }))
        }
      } catch (_) {}

      // Load approval requests (actual approved consults table)
      try {
        const res2 = await supabase
          .from('appointment_approval_requests')
          .select('*')
          .order('requested_date', { ascending: false })
          .limit(250)
        if (!res2.error && Array.isArray(res2.data)) {
          res2.data.forEach((r) => videoRows.push({ source: 'appointment_approval_requests', raw: r }))
        }
      } catch (_) {}

      const filtered = videoRows
        .filter(({ source, raw: r }) => isVideoLike(r))
        .filter(({ source, raw: r }) => matchDoctor(r, name, email))
        .filter(({ source, raw: r }) => {
          const st = normalizeText(r?.status)
          return st !== 'cancelled' && st !== 'canceled' && st !== 'declined'
        })
        .map(({ source, raw: r }) => ({
          id: r.id,
          source,
          date: `${r.appointment_date || r.requested_date || ''}`.trim(),
          time: `${r.appointment_time || r.requested_time || ''}`.trim(),
          timeLabel: formatTimeDisplay(r.appointment_time || r.requested_time),
          patientName: `${r.patient_name || r.first_name || ''}`.trim() || `${r.email || r.patient_email || ''}`.trim() || 'Patient',
          status: `${r.status || ''}`.trim() || 'Approved',
          serviceType: `${r.service_type || ''}`.trim() || `${r.reason || ''}`.trim() || `${r.category || ''}`.trim() || 'Video Consultation',
          meetingRoom: `${r.meeting_room_id || r.meeting_room || r.video_room || r.room_url || ''}`.trim(),
          meetingStartedAt: r.meeting_started_at || null,
          raw: r,
        }))

      const sorted = filtered.sort((a, b) => {
        const ad = a.date || ''
        const bd = b.date || ''
        if (ad !== bd) return ad.localeCompare(bd)
        const am = parseTimeToMinutes(a.time) ?? 0
        const bm = parseTimeToMinutes(b.time) ?? 0
        return am - bm
      })

      setItems(sorted)
    } catch (e) {
      Alert.alert('Error', `${e?.message || e || 'Failed to load video consultations'}`)
      setItems([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [formatTimeDisplay, isVideoLike, matchDoctor, normalizeText, parseTimeToMinutes])

  useEffect(() => {
    load(true)
  }, [load])

  const today = useMemo(() => new Date().toISOString().split('T')[0], [])

  const onRefresh = () => {
    setRefreshing(true)
    load(false)
  }

  const startOrJoin = useCallback(
    async (item) => {
      try {
        const id = `${item?.id || ''}`.trim()
        if (!id) return

        const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase()
        const displayName = doctorName || email || 'Doctor'
        const serviceType = item?.serviceType || 'Video Consultation'
        const sourceTable = `${item?.source || ''}`.trim()

        const started = await startVideoViaApi(id, sourceTable)
        if (started.ok && started.url) {
          await markMeetingStartedIfNeeded(item)
          navigation.navigate('VideoCall', { roomName: started.url, displayName, serviceType })
          return
        }

        const joined = await joinVideoViaApi(id, sourceTable)
        if (joined.ok && joined.url) {
          await markMeetingStartedIfNeeded(item)
          navigation.navigate('VideoCall', { roomName: joined.url, displayName, serviceType })
          return
        }

        // Last fallback: if DB already has a saved Jitsi room, go there directly
        const dbRoom = `${item?.meetingRoom || item?.raw?.meeting_room || item?.raw?.meeting_room_id || item?.raw?.video_room || ''}`.trim()
        if (dbRoom && /jits|meet\.jit/i.test(dbRoom)) {
          await markMeetingStartedIfNeeded(item)
          navigation.navigate('VideoCall', { roomName: dbRoom, displayName, serviceType })
          return
        }

        Alert.alert(
          'Video Consultation',
          joined.message || started.message || 'Unable to start call. Please try again.',
        )
      } catch (e) {
        Alert.alert('Video Consultation', `${e?.message || e || 'Failed to start call'}`)
      }
    },
    [doctorName, joinVideoViaApi, markMeetingStartedIfNeeded, navigation, startVideoViaApi],
  )

  const renderItem = ({ item }) => {
    const isToday = item?.date === today
    const statusKey = normalizeText(item?.status)
    const statusColor = statusKey === 'approved' || statusKey === 'confirmed' ? '#22c55e' : statusKey.includes('pending') ? '#f97316' : '#64748b'
    const canStart = isToday && (statusKey === 'approved' || statusKey === 'confirmed' || statusKey.includes('pending'))

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Ionicons name="videocam" size={18} color="#DA7705" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.patientName} numberOfLines={1}>{item.patientName}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {item.date ? `${item.date}${item.timeLabel ? ` • ${item.timeLabel}` : ''}` : (item.timeLabel || '')}
            </Text>
          </View>
          <Text style={[styles.status, { color: statusColor }]} numberOfLines={1}>{item.status}</Text>
        </View>

        <Text style={styles.serviceType} numberOfLines={2}>{item.serviceType}</Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, !canStart && styles.actionButtonDisabled]}
            activeOpacity={0.9}
            disabled={!canStart}
            onPress={() => startOrJoin(item)}
          >
            <Ionicons name="play" size={16} color="#fff" />
            <Text style={styles.actionText}>Start / Join</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Video Consultations</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {doctorName ? `Doctor: ${doctorName}` : (doctorEmail ? `Doctor: ${doctorEmail}` : 'Doctor')}
          </Text>
        </View>
        <TouchableOpacity activeOpacity={0.85} onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color="#DA7705" />
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#DA7705" />
          <Text style={styles.loadingText}>Loading video consultations…</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => `${it.id}`}
          renderItem={renderItem}
          contentContainerStyle={items.length ? styles.list : styles.emptyList}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#DA7705']} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="videocam-off-outline" size={56} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No video consultations</Text>
              <Text style={styles.emptyText}>There are no video consultations assigned to this account.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 22, fontWeight: '900', color: '#1e293b' },
  subtitle: { marginTop: 3, fontSize: 12, fontWeight: '700', color: '#64748b' },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  loadingText: { marginTop: 10, fontSize: 13, fontWeight: '700', color: '#64748b' },
  list: { padding: 16, paddingBottom: 90 },
  emptyList: { flexGrow: 1, paddingBottom: 90 },
  emptyTitle: { marginTop: 10, fontSize: 16, fontWeight: '900', color: '#1e293b' },
  emptyText: { marginTop: 6, fontSize: 13, fontWeight: '600', color: '#64748b', textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  patientName: { fontSize: 15, fontWeight: '900', color: '#1e293b' },
  meta: { marginTop: 2, fontSize: 12, fontWeight: '700', color: '#64748b' },
  status: { marginLeft: 10, fontSize: 12, fontWeight: '900' },
  serviceType: { marginTop: 10, fontSize: 13, fontWeight: '700', color: '#334155' },
  actionsRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end' },
  actionButton: {
    height: 44,
    borderRadius: 14,
    backgroundColor: '#DA7705',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DA7705',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  actionButtonDisabled: { backgroundColor: '#cbd5e1', shadowOpacity: 0, elevation: 0 },
  actionText: { marginLeft: 8, color: '#fff', fontSize: 13, fontWeight: '900' },
})
