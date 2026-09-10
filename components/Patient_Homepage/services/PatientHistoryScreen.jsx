import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../../lib/supabase';

export default function PatientHistoryScreen({ embedded = false }) {
  const THEME_ORANGE = '#DA7705';
  const navigation = useNavigation();
  const activeEmailRef = useRef('');

  const normalizeText = useCallback((v) => `${v || ''}`.toLowerCase().trim(), []);

  const parseReappointTarget = useCallback(
    (item) => {
      const raw = item?.raw || {};
      const typeText = `${item?.type || raw?.service_type || raw?.reason || ''}`.trim();
      const fallbackCategory = `${item?.category || raw?.category || ''}`.trim();

      const mVideo = typeText.match(/video consultation\s*-\s*([^:]+)\s*:\s*(.+)$/i);
      if (mVideo) {
        const dept = `${mVideo[1] || ''}`.trim();
        const sub = `${mVideo[2] || ''}`.trim();
        if (dept && sub) return { serviceCategory: dept, subServiceName: sub };
      }

      const mColon = typeText.match(/^([^:]+)\s*:\s*(.+)$/);
      if (mColon) {
        const cat = `${mColon[1] || ''}`.trim();
        const sub = `${mColon[2] || ''}`.trim();
        if (cat && sub) return { serviceCategory: cat, subServiceName: sub };
      }

      if (fallbackCategory && typeText) return { serviceCategory: fallbackCategory, subServiceName: typeText };

      // Extra smart mapping if category is missing
      const t = typeText.toLowerCase();
      if (t.includes('x-ray') || t.includes('ultrasound') || t.includes('ct scan') || t.includes('mri')) return { serviceCategory: 'Radiology', subServiceName: typeText };
      if (t.includes('blood') || t.includes('urinalysis') || t.includes('fecalysis')) return { serviceCategory: 'Laboratory', subServiceName: typeText };
      if (t.includes('tooth') || t.includes('dental')) return { serviceCategory: 'Dental Clinic', subServiceName: typeText };
      if (t.includes('ecg') || t.includes('stress test')) return { serviceCategory: 'ECG', subServiceName: typeText };

      return { serviceCategory: fallbackCategory, subServiceName: typeText };
    },
    [],
  );

  const startReappointment = useCallback(
    (item) => {
      const target = parseReappointTarget(item);
      const serviceCategory = `${target?.serviceCategory || ''}`.trim();
      const subServiceName = `${target?.subServiceName || ''}`.trim();
      if (!serviceCategory || !subServiceName) {
        Alert.alert('Re-appointment Unavailable', 'This cancelled appointment is missing service details. Please book again from the Services page.');
        return;
      }

      navigation.navigate('PatientServicesScreen', {
        reappoint: true,
        reappointToken: `${item?.id || Date.now()}`,
        serviceCategory,
        subServiceName,
        lockService: true,
      });
    },
    [navigation, parseReappointTarget],
  );

  const formatTimeDisplay = useCallback((timeStr) => {
    const t = `${timeStr || ''}`.trim();
    if (!t) return 'TBD';
    const m1 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
    if (m1) {
      let hh = Number(m1[1]);
      const mm = `${m1[2]}`.padStart(2, '0');
      if (Number.isNaN(hh)) return t;
      const ap = hh >= 12 ? 'PM' : 'AM';
      hh = hh % 12;
      if (hh === 0) hh = 12;
      return `${hh.toString().padStart(2, '0')}:${mm} ${ap}`;
    }
    const m2 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m2) {
      let hh = Number(m2[1]);
      const mm = `${m2[2]}`.padStart(2, '0');
      const ap = `${m2[3]}`.toUpperCase();
      if (Number.isNaN(hh)) return t;
      hh = hh % 12;
      if (hh === 0) hh = 12;
      return `${hh.toString().padStart(2, '0')}:${mm} ${ap}`;
    }
    return t;
  }, []);

  const parseTimeToMinutes = useCallback((timeStr) => {
    const t = `${timeStr || ''}`.trim();
    if (!t) return null;
    const m1 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m1) {
      const hh = Number(m1[1]);
      const mm = Number(m1[2]);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
      return hh * 60 + mm;
    }
    const m2 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m2) {
      let hh = Number(m2[1]);
      const mm = Number(m2[2]);
      const ap = `${m2[3]}`.toUpperCase();
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
      if (ap === 'PM' && hh < 12) hh += 12;
      if (ap === 'AM' && hh === 12) hh = 0;
      return hh * 60 + mm;
    }
    return null;
  }, []);

  const appointmentStableKey = useCallback(
    (dateStr, timeStr) => {
      const d = `${dateStr || ''}`.trim();
      const mins = parseTimeToMinutes(timeStr);
      if (!d || mins === null) return '';
      return `${d}|${mins}`;
    },
    [parseTimeToMinutes],
  );

  const loadLocalCancelledSet = useCallback(async (email) => {
    try {
      const key = `patientLocalCancelled:${`${email || ''}`.trim().toLowerCase()}`;
      const raw = await AsyncStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      const arr = Array.isArray(parsed) ? parsed : [];
      return new Set(
        arr
          .map((x) => `${x || ''}`.trim())
          .filter(Boolean)
          .map((k) => {
            const parts = k.split('|');
            return parts.length >= 2 ? `${parts[0]}|${parts[1]}` : k;
          }),
      );
    } catch {
      return new Set();
    }
  }, []);

  const looksLikeUuid = useCallback(
    (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${value || ''}`.trim()),
    [],
  );

  const extractTypeLabel = useCallback((raw) => {
    const text = `${raw || ''}`.trim();
    if (!text) return 'Appointment';
    const stripped = text.replace(/\[triage[^\]]*\]\s*/gi, '').trim();
    const head = stripped.split('|')[0]?.trim() || stripped;
    return head.length > 90 ? `${head.slice(0, 90)}…` : head;
  }, []);

  const statusBucket = useCallback(
    (status) => {
      const s = normalizeText(status);
      if (!s) return 'Completed';
      if (s.includes('cancel')) return 'Cancelled';
      if (s.includes('declin') || s.includes('reject')) return 'Cancelled';
      if (s.includes('pending') || s.includes('waiting') || s.includes('for approval') || s.includes('verification')) return 'Pending';
      if (s.includes('approved') || s.includes('confirm') || s.includes('completed') || s.includes('booked') || s.includes('scheduled') || s.includes('paid')) return 'Completed';
      return 'Completed';
    },
    [normalizeText],
  );

  const stableHistoryKey = useCallback(
    (it) => {
      const d = `${it?.date || ''}`.trim();
      const t = `${it?.time_raw || it?.time || ''}`.trim();
      const ty = normalizeText(it?.type || '');
      if (!d || !t || !ty) return `${it?.source || ''}:${it?.id || ''}`;
      return `${d}|${t}|${ty}`;
    },
    [normalizeText],
  );

  const statusBadgeStyle = useCallback(
    (bucket) => {
      if (bucket === 'Cancelled') return { bg: '#fee2e2', fg: '#991b1b', icon: 'x-circle' };
      if (bucket === 'Pending') return { bg: '#ffedd5', fg: '#9a3412', icon: 'clock' };
      return { bg: '#dcfce7', fg: '#166534', icon: 'check-circle' };
    },
    [],
  );

  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [page, setPage] = useState(0);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
      if (!email) {
        activeEmailRef.current = '';
        setHistoryItems([]);
        return;
      }

      if (activeEmailRef.current && activeEmailRef.current !== email) {
        setHistoryItems([]);
      }
      activeEmailRef.current = email;

      const localCancelled = await loadLocalCancelledSet(email);

      const accountRes = await supabase.from('accounts').select('id').eq('email', email).maybeSingle();
      if (accountRes.error) throw accountRes.error;
      const patientId = accountRes.data?.id || '';

      const fetchApprovalRequests = async () => {
        const selectCols = 'id, requested_date, requested_time, reason, status, created_at, email, patient_id';
        const errors = [];
        const base = () =>
          supabase
            .from('appointment_approval_requests')
            .select(selectCols)
            .order('created_at', { ascending: false });

        const tryFetch = async (builder) => {
          const res = await builder;
          if (!res?.error) return { data: res.data || [], ignored: false };
          if (res.error?.code === '42703' || res.error?.code === '22P02') return { data: [], ignored: true };
          const msg = `${res.error?.message || ''}`.toLowerCase();
          if (msg.includes('could not find the') || msg.includes('does not exist') || msg.includes('unknown')) return { data: [], ignored: true };
          errors.push(res.error);
          return { data: [], ignored: false };
        };

        const chunks = [];
        if (patientId && looksLikeUuid(patientId)) {
          const r1 = await tryFetch(base().eq('patient_id', patientId));
          if (r1.data?.length) chunks.push(r1.data);
        }
        {
          const r2 = await tryFetch(base().eq('email', email));
          if (r2.data?.length) chunks.push(r2.data);
        }
        {
          const r3 = await tryFetch(base().eq('patient_email', email));
          if (r3.data?.length) chunks.push(r3.data);
        }
        const seen = new Set();
        const merged = [];
        chunks.flat().forEach((row) => {
          const id = row?.id;
          if (!id || seen.has(id)) return;
          seen.add(id);
          merged.push(row);
        });
        return { data: merged, error: errors[0] || null };
      };

      const [serviceRes, apptRes, approvalRes] = await Promise.all([
        supabase.from('service_appointment').select('*').eq('patient_email', email).order('created_at', { ascending: false }).limit(500),
        supabase.from('appointments').select('*').eq('email', email).order('created_at', { ascending: false }).limit(500),
        fetchApprovalRequests(),
      ]);

      if (serviceRes.error) throw serviceRes.error;
      if (apptRes.error) throw apptRes.error;
      if (approvalRes.error) throw approvalRes.error;

      const fromService = (serviceRes.data || []).map((b, idx) => {
        const createdAt = typeof b?.created_at === 'string' && !Number.isNaN(Date.parse(b.created_at)) ? Date.parse(b.created_at) : Date.now() - idx * 1000;
        const stable = appointmentStableKey(`${b?.appointment_date || ''}`.trim(), `${b?.appointment_time || ''}`.trim());
        return {
          id: `svc-${b?.id || createdAt}-${idx}`,
          date: `${b?.appointment_date || ''}`.trim(),
          time: formatTimeDisplay(b?.appointment_time),
          time_raw: `${b?.appointment_time || ''}`.trim(),
          type: extractTypeLabel(b?.service_type || b?.type || 'Service Booking'),
          mode: (b?.notes && typeof b.notes === 'string' && b.notes.includes('[VIDEO]')) ? 'Video Call' : 'In-person',
          status: stable && localCancelled.has(stable) ? 'Cancelled' : `${b?.status || 'Pending'}`.trim(),
          category: `${b?.category || ''}`.trim(),
          paymentMethod: `${b?.payment_method || ''}`.trim(),
          createdAt,
          source: 'service_appointment',
          raw: b,
        };
      });

      const fromAppointments = (apptRes.data || []).map((b, idx) => {
        const createdAt = typeof b?.created_at === 'string' && !Number.isNaN(Date.parse(b.created_at)) ? Date.parse(b.created_at) : Date.now() - idx * 1000;
        const modeRaw = `${b?.consultation_mode || ''}`.toLowerCase().trim();
        const isVideo = modeRaw === 'video' || normalizeText(b?.service_type || b?.reason).includes('video');
        const stable = appointmentStableKey(`${b?.appointment_date || ''}`.trim(), `${b?.appointment_time || ''}`.trim());
        return {
          id: `appt-${b?.id || createdAt}-${idx}`,
          date: `${b?.appointment_date || ''}`.trim(),
          time: formatTimeDisplay(b?.appointment_time),
          time_raw: `${b?.appointment_time || ''}`.trim(),
          type: extractTypeLabel(b?.service_type || b?.reason || 'Appointment'),
          mode: isVideo ? 'Video Call' : 'In-person',
          status: stable && localCancelled.has(stable) ? 'Cancelled' : `${b?.status || 'Approved'}`.trim(),
          category: `${b?.category || b?.reason || ''}`.trim(),
          paymentMethod: `${b?.payment_method || ''}`.trim(),
          createdAt,
          source: 'appointments',
          raw: b,
        };
      });

      const fromApprovalRequests = (approvalRes.data || []).map((b, idx) => {
        const createdAt = typeof b?.created_at === 'string' && !Number.isNaN(Date.parse(b.created_at)) ? Date.parse(b.created_at) : Date.now() - idx * 1000;
        const reason = `${b?.reason || ''}`.trim();
        const isVideo = normalizeText(reason).includes('payref:') || normalizeText(reason).includes('[video]') || normalizeText(reason).includes('video');
        const stable = appointmentStableKey(`${b?.requested_date || ''}`.trim(), `${b?.requested_time || ''}`.trim());
        return {
          id: `req-${b?.id || createdAt}-${idx}`,
          date: `${b?.requested_date || ''}`.trim(),
          time: formatTimeDisplay(b?.requested_time),
          time_raw: `${b?.requested_time || ''}`.trim(),
          type: extractTypeLabel(reason || 'Appointment Request'),
          mode: isVideo ? 'Video Call' : 'In-person',
          status: stable && localCancelled.has(stable) ? 'Cancelled' : `${b?.status || 'Pending Approval'}`.trim(),
          category: '',
          paymentMethod: '',
          createdAt,
          source: 'appointment_approval_requests',
          raw: b,
        };
      });

      const sourceRank = (src) => (src === 'appointments' ? 3 : src === 'appointment_approval_requests' ? 2 : 1);
      const statusRank = (st) => {
        const b = statusBucket(st);
        if (b === 'Cancelled') return 4;
        if (b === 'Completed') return 3;
        if (b === 'Pending') return 2;
        return 1;
      };
      const mergedMap = new Map();
      [...fromService, ...fromApprovalRequests, ...fromAppointments].forEach((it) => {
        const key = stableHistoryKey(it);
        const prev = mergedMap.get(key);
        if (!prev) {
          mergedMap.set(key, it);
          return;
        }
        const rPrev = sourceRank(prev?.source);
        const rNew = sourceRank(it?.source);
        if (rNew > rPrev) {
          mergedMap.set(key, it);
          return;
        }
        if (rNew === rPrev && statusRank(it?.status) > statusRank(prev?.status)) {
          mergedMap.set(key, it);
          return;
        }
      });

      const list = Array.from(mergedMap.values()).filter((x) => `${x?.date || ''}`.trim());
      list.sort((a, b) => {
        const ak = `${a?.date || ''} ${a?.time_raw || ''}`.trim();
        const bk = `${b?.date || ''} ${b?.time_raw || ''}`.trim();
        if (ak < bk) return 1;
        if (ak > bk) return -1;
        return (b?.createdAt || 0) - (a?.createdAt || 0);
      });

      setHistoryItems(list);
    } catch (e) {
      Alert.alert('Error', `${e?.message || e || 'Failed to load history.'}`.trim());
      setHistoryItems([]);
    } finally {
      setLoading(false);
    }
  }, [
    appointmentStableKey,
    extractTypeLabel,
    formatTimeDisplay,
    loadLocalCancelledSet,
    looksLikeUuid,
    normalizeText,
    stableHistoryKey,
    statusBucket,
  ]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const run = async () => {
        if (!active) return;
        await loadHistory();
      };
      run();
      return () => {
        active = false;
      };
    }, [loadHistory]),
  );

  useEffect(() => {
    let channel;
    (async () => {
      const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
      if (!email) return;
      channel = supabase
        .channel(`patient-history-${email}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => loadHistory())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointment_approval_requests' }, () => loadHistory())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'service_appointment' }, () => loadHistory())
        .subscribe();
    })();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadHistory]);

  const filtered = useMemo(() => {
    const list = Array.isArray(historyItems) ? historyItems : [];
    const q = normalizeText(search);
    const statusFilter = activeFilter;
    const byStatus =
      statusFilter === 'All'
        ? list
        : list.filter((it) => {
            const b = statusBucket(it?.status);
            return b === statusFilter;
          });
    if (!q) return byStatus;
    return byStatus.filter((it) => {
      const hay = [it?.type, it?.status, it?.mode, it?.date, it?.time, it?.category, it?.paymentMethod]
        .map((x) => normalizeText(x))
        .join(' ');
      return hay.includes(q);
    });
  }, [activeFilter, historyItems, normalizeText, search, statusBucket]);

  const counts = useMemo(() => {
    const list = Array.isArray(historyItems) ? historyItems : [];
    const res = { All: list.length, Pending: 0, Completed: 0, Cancelled: 0 };
    list.forEach((it) => {
      const b = statusBucket(it?.status);
      if (b === 'Pending') res.Pending += 1;
      else if (b === 'Cancelled') res.Cancelled += 1;
      else res.Completed += 1;
    });
    return res;
  }, [historyItems, statusBucket]);

  const pageSize = 12;
  const pageCount = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length]);
  const pageClamped = Math.min(Math.max(page, 0), pageCount - 1);
  const sliceStart = pageClamped * pageSize;
  const pageItems = useMemo(() => filtered.slice(sliceStart, sliceStart + pageSize), [filtered, sliceStart]);

  useEffect(() => {
    setPage(0);
  }, [activeFilter, search]);

  const renderFilterChip = (label) => {
    const active = activeFilter === label;
    const count = counts?.[label] ?? 0;
    return (
      <TouchableOpacity
        key={label}
        onPress={() => setActiveFilter(label)}
        activeOpacity={0.85}
        style={[styles.filterChip, active ? styles.filterChipActive : null]}
      >
        <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>{label}</Text>
        <View style={[styles.filterCountBadge, active ? styles.filterCountBadgeActive : null]}>
          <Text style={[styles.filterCountText, active ? styles.filterCountTextActive : null]}>{count}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const Root = embedded ? View : SafeAreaView;

  return (
    <Root style={styles.container}>
      {!embedded ? (
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialCommunityIcons name="history" size={24} color={THEME_ORANGE} />
            <Text style={styles.headerTitle}>Appointment History</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={loadHistory} activeOpacity={0.85} style={styles.refreshBtn}>
              <Feather name="refresh-cw" size={16} color="#0f172a" />
            </TouchableOpacity>
          </View>
          <Text style={styles.headerSubtitle}>Search and filter your appointments.</Text>
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <Feather name="search" size={16} color="#6b7280" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search service, status, date…"
          placeholderTextColor="#9ca3af"
          style={styles.searchInput}
          autoCorrect={false}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x-circle" size={18} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        alwaysBounceHorizontal={false}
        overScrollMode="never"
        nestedScrollEnabled
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {['All', 'Pending', 'Completed', 'Cancelled'].map(renderFilterChip)}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={THEME_ORANGE} />
          <Text style={styles.loadingText}>Loading history…</Text>
        </View>
      ) : null}

      <FlatList
        data={pageItems}
        keyExtractor={(it) => `${it?.id || ''}`}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: embedded ? 20 : 110 }}
        renderItem={({ item }) => {
          const bucket = statusBucket(item?.status);
          const badge = statusBadgeStyle(bucket);
          return (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item?.type || 'Appointment'}
                </Text>
                <Text style={styles.cardSubtitle} numberOfLines={2}>
                  {[item?.date, item?.time, item?.mode].filter(Boolean).join(' • ')}
                </Text>
              </View>
              <View style={styles.cardRight}>
                <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                  <Feather name={badge.icon} size={14} color={badge.fg} />
                  <Text style={[styles.statusText, { color: badge.fg }]}>{bucket}</Text>
                </View>
                {bucket === 'Cancelled' ? (
                  <TouchableOpacity
                    style={styles.reappointBtn}
                    onPress={() => startReappointment(item)}
                    activeOpacity={0.85}
                  >
                    <Feather name="repeat" size={14} color="#0f172a" />
                    <Text style={styles.reappointBtnText}>Re-appoint</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {activeFilter === 'All' && !search ? 'No appointments yet.' : 'No appointments found.'}
          </Text>
        }
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.paginationBar, embedded ? styles.paginationBarEmbedded : null]}>
        <TouchableOpacity
          style={[styles.pageBtn, pageClamped <= 0 ? styles.pageBtnDisabled : null]}
          onPress={() => setPage((p) => Math.max(0, p - 1))}
          disabled={pageClamped <= 0}
          activeOpacity={0.85}
        >
          <Feather name="chevron-left" size={18} color={pageClamped <= 0 ? '#9ca3af' : '#0f172a'} />
          <Text style={[styles.pageBtnText, pageClamped <= 0 ? styles.pageBtnTextDisabled : null]}>Prev</Text>
        </TouchableOpacity>

        <Text style={styles.pageInfoText}>{filtered.length ? `Page ${pageClamped + 1} of ${pageCount}` : 'Page 1 of 1'}</Text>

        <TouchableOpacity
          style={[styles.pageBtn, pageClamped >= pageCount - 1 ? styles.pageBtnDisabled : null]}
          onPress={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          disabled={pageClamped >= pageCount - 1}
          activeOpacity={0.85}
        >
          <Text style={[styles.pageBtnText, pageClamped >= pageCount - 1 ? styles.pageBtnTextDisabled : null]}>Next</Text>
          <Feather name="chevron-right" size={18} color={pageClamped >= pageCount - 1 ? '#9ca3af' : '#0f172a'} />
        </TouchableOpacity>
      </View>
    </Root>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  headerSubtitle: { marginTop: 6, color: '#64748b', fontWeight: '700' },
  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginHorizontal: 16,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 0,
  },
  filterScroll: { marginHorizontal: 16, marginBottom: 10, maxHeight: 56, alignSelf: 'flex-start' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 28, paddingVertical: 2 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignSelf: 'flex-start',
  },
  filterChipActive: {
    backgroundColor: '#ffedd5',
    borderColor: '#fdba74',
  },
  filterChipText: { fontWeight: '900', fontSize: 12, color: '#0f172a' },
  filterChipTextActive: { color: '#9a3412' },
  filterCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  filterCountBadgeActive: { backgroundColor: '#fed7aa' },
  filterCountText: { fontWeight: '900', fontSize: 12, color: '#0f172a' },
  filterCountTextActive: { color: '#9a3412' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  loadingText: { color: '#6b7280', fontWeight: '800' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardLeft: { flex: 1, paddingRight: 10 },
  cardRight: { alignItems: 'flex-end', gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  cardSubtitle: { marginTop: 6, color: '#64748b', fontWeight: '800', fontSize: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 },
  statusText: { fontWeight: '900', fontSize: 12 },
  reappointBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reappointBtnText: { fontWeight: '900', fontSize: 12, color: '#0f172a' },
  emptyText: { paddingHorizontal: 16, paddingTop: 20, color: '#6b7280', fontWeight: '800' },
  paginationBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 85,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  pageBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#f1f5f9' },
  pageBtnDisabled: { backgroundColor: '#f8fafc' },
  pageBtnText: { fontWeight: '900', fontSize: 12, color: '#0f172a' },
  pageBtnTextDisabled: { color: '#9ca3af' },
  pageInfoText: { fontWeight: '900', fontSize: 12, color: '#475569' },
  paginationBarEmbedded: {
    position: 'relative',
    left: 0,
    right: 0,
    bottom: 0,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
  },
});
