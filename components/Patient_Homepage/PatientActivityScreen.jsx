import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import PatientHeader from './PatientHeader';
import PatientSideMenu from './PatientSideMenu';

const THEME_ORANGE = '#DA7705';

const getApiBaseUrl = () => {
  const raw = `${process.env.EXPO_PUBLIC_API_BASE_URL || ''}`.trim();
  return raw ? raw.replace(/\/+$/, '') : '';
};

const safeJsonParse = (text) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

const pickNotificationsPayload = (parsed) => {
  if (Array.isArray(parsed)) return { items: parsed, unreadCount: null };
  if (parsed && typeof parsed === 'object') {
    const items =
      (Array.isArray(parsed.items) && parsed.items) ||
      (Array.isArray(parsed.notifications) && parsed.notifications) ||
      (Array.isArray(parsed.data) && parsed.data) ||
      [];
    const unreadCount =
      Number.isFinite(Number(parsed.unreadCount)) ? Number(parsed.unreadCount) :
      Number.isFinite(Number(parsed.unread)) ? Number(parsed.unread) :
      null;
    return { items, unreadCount };
  }
  return { items: [], unreadCount: null };
};

const normalizeLabStatusTitle = (raw) => {
  const s = `${raw || ''}`.trim().toLowerCase();
  if (!s) return 'New Test Result';
  if (s.includes('pending')) return 'Result Received';
  if (s.includes('verified') || s.includes('approved')) return 'New Test Result';
  if (s.includes('flag')) return 'Needs Review';
  if (s.includes('reject')) return 'Rejected';
  return 'New Test Result';
};

const fetchApiNotifications = async ({ email, name }) => {
  const base = getApiBaseUrl();
  if (!base) return { items: [], unreadCount: null };

  const url = `${base}/api/staff/notifications`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-user-role': 'patient',
      'x-user-email': email,
      ...(name ? { 'x-user-name': name } : {}),
    },
  });

  const text = await res.text().catch(() => '');
  const parsed = safeJsonParse(text);
  if (!res.ok) {
    const msg = parsed?.message || parsed?.error || text || `HTTP ${res.status}`;
    throw new Error(`${msg}`.trim());
  }

  return pickNotificationsPayload(parsed);
};

const markAllReadApi = async ({ email, name }) => {
  const base = getApiBaseUrl();
  if (!base) return;

  const url = `${base}/api/staff/notifications/mark-all-read`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-user-role': 'patient',
      'x-user-email': email,
      ...(name ? { 'x-user-name': name } : {}),
    },
    body: JSON.stringify({}),
  }).catch(() => {});
};

const looksLikeUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${value || ''}`.trim());

const getCachedPatientId = async (email) => {
  const safe = `${email || ''}`.trim().toLowerCase();
  if (!safe) return '';
  return sanitizeText(await AsyncStorage.getItem(`patientId:${safe}`), 120);
};

const resolvePatientId = async (email) => {
  const safe = `${email || ''}`.trim().toLowerCase();
  if (!safe) return '';

  const cached = await getCachedPatientId(safe);
  if (cached) return cached;

  try {
    const tryPatientSelect = async (cols) => {
      return await supabase.from('patients').select(cols).ilike('email', safe).limit(1).maybeSingle();
    };

    let patientRes = await tryPatientSelect('id, patient_id, email');
    if (patientRes.error) {
      const msg = `${patientRes.error?.message || ''}`.toLowerCase();
      if (patientRes.error?.code === '42703' || msg.includes('patient_id') || msg.includes('does not exist')) {
        patientRes = await tryPatientSelect('id, email');
      }
    }

    const patient = patientRes?.data || null;
    const patientUuid = looksLikeUuid(patient?.id) ? `${patient.id}` : '';
    if (patientUuid) await AsyncStorage.setItem(`patientId:${safe}`, patientUuid);
    return patientUuid;
  } catch (_) {
    return '';
  }
};

const fetchApiNotificationsWithPatientId = async ({ email, name }) => {
  const patientId = await resolvePatientId(email);
  const base = getApiBaseUrl();
  if (!base) return { items: [], unreadCount: null };

  const url = `${base}/api/staff/notifications`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-user-role': 'patient',
      'x-user-email': email,
      ...(name ? { 'x-user-name': name } : {}),
      ...(patientId ? { 'x-patient-id': patientId } : {}),
    },
  });

  const text = await res.text().catch(() => '');
  const parsed = safeJsonParse(text);
  if (!res.ok) {
    const msg = parsed?.message || parsed?.error || text || `HTTP ${res.status}`;
    throw new Error(`${msg}`.trim());
  }

  return pickNotificationsPayload(parsed);
};

const markAllReadApiWithPatientId = async ({ email, name }) => {
  const patientId = await resolvePatientId(email);
  const base = getApiBaseUrl();
  if (!base) return;

  const url = `${base}/api/staff/notifications/mark-all-read`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-user-role': 'patient',
      'x-user-email': email,
      ...(name ? { 'x-user-name': name } : {}),
      ...(patientId ? { 'x-patient-id': patientId } : {}),
    },
    body: JSON.stringify({}),
  }).catch(() => {});
};

const TYPE_CONFIG = {
  appointment: { icon: 'calendar-check', color: THEME_ORANGE, label: 'Appointment' },
  record: { icon: 'file-document-outline', color: '#2563eb', label: 'Record' },
  medication: { icon: 'pill', color: '#16a34a', label: 'Medication' },
  billing: { icon: 'credit-card-check-outline', color: '#7c3aed', label: 'Billing' },
  system: { icon: 'shield-check-outline', color: '#0f766e', label: 'System' },
};

const coerceString = (value, fallback = '') => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
};

const sanitizeText = (value, maxLen) => {
  const raw = coerceString(value, '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (typeof maxLen === 'number' && maxLen > 0) return raw.slice(0, maxLen);
  return raw;
};

const hashText = (value) => {
  const str = coerceString(value, '');
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

const parseJsonArray = (raw) => {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getKeys = (email) => {
  const safe = sanitizeText(email, 120).toLowerCase();
  return {
    read: `patientActivitiesRead:${safe}`,
    deleted: `patientActivitiesDeleted:${safe}`,
    markAllAt: `patientActivitiesMarkAllAt:${safe}`,
  };
};

const isValidActivityType = (value) => Object.prototype.hasOwnProperty.call(TYPE_CONFIG, value);

const normalizeActivity = (raw, fallbackIndex) => {
  const type = isValidActivityType(raw?.type) ? raw.type : 'system';
  const id = sanitizeText(raw?.id, 80) || `${Date.now()}-${fallbackIndex}`;
  const title = sanitizeText(raw?.title, 60) || 'Activity Update';
  const description = sanitizeText(raw?.description, 240) || 'No additional details provided.';
  const timeLabel = sanitizeText(raw?.time, 30) || '—';
  const isRead = typeof raw?.isRead === 'boolean' ? raw.isRead : false;
  const labResultId = sanitizeText(raw?.labResultId, 120) || '';
  const appointmentDate = sanitizeText(raw?.appointmentDate, 20) || '';
  const appointmentTime = sanitizeText(raw?.appointmentTime, 20) || '';
  const appointmentRef = sanitizeText(raw?.appointmentRef || raw?.payRef || raw?.reference, 80) || '';
  const rawBookingId = sanitizeText(raw?.rawBookingId, 80) || '';
  const createdAtRaw = raw?.createdAt;
  const createdAt =
    typeof createdAtRaw === 'number'
      ? createdAtRaw
      : typeof createdAtRaw === 'string' && !Number.isNaN(Date.parse(createdAtRaw))
        ? Date.parse(createdAtRaw)
        : Date.now() - fallbackIndex * 1000;
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.system;
  return {
    id,
    title,
    description,
    time: timeLabel,
    type,
    icon: cfg.icon,
    iconColor: cfg.color,
    isRead,
    createdAt,
    labResultId,
    appointmentDate,
    appointmentTime,
    appointmentRef,
    rawBookingId,
  };
};

const normalizeActivities = (rawList) => {
  const list = Array.isArray(rawList) ? rawList : [];
  const normalized = list.map((a, idx) => normalizeActivity(a, idx));
  normalized.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const seen = new Set();
  return normalized.filter((a) => {
    if (!a?.id || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
};

const formatRelativeTime = (isoOrDate) => {
  const ts =
    typeof isoOrDate === 'string'
      ? Date.parse(isoOrDate)
      : isoOrDate instanceof Date
        ? isoOrDate.getTime()
        : NaN;
  if (Number.isNaN(ts)) return '—';
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
};

const buildActivityFromBooking = (booking, fallbackIndex, overrides = {}) => {
  const status = sanitizeText(booking?.status, 40) || 'Pending';
  const serviceType = sanitizeText(booking?.service_type, 70) || 'Service';
  const category = sanitizeText(booking?.category, 40) || '';
  const date = sanitizeText(booking?.appointment_date, 20) || '';
  const time = sanitizeText(booking?.appointment_time, 20) || '';

  let title = 'Service Update';
  const statusLower = status.toLowerCase();
  if (statusLower.includes('pending')) title = 'Appointment Request Submitted';
  else if (statusLower.includes('approved')) title = 'Appointment Approved';
  else if (statusLower.includes('declined')) title = 'Appointment Declined';
  else if (statusLower.includes('confirmed')) title = 'Appointment Completed';

  const whenParts = [date, time].filter(Boolean).join(' • ');
  const whatParts = [serviceType, category ? `(${category})` : ''].filter(Boolean).join(' ');
  const description = `${whatParts}${whenParts ? `\n${whenParts}` : ''}\nStatus: ${status}`;

  const createdAt = overrides.createdAt ?? booking?.created_at ?? Date.now() - fallbackIndex * 1000;
  const finalId = sanitizeText(overrides.id, 80) || sanitizeText(booking?.id, 80) || `${Date.now()}-${fallbackIndex}`;
  const finalIsRead = typeof overrides.isRead === 'boolean' ? overrides.isRead : false;
  return normalizeActivity(
    {
      id: finalId,
      title,
      description,
      time: formatRelativeTime(overrides.timeBase ?? booking?.created_at),
      type: 'appointment',
      isRead: finalIsRead,
      createdAt,
      appointmentDate: date,
      appointmentTime: time,
      appointmentRef: sanitizeText(booking?.payment_reference || booking?.payref || booking?.ref_no || booking?.reference_number || booking?.reference || booking?.appointment_ref || '', 80),
      rawBookingId: sanitizeText(booking?.id, 80),
    },
    fallbackIndex
  );
};

const validateSearchQuery = (value) => {
  const raw = coerceString(value, '').trim();
  if (!raw) return '';
  if (raw.length < 2) return 'Type at least 2 characters to search.';
  if (raw.length > 40) return 'Search is too long (max 40 characters).';
  const ok = /^[A-Za-z0-9\s#().,'-]+$/.test(raw);
  if (!ok) return 'Search contains unsupported characters.';
  return '';
};

export default function PatientActivityScreen() {
  const navigation = useNavigation();
  const [userData, setUserData] = useState({ name: 'Patient', email: '' });
  const [drawerVisible, setDrawerVisible] = useState(false);
  const toggleDrawer = () => setDrawerVisible(!drawerVisible);

  const fetchUserData = async () => {
    try {
      const email = await AsyncStorage.getItem('userEmail');
      if (email) {
        const { data } = await supabase
          .from('accounts')
          .select('name, email')
          .eq('email', email)
          .single();
        if (data) setUserData(data);
      }
    } catch (err) {
      console.log("Error fetching user data:", err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchUserData();
    }, [])
  );

  const [activities, setActivities] = useState(() => normalizeActivities([]));
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [readIds, setReadIds] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const lastEmailRef = useRef('');

  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');

  const unreadCount = useMemo(() => activities.filter((a) => !a.isRead).length, [activities]);

  useEffect(() => {
    try {
      navigation.setOptions({
        tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
      });
    } catch (_) {}
  }, [navigation, unreadCount]);

  const loadFromSupabase = useCallback(async () => {
    setLoading(true);
    try {
      const email = sanitizeText((await AsyncStorage.getItem('userEmail')) || '', 120).toLowerCase();
      if (lastEmailRef.current && lastEmailRef.current !== email) {
        setActivities(normalizeActivities([]));
        setReadIds([]);
        setDeletedIds([]);
        setActiveTab('all');
        setSearchQuery('');
        setSearchError('');
      }
      lastEmailRef.current = email;
      setUserEmail(email);

      if (!email) {
        setActivities(normalizeActivities([]));
        return;
      }

      // Get user ID and Name for filtering
      const { data: userData } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('email', email)
        .single();

      const userName = sanitizeText(userData?.name, 120) || email;

      const keys = getKeys(email);
      const [rawRead, rawDeleted, rawMarkAllAt] = await Promise.all([
        AsyncStorage.getItem(keys.read),
        AsyncStorage.getItem(keys.deleted),
        AsyncStorage.getItem(keys.markAllAt),
      ]);
      const read = parseJsonArray(rawRead);
      const deleted = parseJsonArray(rawDeleted);
      const markAllAt = Number(rawMarkAllAt);
      const readSet = new Set(read);
      const deletedSet = new Set(deleted);
      setReadIds(read);
      setDeletedIds(deleted);

      // 1. Fetch pending requests from appointment_approval_requests
      let pendingActivities = [];
      const pendingStatuses = ['Pending Approval', 'Pending Payment Verification'];
      const fetchApprovalRequestRows = async ({ statusIn, statusEq }) => {
        const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${str || ''}`.trim());
        const selectCols = '*';
        const nonSchemaErrors = [];

        const tryFetch = async (builder) => {
          const res = await builder;
          if (!res?.error) return { data: res.data || [], ignored: false };
          if (res.error?.code === '42703' || res.error?.code === '22P02') return { data: [], ignored: true };
          nonSchemaErrors.push(res.error);
          return { data: [], ignored: false };
        };

        const base = () => {
          let q = supabase
            .from('appointment_approval_requests')
            .select(selectCols)
            .order('created_at', { ascending: false });

          if (Array.isArray(statusIn) && statusIn.length) q = q.in('status', statusIn);
          if (typeof statusEq === 'string' && statusEq) q = q.eq('status', statusEq);
          return q;
        };

        const chunks = [];

        if (userData?.id && isUUID(userData.id)) {
          const r1 = await tryFetch(base().eq('patient_id', userData.id));
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

      const pendingRes = await fetchApprovalRequestRows({ statusIn: pendingStatuses });
      if (!pendingRes.error && pendingRes.data) {
        pendingActivities = (pendingRes.data || [])
          .filter((b) => b?.id && !deletedSet.has(`pending-${b.id}`))
          .map((b, idx) =>
            buildActivityFromBooking(
              {
                id: b.id,
                service_type: b.reason || 'Service Booking',
                category: '',
                appointment_date: b.requested_date,
                appointment_time: b.requested_time,
                status: b.status,
                created_at: b.created_at,
              },
              idx,
              {
                id: `pending-${b.id}`,
                isRead: readSet.has(`pending-${b.id}`),
              }
            )
          );
      }

      const approvalIsVideoLike = (reason) => {
        const r = sanitizeText(reason, 400).toLowerCase();
        return r.includes('payref:') || r.includes('video consultation') || r.includes('[video]') || r.includes('video call');
      };

      // 2. Fetch approved appointments from appointments table
      const { data: approvedData, error: approvedError } = await supabase
        .from('appointments')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false });

      if (approvedError) throw approvedError;

      const approvedActivities = (approvedData || [])
        .filter((b) => {
          return b?.id && !deletedSet.has(`approved-${b.id}`);
        })
        .map((b, idx) => buildActivityFromBooking({
          ...b,
          status: 'Approved',
          service_type: b.service_type || b.reason || 'Service Booking'
        }, idx, { 
          id: `approved-${b.id}`,
          isRead: readSet.has(`approved-${b.id}`) 
        }));

      // 3. Fetch approved (non-video) approvals from appointment_approval_requests
      const approvedReqRes = await fetchApprovalRequestRows({ statusEq: 'Approved' });
      const approvedRequestActivities = (approvedReqRes.data || [])
        .filter((b) => b?.id && !deletedSet.has(`approvedreq-${b.id}`))
        .filter((b) => !approvalIsVideoLike(b?.reason))
        .map((b, idx) =>
          buildActivityFromBooking(
            {
              id: b.id,
              service_type: b.reason || 'Service Booking',
              category: '',
              appointment_date: b.requested_date,
              appointment_time: b.requested_time,
              status: b.status,
              created_at: b.created_at,
            },
            idx,
            {
              id: `approvedreq-${b.id}`,
              isRead: readSet.has(`approvedreq-${b.id}`),
            },
          ),
        );

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

      const extractAppointmentMeta = (row) => {
        const obj = parseJsonSafe(row?.suggested_note ?? row?.suggestedNote);
        if (obj && typeof obj === 'object') {
          if (obj.__appointmentMeta || obj.appointmentMeta) return obj.__appointmentMeta || obj.appointmentMeta;
        }
        return null;
      };

      const normalizeKey = (v) => `${v || ''}`.trim().toLowerCase().replace(/\s+/g, '_');
      const extractDepartment = (row) => {
        const meta = extractAppointmentMeta(row) || {};
        const direct = sanitizeText(row?.department || row?.dept || meta?.department || '', 70);
        if (direct) return `${direct}`.trim();
        const src = sanitizeText(row?.service_type || row?.serviceType || row?.reason || '', 200);
        const idx = src.indexOf(':');
        if (idx > 0) return src.slice(0, idx).trim();
        return '';
      };
      const extractDoctor = (row) => {
        const meta = extractAppointmentMeta(row) || {};
        const raw =
          sanitizeText(
            row?.assigned_doctor ||
              row?.assignedDoctor ||
              row?.assigned_doctor_name ||
              row?.assignedDoctorName ||
              row?.doctor_name ||
              row?.doctorName ||
              meta?.assignedDoctor ||
              meta?.assignedDoctorName ||
              '',
            80,
          ) || '';
        const trimmed = `${raw}`.trim();
        if (!trimmed) return '';
        return /^dr\./i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
      };
      const extractAssignmentStatusKey = (row) => {
        const meta = extractAppointmentMeta(row) || {};
        return normalizeKey(row?.assignment_status || row?.assignmentStatus || meta?.assignmentStatus || meta?.assignment_status || '');
      };
      const formatDateLong = (dateStr) => {
        const d = `${dateStr || ''}`.trim();
        if (!d) return '';
        const parsed = new Date(d);
        if (Number.isNaN(parsed.getTime())) return d;
        return parsed.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
      };
      const formatTimeShort = (isoOrDate) => {
        const ts =
          typeof isoOrDate === 'string'
            ? Date.parse(isoOrDate)
            : isoOrDate instanceof Date
              ? isoOrDate.getTime()
              : NaN;
        if (Number.isNaN(ts)) return '';
        return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      };

      const assignedSeenKey = `patientDoctorAssignedSeen:${sanitizeText(email, 120).toLowerCase()}`;
      const assignedSeenRaw = await AsyncStorage.getItem(assignedSeenKey);
      const assignedSeen = new Set(parseJsonArray(assignedSeenRaw));
      const nextAssignedSeen = new Set(assignedSeen);

      const doctorAssignedActivities = [];
      const addAssignedActivity = (row, sourcePrefix, fallbackIndex) => {
        if (!row?.id) return;
        const assignmentKey = extractAssignmentStatusKey(row);
        if (assignmentKey !== 'assigned') return;

        const activityId = `doctor-assigned-${sourcePrefix}-${row.id}`;
        if (deletedSet.has(activityId)) return;
        if (nextAssignedSeen.has(activityId)) return;
        nextAssignedSeen.add(activityId);

        const dept = extractDepartment(row);
        const doc = extractDoctor(row);
        const reqDate = sanitizeText(row?.requested_date || row?.requestedDate || row?.appointment_date || row?.appointmentDate || '', 20);
        const assignedAtIso =
          row?.assigned_at || row?.assignedAt || row?.updated_at || row?.updatedAt || row?.created_at || row?.createdAt || new Date().toISOString();

        const msgParts = [
          doc ? `Assigned to ${doc}` : 'Doctor assigned',
          dept ? `for ${dept}` : null,
          reqDate ? `on ${formatDateLong(reqDate)}` : null,
          assignedAtIso ? `at ${formatTimeShort(assignedAtIso)}` : null,
        ].filter(Boolean);

        doctorAssignedActivities.push(
          normalizeActivity(
            {
              id: activityId,
              title: 'Doctor Assigned',
              description: msgParts.join(' '),
              time: formatRelativeTime(assignedAtIso),
              type: 'appointment',
              isRead: readSet.has(activityId),
              createdAt: assignedAtIso || Date.now() - fallbackIndex * 1000,
              appointmentDate: reqDate,
              appointmentRef: sanitizeText(row?.payment_reference || row?.payref || row?.reference || row?.ref_no || '', 80),
              rawBookingId: sanitizeText(row?.id, 80),
            },
            fallbackIndex,
          ),
        );
      };

      (approvedReqRes.data || []).forEach((row, idx) => addAssignedActivity(row, 'req', idx));
      (pendingRes.data || []).forEach((row, idx) => addAssignedActivity(row, 'pending', idx));
      (approvedData || []).forEach((row, idx) => addAssignedActivity(row, 'appt', idx));

      if (nextAssignedSeen.size !== assignedSeen.size) {
        AsyncStorage.setItem(assignedSeenKey, JSON.stringify(Array.from(nextAssignedSeen))).catch(() => {});
      }

      let apiActivities = [];
      try {
        const api = await fetchApiNotificationsWithPatientId({ email, name: userName });
        const items = Array.isArray(api?.items) ? api.items : [];

        apiActivities = items
          .map((n, idx) => {
            const rawType = `${n?.type || n?.kind || ''}`.trim().toLowerCase();
            const isLab = rawType.includes('lab') || rawType.includes('result');
            const status = n?.verification_status || n?.status || n?.state;
            const title =
              sanitizeText(n?.title, 60) ||
              (isLab ? normalizeLabStatusTitle(status) : 'Notification');
            const description =
              sanitizeText(n?.message, 240) ||
              sanitizeText(n?.description, 240) ||
              (isLab ? 'Your lab result has been updated.' : 'You have a new notification.');

            const createdAtIso = n?.created_at || n?.createdAt || n?.timestamp || null;
            const isReadFromApi =
              typeof n?.isRead === 'boolean'
                ? n.isRead
                : typeof n?.is_read === 'boolean'
                  ? n.is_read
                  : !!(n?.read_at || n?.readAt);

            const idRaw =
              sanitizeText(n?.id, 80) ||
              sanitizeText(n?.notification_id, 80) ||
              sanitizeText(n?.lab_result_id, 80);
            const labResultId =
              sanitizeText(n?.lab_result_id, 120) ||
              sanitizeText(n?.labResultId, 120) ||
              sanitizeText(n?.result_id, 120) ||
              sanitizeText(n?.resultId, 120) ||
              '';

            const fallbackKey = `${createdAtIso || ''}|${rawType}|${title}|${description}|${labResultId}`;
            const stableId = idRaw || `fallback-${hashText(fallbackKey)}`;
            const safeId = `api-${stableId}`;
            const createdAtTs =
              typeof createdAtIso === 'number'
                ? createdAtIso
                : typeof createdAtIso === 'string' && !Number.isNaN(Date.parse(createdAtIso))
                  ? Date.parse(createdAtIso)
                  : NaN;

            const userRead = readSet.has(safeId);
            let isRead = isReadFromApi || userRead;
            if (Number.isFinite(markAllAt) && Number.isFinite(createdAtTs) && createdAtTs > markAllAt) {
              isRead = userRead;
            }

            return normalizeActivity(
              {
                id: safeId,
                title,
                description,
                time: formatRelativeTime(createdAtIso),
                type: isLab ? 'record' : 'system',
                isRead,
                createdAt: createdAtIso || Date.now() - idx * 1000,
                labResultId,
              },
              idx,
            );
          })
          .filter((a) => a?.id && !deletedSet.has(a.id));
      } catch (_) {
        apiActivities = [];
      }

      setActivities(
        normalizeActivities([
          ...apiActivities,
          ...doctorAssignedActivities,
          ...pendingActivities,
          ...approvedRequestActivities,
          ...approvedActivities,
        ]),
      );
    } catch (e) {
      console.error('Error loading patient activity:', e);
      setActivities(normalizeActivities([]));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFromSupabase();
    }, [loadFromSupabase])
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timer = null;

      const run = async () => {
        const email = sanitizeText((await AsyncStorage.getItem('userEmail')) || '', 120).toLowerCase();
        if (!email || cancelled) return;
        const base = getApiBaseUrl();
        if (!base) return;
        loadFromSupabase();
      };

      run();
      timer = setInterval(run, 25000);
      return () => {
        cancelled = true;
        if (timer) clearInterval(timer);
      };
    }, [loadFromSupabase]),
  );

  useEffect(() => {
    if (!userEmail) return;

    // Listen for updates in BOTH tables (Pending requests and Approved appointments)
    const channel1 = supabase
      .channel(`pending_updates_${userEmail}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'appointment_approval_requests'
          // No simple email filter here as it uses patient_id usually, but let's keep it broad or just reload
        },
        () => loadFromSupabase()
      )
      .subscribe();

    const channel2 = supabase
      .channel(`approved_updates_${userEmail}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'appointments'
        },
        () => loadFromSupabase()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, [userEmail, loadFromSupabase]);

  const handleMarkAllAsRead = useCallback(async () => {
    if (!userEmail) return;

    try {
      const { data: userData } = await supabase
        .from('accounts')
        .select('name')
        .eq('email', userEmail)
        .maybeSingle();
      const userName = sanitizeText(userData?.name, 120) || userEmail;
      await markAllReadApiWithPatientId({ email: userEmail, name: userName });
    } catch (_) {}

    const keys = getKeys(userEmail);
    const now = Date.now();
    AsyncStorage.setItem(keys.markAllAt, String(now)).catch(() => {});

    setActivities((prev) => {
      const next = prev.map((a) => ({ ...a, isRead: true }));
      const allIds = next.map((a) => a.id);
      setReadIds(allIds);
      AsyncStorage.setItem(keys.read, JSON.stringify(allIds)).catch(() => {});
      return next;
    });
  }, [getKeys, userEmail]);

  const markAsRead = useCallback((id) => {
    if (!userEmail) return;
    const keys = getKeys(userEmail);
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)));
    setReadIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [id, ...prev].slice(0, 200);
      AsyncStorage.setItem(keys.read, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [getKeys, userEmail]);

  const onActivityOpen = useCallback(
    (activity) => {
      const safe = normalizeActivity(activity, 0);
      markAsRead(safe.id);

      try {
        switch (safe.type) {
          case 'appointment': {
            let initialDate = '';
            const rawAppt = `${safe.appointmentDate || ''}`.trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(rawAppt)) {
              initialDate = rawAppt;
            } else if (rawAppt) {
              const d = new Date(rawAppt);
              if (!Number.isNaN(d.getTime())) {
                const yyyy = d.getFullYear();
                const mm = `${d.getMonth() + 1}`.padStart(2, '0');
                const dd = `${d.getDate()}`.padStart(2, '0');
                initialDate = `${yyyy}-${mm}-${dd}`;
              }
            }
            if (!initialDate) {
              const desc = `${safe.description || ''}`;
              const matches = desc.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
              if (matches) {
                const yyyy = matches[1];
                const mm = `${matches[2]}`.padStart(2, '0');
                const dd = `${matches[3]}`.padStart(2, '0');
                initialDate = `${yyyy}-${mm}-${dd}`;
              }
            }
            if (!initialDate) {
              const titleOrDesc = `${safe.title || ''} ${safe.description || ''}`;
              const mdy = titleOrDesc.match(/(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s*(\d{4})/i);
              if (mdy) {
                const months = {january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
                const m = months[String(mdy[1]).toLowerCase()];
                const d = Number(mdy[2]);
                const y = Number(mdy[3]);
                if (Number.isFinite(m) && Number.isFinite(d) && Number.isFinite(y)) {
                  const dt = new Date(y, m, d);
                  if (!Number.isNaN(dt.getTime())) {
                    const yyyy = dt.getFullYear();
                    const mm = `${dt.getMonth() + 1}`.padStart(2, '0');
                    const dd = `${dt.getDate()}`.padStart(2, '0');
                    initialDate = `${yyyy}-${mm}-${dd}`;
                  }
                }
              }
            }
            navigation.navigate('Schedule', initialDate ? { initialDate } : undefined);
            return;
          }
          case 'record':
            navigation.navigate('Records', safe?.labResultId ? { labResultId: safe.labResultId } : undefined);
            return;
          case 'medication':
            navigation.navigate('Services');
            return;
          case 'billing':
            Alert.alert('Payment', safe.description);
            return;
          default:
            Alert.alert('Activity', safe.description);
            return;
        }
      } catch (e) {
        Alert.alert('Error', 'Unable to open this activity. Please try again.');
      }
    },
    [markAsRead, navigation]
  );

  const handleDeleteActivity = useCallback((id) => {
    Alert.alert(
      'Delete Activity',
      'Are you sure you want to remove this activity from your list?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            setActivities((prev) => prev.filter((a) => a.id !== id));
            if (!userEmail) return;
            const keys = getKeys(userEmail);
            setDeletedIds((prev) => {
              if (prev.includes(id)) return prev;
              const next = [id, ...prev].slice(0, 500);
              AsyncStorage.setItem(keys.deleted, JSON.stringify(next)).catch(() => {});
              return next;
            });
          } 
        },
      ]
    );
  }, [getKeys, userEmail]);

  const onSearchChange = useCallback((value) => {
    setSearchQuery(value);
    setSearchError(validateSearchQuery(value));
  }, []);

  const filteredActivities = useMemo(() => {
    const query = sanitizeText(searchQuery, 40).toLowerCase();
    const tabFiltered =
      activeTab === 'unread' ? activities.filter((a) => !a.isRead) : activities;
    if (!query) return tabFiltered;
    return tabFiltered.filter((a) => {
      const hay = `${a.title} ${a.description} ${a.time} ${a.type}`.toLowerCase();
      return hay.includes(query);
    });
  }, [activeTab, activities, searchQuery]);

  const renderItem = useCallback(
    ({ item }) => {
      const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.system;
      return (
        <TouchableOpacity
          style={[styles.activityCard, !item.isRead && styles.unreadCard]}
          onPress={() => onActivityOpen(item)}
          onLongPress={() => handleDeleteActivity(item.id)}
          activeOpacity={0.85}
        >
          <View style={[styles.leftAccent, !item.isRead && styles.leftAccentUnread]} />

          <View style={[styles.iconContainer, { backgroundColor: `${cfg.color}14` }]}>
            <MaterialCommunityIcons name={cfg.icon} size={22} color={cfg.color} />
          </View>

          <View style={styles.cardBody}>
            <View style={styles.row}>
              <Text style={[styles.title, !item.isRead && styles.unreadTitle]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.time} numberOfLines={1}>
                {item.time}
              </Text>
            </View>

            <Text style={styles.description} numberOfLines={2}>
              {item.description}
            </Text>

            <View style={styles.metaRow}>
              <View style={[styles.typePill, { backgroundColor: `${cfg.color}12` }]}>
                <Text style={[styles.typePillText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>

              {!item.isRead && <Text style={styles.unreadLabel}>Unread</Text>}

              <TouchableOpacity
                style={[styles.openBtn, { borderColor: `${THEME_ORANGE}40` }]}
                onPress={() => onActivityOpen(item)}
                activeOpacity={0.85}
              >
                <Text style={styles.openBtnText}>Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [THEME_ORANGE, handleDeleteActivity, onActivityOpen]
  );

  return (
    <SafeAreaView style={styles.container}>
      <PatientHeader 
        title="Activity"
        navigation={navigation}
        onMenuPress={toggleDrawer}
        userData={userData}
      />
      
      <View style={styles.headerContainer}>
        <View style={styles.headerTopRow}>
          <View>
            <Text style={styles.subHeader}>Updates from your hospital services</Text>
          </View>

          <TouchableOpacity
            style={[styles.markAllBtn, unreadCount === 0 && { opacity: 0.5 }]}
            onPress={handleMarkAllAsRead}
            disabled={unreadCount === 0}
            activeOpacity={0.85}
          >
            <Feather name="check" size={14} color="#fff" />
            <Text style={styles.markAllText}>Mark all</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryRowTop}>
          <View style={styles.summaryChip}>
            <MaterialCommunityIcons name="bell-outline" size={16} color={THEME_ORANGE} />
            <Text style={styles.summaryChipText}>{activities.length} total</Text>
          </View>
          <View style={[styles.summaryChip, unreadCount > 0 && styles.summaryChipUnread]}>
            <MaterialCommunityIcons name="bell-badge-outline" size={16} color={unreadCount > 0 ? '#fff' : THEME_ORANGE} />
            <Text style={[styles.summaryChipText, unreadCount > 0 && { color: '#fff' }]}>{unreadCount} unread</Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Feather name="search" size={16} color="#9ca3af" />
          <TextInput
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Search activity (e.g., appointment, invoice #)"
            placeholderTextColor="#9ca3af"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => onSearchChange('')} activeOpacity={0.85}>
              <Feather name="x" size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
        {!!searchError && <Text style={styles.errorText}>{searchError}</Text>}

        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'all' && styles.tabPillActive]}
            onPress={() => setActiveTab('all')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'unread' && styles.tabPillActive]}
            onPress={() => setActiveTab('unread')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'unread' && styles.tabTextActive]}>Unread</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={THEME_ORANGE} />
          <Text style={{ marginTop: 10, color: '#6b7280', fontWeight: '700' }}>Loading activity…</Text>
        </View>
      ) : (
        <FlatList
          data={filteredActivities}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listPadding}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBox}>
                <MaterialCommunityIcons name="clipboard-text-outline" size={46} color={THEME_ORANGE} />
              </View>
              <Text style={styles.emptyTitle}>
                {activeTab === 'unread' ? 'No unread activity' : 'No activity found'}
              </Text>
              <Text style={styles.emptyText}>
                {activeTab === 'unread'
                  ? 'You’re all caught up. New updates will appear here.'
                  : 'Try adjusting your search or check back later for updates.'}
              </Text>
            </View>
          }
        />
      )}

      <PatientSideMenu 
        visible={drawerVisible} 
        onClose={toggleDrawer} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#fff',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  header: {
    fontSize: 26,
    fontWeight: '900',
    color: '#111827',
  },
  subHeader: {
    marginTop: 2,
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#DA7705',
  },
  markAllText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  summaryRowTop: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFAF0',
    borderWidth: 1,
    borderColor: '#FDE7C7',
  },
  summaryChipUnread: {
    backgroundColor: '#DA7705',
    borderColor: '#DA7705',
  },
  summaryChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#7c2d12',
  },
  searchBox: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
    paddingVertical: 0,
  },
  errorText: {
    marginTop: 8,
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
  },
  tabsRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  tabPillActive: {
    backgroundColor: '#FFFAF0',
    borderColor: '#DA7705',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#DA7705',
  },
  listPadding: {
    paddingHorizontal: 20,
    paddingBottom: 110,
    paddingTop: 8,
  },
  activityCard: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#DA7705',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  unreadCard: {
    borderColor: '#FDE7C7',
    backgroundColor: '#FFFEFC',
  },
  leftAccent: {
    width: 6,
    borderRadius: 99,
    backgroundColor: '#e5e7eb',
    marginRight: 10,
    marginTop: 2,
    marginBottom: 2,
    alignSelf: 'stretch',
  },
  leftAccentUnread: {
    backgroundColor: '#DA7705',
  },
  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardBody: {
    flex: 1,
    paddingRight: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    flex: 1,
  },
  unreadTitle: {
    color: '#111827',
  },
  description: {
    color: '#666',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
    fontWeight: '600',
  },
  time: {
    fontSize: 11,
    color: '#999',
    marginLeft: 5,
    fontWeight: '700',
  },
  metaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '900',
  },
  unreadLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#DA7705',
  },
  openBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#FFFAF0',
  },
  openBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#DA7705',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 100,
    paddingHorizontal: 40,
  },
  emptyIconBox: {
    width: 96,
    height: 96,
    borderRadius: 30,
    backgroundColor: '#FFFAF0',
    borderWidth: 1,
    borderColor: '#FDE7C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#333',
    marginBottom: 10,
  },
  emptyText: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '600',
  },
});
