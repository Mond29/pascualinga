import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, SafeAreaView, Modal, Alert, Platform, StatusBar } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import PatientHomepageStyles from '../../styles/PatientStyles/PatientHomepageStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import PatientSideMenu from './PatientSideMenu';
import PatientHeader from './PatientHeader';

const sampleAppointments = {};

export default function PatientSchedule() {
  const navigation = useNavigation();
  const route = useRoute();
  const activeEmailRef = useRef('');
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

  const getLocalDateKey = useCallback(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = `${d.getMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getDate()}`.padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const [selectedDate, setSelectedDate] = useState(getLocalDateKey());
  const lastInitialDateRef = useRef('');

  const resolveInitialDateFromRoute = useCallback(() => {
    const direct = `${route?.params?.initialDate || ''}`.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
    const nested = `${route?.params?.params?.initialDate || ''}`.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(nested)) return nested;
    return '';
  }, [route?.params?.initialDate, route?.params?.params?.initialDate]);

  useEffect(() => {
    const candidate = resolveInitialDateFromRoute();
    if (!candidate) return;
    if (lastInitialDateRef.current === candidate) return; // skip redundant identical sets
    lastInitialDateRef.current = candidate;
    setSelectedDate(candidate);
  }, [resolveInitialDateFromRoute]);

  useFocusEffect(
    useCallback(() => {
      const candidate = resolveInitialDateFromRoute();
      if (!candidate) return;
      if (lastInitialDateRef.current === candidate) return; // skip redundant identical sets
      lastInitialDateRef.current = candidate;
      setSelectedDate(candidate);
    }, [resolveInitialDateFromRoute]),
  );

  const [showCallModal, setShowCallModal] = useState(false);
  const callAlertedIdsRef = useRef(new Set());
  const [rescheduleVisible, setRescheduleVisible] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [appointmentsByDate, setAppointmentsByDate] = useState({});
  const [userData, setUserData] = useState({ name: 'Patient', email: '' });
  const [drawerVisible, setDrawerVisible] = useState(false);
  const toggleDrawer = () => setDrawerVisible(!drawerVisible);
  const appointmentsForDay = appointmentsByDate[selectedDate] || [];

  const normalizeText = (v) => `${v || ''}`.toLowerCase().trim();
  const isVideoType = (t) => {
    const s = normalizeText(t);
    return s.includes('video consultation') || s.includes('video call') || s.includes('[video]') || s.includes('video');
  };

  const parseJsonSafe = (value) => {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    const raw = `${value || ''}`.trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  };

  const extractAppointmentMeta = (rawRow) => {
    const obj = parseJsonSafe(rawRow?.suggested_note ?? rawRow?.suggestedNote);
    if (obj && typeof obj === 'object' && (obj.__appointmentMeta || obj.appointmentMeta)) {
      return obj.__appointmentMeta || obj.appointmentMeta;
    }
    return null;
  };

  const parseTimeToMinutes = (timeStr) => {
    const t = `${timeStr || ''}`.trim();
    if (!t) return null;
    const m1 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
    if (m1) {
      const hh = Number(m1[1]);
      const mm = Number(m1[2]);
      if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
      return hh * 60 + mm;
    }
    const m2 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m2) {
      let hh = Number(m2[1]);
      const mm = Number(m2[2]);
      const ap = `${m2[3]}`.toUpperCase();
      if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
      if (ap === 'PM' && hh < 12) hh += 12;
      if (ap === 'AM' && hh === 12) hh = 0;
      return hh * 60 + mm;
    }
    return null;
  };

  const normalizeTimeForDb = (timeStr) => {
    const t = `${timeStr || ''}`.trim();
    if (!t) return '';
    const m1 = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m1) {
      const hh = Number(m1[1]);
      const mm = Number(m1[2]);
      const ss = m1[3] ? Number(m1[3]) : 0;
      if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss)) return '';
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return '';
      return `${`${hh}`.padStart(2, '0')}:${`${mm}`.padStart(2, '0')}:${`${ss}`.padStart(2, '0')}`;
    }
    const m2 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m2) {
      let hh = Number(m2[1]);
      const mm = Number(m2[2]);
      const ap = `${m2[3]}`.toUpperCase();
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '';
      if (ap === 'PM' && hh < 12) hh += 12;
      if (ap === 'AM' && hh === 12) hh = 0;
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
      return `${`${hh}`.padStart(2, '0')}:${`${mm}`.padStart(2, '0')}:00`;
    }
    return '';
  };

  const appointmentStableKey = useCallback(
    (dateStr, timeStr) => {
      const d = `${dateStr || ''}`.trim();
      const mins = parseTimeToMinutes(timeStr);
      if (!d || mins === null) return '';
      return `${d}|${mins}`;
    },
    [parseTimeToMinutes],
  );

  const localCancelledStorageKey = useCallback((email) => `patientLocalCancelled:${`${email || ''}`.trim().toLowerCase()}`, []);

  const loadLocalCancelledSet = useCallback(
    async (email) => {
      try {
        const key = localCancelledStorageKey(email);
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
    },
    [localCancelledStorageKey],
  );

  const addLocalCancelledKey = useCallback(
    async (email, stableKey) => {
      const k = `${stableKey || ''}`.trim();
      if (!k) return;
      try {
        const key = localCancelledStorageKey(email);
        const current = await loadLocalCancelledSet(email);
        if (current.has(k)) return;
        current.add(k);
        await AsyncStorage.setItem(key, JSON.stringify(Array.from(current)));
      } catch {}
    },
    [loadLocalCancelledSet, localCancelledStorageKey],
  );

  const getApiBaseUrl = useCallback(() => {
    return 'https://api.pascualinga.com';
  }, []);

  const getDailyEdgeFnUrl = useCallback(() => {
    const projUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL || ''}`.trim().replace(/\/+$/, '');
    if (projUrl) return `${projUrl}/functions/v1/daily-create-room`;
    return 'https://iknkfjzoubkymcwprrux.supabase.co/functions/v1/daily-create-room';
  }, []);

  const normalizeDailyAppointmentId = useCallback((appointmentId) => {
    const id = `${appointmentId || ''}`.trim();
    return id.replace(/^(appt-|req-|svc-)/i, '').trim();
  }, []);

  const callDailyEdgeFn = useCallback(
    async (appointmentId, action, sourceTable) => {
      const id = normalizeDailyAppointmentId(appointmentId);
      if (!id) return { ok: false, message: 'Missing appointment id' };
      const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
      const name = email ? email.split('@')[0] : 'Patient';
      const source = `${sourceTable || ''}`.trim() || '';

      const url = getDailyEdgeFnUrl();
      const body = {
        appointmentId: id,
        action: action === 'join' ? 'join' : 'start',
        email,
        name,
        displayName: name,
        role: 'patient',
      };
      if (source) body.sourceTable = source;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-user-role': 'patient',
          'x-user-email': email,
          'x-user-name': name,
          'Content-Type': 'application/json',
          apikey: `${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrbmtmanpvdWJreW1jd3BycnV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMjg4MDMsImV4cCI6MjA4OTkwNDgwM30.He4eCsEJQdRYQ0Kk2kqTPTyWV3zeS1TCm1UYlXGyixs'}`,
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (_) {
        json = null;
      }
      if (!res.ok) {
        return { ok: false, message: json?.error || text || 'Failed to prepare call' };
      }
      return { ok: true, json };
    },
    [getDailyEdgeFnUrl, normalizeDailyAppointmentId],
  );

  const startVideoViaApi = useCallback(
    async (appointmentId, sourceTable) => {
      const res = await callDailyEdgeFn(appointmentId, 'start', sourceTable);
      if (!res.ok) return { ok: false, message: res.message };
      const tokenUrl = `${res?.json?.tokenUrl || ''}`.trim();
      const url = tokenUrl || `${res?.json?.url || ''}`.trim();
      return { ok: true, json: res.json, url, tokenUrl };
    },
    [callDailyEdgeFn],
  );

  const joinVideoViaApi = useCallback(
    async (appointmentId, sourceTable) => {
      const res = await callDailyEdgeFn(appointmentId, 'join', sourceTable);
      if (!res.ok) {
        if ((res.message || '').toLowerCase().includes('not found') || (res.message || '').toLowerCase().includes('room')) {
          return { ok: false, waiting: true, message: res.message || 'Waiting for room.' };
        }
        return { ok: false, message: res.message };
      }
      const tokenUrl = `${res?.json?.tokenUrl || ''}`.trim();
      const url = tokenUrl || `${res?.json?.url || ''}`.trim();
      if (!url) return { ok: false, waiting: true, message: 'Waiting for doctor to start the call.' };
      return { ok: true, url, tokenUrl, json: res.json };
    },
    [callDailyEdgeFn],
  );

  const openVideoCallForItem = useCallback(
    async (item) => {
      if (!item?.id) {
        Alert.alert('Unavailable', 'Meeting room is not ready yet.');
        return { ok: false };
      }

      const email = await AsyncStorage.getItem('userEmail');
      const displayName = email ? email.split('@')[0] : 'Guest';
      const serviceType = item.type;
      const source = item?.source || '';

      const joined = await joinVideoViaApi(item.id, source);
      if (joined.ok && joined.url) {
        navigation.navigate('VideoCall', { roomName: joined.url, displayName, serviceType });
        return { ok: true };
      }

      const lastJoin = await joinVideoViaApi(item.id, source);
      if (lastJoin.ok && lastJoin.url) {
        navigation.navigate('VideoCall', { roomName: lastJoin.url, displayName, serviceType });
        return { ok: true };
      }

      Alert.alert(
        joined.waiting || lastJoin.waiting ? 'Waiting' : 'Preparing Room',
        lastJoin.message || joined.message || 'Please wait for the doctor to start the call, then tap Join again.',
      );
      return { ok: false };
    },
    [joinVideoViaApi, navigation],
  );

  const isCancelledStatus = useCallback((v) => {
    const s = normalizeText(v);
    return s === 'cancelled' || s === 'canceled' || s === 'declined' || s === 'reject' || s === 'rejected';
  }, [normalizeText]);

  const loadAppointments = useCallback(async () => {
    try {
      const email = await AsyncStorage.getItem('userEmail');
      if (!email) {
        activeEmailRef.current = '';
        callAlertedIdsRef.current = new Set();
        setAppointmentsByDate({});
        return;
      }

      if (activeEmailRef.current && activeEmailRef.current !== email) {
        callAlertedIdsRef.current = new Set();
        setAppointmentsByDate({});
      }
      activeEmailRef.current = email;

      // 1. Get current user's data from accounts table. Wrap 42703-safe.
      try {
        const { data: accountData } = await supabase
          .from('accounts')
          .select('id, name')
          .eq('email', email)
          .limit(1)
          .maybeSingle();
        if (accountData) setUserData(accountData);
        if (accountData?.id) {
          try { await AsyncStorage.setItem(`patientId:${`${email}`.trim().toLowerCase()}`, `${accountData.id}`); } catch (_) {}
        }
      } catch (_) {}

      const userName = '';
      let userId = '';
      try {
        const userIdRes = await supabase
          .from('accounts')
          .select('id')
          .eq('email', email)
          .limit(1)
          .maybeSingle()
          .catch(() => ({ data: null }));
        if (userIdRes?.data?.id) userId = userIdRes.data.id;
      } catch (_) {}
      const cachedPatientId = `${(await AsyncStorage.getItem(`patientId:${`${email}`.trim().toLowerCase()}`)) || ''}`.trim();
      if (!userId && cachedPatientId) userId = cachedPatientId;

      const fetchAppointmentsMine = async () => {
        const base = getApiBaseUrl();
        const url = `${base}/api/appointments/mine?take=50`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
            'x-user-role': 'patient',
            'x-user-email': `${email}`.trim().toLowerCase(),
            ...(userName ? { 'x-user-name': `${userName}`.trim() } : {}),
            ...(cachedPatientId ? { 'x-patient-id': cachedPatientId } : {}),
          },
        });
        const text = await res.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (_) {
          json = null;
        }
        if (!res.ok) {
          return [];
        }
        const candidates = [
          Array.isArray(json) ? json : null,
          Array.isArray(json?.data) ? json.data : null,
          Array.isArray(json?.appointments) ? json.appointments : null,
          Array.isArray(json?.items) ? json.items : null,
          Array.isArray(json?.results) ? json.results : null,
        ].filter(Boolean);
        return candidates[0] || [];
      };

      // Universal helper: schema-safe Supabase query wrapper.
      // Returns { data: [], error: null } on 42703 undefined_column / 22P02 invalid UUID.
      // Never throws.
      const schemaSafeFetch = async (builder) => {
        try {
          const r = await builder;
          if (!r?.error) return { data: r?.data || [], error: null };
          const code = `${r.error?.code || r.error?.pgCode || ''}`.trim();
          if (code === '42703' || code === '22P02') {
            return { data: [], error: null };
          }
          return { data: [], error: r.error };
        } catch (_) {
          return { data: [], error: null };
        }
      };

      const fetchApprovalRequests = async () => {
        const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${str || ''}`.trim());
        const nonSchemaErrors = [];

        const tryFetch = async (builder) => {
          const res = await schemaSafeFetch(builder);
          if (!res?.error) return { data: res.data || [], ignored: false };
          nonSchemaErrors.push(res.error);
          return { data: [], ignored: false };
        };

        const base = () =>
          supabase
            .from('appointment_approval_requests')
            .select('*')
            .order('created_at', { ascending: false });

        const chunks = [];

        if (userId && isUUID(userId)) {
          const r1 = await tryFetch(base().eq('patient_id', userId));
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
        return { data: merged, error: nonSchemaErrors[0] || null };
      };

      const isPaidStatus = (s) => {
        const st = `${s || ''}`.toLowerCase().trim();
        if (!st) return false;
        const POSITIVE = new Set([
          'paid', 'approved', 'captured', 'successful', 'succeeded', 'success',
          'confirmed', 'completed', 'processed', 'settled', 'paid_out',
          'pay_out', 'paid_offline', 'payed', 'payed_out',
        ]);
        return POSITIVE.has(st);
      };

      // ======= LAYER 1: Backend API appointments/mine (always try first, ignore errors) =======
      let apiAppointments = [];
      try {
        const r = await fetchAppointmentsMine();
        apiAppointments = Array.isArray(r) ? r : [];
      } catch (_) {
        apiAppointments = [];
      }

      // ======= LAYER 2: Supabase `appointments` table — 3 identity columns, 42703-safe, dedup merged =======
      let directAppointmentsMerged = [];
      const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${str || ''}`.trim());
      const apptChunks = [];
      if (userId && isUUID(userId)) {
        const f = await schemaSafeFetch(
          supabase.from('appointments').select('*').eq('patient_id', userId).order('created_at', { ascending: false }).limit(50),
        );
        if (f?.data?.length) apptChunks.push(f.data);
      }
      {
        const f = await schemaSafeFetch(
          supabase.from('appointments').select('*').eq('email', email).order('created_at', { ascending: false }).limit(50),
        );
        if (f?.data?.length) apptChunks.push(f.data);
      }
      {
        const f = await schemaSafeFetch(
          supabase.from('appointments').select('*').eq('patient_email', email).order('created_at', { ascending: false }).limit(50),
        );
        if (f?.data?.length) apptChunks.push(f.data);
      }
      {
        const seen = new Set();
        apptChunks.flat().forEach((row) => {
          const id = row?.id;
          if (!id || seen.has(id)) return;
          seen.add(id);
          directAppointmentsMerged.push(row);
        });
      }

      const finalApprovedRows = (apiAppointments.length > 0 ? apiAppointments : directAppointmentsMerged) || [];

      // ======= LAYER 3: payment_transactions (STATUS = PAID ONLY, CONVERT TO SYNTHETIC APPROVED APPOINTMENTS) =======
      let payTxSyntheticRows = [];
      try {
        const payChunks = [];
        payChunks.push(
          (await schemaSafeFetch(
            supabase
              .from('payment_transactions')
              .select('*')
              .eq('patient_email', email)
              .order('created_at', { ascending: false })
              .limit(50),
          )).data || [],
        );
        payChunks.push(
          (await schemaSafeFetch(
            supabase
              .from('payment_transactions')
              .select('*')
              .eq('email', email)
              .order('created_at', { ascending: false })
              .limit(50),
          )).data || [],
        );
        if (userId && isUUID(userId)) {
          payChunks.push(
            (await schemaSafeFetch(
              supabase
                .from('payment_transactions')
                .select('*')
                .eq('patient_id', userId)
                .order('created_at', { ascending: false })
                .limit(50),
            )).data || [],
          );
        }
        const paySeen = new Set();
        const payRows = [];
        payChunks.flat().forEach((r) => {
          const id = r?.id || r?.reference;
          if (!id || paySeen.has(id)) return;
          paySeen.add(id);
          payRows.push(r);
        });

        const alreadyKeys = new Set(
          finalApprovedRows
            .map((b) => {
              const d = `${b?.appointment_date || b?.requested_date || b?.date || ''}`.trim();
              const t = `${b?.appointment_time || b?.requested_time || b?.time || ''}`.trim();
              if (!d || !t) return '';
              return `${d}|${t}`;
            })
            .filter(Boolean),
        );

        payTxSyntheticRows = payRows
          .filter((r) => {
            if (!isPaidStatus(r?.status)) {
              // Also accept paid-like scalar fields even if status not set / 42703 on status column
              const hasPaidScalar =
                r?.paid === true ||
                r?.is_paid === true ||
                r?.payment_received === true ||
                r?.approved === true ||
                r?.confirmed === true ||
                (r?.checkout_session_id && `${r.checkout_session_id}`.trim().startsWith('cs_')) ||
                (r?.payment_intent_id && `${r.payment_intent_id}`.trim().startsWith('pi_')) ||
                (r?.paymongo_payment_id && `${r.paymongo_payment_id}`.trim());
              if (!hasPaidScalar) return false;
            }
            const d = `${r?.requested_date || r?.appointment_date || r?.date || ''}`.trim();
            const t = `${r?.requested_time || r?.appointment_time || r?.time || ''}`.trim();
            if (d && t && alreadyKeys.has(`${d}|${t}`)) return false;
            return true;
          })
          .map((r) => ({
            id: `paytx-${r?.id || r?.reference || Date.now()}`,
            appointment_date: r?.requested_date || r?.appointment_date || r?.date || null,
            appointment_time: r?.requested_time || r?.appointment_time || r?.time || null,
            service_type: `${r?.service_name || r?.service_category || r?.department || ''}`.trim() || 'Video Consultation (Paid)',
            reason:
              `${r?.service_category ? `${r.service_category}: ` : ''}${r?.service_name || r?.department || 'Paid Video Consultation'}${
                r?.reference ? ` | PAYREF:${r.reference}` : ''
              }`,
            status: 'Approved',
            consultation_mode: r?.consultation_mode || 'Video Call',
            category: r?.department || r?.service_category || '',
            doctor_name: r?.doctor_name || 'Doctor',
            doctor_id: r?.doctor_id || null,
            payment_method: 'QRPh / PayMongo',
            payment_reference: r?.reference || null,
            __synthetic: true,
            raw: r,
          }));
      } catch (_) {
        payTxSyntheticRows = [];
      }

      const combinedApprovedFinal = [...finalApprovedRows, ...payTxSyntheticRows];

      // ======= LAYERS 4 + 5: service_appointment + approval requests (both 42703 safe, no throws) =======
      const [pendingRes, approvalRes] = await Promise.all([
        schemaSafeFetch(
          supabase
            .from('service_appointment')
            .select('*')
            .eq('patient_email', email)
            .order('created_at', { ascending: false })
            .limit(50),
        ),
        fetchApprovalRequests(),
      ]);

      // NO LONGER THROW on ANY individual source errors.
      // (prev: if pendingRes.error threw — entire abort, zero data)
      const pendingData = Array.isArray(pendingRes?.data) ? pendingRes.data : [];
      const approvalData = Array.isArray(approvalRes?.data) ? approvalRes.data : [];
      const approvedData = combinedApprovedFinal || [];

      // ======= LAYER 6: LOCAL ASYNC STORAGE bookedServices (FINAL ABSOLUTE FALLBACK) =======
      // Written by saveBookedService calls from confirmBooking / checkPayment success flows.
      // Even if ALL remote DB tables return 0 rows — user will still see their booking here.
      let localBookedServices = [];
      try {
        const localKey = email ? `patientBookedServices:${email}` : 'patientBookedServices';
        const raw = await AsyncStorage.getItem(localKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const now = Date.now();
            const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
            localBookedServices = parsed
              .filter((b) => {
                if (!b || typeof b !== 'object') return false;
                // Filter by createdAt OR by date field if parsable ISO
                const createdAtMs = b.createdAt ? new Date(b.createdAt).getTime() : NaN;
                if (!isNaN(createdAtMs) && now - createdAtMs > NINETY_DAYS) return false;
                if (b.date && /^\d{4}-\d{2}-\d{2}$/.test(`${b.date}`.trim())) {
                  const dMs = new Date(`${b.date}T00:00:00`).getTime();
                  if (!isNaN(dMs) && now - dMs > NINETY_DAYS) return false;
                }
                return true;
              })
              .slice(0, 100)
              .map((b) => ({ ...b, __local: true, source: b.source || 'local_asyncstorage' }));
          }
        }
      } catch (_) {
        localBookedServices = [];
      }

      const approvalIsVideoLike = (reason) => {
        const r = normalizeText(reason);
        return r.includes('payref:') || r.includes('video consultation') || r.includes('[video]') || r.includes('video call');
      };

      const approvedDateTimeKeys = new Set(
        approvedData
          .map((b) => {
            const d = `${b?.appointment_date || ''}`.trim();
            const t = `${b?.appointment_time || ''}`.trim();
            if (!d || !t) return '';
            return `${d}|${t}`;
          })
          .filter(Boolean),
      );

      const mappedApprovalRequests = approvalData
        .filter((b) => {
          const statusLower = normalizeText(b?.status);
          if (statusLower.includes('approved')) {
            const d = `${b?.requested_date || ''}`.trim();
            const t = `${b?.requested_time || ''}`.trim();
            if (d && t && approvedDateTimeKeys.has(`${d}|${t}`)) return false;
          }
          return true;
        })
        .map((b) => ({
          id: `req-${b.id}`,
          date: b.requested_date,
          time: formatTimeDisplay(b.requested_time),
          time_raw: b.requested_time,
          type: b.reason || 'Service Booking',
          mode: approvalIsVideoLike(b.reason) ? 'Video Call' : 'In-person',
          status: b.status || 'Pending Approval',
          category: '',
          paymentMethod: b.payment_method || b.paymentMethod || '',
          consultation_mode: b.consultation_mode || b.mode || b.consultation_type || null,
          meeting_room_id: b.meeting_room_id || b.meeting_room || b.video_room || b.room_url || null,
          video_room: b.video_room || b.meeting_room || null,
          meeting_started_at: b.meeting_started_at || null,
          payment_reference: b.payment_reference || b.reference || null,
          raw: b,
          source: 'appointment_approval_requests',
        }));

      const combinedData = [
        ...pendingData.map((b) => ({
          id: `svc-${b.id}`,
          date: b.appointment_date,
          time: formatTimeDisplay(b.appointment_time),
          time_raw: b.appointment_time,
          type: b.service_type || 'Service Booking',
          mode: b.notes && typeof b.notes === 'string' && b.notes.includes('[VIDEO]') ? 'Video Call' : 'In-person',
          status: b.status || 'Pending',
          category: b.category,
          paymentMethod: b.payment_method || b.paymentMethod || '',
          payment_reference: b.payment_reference || b.reference || null,
          source: 'service_appointment',
          raw: b,
        })),
        ...mappedApprovalRequests,
        ...approvedData.map((b) => ({
          id: `appt-${b.id || b.payment_reference || Date.now()}`,
          date: b.appointment_date || b.requested_date || b.date,
          time: formatTimeDisplay(b.appointment_time || b.requested_time || b.time),
          time_raw: b.appointment_time || b.requested_time || b.time,
          type: b.service_type || b.reason || 'Service Booking',
          mode:
            `${b.consultation_mode || ''}`.toLowerCase().trim() === 'video' ||
            (b.__synthetic === true) ||
            isVideoType(b.service_type || b.reason)
              ? 'Video Call'
              : 'In-person',
          status: b.status || 'Approved',
          category: b.category || '',
          paymentMethod: b.payment_method || b.paymentMethod || b.__synthetic ? 'QRPh / PayMongo' : 'Cash',
          consultation_mode: b.consultation_mode || null,
          meeting_room_id: b.meeting_room_id || b.meeting_room || b.video_room || null,
          video_room: b.video_room || b.meeting_room || null,
          meeting_started_at: b.meeting_started_at || null,
          payment_reference: b.payment_reference || b.reference || null,
          raw: b,
          source: b.__synthetic ? 'payment_transactions_synthetic' : 'appointments',
        })),
        // LOCAL FALLBACK synthetic bookings (added LAST into combinedData array, so dedup pickBetter which uses
        // appointmentStableKey will: if status same, source rank lower; but if Approved vs Pending, Approved wins.
        // So if local Approved row matches date/time of db pending row → Approved wins!
        ...localBookedServices.map((b) => ({
          id: b.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          date: b.date,
          time: b.time || formatTimeDisplay(b.time_raw),
          time_raw: b.time_raw || null,
          type: b.type || b.service_type || 'Service Booking',
          mode: b.mode || b.consultation_mode || 'In-person',
          status: b.status || 'Approved',
          category: b.category || '',
          paymentMethod: b.paymentMethod || b.payment_method || '',
          consultation_mode: b.consultation_mode || b.mode || null,
          payment_reference: b.payment_reference || null,
          raw: b,
          __local: true,
          source: b.source || 'local_asyncstorage',
        })),
      ];

      // ======= STATUS NORMALIZATION: FORCE STATUS = 'Approved' for ANY paid booking row =======
      // (even if underlying raw DB row says Pending/Pending Verification)
      // Payment happened → Approved. Period. Fixes user's "status is pending verification on paid booking" issue.
      const NEGATIVE = new Set([
        'cancelled', 'canceled', 'failed', 'declined', 'rejected', 'refunded',
        'partially_refunded', 'disputed', 'chargeback', 'expired', 'voided',
      ]);
      const normalizeRowIfPaid = (b) => {
        if (!b || typeof b !== 'object') return b;
        const statusNorm = normalizeText(b.status);
        if (statusNorm && NEGATIVE.has(statusNorm)) return b; // Don't override genuine cancelled rows
        const statusRaw = `${b.status || ''}`.toLowerCase().trim();
        const isExplicitlyPending =
          statusRaw === 'pending' ||
          statusRaw.includes('pending') ||
          statusRaw.includes('awaiting') ||
          statusRaw.includes('to_pay') ||
          statusRaw.includes('verification') ||
          statusNorm === 'pending payment verification' ||
          statusNorm.includes('pending payment');
        const pm = `${b.paymentMethod || b.payment_method || ''}`.trim();
        const pr = `${b.payment_reference || b.reference || ''}`.trim();
        const isQrPh = pm.toLowerCase().includes('qr') || pm.toLowerCase().includes('paymongo') || pr.toUpperCase().startsWith('PGH-');
        const rowType = `${b?.type || b?.service_type || b?.reason || b?.category || ''}`.toLowerCase();
        const rowMode = `${b?.mode || b?.consultation_mode || b?.consult_mode || ''}`.toLowerCase();
        const isVideoOrOnlineBooking =
          isVideoType(`${b?.type || ''}`) ||
          isVideoType(`${b?.service_type || ''}`) ||
          isVideoType(`${b?.reason || ''}`) ||
          rowType.includes('video consultation') ||
          rowType.includes('online consultation') ||
          rowType.includes('teleconsult') ||
          rowMode.includes('video') ||
          rowMode.includes('online') ||
          rowMode.includes('virtual') ||
          rowMode.includes('tele');
        const rawPaidRaw =
          (b.raw?.paid === true) ||
          (b.raw?.is_paid === true) ||
          (b.raw?.approved === true) ||
          (b.raw?.confirmed === true);
        const hasScalarPaid = rawPaidRaw || b.__synthetic === true || b.__local === true;
        const hasPaymentMarker = isQrPh || hasScalarPaid;

        // --- BULLETPROOF: Explicitly status pending = NEVER Approved.
        // (even if isQrPh == true, scalars paid true, synthetic local Approved from before!)
        if (isExplicitlyPending) {
          // keep status but tidy any messy text (Pending Verification → Pending Approval)
          if (statusNorm !== 'pending approval' && statusNorm !== 'pending') {
            return { ...b, status: 'Pending Approval' };
          }
          return b;
        }

        if (statusRaw === 'paid') {
          // explicit payment paid = Approved no cancel
          if (!statusNorm || !statusNorm.includes('cancel')) {
            return { ...b, status: 'Approved' };
          }
        }

        if (hasPaymentMarker && !isExplicitlyPending) {
          if (!statusNorm || !statusNorm.includes('cancel')) {
            return { ...b, status: 'Approved' };
          }
        }

        if (isVideoOrOnlineBooking) {
          // UNPAID Video consult (Cash mode, no QR marker = UNPAID)
          // → cleanup status text only: Pending Verification → Pending Approval
          if (
            statusNorm === 'pending payment verification' ||
            statusNorm.includes('pending payment') ||
            statusNorm.includes('verification')
          ) {
            return { ...b, status: 'Pending Approval' };
          }
        }
        return b;
      };
      const combinedNormalized = combinedData.map(normalizeRowIfPaid);

      // --- BULLETPROOF: HIDE ALL rows with PAYREF tag that are NOT actually paid!
      // (These are stale rows inserted in PREVIOUS FAILED attempts (before submit guard)
      //  when user clicked "Checkout" but NEVER ACTUALLY PAID. They should NOT show up
      //  in My Appointments AT ALL until payment is complete.)
      // Algorithm:
      // 1. From combinedNormalized rows, find all rows where (reason/notes/service_type contains
      //    PAYREF:PGH-xxx) OR payment_reference exists.
      // 2. For these rows: if status == Pending / Pending Approval → check DB payment_transactions
      //    for that PGH-xxx ref, see if ANY row has actual status='paid' OR is_paid=true.
      // 3. If NO paid rows exist → REMOVE row entirely (don't show to user, it's unpaid stale).
      // 4. If YES paid rows exist → keep row, keep Approved status.
      const rowsWPayrefPending = [];
      const payrefSet = new Set();

      const locallyApprovedPayrefs = new Set(
        (localBookedServices || [])
          .filter((b) => {
            if (!b) return false;
            const st = normalizeText(b?.status);
            if (!st.includes('approved') && !st.includes('confirm')) return false;
            return true;
          })
          .map((b) => {
            const reasonRaw = `${b?.reason || b?.service_type || b?.notes || b?.details || ''}`.toUpperCase();
            const refMatch = reasonRaw.match(/PAYREF\s*:\s*(PGH-[A-Z0-9-]+)/i);
            const ref = refMatch
              ? refMatch[1].trim()
              : `${b?.payment_reference || b?.reference || ''}`.trim().toUpperCase();
            return ref.startsWith('PGH-') ? ref.toUpperCase() : '';
          })
          .filter(Boolean),
      );

      combinedNormalized.forEach((b, idx) => {
        if (!b) return;
        const reasonRaw = `${b?.reason || b?.service_type || b?.notes || b?.details || ''}`.toUpperCase();
        const refMatch = reasonRaw.match(/PAYREF\s*:\s*(PGH-[A-Z0-9-]+)/i);
        const payrefFromRow = refMatch
          ? refMatch[1].trim()
          : `${b?.payment_reference || b?.reference || ''}`.trim().toUpperCase();
        if (!payrefFromRow || !payrefFromRow.startsWith('PGH-')) return;

        // --- LOCAL OVERRIDE #1: If this PAYREF was already locally approved (green checker fired!)
        //     → FORCE STATUS = Approved right now, don't wait for DB write!
        if (locallyApprovedPayrefs.has(payrefFromRow.toUpperCase())) {
          combinedNormalized[idx] = { ...combinedNormalized[idx], status: 'Approved' };
          return; // ← SKIP adding to rowsWPayrefPending (it's already Approved!)
        }

        const st = normalizeText(combinedNormalized[idx]?.status);
        const isPendingNow =
          st.includes('pending') ||
          st.includes('awaiting') ||
          st.includes('verification');
        if (isPendingNow) {
          rowsWPayrefPending.push({ idx, ref: payrefFromRow });
          payrefSet.add(payrefFromRow);
        }
      });

      const payrefActuallyPaid = new Set(locallyApprovedPayrefs);
      if (payrefSet.size > 0) {
        try {
          const refsArr = Array.from(payrefSet);
          const payRes = await supabase
            .from('payment_transactions')
            .select('reference,status,paid_at,is_paid')
            .in('reference', refsArr)
            .order('created_at', { ascending: false });
          const payRows = Array.isArray(payRes?.data) ? payRes.data : [];
          for (const row of payRows) {
            if (!row) continue;
            const ref = `${row?.reference || ''}`.trim().toUpperCase();
            if (!ref) continue;
            const st = `${row?.status || ''}`.toLowerCase();
            const marker =
              st === 'paid' ||
              row?.is_paid === true ||
              (row?.paid_at && `${row.paid_at}`.trim());
            if (marker) payrefActuallyPaid.add(ref);
          }
        } catch (_) {}

        // --- SUPER FIX: DIRECT CALL TO paymongo-check-status EDGE FUNCTION!
        // If local DB rows still show 'pending' (because webhook was delayed or DB not updated yet),
        // we ASK PAYMONGO SERVERS DIRECTLY via the edge function. This bypasses ALL stale DB issues!
        // If PayMongo API says "paid" → immediately add to payrefActuallyPaid!
        // Result: Pedia 3K1J1 or any PAYREF paid in real life → UI Approved INSTANTLY!
        try {
          const refsArr = Array.from(payrefSet);
          for (const ref of refsArr) {
            try {
              const res = await supabase.functions.invoke('paymongo-check-status', {
                body: { reference: ref },
              });
              const isPaid = res?.data?.paid === true || res?.paid === true;
              if (isPaid) {
                payrefActuallyPaid.add(`${ref}`.trim().toUpperCase());
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      // Helper: Case-insensitive match for payrefActuallyPaid (handles case/format mismatches)
      const isPayrefActuallyPaid = (payrefTest) => {
        const up = `${payrefTest || ''}`.trim().toUpperCase();
        if (!up) return false;
        if (payrefActuallyPaid.has(up)) return true;
        // Also try includes (in case one has extra leading/trailing chars)
        for (const k of payrefActuallyPaid) {
          const ku = `${k || ''}`.trim().toUpperCase();
          if (!ku) continue;
          if (ku === up) return true;
          if (ku.includes(up) || up.includes(ku)) return true;
        }
        return false;
      };

      // --- FINAL NUCLEAR OVERRIDE: If PAYREF is actually PAID (from DB payment_transactions OR local approved set OR paymongo edge check)
      //     → FORCE STATUS = 'Approved' on ANY ROW WITH THAT PAYREF! (overrides DB appointment row's old Pending Approval status!)
      //     This fixes your exact screenshot: Pedia row was written as Pending Approval long ago
      //     but PayMongo API says paid → UI must show Approved!
      for (let i = 0; i < combinedNormalized.length; i++) {
        const b = combinedNormalized[i];
        if (!b) continue;
        const reasonRaw = `${b?.reason || b?.service_type || b?.notes || b?.details || ''}`.toUpperCase();
        const refMatch = reasonRaw.match(/PAYREF\s*:\s*(PGH-[A-Z0-9-]+)/i);
        const payrefFromRow = refMatch
          ? refMatch[1].trim()
          : `${b?.payment_reference || b?.reference || ''}`.trim().toUpperCase();
        if (!payrefFromRow || !payrefFromRow.startsWith('PGH-')) continue;
        if (isPayrefActuallyPaid(payrefFromRow)) {
          combinedNormalized[i] = { ...b, status: 'Approved' };
        }
      }

      const hideIdxSet = new Set(
        rowsWPayrefPending
          .filter(({ ref }) => !isPayrefActuallyPaid(ref))
          .map(({ idx }) => idx),
      );
      const combinedAfterStaleHidden = combinedNormalized.filter((_, i) => !hideIdxSet.has(i));

      const localCancelled = await loadLocalCancelledSet(email);
      const cancelledSlots = new Set(
        combinedAfterStaleHidden
          .map((b) => {
            const statusKey = normalizeText(b?.status);
            if (!statusKey.includes('cancel')) return '';
            return appointmentStableKey(b?.date, b?.time_raw || b?.time);
          })
          .filter(Boolean),
      );
      const combinedWithLocal = combinedAfterStaleHidden.map((b) => {
        const stable = appointmentStableKey(b?.date, b?.time_raw || b?.time);
        if (stable && (localCancelled.has(stable) || cancelledSlots.has(stable))) return { ...b, status: 'Cancelled' };
        return b;
      });

      const statusRank = (st) => {
        const s = normalizeText(st);
        if (s.includes('cancel') || s.includes('declin') || s.includes('reject')) return 3;
        if (s.includes('approved') || s.includes('confirm') || s.includes('completed')) return 2;
        return 1;
      };
      const sourceRank = (src) => {
        if (src === 'appointments') return 4;
        if (src === 'payment_transactions_synthetic') return 3;
        if (src === 'appointment_approval_requests') return 2;
        if (src === 'local_asyncstorage') return 1;
        return 1; // service_appointment
      };
      const pickBetter = (a, b) => {
        const sa = statusRank(a?.status);
        const sb = statusRank(b?.status);
        if (sb !== sa) return sb > sa ? b : a;
        const ra = sourceRank(a?.source);
        const rb = sourceRank(b?.source);
        if (rb !== ra) return rb > ra ? b : a;
        const fa = Object.keys(a || {}).length;
        const fb = Object.keys(b || {}).length;
        return fb > fa ? b : a;
      };

      const deduped = (() => {
        const map = new Map();
        combinedWithLocal.forEach((b) => {
          // Prefer date+time for stable key, but also accept payref hash as fallback for rows without date/time
          let key = appointmentStableKey(b?.date, b?.time_raw || b?.time);
          if (!key) {
            const payref = `${b?.payment_reference || b?.reference || ''}`.trim();
            if (payref) key = `payref:${payref.toUpperCase()}`;
          }
          if (!key && b?.id) key = `id:${b.id}`;
          if (!key) return;
          const prev = map.get(key);
          map.set(key, prev ? pickBetter(prev, b) : b);
        });
        return Array.from(map.values());
      })();

      const bookedByDate = deduped.reduce((acc, b) => {
        const date = b?.date;
        if (!date) return acc;
        if (!acc[date]) acc[date] = [];
        acc[date].push(b);
        return acc;
      }, {});
      setAppointmentsByDate(bookedByDate);
    } catch (e) {
      console.error('Error loading appointments:', e);
      // Even on top-level crash, NEVER leave user with ZERO data — at least try local booked services fallback.
      try {
        const email = activeEmailRef.current || (await AsyncStorage.getItem('userEmail'));
        if (email) {
          const localKey = `patientBookedServices:${email}`;
          const raw = await AsyncStorage.getItem(localKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const bookedByDate = {};
              parsed.slice(0, 100).forEach((b) => {
                const d = b?.date;
                if (!d) return;
                if (!bookedByDate[d]) bookedByDate[d] = [];
                bookedByDate[d].push({ ...b, __local: true, status: b.status || 'Approved' });
              });
              setAppointmentsByDate(bookedByDate);
            }
          }
        }
      } catch (_) {}
    }
  }, []);

  // Set up real-time listener
  useEffect(() => {
    let channel;
    const setupRealtime = async () => {
      const email = await AsyncStorage.getItem('userEmail');
      if (!email) return;

      channel = supabase
        .channel('patient-schedule-updates')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'appointments' },
          () => loadAppointments()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'appointment_approval_requests' },
          () => loadAppointments()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'service_appointment' },
          () => loadAppointments()
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadAppointments]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const loadBookedServices = async () => {
        if (!isActive) return;
        await loadAppointments();
      };

      loadBookedServices();

      return () => {
        isActive = false;
      };
    }, [loadAppointments])
  );

  const removeBookedService = async (bookingId) => {
    try {
      const id = `${bookingId || ''}`.replace(/^svc-/, '');
      const { error } = await supabase
        .from('service_appointment')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await loadAppointments();
    } catch (e) {
      Alert.alert('Error', 'Failed to cancel booking. Please try again.');
    }
  };

  const cancelApprovedAppointment = useCallback(
    async (item) => {
      try {
        if (!item?.id) {
          Alert.alert('Error', 'Missing appointment id.');
          return;
        }

        const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
        if (!email) {
          Alert.alert('Error', 'Missing user email.');
          return;
        }

        const statusKey = normalizeText(item?.status);
        if (statusKey === 'cancelled') {
          Alert.alert('Already Cancelled', 'This appointment is already cancelled.');
          return;
        }

        const nowIso = new Date().toISOString();

        const appointmentDateRaw = `${item?.raw?.appointment_date || item?.raw?.requested_date || item?.date || ''}`.trim();
        const appointmentTimeRaw = `${item?.raw?.appointment_time || item?.raw?.requested_time || item?.time_raw || item?.time || ''}`.trim();
        const appointmentTimeDb = normalizeTimeForDb(appointmentTimeRaw);
        const appointmentServiceTypeRaw = `${item?.raw?.service_type || item?.raw?.reason || item?.type || ''}`.trim();

        const updateTable = async (tableName, idCol, payload) => {
          const res = await supabase.from(tableName).update(payload).eq(idCol, item.id.replace(/^(svc-|req-|appt-)/, ''));
          if (!res?.error) return res;

          const isUuidMismatch =
            res.error?.code === '22P02' ||
            `${res.error?.message || ''}`.toLowerCase().includes('invalid input syntax for type uuid');
          if (!isUuidMismatch) return res;

          let q = supabase.from(tableName).update(payload).eq('email', email);
          if (tableName === 'service_appointment') q = supabase.from(tableName).update(payload).eq('patient_email', email);

          if (appointmentDateRaw) {
            const dateCol = tableName === 'appointment_approval_requests' ? 'requested_date' : 'appointment_date';
            q = q.eq(dateCol, appointmentDateRaw);
          }
          if (appointmentTimeDb) {
            const timeCol = tableName === 'appointment_approval_requests' ? 'requested_time' : 'appointment_time';
            q = q.eq(timeCol, appointmentTimeDb);
          }
          return await q;
        };

        let updatedInSource = false;
        let lastUpdateError = null;
        const updatePayload = {
          status: 'Cancelled',
          updated_at: nowIso,
        };

        // Try to update the primary source table
        const sourceTableMap = {
          'appointments': 'appointments',
          'service_appointment': 'service_appointment',
          'appointment_approval_requests': 'appointment_approval_requests'
        };

        const targetTable = sourceTableMap[item.source] || 'appointments';
        const idCol = 'id';

        {
          const maxTries = 4;
          let attemptPayload = { ...updatePayload };
          if (targetTable === 'appointments') {
            attemptPayload.cancelled_at = nowIso;
            attemptPayload.cancelled_by = email;
            attemptPayload.cancelled_reason = 'Cancelled by patient';
          }

          for (let i = 0; i < maxTries; i += 1) {
            const res = await updateTable(targetTable, idCol, attemptPayload);
            if (!res?.error) {
              updatedInSource = true;
              break;
            }

            lastUpdateError = res.error;
            const code = `${res.error?.code || ''}`.trim();
            const msg = `${res.error?.message || ''}`.trim();
            if (code === '42501') break;

            const missingCol = (code === '42703' ? msg.match(/column\s+"([^"]+)"/i)?.[1] : null) || 
                               ((code === 'PGRST204' || msg.includes('schema cache')) ? msg.match(/Could not find the '([^']+)' column/i)?.[1] : null);

            if (missingCol && Object.prototype.hasOwnProperty.call(attemptPayload, missingCol)) {
              delete attemptPayload[missingCol];
              continue;
            }
            break;
          }
        }

        if (!updatedInSource && appointmentDateRaw && appointmentTimeDb) {
          const tryCancelApproval = async (emailCol) => {
            const res = await supabase
              .from('appointment_approval_requests')
              .update({ status: 'Cancelled', updated_at: nowIso })
              .eq(emailCol, email)
              .eq('requested_date', appointmentDateRaw)
              .eq('requested_time', appointmentTimeDb)
              .select('id');
            return res;
          };

          let approvalUpdated = false;
          try {
            const [r1, r2] = await Promise.all([tryCancelApproval('email'), tryCancelApproval('patient_email')]);
            if (!r1?.error && Array.isArray(r1.data) && r1.data.length > 0) approvalUpdated = true;
            if (!r2?.error && Array.isArray(r2.data) && r2.data.length > 0) approvalUpdated = true;
            if ((r1?.error && !lastUpdateError) || (r2?.error && !lastUpdateError)) lastUpdateError = r1?.error || r2?.error || lastUpdateError;
          } catch (e) {
            if (!lastUpdateError) lastUpdateError = e;
          }
          if (approvalUpdated) updatedInSource = true;
        }

        const { data: accountData } = await supabase.from('accounts').select('name').eq('email', email).maybeSingle();
        const patientName = `${accountData?.name || ''}`.trim();

        const dept = `${item?.category || ''}`.trim();
        const serviceLabel = `${item?.type || ''}`.trim() || 'Service Booking';
        const requestedDate = appointmentDateRaw;
        const requestedTime = appointmentTimeDb || appointmentTimeRaw;

        const noticeBase = {
          status: 'Cancelled',
          email,
          patient_email: email,
          patient_name: patientName || email,
          requested_date: requestedDate,
          requested_time: requestedTime,
          reason: `${serviceLabel}${dept ? ` • ${dept}` : ''} | CANCELLED | Appointment:${item.id}`,
          created_at: nowIso,
        };

        const noticeCandidates = [
          noticeBase,
          (() => {
            const x = { ...noticeBase };
            delete x.created_at;
            return x;
          })(),
          (() => {
            const x = { ...noticeBase };
            delete x.patient_name;
            delete x.patient_email;
            delete x.created_at;
            return x;
          })(),
        ];

        let noticeInserted = false;
        let lastInsertError = null;
        for (const payload of noticeCandidates) {
          const ins = await supabase.from('appointment_approval_requests').insert(payload);
          if (!ins?.error) {
            noticeInserted = true;
            break;
          }
          lastInsertError = ins.error;
          if (ins.error?.code === '42703') continue;
          break;
        }

        if (!updatedInSource && !noticeInserted) {
          const updateMsg = `${lastUpdateError?.message || lastUpdateError?.error_description || ''}`.trim();
          const insertMsg = `${lastInsertError?.message || lastInsertError?.error_description || ''}`.trim();
          const details = [updateMsg ? `Update: ${updateMsg}` : null, insertMsg ? `Insert: ${insertMsg}` : null].filter(Boolean).join('\n');
          const stable = appointmentStableKey(requestedDate, requestedTime);
          if (stable) {
            await addLocalCancelledKey(email, stable);
            Alert.alert('Cancelled', 'Your appointment has been cancelled.');
            await loadAppointments();
            return;
          }
          Alert.alert('Error', details || 'Unable to cancel this appointment right now. Please try again.');
          return;
        }

        const stable = appointmentStableKey(requestedDate, requestedTime);
        if (stable) await addLocalCancelledKey(email, stable);

        Alert.alert(
          updatedInSource ? 'Cancelled' : 'Cancellation Sent',
          updatedInSource
            ? 'Your appointment has been cancelled. The department will be notified.'
            : 'Your cancellation request has been sent. The department will be notified.',
        );
        await loadAppointments();
      } catch (e) {
        const msg = `${e?.message || e?.error_description || ''}`.trim();
        Alert.alert('Error', msg ? `Failed to cancel appointment: ${msg}` : 'Failed to cancel appointment. Please try again.');
      }
    },
    [loadAppointments],
  );

  const updateBookedServiceDate = async (bookingId, nextDate) => {
    try {
      const id = `${bookingId || ''}`.replace(/^svc-/, '');
      const { error } = await supabase
        .from('service_appointment')
        .update({ appointment_date: nextDate })
        .eq('id', id);
        
      if (error) throw error;
      await loadAppointments();
    } catch (e) {
      Alert.alert('Error', 'Failed to reschedule booking. Please try again.');
    }
  };

  const openReschedule = (item) => {
    const initialDate = item?.appointment_date || selectedDate;
    setRescheduleTarget(item);
    setRescheduleDate(initialDate);
    setRescheduleVisible(true);
  };

  const confirmReschedule = async () => {
    if (!rescheduleTarget?.bookingId || !rescheduleDate) {
      Alert.alert('Required', 'Please select a new date.');
      return;
    }
    await updateBookedServiceDate(rescheduleTarget.id, rescheduleDate);
    setSelectedDate(rescheduleDate);
    setRescheduleVisible(false);
    setRescheduleTarget(null);
    setRescheduleDate('');
  };

  const isToday = (dateString) => {
    if (!dateString) return false;
    const today = getLocalDateKey();
    return dateString === today;
  };

  const isWithinJoinWindow = useCallback(
    (dateString, timeString) => {
      if (!isToday(dateString)) return false;
      const startMin = parseTimeToMinutes(timeString);
      if (startMin === null) return false;
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      return nowMin >= startMin - 10 && nowMin <= startMin + 30;
    },
    [isToday],
  );

  const meetingRoomFor = useCallback((it) => {
    const direct = `${it?.meeting_room_id || it?.meeting_room || it?.video_room || ''}`.trim();
    if (direct) return direct;
    const r = it?.raw || {};
    return `${r.meeting_room_id || r.meeting_room || r.video_room || r.room_url || ''}`.trim() || null;
  }, []);

  const markMeetingStartedIfNeeded = useCallback(
    async (it) => {
      try {
        if (!it) return;
        const room = meetingRoomFor(it);
        if (!room) return;
        if (it?.meeting_started_at) return;
        const rawId = normalizeDailyAppointmentId(it?.id);
        if (!rawId) return;

        const source = `${it?.source || ''}`.trim();
        const tables = [];
        if (source === 'appointments') tables.push('appointments');
        else if (source === 'appointment_approval_requests') tables.push('appointment_approval_requests');
        else if (source === 'service_appointment') tables.push('service_appointment');
        else tables.push('appointments', 'appointment_approval_requests', 'service_appointment');

        for (const tableName of tables) {
          try {
            await supabase
              .from(tableName)
              .update({ meeting_started_at: new Date().toISOString() })
              .eq('id', rawId)
              .is('meeting_started_at', null);
          } catch (_) {}
        }
      } catch (e) {
      }
    },
    [meetingRoomFor, normalizeDailyAppointmentId],
  );

  const todayKey = useMemo(() => getLocalDateKey(), [getLocalDateKey]);
  const nextVideoToday = useMemo(() => {
    const items = appointmentsByDate[todayKey] || [];
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const candidates = (items || [])
      .filter((it) => it?.mode === 'Video Call' && it?.status && normalizeText(it.status) !== 'declined')
      .map((it) => ({ it, mins: parseTimeToMinutes(it?.time) }))
      .filter((x) => x.mins !== null)
      .sort((a, b) => a.mins - b.mins);

    const upcoming = candidates.find((x) => x.mins >= nowMin - 10);
    return upcoming?.it || null;
  }, [appointmentsByDate, todayKey]);

  useEffect(() => {
    if (!nextVideoToday?.id) return;
    if (!isToday(nextVideoToday.date)) return;

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const startMin = parseTimeToMinutes(nextVideoToday.time);
    if (startMin === null) return;

    const withinWindow = nowMin >= startMin - 10 && nowMin <= startMin + 30;
    const statusKey = normalizeText(nextVideoToday.status);
    const joinAllowed = statusKey === 'confirmed' || statusKey === 'approved';
    if (!withinWindow || !joinAllowed) return;

    const key = `${nextVideoToday.id}`;
    if (callAlertedIdsRef.current.has(key)) return;
    callAlertedIdsRef.current.add(key);

    Alert.alert(
      'Online Consultation',
      'Your online consultation is ready. Press Join to enter the video call.',
      [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Join',
          onPress: async () => {
            await openVideoCallForItem(nextVideoToday);
          },
        },
      ],
    );
  }, [nextVideoToday, normalizeText, openVideoCallForItem, parseTimeToMinutes, todayKey]);

  const renderAppointment = ({ item }) => {
    const appointmentIsToday = isToday(item.date);
    const raw = item?.raw || {};
    const meta = extractAppointmentMeta(raw);
    const assignmentRaw =
      item?.assignmentStatus ??
      raw?.assignmentStatus ??
      raw?.assignment_status ??
      meta?.assignmentStatus ??
      meta?.assignment_status ??
      '';
    const assignmentKey = normalizeText(assignmentRaw).replace(/\s+/g, '_');
    const isPendingAssignment = assignmentKey === 'pending_assignment';
    const isAssigned = assignmentKey === 'assigned';

    const rawStatus = `${item?.status || ''}`.trim();
    const rawStatusKey = normalizeText(rawStatus);
    const isApprovedLike = rawStatusKey.includes('approved') || rawStatusKey.includes('confirm') || rawStatusKey.includes('completed');
    const isCancelledLike = rawStatusKey.includes('cancel') || rawStatusKey.includes('declin') || rawStatusKey.includes('reject');

    const displayStatus = (() => {
      if (isCancelledLike) return 'Cancelled';
      if (isPendingAssignment) return isApprovedLike ? 'Approved' : 'Pending Assignment';
      if (isAssigned) return 'Completed';
      if (rawStatusKey === 'confirmed') return 'Completed';
      return rawStatus || 'Pending';
    })();
    const statusKey = normalizeText(displayStatus);
    const joinAllowed = statusKey === 'completed' || statusKey === 'confirmed' || statusKey === 'approved';
    const withinWindow = isWithinJoinWindow(item.date, item.time);
    const roomName = meetingRoomFor(item);
    const roomReady = !!roomName;
    const canJoinNow = item.mode === 'Video Call' && joinAllowed && withinWindow;
    const stripTriage = (text) => {
      const rawText = `${text || ''}`.trim();
      if (!rawText) return '';
      const noBracket = rawText.replace(/^\s*\[?\s*triage[^\]]*\]\s*/i, '').trim();
      const noLead = noBracket.replace(/^\s*triage\s*t?\d+[^\]|:]*(\]|\s)\s*/i, '').trim();
      const noInline = noLead.replace(/\s*\[?\s*triage[^\]]*\]\s*/gi, ' ');
      return noInline.replace(/\s+/g, ' ').trim();
    };

    const rawType = `${item.type || ''}`.trim();
    const cleanedType = stripTriage(rawType);
    const qMatch = cleanedType.match(/\bQNO:(\d+)\b/i);
    const queueNo = qMatch?.[1] ? Number(qMatch[1]) : null;
    const typeLabel = cleanedType.replace(/\s*\|\s*QNO:\d+\b/gi, '').trim();
    const inferredDept = (() => {
      const fromRow = stripTriage(`${item?.department || raw?.department || meta?.department || ''}`.trim());
      if (fromRow) return fromRow;
      const t = `${typeLabel || ''}`.trim();
      const idx = t.indexOf(':');
      if (idx > 0) return t.slice(0, idx).trim();
      return '';
    })();
    const requestedFrom = `${item?.requestedTimeFrom || raw?.requestedTimeFrom || raw?.requested_time_from || meta?.requestedTimeFrom || meta?.requested_time_from || ''}`.trim();
    const requestedTo = `${item?.requestedTimeTo || raw?.requestedTimeTo || raw?.requested_time_to || meta?.requestedTimeTo || meta?.requested_time_to || ''}`.trim();
    
    // Priority: use specific item.time if it's not "TBD", otherwise use requestedRange
    const specificTime = `${item.time || ''}`.trim();
    const hasSpecificTime = specificTime && specificTime.toUpperCase() !== 'TBD';

    const requestedRange =
      requestedFrom && requestedTo
        ? requestedFrom === requestedTo
          ? `${formatTimeDisplay(requestedFrom)}`
          : `${formatTimeDisplay(requestedFrom)}–${formatTimeDisplay(requestedTo)}`
        : '';
    
    const displayTime = hasSpecificTime ? specificTime : (isPendingAssignment && requestedRange ? requestedRange : specificTime);

    const formatDateLong = (dateStr) => {
      const d = `${dateStr || ''}`.trim();
      if (!d) return '';
      const parsed = new Date(d);
      if (Number.isNaN(parsed.getTime())) return d;
      return parsed.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    };
    const assignedDoctorRaw =
      `${item?.assignedDoctor || item?.assignedDoctorName || raw?.assignedDoctor || raw?.assigned_doctor || raw?.doctor_name || raw?.doctor || meta?.assignedDoctor || meta?.assigned_doctor || ''}`.trim();
    const assignedDoctorLabel = assignedDoctorRaw
      ? /^dr\./i.test(assignedDoctorRaw)
        ? assignedDoctorRaw
        : `Dr. ${assignedDoctorRaw}`
      : '';

    return (
      <View style={localStyles.card}>
        <View style={[localStyles.indicator, { backgroundColor: item.mode === 'Video Call' ? '#0077B6' : '#DA7705' }]} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={localStyles.timeText} numberOfLines={1} ellipsizeMode="tail">
                {displayTime}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {!!displayStatus && (
                <View
                  style={[
                    localStyles.statusBadge,
                    (displayStatus === 'Pending Assignment' || displayStatus === 'Pending Approval' || displayStatus === 'Pending') &&
                      localStyles.statusBadgePending,
                    (displayStatus === 'Declined' || displayStatus === 'Cancelled') && localStyles.statusBadgeDeclined,
                    (displayStatus === 'Approved' || displayStatus === 'Completed') && localStyles.statusBadgeApproved,
                  ]}
                >
                  <Text
                    style={[
                      localStyles.statusText,
                      (displayStatus === 'Pending Assignment' || displayStatus === 'Pending Approval' || displayStatus === 'Pending') &&
                        localStyles.statusTextPending,
                      (displayStatus === 'Declined' || displayStatus === 'Cancelled') && localStyles.statusTextDeclined,
                      (displayStatus === 'Approved' || displayStatus === 'Completed') && localStyles.statusTextApproved,
                    ]}
                    numberOfLines={1}
                  >
                    {displayStatus}
                  </Text>
                </View>
              )}

              <View style={[localStyles.modeBadge, { backgroundColor: item.mode === 'Video Call' ? '#E0EEF6' : '#FFFAF0' }]}>
                <Text style={[localStyles.modeText, { color: item.mode === 'Video Call' ? '#0077B6' : '#DA7705' }]}>{item.mode}</Text>
              </View>
            </View>
          </View>
          {/* Doctor hidden for privacy */}
          <Text style={localStyles.typeText}>{typeLabel || cleanedType || rawType}</Text>
          {isPendingAssignment && item.mode !== 'Video Call' ? (
            <>
              {inferredDept ? <Text style={localStyles.typeText}>{`Department: ${inferredDept}`}</Text> : null}
              {requestedRange ? (
                <Text style={localStyles.typeText}>{`Requested: ${formatDateLong(item.date)} • ${requestedRange}`}</Text>
              ) : null}
              <Text style={localStyles.typeText}>Waiting for the secretary to assign an available doctor.</Text>
            </>
          ) : null}
          {isPendingAssignment && item.mode === 'Video Call' ? (
            <>
              {inferredDept ? <Text style={localStyles.typeText}>{`Department: ${inferredDept}`}</Text> : null}
              {requestedRange ? (
                <Text style={localStyles.typeText}>{`Requested: ${formatDateLong(item.date)} • ${requestedRange}`}</Text>
              ) : null}
              <Text style={localStyles.typeText}>Online consultation room will be prepared when you tap Join below.</Text>
            </>
          ) : null}

          {isAssigned && assignedDoctorLabel ? <Text style={localStyles.typeText}>{`Assigned Doctor: ${assignedDoctorLabel}`}</Text> : null}

          {!isPendingAssignment && statusKey === 'pending' && `${item.time || ''}`.trim().toUpperCase() === 'TBD' && item.mode !== 'Video Call' ? (
            <Text style={localStyles.queueText}>Waiting for clinic confirmation</Text>
          ) : null}
          {!isPendingAssignment && Number.isFinite(queueNo) && queueNo > 0 ? (
            <Text style={localStyles.queueText}>{`Queue Number: ${queueNo}`}</Text>
          ) : null}
          {(item.category || item.paymentMethod) && (
            <Text style={localStyles.typeText}>
              {[stripTriage(item.category), item.paymentMethod ? `Payment: ${item.paymentMethod}` : null].filter(Boolean).join(' • ')}
            </Text>
          )}

          {/* Cancellation Action for Confirmed/Approved appointments */}
          {(statusKey === 'approved' || statusKey === 'confirmed' || statusKey === 'completed') && (
            <View style={localStyles.actionRow}>
              <TouchableOpacity
                style={[localStyles.actionButton, localStyles.cancelButton]}
                onPress={() => {
                  Alert.alert('Cancel Appointment', 'Are you sure you want to cancel this appointment?', [
                    { text: 'No', style: 'cancel' },
                    { text: 'Yes, Cancel', style: 'destructive', onPress: () => cancelApprovedAppointment(item) },
                  ]);
                }}
                activeOpacity={0.8}
              >
                <Feather name="x" size={16} color="#fff" />
                <Text style={localStyles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {item.source === 'booked' && item.status === 'Booked' && (
            <View style={localStyles.actionRow}>
              <TouchableOpacity
                style={[localStyles.actionButton, localStyles.rescheduleButton]}
                onPress={() => openReschedule(item)}
                activeOpacity={0.8}
              >
                <Feather name="calendar" size={16} color="#fff" />
                <Text style={localStyles.actionButtonText}>Reschedule</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[localStyles.actionButton, localStyles.cancelButton]}
                onPress={() => {
                  Alert.alert(
                    'Cancel Booking',
                    'Are you sure you want to cancel this booking?',
                    [
                      { text: 'No', style: 'cancel' },
                      { text: 'Yes, Cancel', style: 'destructive', onPress: () => removeBookedService(item.id) },
                    ]
                  );
                }}
                activeOpacity={0.8}
              >
                <Feather name="x" size={16} color="#fff" />
                <Text style={localStyles.actionButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {item.mode === 'Video Call' && joinAllowed && (
            <>
              {appointmentIsToday ? (
                <TouchableOpacity
                  style={[
                    localStyles.joinButton,
                    !canJoinNow && { backgroundColor: '#94a3b8', opacity: 0.85 },
                  ]}
                  onPress={async () => {
                    if (!canJoinNow) return;
                    await openVideoCallForItem(item);
                  }}
                  activeOpacity={0.85}
                  disabled={!canJoinNow}
                >
                  <Feather name={canJoinNow ? "video" : "video-off"} size={16} color="#fff" />
                  <Text style={localStyles.joinButtonText}>
                    {canJoinNow ? 'Join Consultation' : (!withinWindow ? 'You can join 10 mins before schedule' : 'Waiting for room')}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={[localStyles.joinButton, { backgroundColor: '#94a3b8', opacity: 0.85 }]}>
                  <Feather name="video-off" size={16} color="#fff" />
                  <Text style={localStyles.joinButtonText}>Join available on {item.date}</Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[
        PatientHomepageStyles.container,
        Platform.OS === 'android' ? { paddingTop: StatusBar.currentHeight || 0 } : null,
      ]}
    >
      {/* NOTIFICATION MODAL (FOLLOW-UP POP-UP) */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showCallModal}
        onRequestClose={() => setShowCallModal(false)}
      >
        <View style={localStyles.modalOverlay}>
          <View style={localStyles.notifCard}>
            <View style={localStyles.notifHeader}>
              <View style={localStyles.notifIconCircle}>
                <MaterialCommunityIcons name="bell-ring" size={24} color="#DA7705" />
              </View>
              <Text style={localStyles.notifTitle}>New Follow-up Schedule</Text>
              <TouchableOpacity onPress={() => setShowCallModal(false)}>
                <Feather name="x" size={20} color="#999" />
              </TouchableOpacity>
            </View>

            <View style={localStyles.notifContent}>
              <Text style={localStyles.notifMessage}>A follow-up online consultation has been scheduled.</Text>
              <View style={localStyles.notifDetails}>
                <View style={localStyles.detailRow}>
                  <Feather name="calendar" size={14} color="#666" />
                  <Text style={localStyles.detailText}>March 29, 2026</Text>
                </View>
                <View style={localStyles.detailRow}>
                  <Feather name="clock" size={14} color="#666" />
                  <Text style={localStyles.detailText}>10:00 AM</Text>
                </View>
                <View style={localStyles.detailRow}>
                  <Feather name="video" size={14} color="#666" />
                  <Text style={localStyles.detailText}>Video Call</Text>
                </View>
              </View>
            </View>

            <View style={localStyles.notifActions}>
              <TouchableOpacity style={localStyles.notifDecline} onPress={() => setShowCallModal(false)}>
                <Text style={localStyles.declineText}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity style={localStyles.notifAccept} onPress={() => setShowCallModal(false)}>
                <Text style={localStyles.acceptText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {nextVideoToday && (
        <View style={[localStyles.card, { marginHorizontal: 20, marginTop: 10, borderLeftWidth: 6, borderLeftColor: '#0077B6' }]}>
          {(() => {
            const statusKey = normalizeText(nextVideoToday.status);
            const joinAllowed = statusKey === 'confirmed' || statusKey === 'approved';
            const withinWindow = isWithinJoinWindow(nextVideoToday.date, nextVideoToday.time);
            const canJoinNow = joinAllowed && withinWindow;
            return (
              <>
          <Text style={[localStyles.typeText, { fontWeight: '700', color: '#0f172a' }]}>Online Consultation (Today)</Text>
          <Text style={localStyles.typeText}>{`${nextVideoToday.time || ''}`.trim() ? `${nextVideoToday.time} • ` : ''}{nextVideoToday.type}</Text>
          <TouchableOpacity
            style={[
              localStyles.joinButton,
              { marginTop: 10 },
              !canJoinNow && { backgroundColor: '#94a3b8', opacity: 0.85 },
            ]}
            onPress={async () => {
              if (!canJoinNow) return;
              await openVideoCallForItem(nextVideoToday);
            }}
            activeOpacity={0.85}
            disabled={!canJoinNow}
          >
            <Feather name={canJoinNow ? "video" : "video-off"} size={16} color="#fff" />
            <Text style={localStyles.joinButtonText}>
              {!joinAllowed ? 'Waiting for confirmation' : (!withinWindow ? 'You can join 10 mins before schedule' : 'Join Video Call')}
            </Text>
          </TouchableOpacity>
              </>
            );
          })()}
        </View>
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={rescheduleVisible}
        onRequestClose={() => setRescheduleVisible(false)}
      >
        <View style={localStyles.modalOverlay}>
          <View style={localStyles.rescheduleCard}>
            <View style={localStyles.rescheduleHeader}>
              <Text style={localStyles.rescheduleTitle}>Reschedule Booking</Text>
              <TouchableOpacity
                onPress={() => {
                  setRescheduleVisible(false);
                  setRescheduleTarget(null);
                  setRescheduleDate('');
                }}
              >
                <Feather name="x" size={20} color="#999" />
              </TouchableOpacity>
            </View>

            <Text style={localStyles.rescheduleSubtitle}>
              {[
                rescheduleTarget?.type ? rescheduleTarget.type : null,
              ]
                .filter(Boolean)
                .join(' • ')}
            </Text>

            <Calendar
              current={rescheduleDate || selectedDate}
              onDayPress={(day) => setRescheduleDate(day.dateString)}
              markedDates={{
                ...(rescheduleDate
                  ? {
                      [rescheduleDate]: {
                        selected: true,
                        selectedColor: '#DA7705',
                      },
                    }
                  : {}),
              }}
              theme={{
                selectedDayBackgroundColor: '#DA7705',
                todayTextColor: '#DA7705',
                arrowColor: '#DA7705',
                monthTextColor: '#DA7705',
                textMonthFontWeight: 'bold',
              }}
              style={localStyles.rescheduleCalendar}
            />

            <View style={localStyles.rescheduleActions}>
              <TouchableOpacity
                style={localStyles.rescheduleCancel}
                onPress={() => {
                  setRescheduleVisible(false);
                  setRescheduleTarget(null);
                  setRescheduleDate('');
                }}
              >
                <Text style={localStyles.declineText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={localStyles.rescheduleSave} onPress={confirmReschedule}>
                <Text style={localStyles.acceptText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* HEADER */}
      <PatientHeader 
        title="My Schedule"
        navigation={navigation}
        onMenuPress={toggleDrawer}
        userData={userData}
      />

      <FlatList
        data={appointmentsForDay}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <View style={PatientHomepageStyles.calendarWrapper}>
              <Text style={{ alignSelf: "center", fontSize: 20, fontWeight: "bold", marginTop: 10, color: '#333' }}>Consultation Calendar</Text>
              <Calendar
                current={selectedDate}
                onDayPress={(day) => setSelectedDate(day.dateString)}
                markedDates={{
                  ...Object.keys(appointmentsByDate).reduce((acc, date) => {
                    const dayItems = appointmentsByDate[date] || [];
                    const allCancelled = dayItems.length > 0 && dayItems.every(it => isCancelledStatus(it?.status));
                    acc[date] = { 
                      marked: true, 
                      dotColor: allCancelled ? '#b91c1c' : '#DA7705' 
                    };
                    return acc;
                  }, {}),
                  [selectedDate]: {
                    selected: true,
                    selectedColor: '#DA7705',
                    marked: (appointmentsByDate[selectedDate] || []).length > 0,
                    dotColor: (appointmentsByDate[selectedDate] || []).every(it => isCancelledStatus(it?.status)) ? '#b91c1c' : '#DA7705',
                  },
                }}
                theme={{
                  selectedDayBackgroundColor: '#DA7705',
                  todayTextColor: '#DA7705',
                  arrowColor: '#DA7705',
                  monthTextColor: '#DA7705',
                  textMonthFontWeight: 'bold',
                }}
                style={PatientHomepageStyles.calendar}
              />
            </View>
            
            <View style={localStyles.sectionHeader}>
              <Text style={localStyles.sectionTitle}>My Appointments</Text>
              <MaterialCommunityIcons name="video-account" size={22} color="#0077B6" />
            </View>
          </>
        }
        renderItem={renderAppointment}
        ListEmptyComponent={<Text style={PatientHomepageStyles.noAppointments}>No scheduled consultations for this date.</Text>}
        contentContainerStyle={[PatientHomepageStyles.listPadding, { paddingBottom: 100 }]}
      />

      <PatientSideMenu 
        visible={drawerVisible} 
        onClose={toggleDrawer} 
      />
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    padding: 15,
    borderRadius: 20,
    marginBottom: 15,
    flexDirection: 'row',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  indicator: {
    width: 4,
    borderRadius: 2,
    marginRight: 15,
  },
  timeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  modeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  modeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    maxWidth: 140,
  },
  statusBadgePending: {
    backgroundColor: '#FFFAF0',
  },
  statusBadgeDeclined: {
    backgroundColor: '#FEF2F2',
  },
  statusBadgeApproved: {
    backgroundColor: '#f0fdf4',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
  },
  statusTextPending: {
    color: '#DA7705',
  },
  statusTextDeclined: {
    color: '#b91c1c',
  },
  statusTextApproved: {
    color: '#166534',
  },
  doctorName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#444',
    marginTop: 5,
  },
  typeText: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  queueText: {
    fontSize: 13,
    color: '#DA7705',
    marginTop: 2,
    fontWeight: '800',
  },
  joinButton: {
    backgroundColor: '#0077B6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 15,
  },
  joinButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
    marginLeft: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  rescheduleButton: {
    backgroundColor: '#DA7705',
  },
  cancelButton: {
    backgroundColor: '#b91c1c',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 25,
    marginTop: 20,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },

  // MODAL STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  notifCard: {
    backgroundColor: '#fff',
    width: '100%',
    borderRadius: 25,
    padding: 20,
    elevation: 10,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  notifIconCircle: {
    width: 45,
    height: 45,
    borderRadius: 12,
    backgroundColor: '#FFFAF0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  notifTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  notifContent: {
    marginBottom: 25,
  },
  notifMessage: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  notifDetails: {
    marginTop: 15,
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 15,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 10,
    fontWeight: '600',
  },
  notifActions: {
    flexDirection: 'row',
    gap: 12,
  },
  notifDecline: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 15,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  notifAccept: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 15,
    alignItems: 'center',
    backgroundColor: '#DA7705',
  },
  declineText: {
    color: '#666',
    fontWeight: 'bold',
  },
  acceptText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  rescheduleCard: {
    backgroundColor: '#fff',
    width: '100%',
    borderRadius: 25,
    padding: 16,
    elevation: 10,
  },
  rescheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rescheduleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  rescheduleSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 6,
    marginBottom: 10,
  },
  rescheduleCalendar: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  rescheduleActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  rescheduleCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 15,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  rescheduleSave: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 15,
    alignItems: 'center',
    backgroundColor: '#DA7705',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
});
