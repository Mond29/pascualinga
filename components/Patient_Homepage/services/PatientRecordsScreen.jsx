import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, TextInput, Modal, ActivityIndicator, Alert, ScrollView, Linking } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../../lib/supabase';
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
    return raw ? raw.replace(/\/+$/, '') : '';
  };

  const getApiBaseUrlForBilling = () => {
    const fromEnv = getApiBaseUrl();
    return fromEnv || 'https://api.pascualinga.com';
  };

  const fetchLabResultsMine = async ({ email, name, patientId, take = 50 }) => {
    const base = getApiBaseUrl();
    if (!base) return [];

    const url = `${base}/api/lab-results/mine?take=${encodeURIComponent(String(take))}`;
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
    return Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  };

  const fetchBillingPaymentsMine = async ({ email, patientId, take = 50, skip = 0, baseOverride }) => {
    const base = `${baseOverride || ''}`.trim() || getApiBaseUrlForBilling();
    if (!base) return [];
    const url = `${base}/api/billing/mine/payments?take=${encodeURIComponent(String(take))}&skip=${encodeURIComponent(String(skip))}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-user-role': 'patient',
        ...(email ? { 'x-user-email': email } : {}),
        ...(patientId ? { 'x-patient-id': patientId } : {}),
      },
    });

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
        let labResults = apiBase
          ? await fetchLabResultsMine({ email, name: userName, patientId, take: 50 })
          : await fetchLabResultsFromSupabase({ email, take: 50 });
        if (apiBase && (!labResults || !labResults.length)) {
          const fallback = await fetchLabResultsFromSupabase({ email, take: 50 }).catch(() => []);
          if (fallback?.length) labResults = fallback;
        }
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

  const resultUrlFrom = useCallback((raw) => {
    if (!raw) return '';
    const url =
      raw?.url ||
      raw?.file_url ||
      raw?.fileUrl ||
      raw?.pdf_url ||
      raw?.pdfUrl ||
      raw?.public_url ||
      raw?.publicUrl ||
      raw?.link ||
      raw?.attachment_url ||
      raw?.attachmentUrl ||
      '';
    return `${url || ''}`.trim();
  }, []);

  const apiRawFromRecord = useCallback((record) => {
    const r = record?.raw;
    if (!r || typeof r !== 'object') return null;
    const looksNormalized =
      Object.prototype.hasOwnProperty.call(r, 'subtitle') &&
      Object.prototype.hasOwnProperty.call(r, 'iconColor') &&
      Object.prototype.hasOwnProperty.call(r, 'raw');
    return looksNormalized ? r.raw : r;
  }, []);

  const handleViewRecord = useCallback(() => {
    setModalVisible(false);
    const normalized = selectedDoc && selectedDoc?.source && selectedDoc?.raw ? selectedDoc : selectedDoc ? normalizeRecord(selectedDoc, 0) : null;
    if (!normalized) return;

    if (normalized.category === 'Laboratory') {
      const apiRaw = apiRawFromRecord(normalized) || normalized?.raw || null;
      navigation.navigate('Laboratory', {
        doc: {
          name: normalized.title,
          type: 'Laboratory Result',
          date: normalized.dateLabel,
          status: normalized.status,
          verificationStatus: normalized.verificationStatus,
          url: resultUrlFrom(apiRaw),
          labResultId: `${apiRaw?.id || apiRaw?.lab_result_id || apiRaw?.result_id || normalized?.id || ''}`.trim(),
          raw: apiRaw,
        },
      });
      return;
    }

    Alert.alert('Record', `${normalized.title}\n\n${normalized.subtitle}`);
  }, [apiRawFromRecord, navigation, resultUrlFrom, selectedDoc]);

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
    const apiRaw = apiRawFromRecord(normalized) || normalized?.raw || null;
    const url = resultUrlFrom(apiRaw);
    if (!url) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        const keys = apiRaw && typeof apiRaw === 'object' ? Object.keys(apiRaw) : [];
        Alert.alert('No PDF URL', `URL is empty.\n\nraw keys:\n${keys.join(', ') || '(none)'}`);
        return;
      }
      Alert.alert('Unavailable', 'No PDF is attached to this record yet.');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch (_) {
      Alert.alert('Error', 'Unable to open the PDF link.');
    }
  }, [apiRawFromRecord, resultUrlFrom, selectedDoc]);

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
