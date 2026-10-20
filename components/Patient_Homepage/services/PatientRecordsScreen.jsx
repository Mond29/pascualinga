import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, TextInput, Modal, ActivityIndicator, Alert, ScrollView, Linking, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../../lib/supabase';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import PatientHistoryScreen from './PatientHistoryScreen';
import PatientHeader from '../PatientHeader';
import PatientSideMenu from '../PatientSideMenu';

export default function PatientRecordsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const THEME_ORANGE = '#DA7705';

  const CATEGORY_CONFIG = {
    Laboratory: { icon: 'test-tube', color: THEME_ORANGE },
    ECG: { icon: 'heart-pulse', color: '#ef4444' },
    Radiology: { icon: 'scan-helper', color: '#2563eb' },
    'Physical Therapy': { icon: 'arm-flex', color: '#16a34a' },
    'Dental Clinic': { icon: 'tooth-outline', color: '#7c3aed' },
    'Surgery (Minor)': { icon: 'medical-bag', color: '#b45309' },
    Anesthesia: { icon: 'needle', color: '#0ea5e9' },
    Pediatrics: { icon: 'baby-face-outline', color: '#f59e0b' },
    'Otolaryngology (ENT)': { icon: 'ear-hearing', color: '#06b6d4' },
    Pathology: { icon: 'microscope', color: '#7c3aed' },
    Orthopedics: { icon: 'bone', color: '#475569' },
    Obstetrics: { icon: 'baby-carriage', color: '#fb7185' },
    Ophthalmology: { icon: 'eye-outline', color: '#14b8a6' },
    Dermatology: { icon: 'face-man-outline', color: '#f97316' },
    Urology: { icon: 'water', color: '#0ea5e9' },
    Other: { icon: 'file-document-outline', color: '#0f766e' },
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

  const safeJsonParse = (raw, fallback) => {
    try {
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const normalizeCategory = (value) => {
    const raw = sanitizeText(value, 40);
    if (!raw) return 'Other';
    if (Object.prototype.hasOwnProperty.call(CATEGORY_CONFIG, raw)) return raw;
    return 'Other';
  };

  const normalizeRecord = (raw, fallbackIndex) => {
    const source = raw?.source === 'document' ? 'document' : 'service';
    const title = sanitizeText(raw?.title ?? raw?.type ?? raw?.name, 70) || 'Medical Record';
    const category = normalizeCategory(raw?.category ?? raw?.serviceCategory ?? raw?.typeLabel);
    const dateLabel = sanitizeText(raw?.dateLabel ?? raw?.date, 40) || '—';
    const verificationStatus = sanitizeText(raw?.verification_status ?? raw?.verificationStatus, 30);
    const status =
      source === 'document'
        ? (() => {
            const s = `${verificationStatus || raw?.status || ''}`.trim().toLowerCase();
            if (s.includes('reject')) return 'Rejected';
            if (s.includes('flag') || s.includes('pending') || s.includes('review')) return 'Under review';
            if (s.includes('verify') || s.includes('approved') || s.includes('available')) return 'Available';
            return 'Available';
          })()
        : sanitizeText(raw?.status, 20) || 'Booked';
    const paymentMethod = sanitizeText(raw?.paymentMethod, 30) || '';
    const createdAtRaw = raw?.createdAt;
    const createdAt =
      typeof createdAtRaw === 'number'
        ? createdAtRaw
        : typeof createdAtRaw === 'string' && !Number.isNaN(Date.parse(createdAtRaw))
        ? Date.parse(createdAtRaw)
        : Date.now() - fallbackIndex * 1000;
    const id = sanitizeText(raw?.id, 80) || `${source}-${createdAt}-${fallbackIndex}`;
    const cfg = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.Other;
    const subtitleParts = [];
    if (category && category !== 'Other') subtitleParts.push(category);
    if (dateLabel && dateLabel !== '—') subtitleParts.push(dateLabel);
    const subtitle = subtitleParts.length ? subtitleParts.join(' • ') : '—';
    return {
      id,
      title,
      subtitle,
      category,
      dateLabel,
      status,
      verificationStatus,
      paymentMethod,
      createdAt,
      source,
      icon: cfg.icon,
      iconColor: cfg.color,
      raw,
    };
  };

  const normalizeRecords = (rawList) => {
    const list = Array.isArray(rawList) ? rawList : [];
    const normalized = list.map((r, idx) => normalizeRecord(r, idx));
    normalized.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const seen = new Set();
    return normalized.filter((r) => {
      if (!r?.id || seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
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

  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeSection, setActiveSection] = useState('Medical');
  const [billingItems, setBillingItems] = useState([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSearch, setBillingSearch] = useState('');
  const [billingPage, setBillingPage] = useState(0);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [billingModalVisible, setBillingModalVisible] = useState(false);
  const [userData, setUserData] = useState({ name: 'Patient', email: '' });
  const [drawerVisible, setDrawerVisible] = useState(false);
  const toggleDrawer = () => setDrawerVisible(!drawerVisible);
  const [authSessionMissing, setAuthSessionMissing] = useState(false);

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

  const getApiBaseUrl = () => {
    const raw = `${process.env.EXPO_PUBLIC_API_BASE_URL || ''}`.trim();
    return raw ? raw.replace(/\/+$/, '') : 'https://api.pascualinga.com';
  };

  const getMobileProxyBase = () => {
    const fromEnv = getApiBaseUrl();
    return fromEnv || 'https://api.pascualinga.com';
  };

  const getApiBaseUrlForBilling = () => getMobileProxyBase();

  const loadSessionTokenForPatient = async ({ email }) => {
    let token = '';
    let source = 'none';
    let refreshAttempted = false;
    try {
      let { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!sessionError && sessionData?.session?.access_token) {
        token = sessionData.session.access_token.trim();
        source = 'supabase.auth.getSession()';
      }
      if (!token) {
        // Session might be stale or missing — try explicit refresh
        refreshAttempted = true;
        const refreshed = await supabase.auth.refreshSession().catch(() => ({ data: null, error: 'refresh-threw' }));
        if (refreshed?.data?.session?.access_token) {
          token = refreshed.data.session.access_token.trim();
          source = 'supabase.auth.refreshSession()';
        } else {
          // Last attempt: no session at all, see if we can sign in silently by getting current user
          const current = await supabase.auth.getUser().catch(() => ({ data: null, error: 'getuser-threw' }));
          if (current?.data?.user && refreshed?.data?.session?.access_token) {
            token = refreshed.data.session.access_token.trim();
            source = 'supabase.auth.getUser()+refresh()';
          }
        }
      }
    } catch (sessErr) {
      // eslint-disable-next-line no-console
      console.log('[Forensics: lab:mine:token] supabase auth lookup threw (non-fatal):', {
        message: sessErr?.message || String(sessErr || ''),
      });
    }
    if (!token) {
      try {
        const cuRaw = await AsyncStorage.getItem('currentUser');
        if (cuRaw) {
          try {
            const cu = JSON.parse(cuRaw);
            if (cu && typeof cu === 'object') {
              const candFields = ['access_token', 'accessToken', 'sessionToken', 'session_token', 'token', 'authToken', 'auth_token', 'jwt', 'bearer'];
              for (const f of candFields) {
                if (typeof cu[f] === 'string' && cu[f].trim()) { token = cu[f].trim(); source = `currentUser.${f}`; break; }
                const d = cu.data;
                if (d && typeof d === 'object' && typeof d[f] === 'string' && d[f].trim()) { token = d[f].trim(); source = `currentUser.data.${f}`; break; }
                const u = cu.user;
                if (u && typeof u === 'object' && typeof u[f] === 'string' && u[f].trim()) { token = u[f].trim(); source = `currentUser.user.${f}`; break; }
              }
              if (!token && typeof cu.session?.access_token === 'string') {
                token = cu.session.access_token.trim();
                source = 'currentUser.session.access_token';
              }
            }
          } catch (_) {}
        }
      } catch (_) {}
    }
    if (!token) {
      try { const v = await AsyncStorage.getItem('sessionToken'); if (v && typeof v === 'string' && v.trim()) { token = v.trim(); source = 'AsyncStorage.sessionToken'; } } catch (_) {}
    }
    // eslint-disable-next-line no-console
    console.log('[Forensics: lab:mine:token]', {
      emailSanitized: email ? `${email.substring(0, 3)}***@***` : '',
      hasToken: Boolean(token),
      tokenLength: String(token || '').length,
      source,
      refreshAttempted,
      note: 'Per backend commit da276d29: token should come from supabase.auth.getSession(). If hasToken=false, user MUST LOGOUT then LOGIN AGAIN — LoginScreen now auto-creates missing Supabase Auth user via signUp() if signInWithPassword fails (accounts table credentials already verified).',
    });
    return {
      hasToken: Boolean(token),
      token,
      hasBearer: Boolean(token),
      bearer: token,
      tokenLength: String(token || '').length,
      startsWithBearer: `Bearer ${token || ''}`.startsWith('Bearer '),
    };
  };

  const fetchLabResultsMine = async ({ email, name, patientId, take = 50 }) => {
    const base = getApiBaseUrl();
    if (!base) return [];

    const { hasToken, token, tokenLength, startsWithBearer } = await loadSessionTokenForPatient({ email });
    // EXACT pre-fetch log per backend spec — NEVER print actual token
    // eslint-disable-next-line no-console
    console.log({ hasToken, tokenLength, startsWithBearer });
    // eslint-disable-next-line no-console
    console.log('[Auth: lab-results:mine]', { endpoint: '/api/lab-results/mine', take });

    const url = `${base}/api/lab-results/mine?take=${encodeURIComponent(String(take))}`;
    const headers = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // ================================================================
    // FORENSIC DEBUG LOG (per web dev request 2026-09-15):
    // Request URL used to populate Medical Records list — NO TOKENS
    // ================================================================
    // eslint-disable-next-line no-console
    console.log('[Forensics: lab:mine:request]', {
      requestUrl: url,
      requestMethod: 'GET',
      requestHeaderKeys: Object.keys(headers).sort(),
      requestHeaderAccept: headers.Accept || '',
      requestHasAuthorizationHeader: Boolean(token),
      requestHasXUserHeaders: Object.keys(headers).some(k => String(k).toLowerCase().startsWith('x-user')),
      patientIdSanitized: `${patientId || ''}`.slice(0, 6) + (patientId && patientId.length > 6 ? '...' : ''),
      note: 'Per latest spec: STRICTLY Authorization: Bearer <supabase_access_token> only. No x-user fallbacks, no other auth schemes.',
    });

    const res = await fetch(url, { method: 'GET', headers });
    const httpStatus = res?.status || 0;

    const text = await res.text().catch(() => '');
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    // ================================================================
    // FORENSIC DEBUG LOG (per web dev request 2026-09-15):
    // HTTP status + response structure + raw result ID 22 object
    // BEFORE any app mapping/transformation.
    // Print EVERY raw top-level key and full ID=22 response.
    // ALL signed tokens redacted.
    // ================================================================
    const CENSOR_TOKEN_REGEX = /\/mobile\/[^/]+(\/[^/]+\.pdf)/g;
    const CENSOR_BEARER_REGEX = /Bearer\s+[A-Za-z0-9\-_.]+/g;
    const censor = (val) => {
      if (val === null || val === undefined) return val;
      if (typeof val === 'string') return val.replace(CENSOR_TOKEN_REGEX, '/mobile/{signed-token}$1').replace(CENSOR_BEARER_REGEX, 'Bearer {redacted}');
      if (typeof val === 'number' || typeof val === 'boolean') return val;
      if (Array.isArray(val)) return val.map(censor);
      if (typeof val === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(val)) {
          const lk = String(k).toLowerCase();
          if (lk === 'password' || lk === 'otp' || lk === 'challengeid' || lk === 'challenge_id') {
            out[k] = '{redacted}';
          } else if (lk === 'sessiontoken' || lk === 'session_token' || lk === 'token' || lk === 'accesstoken' || lk === 'access_token' || lk === 'jwt' || lk === 'bearer') {
            out[k] = typeof v === 'string' ? `{len=${String(v || '').length}}` : (v === null || v === undefined ? v : '{redacted}');
          } else {
            out[k] = censor(v);
          }
        }
        return out;
      }
      return val;
    };

    const allResultsRaw = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    const result22 = allResultsRaw.find(r => {
      const candIds = new Set([
        `${r?.id || ''}`.trim(),
        `${r?.result_id || ''}`.trim(),
        `${r?.resultId || ''}`.trim(),
        `${r?.lab_result_id || ''}`.trim(),
        `${r?.labResultId || ''}`.trim(),
        `${r?.record_id || ''}`.trim(),
        `${r?.recordId || ''}`.trim(),
      ]);
      return candIds.has('22') || candIds.has('22.0');
    });

    // eslint-disable-next-line no-console
    console.log('[Forensics: lab:mine:response]', {
      requestUrl: url,
      httpStatus,
      httpOk: res?.ok || false,
      responseContentType: res?.headers?.get?.('content-type') || '',
      responseTopLevelShape: {
        isArray: Array.isArray(data),
        topKeys: data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : null,
        dataIsArray: Array.isArray(data?.data),
        totalRawResults: allResultsRaw.length,
      },
      id22Found: Boolean(result22),
      id22RawObjectBeforeAnyMapping: censor(result22 || null),
      allRawIds: allResultsRaw.map(r => ({
        id: `${r?.id || ''}`.trim() || null,
        result_id: `${r?.result_id || ''}`.trim() || null,
        resultId: `${r?.resultId || ''}`.trim() || null,
        lab_result_id: `${r?.lab_result_id || ''}`.trim() || null,
        title: typeof r?.title === 'string' ? r.title.slice(0, 40) : (typeof r?.name === 'string' ? r.name.slice(0, 40) : null),
      })).slice(0, 20),
    });

    if (!res.ok) {
      const msg = data?.message || data?.error || text || `HTTP ${res.status}`;
      throw new Error(`${msg}`.trim());
    }
    return Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  };

  const fetchBillingPaymentsMine = async ({ email, patientId, take = 50, skip = 0, baseOverride }) => {
    const base = `${baseOverride || ''}`.trim() || getApiBaseUrlForBilling();
    if (!base) return [];

    const { hasToken, token, tokenLength, startsWithBearer } = await loadSessionTokenForPatient({ email });
    // EXACT pre-fetch log per backend spec — NEVER print actual token
    // eslint-disable-next-line no-console
    console.log({ hasToken, tokenLength, startsWithBearer });
    // eslint-disable-next-line no-console
    console.log('[Auth: billing:mine:payments]', { endpoint: '/api/billing/mine/payments', take, skip });

    const url = `${base}/api/billing/mine/payments?take=${encodeURIComponent(String(take))}&skip=${encodeURIComponent(String(skip))}`;
    const headers = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { method: 'GET', headers });

    const text = await res.text().catch(() => '');
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!res.ok) {
      const msg = data?.message || data?.error || text || `HTTP ${res.status}`;
      throw new Error(`${msg}`.trim());
    }
    const pickArray = (value) => (Array.isArray(value) ? value : null);
    const candidates = [
      pickArray(data),
      pickArray(data?.data),
      pickArray(data?.payments),
      pickArray(data?.data?.payments),
      pickArray(data?.items),
      pickArray(data?.data?.items),
      pickArray(data?.results),
      pickArray(data?.data?.results),
      pickArray(data?.rows),
      pickArray(data?.data?.rows),
      pickArray(data?.payments?.items),
      pickArray(data?.data?.payments?.items),
    ].filter(Boolean);
    return candidates[0] || [];
  };

  const looksLikeUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${value || ''}`.trim());

  const fetchLabResultsFromSupabase = async ({ email, take = 50 }) => {
    const tryPatientSelect = async (cols) => {
      return await supabase.from('patients').select(cols).ilike('email', email).limit(1).maybeSingle();
    };

    let patientRes = await tryPatientSelect('id, patient_id, email');
    if (patientRes.error) {
      const msg = `${patientRes.error?.message || ''}`.toLowerCase();
      if (patientRes.error?.code === '42703' || msg.includes('patient_id') || msg.includes('does not exist')) {
        patientRes = await tryPatientSelect('id, email');
      }
    }

    if (patientRes.error) throw patientRes.error;
    const patient = patientRes.data;
    const patientUuid = looksLikeUuid(patient?.id) ? `${patient.id}` : '';
    if (!patientUuid) return [];

    const tryOrder = async (col) => {
      const res = await supabase
        .from('lab_results')
        .select('*')
        .eq('patient_id', patientUuid)
        .order(col, { ascending: false })
        .limit(take);
      return res;
    };

    let labRes = await tryOrder('verified_at');
    if (labRes.error) {
      const msg = `${labRes.error?.message || ''}`.toLowerCase();
      if (msg.includes('column') || msg.includes('does not exist') || msg.includes('unknown')) {
        labRes = await tryOrder('created_at');
      }
    }
    if (labRes.error) throw labRes.error;
    return labRes.data || [];
  };

  const getCurrentUserIdentity = async () => {
    const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
    if (!email) return null;

    const cachedName = sanitizeText(await AsyncStorage.getItem(`userName:${email}`), 120);
    const cachedPatientId = sanitizeText(await AsyncStorage.getItem(`patientId:${email}`), 120);
    if (cachedName && cachedPatientId) return { email, name: cachedName, patientId: cachedPatientId };

    const tryPatientSelect = async (cols) => {
      return await supabase.from('patients').select(cols).ilike('email', email).limit(1).maybeSingle();
    };

    let accountId = null;
    let fetchedName = cachedName || '';

    try {
      const { data } = await supabase.from('accounts').select('id, name').eq('email', email).maybeSingle();
      accountId = data?.id || null;
      const nameFromAccounts = sanitizeText(data?.name, 120);
      if (nameFromAccounts) fetchedName = nameFromAccounts;
    } catch (_) {}

    if (fetchedName) {
      try {
        await AsyncStorage.setItem(`userName:${email}`, fetchedName);
      } catch (_) {}
    }

    let patientUuid = cachedPatientId || '';
    if (!looksLikeUuid(patientUuid)) {
      try {
        let patientRes = await tryPatientSelect('id, patient_id, email');
        if (patientRes.error) {
          const msg = `${patientRes.error?.message || ''}`.toLowerCase();
          if (patientRes.error?.code === '42703' || msg.includes('patient_id') || msg.includes('does not exist')) {
            patientRes = await tryPatientSelect('id, email');
          }
        }
        const patient = patientRes?.data || null;
        patientUuid = looksLikeUuid(patient?.id) ? `${patient.id}` : '';
      } catch (_) {
        patientUuid = '';
      }
    }

    if (patientUuid) {
      try {
        await AsyncStorage.setItem(`patientId:${email}`, patientUuid);
      } catch (_) {}
    }

    if (!fetchedName) fetchedName = email.includes('@') ? email.split('@')[0] : email;
    return { email, name: fetchedName, accountId, patientId: patientUuid || null };
  };

  const loadRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      const identity = await getCurrentUserIdentity();
      if (!identity?.email) {
        setRecords(normalizeRecords([]));
        return;
      }
      const email = identity.email;
      const userName = sanitizeText(identity.name, 120);
      const patientId = sanitizeText(identity?.patientId, 120);

      const { data, error } = await supabase
        .from('service_appointment')
        .select('id, category, service_type, appointment_date, appointment_time, status, payment_method, created_at')
        .eq('patient_email', email)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const fromServices = (data || []).map((b, idx) => ({
        id: b.id,
        title: b.service_type || 'Service',
        category: b.category || 'Other',
        dateLabel: b.appointment_date || '—',
        status: b.status || 'Booked',
        paymentMethod: b.payment_method || '',
        createdAt: b.created_at,
        source: 'service',
        raw: b,
      }));

      let fromLabResults = [];
      try {
        const apiBase = getApiBaseUrl();
        let apiLabResults = [];
        let apiCallSucceededWith200 = false;
        // Check auth session BEFORE attempting API call — show warning banner if missing
        try {
          const sess = await loadSessionTokenForPatient({ email });
          if (!sess?.hasToken) {
            setAuthSessionMissing(true);
          } else {
            setAuthSessionMissing(false);
          }
        } catch (_) { /* ignore — just don't show banner */ }
        if (apiBase) {
          try {
            apiLabResults = await fetchLabResultsMine({ email, name: userName, patientId, take: 50 });
            // If we got here with NO exception thrown = API call completed successfully (200 OK)
            // even if the result list is EMPTY (0 records). This means the backend has
            // confirmed the user has ZERO lab records assigned. Do NOT fall back to Supabase
            // local lab_results table in that case (avoids showing OTHER PATIENTS' global
            // records that happen to live in the Supabase table without strict per-user RLS).
            apiCallSucceededWith200 = true;
          } catch (e) {
            const m = `${e?.message || e}`.trim();
            if (m) {
              console.log('Records: API lab fetch error (fallback to Supabase):', m);
              const lower = `${m || ''}`.toLowerCase();
              if (lower.includes('authentication required') || lower.includes('sign in') || lower.includes('401') || lower.includes('unauthorized')) {
                setAuthSessionMissing(true);
              }
            }
            apiLabResults = [];
          }
        }
        let supaLabResults = [];
        // ----------------------------------------------------------------
        // CRITICAL PER-PATIENT PRIVACY FIX:
        // Only use the Supabase local-lab_results fallback when the BACKEND
        // API CALL ITSELF FAILED (network error, 500, unreachable).
        // If the backend API returned HTTP 200 OK (even with 0 records =
        // totalRawResults: 0), the backend is the source of truth. We MUST
        // NOT merge in Supabase fallback rows in that scenario — otherwise
        // brand new accounts (with no records) will see GLOBAL / OTHER
        // PATIENTS' records from the pre-da276d29 Supabase table era.
        // ----------------------------------------------------------------
        if (!apiCallSucceededWith200) {
          try {
            supaLabResults = await fetchLabResultsFromSupabase({ email, take: 50 }).catch(() => []);
          } catch (_) { supaLabResults = []; }
        } else {
          // Backend returned successfully — zero Supabase fallback.
          supaLabResults = [];
        }

        const seenIds = new Set();
        const merged = [];
        const apiCount = (apiLabResults || []).length;
        const supaCount = (supaLabResults || []).length;
        for (const row of [...(apiLabResults || []), ...(supaLabResults || [])]) {
          const id = `${row?.id || row?.lab_result_id || row?.result_id || JSON.stringify(row || '').slice(0, 50)}`;
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          merged.push({
            ...(row || {}),
            _source: apiLabResults?.includes(row) ? 'backend-api-da276d29' : 'supabase-fallback',
          });
        }
        const labResults = merged;
        const mergedCount = labResults.length;
        // eslint-disable-next-line no-console
        console.log('[Forensics: lab:mine:merge]', {
          emailSanitized: email ? `${email.substring(0, 3)}***@***` : '',
          apiCallSucceededWith200,
          apiCount,
          supaCount,
          mergedCount,
          supabaseFallbackUsed: !apiCallSucceededWith200 && supaCount > 0,
          note: 'Privacy rule: Supabase fallback is ONLY used when backend API call throws (network/5xx). If backend returns 200 (even empty list = user truly has 0 records), supaCount is forced to 0 to avoid leaking other patients global legacy records stored in the Supabase lab_results table pre-da276d29.',
        });
        fromLabResults = (labResults || []).map((r, idx) => {
          const pdfUrl =
            `${r?.url || r?.file_url || r?.fileUrl || r?.pdf_url || r?.pdfUrl || r?.public_url || r?.publicUrl || r?.link || r?.signed_url || r?.signedUrl || ''}`.trim();
          return ({
          id: r.id || r.result_id || r.lab_result_id || `${idx}`,
          title: r.title || r.test_name || r.name || r.type || 'Laboratory Result',
          category: r.category || 'Laboratory',
          dateLabel: r.date || r.result_date || r.verified_at || r.created_at || '—',
          status: r.status || 'Available',
          pdfUrl,
          paymentMethod: r.payment_method || '',
          createdAt: r.verified_at || r.created_at || r.date || Date.now() - idx * 1000,
          source: 'document',
          raw: { ...(r || {}), ...(pdfUrl ? { url: pdfUrl } : {}) },
        });
        });
      } catch (e) {
        const msg = `${e?.message || e}`.trim();
        if (msg) console.log('Records: lab results fetch failed:', msg);
      }

      setRecords(normalizeRecords([...fromLabResults, ...fromServices]));
    } catch (e) {
      console.error('Error loading records:', e);
      setRecords(normalizeRecords([]));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (activeSection === 'Medical') loadRecords();
    }, [loadRecords])
  );

  useFocusEffect(
    useCallback(() => {
      let channel;
      let cancelled = false;

      const start = async () => {
        if (activeSection !== 'Medical') return;
        const email = await AsyncStorage.getItem('userEmail');
        if (cancelled || !email) return;

        channel = supabase
          .channel(`patient_records_${email}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'service_appointment' },
            (payload) => {
              const row = payload?.new;
              if (!row?.patient_email || row.patient_email !== email) return;
              loadRecords();
            }
          )
          .subscribe();
      };

      start();

      return () => {
        cancelled = true;
        if (channel) supabase.removeChannel(channel);
      };
    }, [loadRecords])
  );

  const loadBilling = useCallback(async () => {
    setBillingLoading(true);
    try {
      const identity = await getCurrentUserIdentity();
      if (!identity?.email) {
        setBillingItems([]);
        return;
      }
      const email = identity.email;
      const patientId = sanitizeText(identity?.patientId, 120) || '';
      const userName = sanitizeText(identity?.name, 120);

      const primaryBase = getApiBaseUrl();
      const fallbackBase = getApiBaseUrlForBilling();
      const baseCandidates = [];
      if (primaryBase) baseCandidates.push(primaryBase);
      if (fallbackBase && fallbackBase !== primaryBase) baseCandidates.push(fallbackBase);
      if (!baseCandidates.length) {
        setBillingItems([]);
        return;
      }

      const tryFetchPayments = async (base) => {
        let payments = await fetchBillingPaymentsMine({ email, patientId, take: 50, skip: 0, baseOverride: base }).catch(() => []);
        if ((!payments || !payments.length) && patientId) {
          const retryByEmailOnly = await fetchBillingPaymentsMine({ email, patientId: '', take: 50, skip: 0, baseOverride: base }).catch(() => []);
          if (retryByEmailOnly?.length) payments = retryByEmailOnly;
        }
        if ((!payments || !payments.length) && email) {
          const retryByPatientOnly = await fetchBillingPaymentsMine({ email: '', patientId, take: 50, skip: 0, baseOverride: base }).catch(() => []);
          if (retryByPatientOnly?.length) payments = retryByPatientOnly;
        }
        return payments || [];
      };

      let payments = [];
      for (const base of baseCandidates) {
        payments = await tryFetchPayments(base);
        if (payments?.length) break;
      }
      const list = (payments || []).map((p, idx) => {
        const createdAtRaw = p?.createdAt || p?.created_at || p?.collectedAt || p?.collected_at;
        const createdAtMs =
          typeof createdAtRaw === 'string' && !Number.isNaN(Date.parse(createdAtRaw)) ? Date.parse(createdAtRaw) : Date.now() - idx * 1000;
        const receiptNumber = sanitizeText(p?.receiptNumber || p?.receipt_number || p?.reference || p?.receipt || p?.id, 80) || '—';
        const source = sanitizeText(p?.source || p?.paymentSource || p?.payment_source || p?.category || p?.type, 40) || 'Payment';
        const serviceLabel =
          sanitizeText(p?.serviceLabel || p?.service_label || p?.service || p?.serviceName || p?.service_name, 140) || 'Hospital Service';
        const method = sanitizeText(p?.method || p?.paymentMethod || p?.payment_method, 40) || '—';
        const receivedBy = sanitizeText(p?.receivedBy || p?.received_by || p?.cashier || p?.cashierEmail || p?.cashier_email, 120) || '';
        const amountRaw = Number(p?.amount);
        const amount = Number.isFinite(amountRaw) ? amountRaw : null;
        const currency = sanitizeText(p?.currency, 10) || 'PHP';
        const status = sanitizeText(p?.status || p?.paymentStatus || p?.payment_status, 30) || 'Paid';
        const invoice = p?.invoice && typeof p.invoice === 'object' ? p.invoice : null;

        const dateLabel = typeof createdAtRaw === 'string' ? createdAtRaw.slice(0, 10) : '';
        const timeLabel =
          typeof createdAtRaw === 'string' && createdAtRaw.includes('T') ? createdAtRaw.split('T')[1]?.slice(0, 5) : '';

        return {
          id: sanitizeText(p?.id, 80) || `${receiptNumber}-${createdAtMs}-${idx}`,
          receiptNumber,
          source,
          serviceLabel,
          method,
          amount,
          currency,
          status,
          receivedBy,
          dateLabel,
          timeLabel,
          createdAt: createdAtMs,
          invoice,
          raw: p,
        };
      });

      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setBillingItems(list);
    } catch (e) {
      const msg = `${e?.message || e || ''}`.trim();
      const lower = msg.toLowerCase();
      if (lower.includes('does not exist') || lower.includes('relation') || e?.code === '42P01') {
        setBillingItems([]);
        return;
      }
      Alert.alert('Error', msg || 'Failed to load billing records.');
      setBillingItems([]);
    } finally {
      setBillingLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (activeSection !== 'Billing') return;
      let active = true;
      const run = async () => {
        if (!active) return;
        await loadBilling();
      };
      run();
      return () => {
        active = false;
      };
    }, [activeSection, loadBilling]),
  );

  const sectionTabs = useMemo(
    () => [
      { key: 'Medical', label: 'Medical Records' },
      { key: 'Appointments', label: 'Appointment Records' },
      { key: 'Billing', label: 'Billing Records' },
    ],
    [],
  );

  const billingFiltered = useMemo(() => {
    const q = sanitizeText(billingSearch, 40).toLowerCase();
    const list = Array.isArray(billingItems) ? billingItems : [];
    if (!q) return list;
    return list.filter((it) =>
      `${it.receiptNumber} ${it.source} ${it.serviceLabel} ${it.method} ${it.amount} ${it.currency} ${it.receivedBy} ${it.status} ${it.dateLabel} ${it.timeLabel}`.toLowerCase().includes(q),
    );
  }, [billingItems, billingSearch]);

  const billingPageSize = 12;
  const billingPageCount = useMemo(() => Math.max(1, Math.ceil(billingFiltered.length / billingPageSize)), [billingFiltered.length]);
  const billingPageClamped = Math.min(Math.max(billingPage, 0), billingPageCount - 1);
  const billingSliceStart = billingPageClamped * billingPageSize;
  const billingPageItems = useMemo(
    () => billingFiltered.slice(billingSliceStart, billingSliceStart + billingPageSize),
    [billingFiltered, billingSliceStart],
  );

  const billingStatusStyle = useCallback((status) => {
    const s = sanitizeText(status, 30).toLowerCase();
    if (s.includes('paid') || s.includes('success')) return { bg: '#dcfce7', fg: '#166534' };
    if (s.includes('pending')) return { bg: '#ffedd5', fg: '#9a3412' };
    if (s.includes('fail') || s.includes('cancel') || s.includes('expire')) return { bg: '#fee2e2', fg: '#991b1b' };
    return { bg: '#e2e8f0', fg: '#0f172a' };
  }, []);

  const renderSectionTabs = useMemo(() => {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        alwaysBounceHorizontal={false}
        overScrollMode="never"
        contentContainerStyle={styles.sectionTabsRow}
      >
        {sectionTabs.map((t) => {
          const active = t.key === activeSection;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.sectionTab, active ? styles.sectionTabActive : null]}
              onPress={() => {
                setActiveSection(t.key);
                setBillingPage(0);
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.sectionTabText, active ? styles.sectionTabTextActive : null]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }, [activeSection, sectionTabs]);

  const onBillingSearchChange = useCallback((value) => {
    setBillingSearch(value);
    setBillingPage(0);
  }, []);

  const onSearchChange = useCallback((value) => {
    setSearchQuery(value);
    setSearchError(validateSearchQuery(value));
  }, []);

  const handleDocClick = useCallback((doc) => {
    setSelectedDoc(doc);
    setModalVisible(true);
  }, []);

  const FALLBACK_MOBILE_PROXY_BUCKETS_RECORDS = {
    'lab-results': '/api/lab-results/file/mobile',
    'lab_results': '/api/lab-results/file/mobile',
    'labresults': '/api/lab-results/file/mobile',
    'default': '/api/file/mobile',
  };

  const resultUrlFrom = useCallback((raw) => {
    if (!raw) return '';

    const FORBIDDEN_PREFIXES = ['lab-storage:', 'lab-local:', 'storage-local:', 'internal:', 'db:', 'storage:'];
    const isForbidden = (s) => {
      if (!s || typeof s !== 'string') return true;
      const t = `${s}`.trim().toLowerCase();
      for (const bad of FORBIDDEN_PREFIXES) if (t.startsWith(bad)) return true;
      return false;
    };
    const isHttpLike = (s) => typeof s === 'string' && /^https?:\/\//i.test(`${s || ''}`.trim());

    const flatKeys = [
      'pdfUrl', 'fileUrl', 'file_url', 'pdf_url',
      'public_url', 'publicUrl', 'download_url', 'downloadUrl',
      'signed_url', 'signedUrl', 'attachment_url', 'attachmentUrl',
      'storage_url', 'storageUrl', 'result_url', 'resultUrl',
      'document_url', 'documentUrl',
      'link', 'url',
    ];

    const pickFromObj = (obj) => {
      if (!obj || typeof obj !== 'object') return '';
      for (const k of flatKeys) {
        const v = obj[k];
        if (isHttpLike(v)) return `${v}`.trim();
      }
      return '';
    };

    const nested = ['file', 'files', 'pdf', 'document', 'attachment', 'result', 'record', 'storage', 'media', 'asset', 'metadata', 'meta', 'raw'];
    let picked = pickFromObj(raw);
    if (picked) return picked;

    for (const n of nested) {
      const nest = raw?.[n];
      if (Array.isArray(nest)) {
        for (const item of nest) {
          const p = pickFromObj(item);
          if (p) return p;
        }
      } else {
        const p = pickFromObj(nest);
        if (p) return p;
        if (isHttpLike(nest)) return `${nest}`.trim();
      }
    }

    if (Array.isArray(raw?.files) && raw.files[0]) {
      const p = pickFromObj(raw.files[0]);
      if (p) return p;
    }
    if (Array.isArray(raw?.attachments) && raw.attachments[0]) {
      const p = pickFromObj(raw.attachments[0]);
      if (p) return p;
    }

    const allKeys = raw && typeof raw === 'object' ? Object.keys(raw) : [];
    for (const k of allKeys) {
      const v = raw[k];
      if (isHttpLike(v)) return `${v}`.trim();
      if (typeof v === 'string' && isForbidden(v)) continue;
      if (typeof v === 'object') {
        const p = pickFromObj(v);
        if (p) return p;
      }
    }
    return '';
  }, []);

  const normalizePdfInputToUrlRecords = useCallback(async (rawInput) => {
    const s = `${rawInput || ''}`.trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s) || /^file:\/\//i.test(s) || /^content:\/\//i.test(s)) return s;
    if (s.startsWith('//')) return `https:${s}`;
    if (s.startsWith('/')) {
      const base = getMobileProxyBase();
      if (base) return `${base}${s}`;
    }
    return '';
  }, [getMobileProxyBase]);

  const apiRawFromRecord = useCallback((record) => {
    const r = record?.raw;
    if (!r || typeof r !== 'object') return null;
    const looksNormalized =
      Object.prototype.hasOwnProperty.call(r, 'subtitle') &&
      Object.prototype.hasOwnProperty.call(r, 'iconColor') &&
      Object.prototype.hasOwnProperty.call(r, 'raw');
    return looksNormalized ? r.raw : r;
  }, []);

  const extractLabResultId = useCallback((normalized, apiRaw) => {
    const isGoodNumericId = (v) => {
      if (v === undefined || v === null) return false;
      const s = `${v}`.trim();
      if (!s) return false;
      if (!/^[1-9][0-9]{0,7}$/.test(s)) return false;
      const n = parseInt(s, 10);
      if (!Number.isFinite(n) || n <= 0 || n >= 2000000000) return false;
      return true;
    };
    const isPossibleIdKey = (k) => {
      if (!k || typeof k !== 'string') return false;
      const lk = k.toLowerCase();
      if (lk.endsWith('id')) return true;
      if (lk === 'pk') return true;
      return false;
    };
    const knownIdKeys = new Set(['id', 'lab_result_id', 'labresultid', 'result_id', 'resultid', 'record_id', 'recordid', 'lab_id', 'labid', 'test_id', 'testid', 'report_id', 'reportid', 'document_id', 'documentid', 'file_id', 'fileid', 'pk', 'rowid', 'row_id']);
    const deepCollect = (obj, out, depth) => {
      if (depth === undefined) depth = 0;
      if (depth > 8) return;
      if (!obj) return;
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) deepCollect(obj[i], out, depth + 1);
        return;
      }
      if (typeof obj !== 'object') return;
      const entries = Object.entries(obj);
      for (const [k, v] of entries) {
        const lk = `${k}`.toLowerCase();
        if (isGoodNumericId(v)) {
          out.push({ key: k, value: `${v}`, depth, known: knownIdKeys.has(lk) });
        }
        if (v && typeof v === 'object') deepCollect(v, out, depth + 1);
      }
    };
    const candidates = [];
    deepCollect(apiRaw, candidates, 0);
    deepCollect(normalized, candidates, 0);
    const preview = (() => {
      try {
        const s = JSON.stringify({ apiRawKeys: apiRaw ? Object.keys(apiRaw) : null, normKeys: normalized ? Object.keys(normalized) : null });
        return s.length > 500 ? s.substring(0, 500) + '…' : s;
      } catch (_) { return 'stringify-failed'; }
    })();
    const flatVals = candidates.map(c => c.value);
    const uniq = [];
    for (const x of candidates) {
      const lk = `${x.key}`.toLowerCase();
      const known = knownIdKeys.has(lk) || (isPossibleIdKey(x.key) && /[a-z]_id$|^id$|id$/i.test(x.key));
      const score = (known ? 1000 : 0) + (x.depth === 0 ? 100 : 0) + (x.depth === 1 ? 50 : 0) - x.depth;
      if (!uniq.some(u => u.value === x.value)) uniq.push({ value: x.value, key: x.key, depth: x.depth, known, score });
    }
    uniq.sort((a, b) => b.score - a.score);
    const finalList = uniq.map(u => u.value);
    console.log('[Auth:lab-result-id:extract]', {
      title: normalized?.title || '',
      previewStruct: preview,
      numericIdsFound: flatVals.length,
      candidatesSorted: uniq.map(u => ({ id: u.value, at: `${u.key}@depth${u.depth}`, knownKey: u.known })).slice(0, 12),
      chosen: finalList[0] || '',
    });
    return finalList[0] || '';
  }, []);

  const handleViewRecord = useCallback(() => {
    setModalVisible(false);
    const normalized = selectedDoc && selectedDoc?.source && selectedDoc?.raw ? selectedDoc : selectedDoc ? normalizeRecord(selectedDoc, 0) : null;
    if (!normalized) return;

    if (normalized.category === 'Laboratory') {
      const apiRaw = apiRawFromRecord(normalized) || normalized?.raw || null;
      const actualId = extractLabResultId(normalized, apiRaw);
      const signedUrl = resultUrlFrom(apiRaw);
      const extraFromNormalized = normalized && typeof normalized === 'object' ? normalized : {};
      navigation.navigate('Laboratory', {
        doc: {
          name: normalized.title,
          type: 'Laboratory Result',
          date: normalized.dateLabel,
          status: normalized.status,
          verificationStatus: normalized.verificationStatus,
          labResultId: actualId,
          url: signedUrl,
          pdfUrl: extraFromNormalized.pdfUrl || apiRaw?.pdfUrl || apiRaw?.pdf_url || signedUrl,
          fileUrl: apiRaw?.fileUrl || apiRaw?.file_url || '',
          file_url: apiRaw?.file_url || '',
          pdf_url: apiRaw?.pdf_url || '',
          signed_url: apiRaw?.signed_url || apiRaw?.signedUrl || '',
          public_url: apiRaw?.public_url || apiRaw?.publicUrl || '',
          download_url: apiRaw?.download_url || apiRaw?.downloadUrl || '',
          signedUrl: apiRaw?.signedUrl || '',
          publicUrl: apiRaw?.publicUrl || '',
          downloadUrl: apiRaw?.downloadUrl || '',
          attachmentUrl: apiRaw?.attachmentUrl || apiRaw?.attachment_url || '',
          documentUrl: apiRaw?.documentUrl || apiRaw?.document_url || '',
          storageUrl: apiRaw?.storageUrl || apiRaw?.storage_url || '',
          resultUrl: apiRaw?.resultUrl || apiRaw?.result_url || '',
          link: apiRaw?.link || extraFromNormalized.link || '',
          raw: apiRaw,
          normalizedRaw: normalized.raw,
          pdfUrlSource: extraFromNormalized.pdfUrl ? 'fromLabResult' : signedUrl ? 'fromResultUrlFromApiRaw' : 'none',
        },
      });
      return;
    }

    Alert.alert('Record', `${normalized.title}\n\n${normalized.subtitle}`);
  }, [apiRawFromRecord, extractLabResultId, navigation, resultUrlFrom, selectedDoc]);

  const handleBookAppointment = useCallback(() => {
    setModalVisible(false);
    const normalized = selectedDoc && selectedDoc?.source && selectedDoc?.raw ? selectedDoc : selectedDoc ? normalizeRecord(selectedDoc, 0) : null;
    if (!normalized) return;
    navigation.navigate('PatientServicesScreen', {
      initialService: normalized.category,
      relatedRecord: normalized.title,
    });
  }, [navigation, selectedDoc]);

  const handleDownloadPdf = useCallback(async () => {
    const normalized = selectedDoc && selectedDoc?.source && selectedDoc?.raw ? selectedDoc : selectedDoc ? normalizeRecord(selectedDoc, 0) : null;
    if (!normalized) return;
    if (normalized.category === 'Laboratory') {
      const apiRawLR = apiRawFromRecord(normalized) || normalized?.raw || null;
      const actualId = extractLabResultId(normalized, apiRawLR);
      const signedUrlLR = resultUrlFrom(apiRawLR);
      const extraFromNorm = normalized && typeof normalized === 'object' ? normalized : {};
      navigation.navigate('Laboratory', {
        doc: {
          name: normalized.title, type: 'Laboratory Result', date: normalized.dateLabel,
          status: normalized.status, verificationStatus: normalized.verificationStatus,
          labResultId: actualId,
          url: signedUrlLR,
          pdfUrl: extraFromNorm.pdfUrl || apiRawLR?.pdfUrl || apiRawLR?.pdf_url || signedUrlLR,
          fileUrl: apiRawLR?.fileUrl || apiRawLR?.file_url || '',
          file_url: apiRawLR?.file_url || '',
          pdf_url: apiRawLR?.pdf_url || '',
          signed_url: apiRawLR?.signed_url || apiRawLR?.signedUrl || '',
          public_url: apiRawLR?.public_url || apiRawLR?.publicUrl || '',
          download_url: apiRawLR?.download_url || apiRawLR?.downloadUrl || '',
          signedUrl: apiRawLR?.signedUrl || '',
          publicUrl: apiRawLR?.publicUrl || '',
          downloadUrl: apiRawLR?.downloadUrl || '',
          attachmentUrl: apiRawLR?.attachmentUrl || apiRawLR?.attachment_url || '',
          documentUrl: apiRawLR?.documentUrl || apiRawLR?.document_url || '',
          storageUrl: apiRawLR?.storageUrl || apiRawLR?.storage_url || '',
          resultUrl: apiRawLR?.resultUrl || apiRawLR?.result_url || '',
          link: apiRawLR?.link || extraFromNorm.link || '',
          raw: apiRawLR,
          normalizedRaw: normalized.raw,
          triggerDirectDownload: true,
        },
      });
      return;
    }
    const apiRaw = apiRawFromRecord(normalized) || normalized?.raw || null;
    const urlRaw = resultUrlFrom(apiRaw);
    const FORBIDDEN_PREFIXES = ['lab-storage:', 'lab-local:', 'storage-local:', 'internal:', 'db:', 'storage:'];
    const rawStorageRef = apiRaw && typeof apiRaw === 'object' ? (() => {
      const vals = Object.values(apiRaw);
      for (const v of vals) {
        if (typeof v === 'string') {
          const t = v.trim().toLowerCase();
          for (const bad of FORBIDDEN_PREFIXES) if (t.startsWith(bad)) return v;
        }
        if (v && typeof v === 'object') {
          for (const inner of Object.values(v)) {
            if (typeof inner === 'string') {
              const t = inner.trim().toLowerCase();
              for (const bad of FORBIDDEN_PREFIXES) if (t.startsWith(bad)) return inner;
            }
          }
        }
      }
      return '';
    })() : '';
    if (!urlRaw) {
      const keys = apiRaw && typeof apiRaw === 'object' ? Object.keys(apiRaw) : [];
      Alert.alert(
        'PDF Not Available',
        'Backend did not return a signed HTTPS PDF URL for this record.\n\n' +
        'Expected: backend must include an HTTPS download URL (pdfUrl / fileUrl / downloadUrl / signedUrl / url) in the list API JSON response.\n\n' +
        'The app will NOT construct URLs from internal storage references, and direct storage access is disabled.\n\n' +
        (rawStorageRef ? `Raw internal ref (send to backend team):\n${rawStorageRef.slice(0, 180)}\n\n` : '') +
        (keys.length ? `Raw JSON response keys: ${keys.join(', ')}` : '')
      );
      return;
    }
    const url = await normalizePdfInputToUrlRecords(urlRaw);
    try {
      if (!url) {
        Alert.alert('Invalid Link', 'The PDF link could not be resolved. Raw value: ' + `${urlRaw || ''}`.substring(0, 150));
        return;
      }

      if (Platform.OS === 'web') {
        try { window.open(url, '_blank', 'noopener,noreferrer'); return; } catch (_) { /* fallthrough */ }
      }

      const cacheDir = `${FileSystem.cacheDirectory || ''}`;

      const safeName = `${normalized?.title || 'record'}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'medical_record';

      const validatePdfFile = async (targetFileUri) => {
        try {
          const info = await FileSystem.getInfoAsync(targetFileUri).catch(() => null);
          if (!info || !info.exists || typeof info.size !== 'number' || info.size <= 0) return false;
          let head = '';
          try {
            head = await FileSystem.readAsStringAsync(targetFileUri, {
              length: Math.min(512, info.size), position: 0, encoding: FileSystem.EncodingType.UTF8,
            });
          } catch (_) { head = ''; }
          const headTrim = (head || '').replace(/^\uFEFF/, '').trimStart();
          if (headTrim.substring(0, 5) === '%PDF-') return true;
          if (headTrim.toUpperCase().includes('%PDF-')) return true;
          if (/^\s*<\s*(!doctype|html|head|body)/i.test(headTrim)) return false;
          if (/Cannot\s+(GET|POST|PUT|DELETE)|NotFound|Not Found|Error\s+404/i.test(headTrim)) return false;
          if (/<\s*html[\s>]/i.test(headTrim) || /<\s*title[^>]*error/i.test(headTrim)) return false;
          return info.size > 8000;
        } catch (_) { return false; }
      };

      const tryDownloadFromUrl = async (targetUrl, targetFileUri) => {
        const headers = { Accept: 'application/pdf,*/*' };
        const r = await FileSystem.downloadAsync(targetUrl, targetFileUri, { headers });
        if (!r || !r.uri) throw new Error(`Download failed (null response)`);
        const statusCode = r.status || 0;
        const size = typeof r.totalBytesWritten === 'number' ? r.totalBytesWritten : (typeof r.size === 'number' ? r.size : 0);
        if (statusCode !== 200 && statusCode !== 206) throw new Error(`Download failed (PDF download failed with HTTP ${statusCode}).`);
        if (size <= 0) throw new Error(`Download failed (empty file 0 bytes, HTTP ${statusCode})`);
        if (r.headers && typeof r.headers === 'object') {
          const ct = `${r.headers['content-type'] || r.headers['Content-Type'] || ''}`.toLowerCase();
          if (ct && !ct.includes('application/pdf') && !ct.includes('pdf')) {
            try { await FileSystem.deleteAsync(r.uri, { idempotent: true }).catch(() => {}); } catch (_) {}
            throw new Error(`Server returned Content-Type "${ct}" instead of application/pdf (HTTP ${statusCode}).`);
          }
        }
        const isPdf = await validatePdfFile(r.uri);
        if (!isPdf) {
          try { await FileSystem.deleteAsync(r.uri, { idempotent: true }).catch(() => {}); } catch (_) {}
          throw new Error(`Download failed (not a valid PDF bytes, likely error page HTML, size=${size}B, HTTP ${statusCode})`);
        }
        return { uri: r.uri, status: statusCode, size };
      };

      let fileUri = `${cacheDir}${safeName}_${Date.now()}.pdf`;
      let result = null;

      try {
        result = await tryDownloadFromUrl(url, fileUri);
      } catch (e1) {
        throw e1;
      }

      if (!result || !result?.uri) throw new Error('Download returned no file.');

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        try {
          await Sharing.shareAsync(result.uri, {
            mimeType: 'application/pdf',
            dialogTitle: `${normalized?.title || 'Medical Record'}`,
            UTI: 'com.adobe.pdf',
          });
          return;
        } catch (shareErr) {}
      }

      try {
        await Linking.openURL(result.uri);
      } catch (openErr) {
        Alert.alert('PDF Downloaded', `Saved locally (${Math.round((result?.size || 0) / 1024)} KB). Open Files / Downloads app to view.`);
      }
    } catch (e) {
      const msg = e && typeof e === 'object' ? `${e.message || ''}${e.code ? ' [' + e.code + ']' : ''}` : String(e || '');
      Alert.alert(
        'Error',
        `Unable to open the PDF link.\n\n${msg ? 'Details: ' + msg.slice(0, 500) : ''}`
      );
    }
  }, [apiRawFromRecord, normalizePdfInputToUrlRecords, resultUrlFrom, selectedDoc, navigation]);

  const visibleRecords = useMemo(() => {
    return records.filter((r) => `${r?.status || ''}`.trim().toLowerCase() !== 'rejected');
  }, [records]);

  const totalCount = useMemo(() => visibleRecords.length, [visibleRecords]);

  const categoriesWithCounts = useMemo(() => {
    const counts = visibleRecords.reduce((acc, r) => {
      const key = r.category || 'Other';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const keys = Object.keys(counts).sort((a, b) => (b === 'Other' ? -1 : 0) - (a === 'Other' ? -1 : 0));
    return [{ key: 'All', count: totalCount }, ...keys.map((k) => ({ key: k, count: counts[k] }))];
  }, [totalCount, visibleRecords]);

  const filteredRecords = useMemo(() => {
    const q = sanitizeText(searchQuery, 40).toLowerCase();
    const base = activeCategory === 'All' ? visibleRecords : visibleRecords.filter((r) => r.category === activeCategory);
    if (!q) return base;
    return base.filter((r) => `${r.title} ${r.subtitle} ${r.status}`.toLowerCase().includes(q));
  }, [activeCategory, searchQuery, visibleRecords]);

  useFocusEffect(
    useCallback(() => {
      const section = route?.params?.initialSection;
      if (section && (section === 'Medical' || section === 'Appointments' || section === 'Billing')) {
        setActiveSection(section);
        navigation.setParams({ initialSection: undefined });
      }
    }, [navigation, route?.params?.initialSection]),
  );

  useFocusEffect(
    useCallback(() => {
      const id = route?.params?.labResultId;
      if (!id) return;
      const asString = String(id);
      const found = records.find((r) => {
        if (!r) return false;
        if (String(r.id) === asString) return true;
        const rawId = r?.raw?.id || r?.raw?.lab_result_id || r?.raw?.result_id;
        return rawId ? String(rawId) === asString : false;
      });
      if (found) {
        setActiveSection('Medical');
        setSelectedDoc(found);
        setModalVisible(true);
      }
      navigation.setParams({ labResultId: undefined });
    }, [navigation, records, route?.params?.labResultId]),
  );

  return (
    <SafeAreaView style={styles.container}>
      <PatientHeader 
        title="Records"
        navigation={navigation}
        onMenuPress={toggleDrawer}
        userData={userData}
      />
      
      <View style={styles.header}>
        {renderSectionTabs}
      </View>

      {authSessionMissing && activeSection === 'Medical' ? (
        <View style={{
          marginHorizontal: 16,
          marginTop: 12,
          marginBottom: 4,
          padding: 14,
          borderRadius: 14,
          backgroundColor: '#FEF2F2',
          borderWidth: 1.5,
          borderColor: '#F87171',
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          elevation: 2,
          shadowColor: '#7F1D1D',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        }}>
          <MaterialCommunityIcons name="alert-octagon" size={22} color="#B91C1C" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#7F1D1D', fontWeight: '800', fontSize: 14, marginBottom: 4, letterSpacing: 0.2 }}>
              ⚠️ NO SUPABASE SESSION — PDF download will fail!
            </Text>
            <Text style={{ color: '#7F1D1D', fontSize: 12.5, lineHeight: 18, marginBottom: 8 }}>
              Walang Supabase access_token. Kaya ang /api/lab-results/mine ay nagre-return ng HTTP 401 "Authentication required", at ang mga lab result PDF URL ay lab-storage: (internal, NOT downloadable).
            </Text>

            <Text style={{ color: '#991B1B', fontSize: 12.5, lineHeight: 18, fontWeight: '800', marginBottom: 2 }}>
              👤 FOR PATIENT USERS:
            </Text>
            <Text style={{ color: '#991B1B', fontSize: 12.5, lineHeight: 18, marginBottom: 10 }}>
              Try: (1) Mag-LOG OUT muna (hamburger menu → Logout)  →  (2) Mag-LOGIN ULIT gamit ang same email + password.
              {'\n'}Pagkatapos mag re-login, kung WALA PA RIN itong red banner = I-message mo ang clinic/admin para ma-fix ang Supabase Auth user mo gamit ang 2 options sa ibaba.
            </Text>

            <Text style={{ color: '#7F1D1D', fontSize: 12.5, lineHeight: 18, fontWeight: '800', marginBottom: 3 }}>
              🛠️ FOR ADMIN / DEVELOPER — 2 WAYS TO FIX PERMANENTLY (applies to ALL ~10 existing accounts):
            </Text>
            <Text style={{ color: '#991B1B', fontSize: 12.5, lineHeight: 18, marginBottom: 2, fontWeight: '700' }}>
              OPTION A — BULK SEED MANUAL SA DASHBOARD (RECOMMENDED, PINAKA-SECURE):
            </Text>
            <Text style={{ color: '#991B1B', fontSize: 12, lineHeight: 17.5, marginBottom: 8 }}>
              Supabase → Authentication → Users → <Text style={{fontWeight:'700'}}>Add user</Text>
              {'\n'}• <Text style={{fontWeight:'700'}}>Email:</Text> gamitin ang EXACT email mula sa `accounts` table (case sensitive!)
              {'\n'}• <Text style={{fontWeight:'700'}}>Password:</Text> EXACT na password din na naka-store sa `accounts` table (para match ang login credentials)
              {'\n'}• ✅ <Text style={{fontWeight:'700'}}>CHECK ang "Email confirmed"</Text> (huwag gagamit ng email confirmation link)
              {'\n'}• Repeat para sa LAHAT ng ~10 existing patient/staff accounts.
              {'\n'}• Signups REMAIN DISABLED after. Pinaka-safe for production — walang spam account.
            </Text>

            <Text style={{ color: '#991B1B', fontSize: 12.5, lineHeight: 18, marginBottom: 2, fontWeight: '700' }}>
              OPTION B — TEMP ENABLE SIGNUPS (FASTER KUNG MARAMI ANG USERS):
            </Text>
            <Text style={{ color: '#991B1B', fontSize: 12, lineHeight: 17.5, marginBottom: 8 }}>
              Supabase → Authentication → Configuration → <Text style={{fontWeight:'700'}}>Sign In / Providers</Text> → Email → Settings → <Text style={{fontWeight:'700'}}>TURN ON "Allow user signups"</Text> → Save.
              {'\n'}Then sabihin sa LAHAT ng existing users: <Text style={{fontWeight:'700'}}>"Logout → Login ONE TIME lang"</Text> (awtomatikong gagawa ang LoginScreen ng Supabase Auth user nila via auto-signUp).
              {'\n'}Pagkatapos ng 1-2 days (pag lahat nakapag-login na), <Text style={{fontWeight:'700'}}>DISABLE ULIT ANG SIGNUPS</Text> para iwas spam.
            </Text>

            <Text style={{ color: '#B91C1C', fontSize: 12, lineHeight: 17, marginTop: 4, fontStyle: 'italic' }}>
              ⚡ Future-proofing note: The "Create Account" (OTPrequest.jsx) registration flow now calls supabase.auth.signUp() automatically. So NEW users registering after today will auto-get a Supabase Auth user — no manual seed needed anymore (as long as signups are enabled, or admin provisions them).
            </Text>
          </View>
        </View>
      ) : null}

      {activeSection === 'Medical' ? (
        <>
          <View style={styles.medicalHeaderBlock}>
            <View style={styles.searchBox}>
              <Feather name="search" size={16} color="#9ca3af" />
              <TextInput
                value={searchQuery}
                onChangeText={onSearchChange}
                placeholder="Search records (e.g., CBC, X-Ray)"
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

            <View style={styles.categoryRow}>
              {categoriesWithCounts.map((cat) => {
                const active = cat.key === activeCategory;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[styles.categoryPill, active && styles.categoryPillActive]}
                    onPress={() => setActiveCategory(cat.key)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>
                      {cat.key} ({cat.count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

          </View>

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={THEME_ORANGE} />
              <Text style={styles.loadingText}>Loading records…</Text>
            </View>
          ) : (
            <FlatList
              data={filteredRecords}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listPadding}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconBox}>
                    <MaterialCommunityIcons name="folder-open-outline" size={44} color={THEME_ORANGE} />
                  </View>
                  <Text style={styles.emptyTitle}>No records found</Text>
                  <Text style={styles.emptyText}>Try adjusting your search or category filter.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.docCard} onPress={() => handleDocClick(item)} activeOpacity={0.85}>
                  <View style={[styles.docIconCircle, { backgroundColor: `${item.iconColor}14` }]}>
                    <MaterialCommunityIcons name={item.icon} size={22} color={item.iconColor} />
                  </View>
                  <View style={styles.docBody}>
                    <View style={styles.docTopRow}>
                      <Text style={styles.docName} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <View
                        style={[
                          styles.statusPill,
                          (item.status === 'Approved' || item.status === 'Booked') && styles.statusPillBooked,
                          item.status === 'Declined' && styles.statusPillDeclined,
                          item.status === 'Available' && styles.statusPillAvailable,
                          item.status === 'Under review' && styles.statusPillReview,
                          item.status === 'Rejected' && styles.statusPillDeclined,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            (item.status === 'Approved' || item.status === 'Booked') && styles.statusTextBooked,
                            item.status === 'Declined' && styles.statusTextDeclined,
                            item.status === 'Available' && styles.statusTextAvailable,
                            item.status === 'Under review' && styles.statusTextReview,
                            item.status === 'Rejected' && styles.statusTextDeclined,
                          ]}
                        >
                          {item.status}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.docSub} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color="#cbd5e1" />
                </TouchableOpacity>
              )}
            />
          )}
        </>
      ) : null}

      {activeSection === 'Appointments' ? (
        <View style={{ flex: 1 }}>
          <PatientHistoryScreen embedded />
        </View>
      ) : null}

      {activeSection === 'Billing' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.medicalHeaderBlock}>
            <View style={styles.searchBox}>
              <Feather name="search" size={16} color="#9ca3af" />
              <TextInput
                value={billingSearch}
                onChangeText={onBillingSearchChange}
                placeholder="Search billing (receipt, service, cashier…)"
                placeholderTextColor="#9ca3af"
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {!!billingSearch && (
                <TouchableOpacity onPress={() => onBillingSearchChange('')} activeOpacity={0.85}>
                  <Feather name="x" size={16} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {billingLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={THEME_ORANGE} />
              <Text style={styles.loadingText}>Loading billing…</Text>
            </View>
          ) : (
            <>
              <FlatList
                data={billingPageItems}
                keyExtractor={(it) => `${it?.id || ''}`}
                contentContainerStyle={styles.listPadding}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <View style={styles.emptyIconBox}>
                      <MaterialCommunityIcons name="cash-multiple" size={44} color={THEME_ORANGE} />
                    </View>
                    <Text style={styles.emptyTitle}>No billing records found</Text>
                    <Text style={styles.emptyText}>Your payments and transactions will appear here.</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const badge = billingStatusStyle(item?.status);
                  const amountLabel =
                    typeof item?.amount === 'number' ? `${item.currency} ${item.amount.toLocaleString()}` : item.currency ? `${item.currency} —` : '—';
                  const meta = [item?.source, item?.method, item?.dateLabel, item?.timeLabel].filter(Boolean).join(' • ');
                  return (
                    <TouchableOpacity
                      style={styles.billCard}
                      activeOpacity={0.85}
                      onPress={() => {
                        setSelectedPayment(item);
                        setBillingModalVisible(true);
                      }}
                    >
                      <View style={styles.billLeft}>
                        <Text style={styles.billTitle} numberOfLines={2}>
                          {item?.serviceLabel || 'Hospital Service'}
                        </Text>
                        <Text style={styles.billSub} numberOfLines={2}>
                          {meta}
                        </Text>
                        <Text style={styles.billRef} numberOfLines={1}>
                          Receipt: {item?.receiptNumber || '—'}
                        </Text>
                        {!!item?.receivedBy ? (
                          <Text style={styles.billRef} numberOfLines={1}>
                            Cashier: {item.receivedBy}
                          </Text>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 8 }}>
                        <Text style={styles.billAmount}>{amountLabel}</Text>
                        <View style={[styles.billStatus, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.billStatusText, { color: badge.fg }]}>{sanitizeText(item?.status, 30) || 'Unknown'}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }}
                showsVerticalScrollIndicator={false}
              />

              <View style={styles.billingPagination}>
                <TouchableOpacity
                  style={[styles.pageBtn, billingPageClamped <= 0 ? styles.pageBtnDisabled : null]}
                  onPress={() => setBillingPage((p) => Math.max(0, p - 1))}
                  disabled={billingPageClamped <= 0}
                  activeOpacity={0.85}
                >
                  <Feather name="chevron-left" size={18} color={billingPageClamped <= 0 ? '#9ca3af' : '#0f172a'} />
                  <Text style={[styles.pageBtnText, billingPageClamped <= 0 ? styles.pageBtnTextDisabled : null]}>Prev</Text>
                </TouchableOpacity>

                <Text style={styles.pageInfoText}>{billingFiltered.length ? `Page ${billingPageClamped + 1} of ${billingPageCount}` : 'Page 1 of 1'}</Text>

                <TouchableOpacity
                  style={[styles.pageBtn, billingPageClamped >= billingPageCount - 1 ? styles.pageBtnDisabled : null]}
                  onPress={() => setBillingPage((p) => Math.min(billingPageCount - 1, p + 1))}
                  disabled={billingPageClamped >= billingPageCount - 1}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.pageBtnText, billingPageClamped >= billingPageCount - 1 ? styles.pageBtnTextDisabled : null]}>Next</Text>
                  <Feather name="chevron-right" size={18} color={billingPageClamped >= billingPageCount - 1 ? '#9ca3af' : '#0f172a'} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      ) : null}

      {/* OPTIONS MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            
            <Text style={styles.modalTitle}>{selectedDoc?.title || selectedDoc?.name || 'Record'}</Text>
            <Text style={styles.modalSub}>{selectedDoc?.subtitle || ''}</Text>

            <View style={styles.optionList}>
              <TouchableOpacity style={styles.optionItem} onPress={handleViewRecord}>
                <View style={[styles.optionIconCircle, { backgroundColor: '#FFFAF0' }]}>
                  <Feather name="eye" size={22} color="#DA7705" />
                </View>
                <View style={{ flex: 1, marginLeft: 15 }}>
                  <Text style={styles.optionLabel}>View Record</Text>
                  <Text style={styles.optionDesc}>Open available details for this record</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.optionItem} onPress={handleBookAppointment}>
                <View style={[styles.optionIconCircle, { backgroundColor: '#E0EEF6' }]}>
                  <Feather name="calendar" size={22} color="#0077B6" />
                </View>
                <View style={{ flex: 1, marginLeft: 15 }}>
                  <Text style={styles.optionLabel}>Book Service Again</Text>
                  <Text style={styles.optionDesc}>Create a new booking based on this record</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#ccc" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.optionItem} onPress={handleDownloadPdf} activeOpacity={0.85}>
                <View style={[styles.optionIconCircle, { backgroundColor: '#F0FDF4' }]}>
                  <Feather name="download" size={22} color="#22c55e" />
                </View>
                <View style={{ flex: 1, marginLeft: 15 }}>
                  <Text style={styles.optionLabel}>Download as PDF</Text>
                  <Text style={styles.optionDesc}>Save a copy to your device</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#ccc" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* BILLING DETAIL MODAL */}
      <Modal animationType="slide" transparent={true} visible={billingModalVisible} onRequestClose={() => setBillingModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{selectedPayment?.serviceLabel || 'Billing Record'}</Text>
            <Text style={styles.modalSub}>{[selectedPayment?.receiptNumber, selectedPayment?.source].filter(Boolean).join(' • ')}</Text>

            <View style={styles.optionList}>
              <View style={styles.optionItem}>
                <View style={[styles.optionIconCircle, { backgroundColor: '#FFFAF0' }]}>
                  <Feather name="hash" size={22} color="#DA7705" />
                </View>
                <View style={{ flex: 1, marginLeft: 15 }}>
                  <Text style={styles.optionLabel}>Receipt Number</Text>
                  <Text style={styles.optionDesc}>{selectedPayment?.receiptNumber || '—'}</Text>
                </View>
              </View>

              <View style={styles.optionItem}>
                <View style={[styles.optionIconCircle, { backgroundColor: '#E0EEF6' }]}>
                  <Feather name="credit-card" size={22} color="#0077B6" />
                </View>
                <View style={{ flex: 1, marginLeft: 15 }}>
                  <Text style={styles.optionLabel}>Payment</Text>
                  <Text style={styles.optionDesc}>
                    {`${selectedPayment?.method || '—'} • ${typeof selectedPayment?.amount === 'number' ? `${selectedPayment.currency} ${selectedPayment.amount.toLocaleString()}` : selectedPayment?.currency ? `${selectedPayment.currency} —` : '—'}`}
                  </Text>
                </View>
              </View>

              {!!selectedPayment?.receivedBy ? (
                <View style={styles.optionItem}>
                  <View style={[styles.optionIconCircle, { backgroundColor: '#F0FDF4' }]}>
                    <Feather name="user" size={22} color="#22c55e" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 15 }}>
                    <Text style={styles.optionLabel}>Received By</Text>
                    <Text style={styles.optionDesc}>{selectedPayment.receivedBy}</Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.optionItem}>
                <View style={[styles.optionIconCircle, { backgroundColor: '#F1F5F9' }]}>
                  <Feather name="clock" size={22} color="#475569" />
                </View>
                <View style={{ flex: 1, marginLeft: 15 }}>
                  <Text style={styles.optionLabel}>Date</Text>
                  <Text style={styles.optionDesc}>{[selectedPayment?.dateLabel, selectedPayment?.timeLabel].filter(Boolean).join(' ') || '—'}</Text>
                </View>
              </View>
            </View>

            {Array.isArray(selectedPayment?.invoice?.items) && selectedPayment.invoice.items.length ? (
              <View style={{ marginTop: 10 }}>
                <Text style={[styles.modalTitle, { fontSize: 16 }]}>Invoice Items</Text>
                <View style={{ marginTop: 8, gap: 8 }}>
                  {selectedPayment.invoice.items.slice(0, 20).map((it, idx) => {
                    const label = sanitizeText(it?.label || it?.name || it?.description, 160) || `Item ${idx + 1}`;
                    const qtyRaw = Number(it?.quantity ?? it?.qty);
                    const qty = Number.isFinite(qtyRaw) ? qtyRaw : null;
                    const amtRaw = Number(it?.amount ?? it?.price ?? it?.total);
                    const amt = Number.isFinite(amtRaw) ? amtRaw : null;
                    return (
                      <View key={`${idx}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                        <Text style={{ flex: 1, color: '#111827', fontWeight: '700' }} numberOfLines={2}>
                          {label}{qty ? ` ×${qty}` : ''}
                        </Text>
                        <Text style={{ color: '#111827', fontWeight: '900' }}>{amt !== null ? `${selectedPayment.currency} ${amt.toLocaleString()}` : '—'}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <TouchableOpacity style={styles.closeButton} onPress={() => setBillingModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <PatientSideMenu 
        visible={drawerVisible} 
        onClose={toggleDrawer} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  sectionTabsRow: { paddingTop: 12, paddingBottom: 2, gap: 10, paddingRight: 20 },
  sectionTab: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionTabActive: { backgroundColor: '#FFFAF0', borderColor: '#DA7705' },
  sectionTabText: { fontSize: 12, fontWeight: '900', color: '#6b7280' },
  sectionTabTextActive: { color: '#DA7705' },
  medicalHeaderBlock: { paddingHorizontal: 20, paddingBottom: 10 },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#111827' },
  headerSub: { marginTop: 2, fontSize: 13, fontWeight: '600', color: '#6b7280' },
  countBadge: {
    minWidth: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#DA7705',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  countBadgeText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
  },
  searchBox: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 12,
  },
  searchInput: { flex: 1, color: '#111827', fontWeight: '600', fontSize: 13, paddingVertical: 0 },
  errorText: { marginTop: 8, color: '#b91c1c', fontSize: 12, fontWeight: '800' },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  categoryPillActive: {
    backgroundColor: '#FFFAF0',
    borderColor: '#DA7705',
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#6b7280',
  },
  categoryPillTextActive: {
    color: '#DA7705',
  },
  listPadding: {
    paddingHorizontal: 20,
    paddingBottom: 110,
    paddingTop: 8,
  },
  billCard: {
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  billLeft: { flex: 1 },
  billTitle: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  billSub: { marginTop: 6, fontSize: 12, fontWeight: '800', color: '#64748b' },
  billRef: { marginTop: 6, fontSize: 12, fontWeight: '800', color: '#475569' },
  billAmount: { fontSize: 13, fontWeight: '900', color: '#0f172a' },
  billStatus: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  billStatusText: { fontSize: 12, fontWeight: '900' },
  billingPagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    marginHorizontal: 20,
    marginBottom: 90,
  },
  pageBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#f1f5f9' },
  pageBtnDisabled: { backgroundColor: '#f8fafc' },
  pageBtnText: { fontWeight: '900', fontSize: 12, color: '#0f172a' },
  pageBtnTextDisabled: { color: '#9ca3af' },
  pageInfoText: { fontWeight: '900', fontSize: 12, color: '#475569' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginLeft: 20, marginBottom: 15 },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 25,
  },
  categoryCard: {
    width: '47%',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  iconCircle: { width: 55, height: 55, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  categoryText: { fontWeight: '600', color: '#444' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 20, alignItems: 'center' },
  seeAll: { color: '#DA7705', fontWeight: '600', fontSize: 12 },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    elevation: 2,
    shadowColor: '#DA7705',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  docIconCircle: { width: 46, height: 46, backgroundColor: '#FFFAF0', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  docBody: { flex: 1, marginLeft: 12 },
  docTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  docName: { fontWeight: '900', fontSize: 14, color: '#111827', flex: 1 },
  docSub: { fontSize: 12, color: '#6b7280', marginTop: 4, fontWeight: '700' },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  statusPillBooked: {
    backgroundColor: '#FFFAF0',
  },
  statusText: { fontSize: 11, fontWeight: '900', color: '#64748b' },
  statusTextBooked: { color: '#DA7705' },
  statusPillAvailable: {
    backgroundColor: '#F0FDF4',
  },
  statusTextAvailable: {
    color: '#16a34a',
  },
  statusPillReview: {
    backgroundColor: '#FFFAF0',
  },
  statusTextReview: {
    color: '#b45309',
  },
  statusPillDeclined: {
    backgroundColor: '#fee2e2',
  },
  statusTextDeclined: {
    color: '#b91c1c',
  },

  // MODAL STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#eee',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  modalSub: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 25,
  },
  optionList: {
    marginBottom: 10,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  optionIconCircle: {
    width: 45,
    height: 45,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  optionDesc: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  closeButton: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#666',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 80,
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
    color: '#111827',
    marginBottom: 10,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '600',
  },
});
