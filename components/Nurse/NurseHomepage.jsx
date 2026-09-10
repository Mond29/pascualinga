import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  ActivityIndicator,
  RefreshControl,
  Modal,
  StyleSheet,
  Dimensions,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import NurseHomepageStyles from '../../styles/NurseStyles/NurseHomepageStyles';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import NurseSideMenu from './NurseSideMenu';

const TRIAGE_TABLE_CANDIDATES = [
  'er_triage_logs',
  'patient_triage_logs',
  'triage_logs',
  'er_triage_queue',
];

const VITALS_TABLE_CANDIDATES = [
  'patient_vitals_logs',
  'er_vitals_logs',
  'er_patient_vitals',
  'vitals_logs',
];

const WARD_TABLE_CANDIDATES = [
  'ward_occupancy',
  'Ward_Occupancy',
  'Ward_occupancy',
  'wardOccupancy',
  'WardOccupancy',
  'wardoccupancy',
];

let cachedWardTableName = null;
let wardTableProbePromise = null;
let cachedTriageTableName = null;
let triageTableProbePromise = null;
let cachedVitalsTableName = null;
let vitalsTableProbePromise = null;

const formatRoomLabel = (wardNumber) => {
  const num = typeof wardNumber === 'number' ? wardNumber : Number(wardNumber);
  if (Number.isFinite(num) && num === 100) return 'Ward';
  if (Number.isFinite(num)) return `Private Room ${num}`;
  return 'Room';
};

const parseBp = (bpText) => {
  const raw = `${bpText || ''}`.trim();
  if (!raw) return { sys: null, dia: null };
  const parts = raw.split(/[^0-9]+/).filter(Boolean);
  const sys = parts[0] ? Number(parts[0]) : null;
  const dia = parts[1] ? Number(parts[1]) : null;
  return {
    sys: Number.isFinite(sys) ? sys : null,
    dia: Number.isFinite(dia) ? dia : null,
  };
};

const computeVitalsTag = (vitals) => {
  if (!vitals) return { label: 'No Vitals', level: 'none' };

  const spo2 = Number.isFinite(vitals?.spo2) ? vitals.spo2 : null;
  const hr = Number.isFinite(vitals?.hr) ? vitals.hr : null;
  const rr = Number.isFinite(vitals?.rr) ? vitals.rr : null;
  const temp = Number.isFinite(vitals?.temp) ? Number(vitals.temp) : null;
  const pain = Number.isFinite(vitals?.pain) ? vitals.pain : null;
  const bp = parseBp(vitals?.bp);

  const critical =
    (spo2 !== null && spo2 < 90) ||
    (hr !== null && (hr < 40 || hr >= 130)) ||
    (temp !== null && temp >= 39) ||
    (bp.sys !== null && (bp.sys < 80 || bp.sys >= 180)) ||
    (rr !== null && (rr < 8 || rr >= 30));

  if (critical) return { label: 'Critical', level: 'critical' };

  const alert =
    (spo2 !== null && spo2 >= 90 && spo2 <= 92) ||
    (hr !== null && hr >= 110 && hr <= 129) ||
    (temp !== null && temp >= 38 && temp < 39) ||
    (bp.sys !== null && bp.sys >= 160 && bp.sys < 180) ||
    (bp.dia !== null && bp.dia >= 100) ||
    (pain !== null && pain >= 8) ||
    (rr !== null && rr >= 24 && rr < 30);

  if (alert) return { label: 'Alert', level: 'alert' };

  return { label: 'Stable', level: 'stable' };
};

const drawerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  drawerContainer: {
    width: SCREEN_WIDTH * 0.75,
    height: '100%',
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 5,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  menuText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 15,
  },
});

export default function NurseHomepage() {
  const navigation = useNavigation();
  const [userRole, setUserRole] = useState('nurse');
  const [userName, setUserName] = useState('Peralta!');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wardTableMissing, setWardTableMissing] = useState(false);
  const normalizedRole = useMemo(() => {
    const raw = `${userRole || ''}`.trim().toLowerCase();
    if (!raw) return 'nurse';
    if (raw.includes('doctor')) return 'doctor';
    if (raw.includes('nurse')) return 'nurse';
    if (raw.includes('lab')) return 'lab';
    return raw;
  }, [userRole]);
  const isDoctor = normalizedRole === 'doctor';

  // Real-time Stats States
  const [stats, setStats] = useState({
    patients: 0,
    inpatients: 0,
    criticalAlerts: 0,
  });

  // Ward States
  const [wards, setWards] = useState({
    occupied: 0,
    available: 0,
  });

  // Lists States
  const [watchlist, setWatchlist] = useState([]);
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [erSnapshot, setErSnapshot] = useState({
    total: 0,
    critical: 0,
    alert: 0,
    stable: 0,
    noVitals: 0,
    stale: 0,
    triageCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });
  const [needsUpdate, setNeedsUpdate] = useState([]);

  const [shiftInfo, setShiftInfo] = useState({
    shift: 'Loading...',
    time: '...',
    ward: '...',
    dutyMinutes: 0,
    progress_percent: 0,
  });

  const [drawerVisible, setDrawerVisible] = useState(false);

  const toggleDrawer = () => setDrawerVisible(!drawerVisible);

  const ensureWardTableName = useCallback(async () => {
    if (cachedWardTableName) return cachedWardTableName;
    if (wardTableProbePromise) return await wardTableProbePromise;

    wardTableProbePromise = (async () => {
      for (const candidate of WARD_TABLE_CANDIDATES) {
        const res = await supabase.from(candidate).select('id').limit(1);
        if (!res.error) return candidate;
        if (res.error?.code !== 'PGRST205') return candidate;
      }
      return null;
    })();

    const resolved = await wardTableProbePromise;
    wardTableProbePromise = null;
    cachedWardTableName = resolved;
    setWardTableMissing(!resolved);
    return resolved;
  }, []);

  const ensureTriageTableName = useCallback(async () => {
    if (cachedTriageTableName) return cachedTriageTableName;
    if (triageTableProbePromise) return await triageTableProbePromise;

    triageTableProbePromise = (async () => {
      for (const candidate of TRIAGE_TABLE_CANDIDATES) {
        const res = await supabase.from(candidate).select('id').limit(1);
        if (!res.error) return candidate;
        if (res.error?.code !== 'PGRST205') return candidate;
      }
      return null;
    })();

    const resolved = await triageTableProbePromise;
    triageTableProbePromise = null;
    cachedTriageTableName = resolved;
    return resolved;
  }, []);

  const ensureVitalsTableName = useCallback(async () => {
    if (cachedVitalsTableName) return cachedVitalsTableName;
    if (vitalsTableProbePromise) return await vitalsTableProbePromise;

    vitalsTableProbePromise = (async () => {
      for (const candidate of VITALS_TABLE_CANDIDATES) {
        const res = await supabase.from(candidate).select('id').limit(1);
        if (!res.error) return candidate;
        if (res.error?.code !== 'PGRST205') return candidate;
      }
      return null;
    })();

    const resolved = await vitalsTableProbePromise;
    vitalsTableProbePromise = null;
    cachedVitalsTableName = resolved;
    return resolved;
  }, []);

  const fetchUserData = async () => {
    const role = await AsyncStorage.getItem('userRole');
    const email = await AsyncStorage.getItem('userEmail');
    const rawRole = `${role || ''}`.trim().toLowerCase();
    const isDoctorAccount = rawRole.includes('doctor');
    if (role) setUserRole(role);
    
    if (email) {
      // Fetch Account Info
      const { data } = await supabase
        .from('accounts')
        .select('name')
        .eq('email', email)
        .single();
      if (data) setUserName(data.name);
      if (isDoctorAccount) {
        setUpcomingTasks([]);
        setShiftInfo({
          shift: 'ER Doctor',
          time: '',
          ward: 'ER',
          dutyMinutes: 0,
          progress_percent: 0,
        });
        return isDoctorAccount;
      }

      const { data: shiftData, error: shiftErr } = await supabase
        .from('nurse_shifts')
        .select('*')
        .eq('nurse_email', email)
        .maybeSingle();
      
      if (shiftData && !shiftErr) {
        setShiftInfo({
          shift: shiftData.shift_name,
          time: shiftData.shift_time || '',
          ward: shiftData.ward_assignment,
          dutyMinutes: shiftData.duty_minutes || 0,
          progress_percent: shiftData.progress_percent || 0,
        });
      } else {
        setShiftInfo({
          shift: 'Off Duty',
          time: '',
          ward: 'Unassigned',
          dutyMinutes: 0,
          progress_percent: 0,
        });
      }
      setUpcomingTasks([]);
    }
    return isDoctorAccount;
  };

  const fetchStats = async () => {
    try {
      // Patients count
      const { count: patientCount } = await supabase
        .from('patients')
        .select('*', { count: 'exact', head: true });

      const resolvedWardTable = await ensureWardTableName();

      let inpatientCount = 0;
      if (resolvedWardTable) {
        // Inpatients count (from ward table where status is Occupied)
        const inpatientRes = await supabase
          .from(resolvedWardTable)
          .select('*', { count: 'exact', head: true })
          .ilike('status', 'occupied%');
        if (!inpatientRes.error) inpatientCount = inpatientRes.count || 0;
      }

      setStats((prev) => ({
        ...prev,
        patients: patientCount || 0,
        inpatients: inpatientCount || 0,
      }));
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchWards = async () => {
    try {
      const resolvedWardTable = await ensureWardTableName();
      if (!resolvedWardTable) {
        setWards({ occupied: 0, available: 0 });
        return;
      }

      const { data: occupiedData } = await supabase
        .from(resolvedWardTable)
        .select('id')
        .ilike('status', 'occupied%');
      
      const { data: availableData } = await supabase
        .from(resolvedWardTable)
        .select('id')
        .ilike('status', 'available%');

      setWards({
        occupied: occupiedData?.length || 0,
        available: availableData?.length || 0,
      });
    } catch (error) {
      console.error('Error fetching wards:', error);
    }
  };

  const fetchWatchlist = async () => {
    try {
      const resolvedWardTable = await ensureWardTableName();
      const occupiedQuery = resolvedWardTable
        ? supabase.from(resolvedWardTable).select('id, status, patient_name').ilike('status', 'occupied%')
        : Promise.resolve({ data: [], error: null });

      const [{ data: allPatients, error: patientError }, { data: occupiedRows, error: occupiedError }] = await Promise.all([
        supabase.from('patients').select('id, first_name, middle_name, last_name'),
        occupiedQuery,
      ]);

      if (patientError) throw patientError;
      if (occupiedError) setWardTableMissing(true);

      const occupiedNameSet = new Set(
        (occupiedRows || [])
          .map((row) => `${row?.patient_name || ''}`.trim().toLowerCase())
          .filter(Boolean)
      );

      const erPatients = occupiedError
        ? (allPatients || [])
        : (allPatients || []).filter((p) => {
            const fullName = `${p?.first_name || ''} ${p?.middle_name || ''} ${p?.last_name || ''}`
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase();
            if (!fullName) return true;
            return !occupiedNameSet.has(fullName);
          });

      const erPatientIds = erPatients.map((p) => p?.id).filter(Boolean).map(String);
      if (erPatientIds.length === 0) {
        setStats((prev) => ({ ...prev, criticalAlerts: 0 }));
        setWatchlist([]);
        return;
      }

      const triageTable = await ensureTriageTableName();
      if (!triageTable) {
        setStats((prev) => ({ ...prev, criticalAlerts: 0 }));
        setWatchlist([]);
        return;
      }

      let triageRes = await supabase
        .from(triageTable)
        .select('id, patient_id, context, triage_level, priority_label, created_at')
        .eq('context', 'ER')
        .in('patient_id', erPatientIds)
        .order('created_at', { ascending: false })
        .limit(400);

      if (triageRes.error?.code === '42703') {
        triageRes = await supabase
          .from(triageTable)
          .select('id, patient_id, triage_level, priority_label, created_at')
          .in('patient_id', erPatientIds)
          .order('created_at', { ascending: false })
          .limit(400);
      }

      if (triageRes.error?.code === '42703') {
        triageRes = await supabase
          .from(triageTable)
          .select('id, patient_id, triage_level, priority_label')
          .in('patient_id', erPatientIds)
          .order('id', { ascending: false })
          .limit(400);
      }

      if (triageRes.error) throw triageRes.error;

      const triageRows = Array.isArray(triageRes.data) ? triageRes.data : [];
      const latestCriticalByPatient = new Map();
      for (const row of triageRows) {
        const pid = `${row?.patient_id || ''}`.trim();
        if (!pid) continue;
        const level = Number(row?.triage_level);
        const label = `${row?.priority_label || ''}`.trim().toLowerCase();
        const isCritical = level === 1 || label === 'critical';
        if (!isCritical) continue;
        if (!latestCriticalByPatient.has(pid)) latestCriticalByPatient.set(pid, row);
      }

      const patientIds = Array.from(latestCriticalByPatient.keys());
      setStats((prev) => ({ ...prev, criticalAlerts: patientIds.length }));

      if (patientIds.length === 0) {
        setWatchlist([]);
        return;
      }
      const patientById = new Map(
        (Array.isArray(erPatients) ? erPatients : []).map((p) => [`${p.id}`, p])
      );

      const vitalsTable = await ensureVitalsTableName();
      const latestVitalsByPatient = new Map();
      if (vitalsTable) {
        let vitalsRes = await supabase
          .from(vitalsTable)
          .select('id, patient_id, context, bp, hr, created_at')
          .eq('context', 'ER')
          .in('patient_id', patientIds.map(String))
          .order('created_at', { ascending: false })
          .limit(200);

        if (vitalsRes.error?.code === '42703') {
          vitalsRes = await supabase
            .from(vitalsTable)
            .select('id, patient_id, context, bp, hr')
            .eq('context', 'ER')
            .in('patient_id', patientIds.map(String))
            .order('id', { ascending: false })
            .limit(200);
        }

        if (!vitalsRes.error && Array.isArray(vitalsRes.data)) {
          for (const v of vitalsRes.data) {
            const pid = `${v?.patient_id || ''}`.trim();
            if (!pid) continue;
            if (!latestVitalsByPatient.has(pid)) latestVitalsByPatient.set(pid, v);
          }
        }
      }

      const mappedWatchlist = patientIds.slice(0, 5).map((pid) => {
        const p = patientById.get(pid);
        const v = latestVitalsByPatient.get(pid);
        const first = `${p?.first_name || ''}`.trim();
        const middle = `${p?.middle_name || ''}`.trim();
        const last = `${p?.last_name || ''}`.trim();
        const name = `${first}${middle ? ` ${middle}` : ''}${last ? ` ${last}` : ''}`.trim() || `Patient #${pid}`;
        return {
          id: pid,
          name,
          ward: 'ER',
          bp: v?.bp || 'N/A',
          hr: v?.hr || 'N/A',
        };
      });

      setWatchlist(mappedWatchlist);
    } catch (error) {
      console.error('Error fetching watchlist:', error);
      setStats((prev) => ({ ...prev, criticalAlerts: 0 }));
      setWatchlist([]);
    }
  };

  const fetchErSnapshot = useCallback(async () => {
    try {
      const resolvedWardTable = await ensureWardTableName();
      const occupiedQuery = resolvedWardTable
        ? supabase.from(resolvedWardTable).select('id, status, patient_name').ilike('status', 'occupied%')
        : Promise.resolve({ data: [], error: null });

      const [{ data: patientRows, error: patientError }, { data: occupiedRows, error: occupiedError }] = await Promise.all([
        supabase.from('patients').select('id, first_name, middle_name, last_name, date_of_birth'),
        occupiedQuery,
      ]);

      if (patientError) throw patientError;
      if (occupiedError) setWardTableMissing(true);

      const occupiedNameSet = new Set(
        (occupiedRows || [])
          .map((row) => `${row?.patient_name || ''}`.trim().toLowerCase())
          .filter(Boolean)
      );

      const erPatients = (patientRows || []).filter((p) => {
        const fullName = `${p?.first_name || ''} ${p?.middle_name || ''} ${p?.last_name || ''}`
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        if (!fullName) return true;
        return !occupiedNameSet.has(fullName);
      });

      const ids = erPatients.map((p) => p?.id).filter(Boolean);
      if (!ids.length) {
        setErSnapshot({
          total: 0,
          critical: 0,
          alert: 0,
          stable: 0,
          noVitals: 0,
          stale: 0,
          triageCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        });
        setNeedsUpdate([]);
        return;
      }

      const vitalsTable = await ensureVitalsTableName();
      const latestVitalsByPatient = new Map();
      if (vitalsTable) {
        let vitalsRes = await supabase
          .from(vitalsTable)
          .select('id, patient_id, created_at, context, bp, hr, rr, temp, spo2, pain')
          .eq('context', 'ER')
          .in('patient_id', ids.map(String))
          .order('created_at', { ascending: false })
          .limit(800);

        if (vitalsRes.error?.code === '42703') {
          vitalsRes = await supabase
            .from(vitalsTable)
            .select('id, patient_id, created_at, bp, hr, rr, temp, spo2, pain')
            .in('patient_id', ids.map(String))
            .order('created_at', { ascending: false })
            .limit(800);
        }

        if (vitalsRes.error?.code === '42703') {
          vitalsRes = await supabase
            .from(vitalsTable)
            .select('id, patient_id, bp, hr, rr, temp, spo2, pain')
            .in('patient_id', ids.map(String))
            .order('id', { ascending: false })
            .limit(800);
        }

        if (!vitalsRes.error && Array.isArray(vitalsRes.data)) {
          for (const v of vitalsRes.data) {
            const pid = `${v?.patient_id || ''}`.trim();
            if (!pid) continue;
            if (latestVitalsByPatient.has(pid)) continue;
            latestVitalsByPatient.set(pid, v);
          }
        }
      }

      const triageTable = await ensureTriageTableName();
      const latestTriageByPatient = new Map();
      if (triageTable) {
        let triageRes = await supabase
          .from(triageTable)
          .select('id, patient_id, context, triage_level, priority_label, created_at')
          .eq('context', 'ER')
          .in('patient_id', ids.map(String))
          .order('created_at', { ascending: false })
          .limit(800);

        if (triageRes.error?.code === '42703') {
          triageRes = await supabase
            .from(triageTable)
            .select('id, patient_id, triage_level, priority_label')
            .in('patient_id', ids.map(String))
            .order('id', { ascending: false })
            .limit(800);
        }

        if (!triageRes.error && Array.isArray(triageRes.data)) {
          for (const t of triageRes.data) {
            const pid = `${t?.patient_id || ''}`.trim();
            if (!pid) continue;
            if (latestTriageByPatient.has(pid)) continue;
            latestTriageByPatient.set(pid, t);
          }
        }
      }

      const now = Date.now();
      const staleMinutes = 60;
      let critical = 0;
      let alert = 0;
      let stable = 0;
      let noVitals = 0;
      let stale = 0;

      const triageCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const needs = [];

      for (const p of erPatients) {
        const pid = `${p?.id || ''}`.trim();
        if (!pid) continue;
        const v = latestVitalsByPatient.get(pid) || null;
        const t = latestTriageByPatient.get(pid) || null;
        const level = Number(t?.triage_level ?? 0);
        if (level >= 1 && level <= 5) triageCounts[level] += 1;

        if (!v) {
          noVitals += 1;
          needs.push({ id: pid, patient: p, reason: 'No vitals', ts: 0 });
          continue;
        }

        const tag = computeVitalsTag(v);
        if (tag.level === 'critical') critical += 1;
        else if (tag.level === 'alert') alert += 1;
        else stable += 1;

        const ts = v?.created_at && !Number.isNaN(Date.parse(v.created_at)) ? Date.parse(v.created_at) : 0;
        const ageMinutes = ts ? Math.floor((now - ts) / 60000) : null;
        if (ageMinutes !== null && ageMinutes >= staleMinutes) {
          stale += 1;
          needs.push({ id: pid, patient: p, reason: `Stale vitals (${ageMinutes}m)`, ts });
        }
      }

      needs.sort((a, b) => {
        const ar = `${a?.reason || ''}`;
        const br = `${b?.reason || ''}`;
        const aNo = ar.toLowerCase().includes('no vitals');
        const bNo = br.toLowerCase().includes('no vitals');
        if (aNo !== bNo) return aNo ? -1 : 1;
        return (a.ts || 0) - (b.ts || 0);
      });

      setErSnapshot({
        total: erPatients.length,
        critical,
        alert,
        stable,
        noVitals,
        stale,
        triageCounts,
      });
      setNeedsUpdate(needs.slice(0, 8));
    } catch (error) {
      console.error('Error fetching ER snapshot:', error);
    }
  }, [ensureTriageTableName, ensureVitalsTableName, ensureWardTableName]);

  const fetchAllData = async () => {
    setLoading(true);
    const isDoctorAccount = await fetchUserData();
    if (isDoctorAccount) {
      await Promise.all([fetchStats(), fetchWards(), fetchWatchlist(), fetchErSnapshot()]);
    } else {
      await Promise.all([fetchStats(), fetchWards(), fetchWatchlist()]);
    }
    setLoading(false);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  }, []);

  useEffect(() => {
    let wardSubscription = null;
    let triageSubscription = null;
    let vitalsSubscription = null;
    let shiftsSubscription = null;
    let isActive = true;
    let progressInterval = null;
    let pollInterval = null;

    (async () => {
      await fetchAllData();

      const currentEmail = await AsyncStorage.getItem('userEmail');
      const resolvedWardTable = await ensureWardTableName();
      const resolvedTriageTable = await ensureTriageTableName();
      const resolvedVitalsTable = await ensureVitalsTableName();
      if (!isActive) return;

      if (resolvedWardTable) {
        wardSubscription = supabase
          .channel('ward-changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: resolvedWardTable }, () => {
            fetchWards();
            fetchStats();
            if (isDoctor) fetchErSnapshot();
          })
          .subscribe();
      }

      if (resolvedTriageTable) {
        triageSubscription = supabase
          .channel('er-triage-changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: resolvedTriageTable }, () => {
            fetchWatchlist();
            if (isDoctor) fetchErSnapshot();
          })
          .subscribe();
      }

      if (resolvedVitalsTable) {
        vitalsSubscription = supabase
          .channel('er-vitals-changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: resolvedVitalsTable }, () => {
            fetchWatchlist();
            if (isDoctor) fetchErSnapshot();
          })
          .subscribe();
      }
    })();

    const patientSubscription = supabase
      .channel('patient-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, () => {
        fetchStats();
      })
      .subscribe();

    (async () => {
      const currentEmail = await AsyncStorage.getItem('userEmail');
      if (!isActive || isDoctor || !currentEmail) return;

      shiftsSubscription = supabase
        .channel('shifts-changes-' + currentEmail)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'nurse_shifts',
            filter: `nurse_email=eq.${currentEmail}`,
          },
          () => {
            fetchUserData();
          }
        )
        .subscribe();

      progressInterval = setInterval(() => {
        setShiftInfo((prev) => {
          if (!prev || !prev.shift || prev.shift === 'Off Duty' || !prev.shift.toLowerCase().includes('shift')) return prev;
          const total = 8 * 60;
          const next = Math.min(100, Math.round(((prev.dutyMinutes || 0) + 1) / total * 100));
          return {
            ...prev,
            dutyMinutes: (prev.dutyMinutes || 0) + 1,
            progress_percent: next,
          };
        });
      }, 60000);

      pollInterval = setInterval(() => {
        fetchUserData();
        fetchStats();
        fetchWards();
        fetchWatchlist();
        if (isDoctor) fetchErSnapshot();
      }, 90000);
    })();

    return () => {
      isActive = false;
      if (progressInterval) clearInterval(progressInterval);
      if (pollInterval) clearInterval(pollInterval);
      if (wardSubscription) supabase.removeChannel(wardSubscription);
      if (triageSubscription) supabase.removeChannel(triageSubscription);
      if (vitalsSubscription) supabase.removeChannel(vitalsSubscription);
      supabase.removeChannel(patientSubscription);
      if (shiftsSubscription) supabase.removeChannel(shiftsSubscription);
    };
  }, [fetchErSnapshot, isDoctor]);

  const getDisplayName = () => {
    if (isDoctor) return userName;
    return normalizedRole === 'lab' ? 'Laboratory Section' : userName;
  };

  if (loading && !refreshing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#d9802b" />
        <Text style={{ marginTop: 10, color: '#666' }}>Loading real-time data...</Text>
      </View>
    );
  }

  return (

    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>

      {/* ✅ FIXED MAIN SCROLLVIEW */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#d9802b']} />
        }
        contentContainerStyle={{
          paddingBottom: 120,
          flexGrow: 1,
        }}
      >

        {/* HEADER */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10 }}>
          <TouchableOpacity onPress={toggleDrawer} style={{ padding: 5 }}>
            <Feather name="menu" size={24} color="#d9802b" />
          </TouchableOpacity>
          <Text style={NurseHomepageStyles.logoText}>
            Pascualinga
          </Text>
        </View>


        {/* Welcome Section */}
        <View style={[NurseHomepageStyles.welcomeSection, { height: 160, paddingVertical: 15 }]}>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[NurseHomepageStyles.profileCircle, { width: 60, height: 60, borderRadius: 30 }]}>
                <Feather name="user" size={30} color="#fff" />
              </View>
              <View style={NurseHomepageStyles.welcomeTextWrapper}>
                <Text style={[NurseHomepageStyles.welcomeText, { fontSize: 16 }]}>
                  Welcome,
                </Text>
                <Text style={[NurseHomepageStyles.doctorName, { fontSize: userName.length > 10 ? 22 : 28, top: 0 }]}>
                  {getDisplayName()}
                </Text>
              </View>
            </View>

            {!isDoctor ? (
              <View style={{ marginTop: 15, backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ color: '#fff', fontSize: 12, opacity: 0.9 }}>Current Shift</Text>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{shiftInfo.shift}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: '#fff', fontSize: 12, opacity: 0.9 }}>Ward Assignment</Text>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{shiftInfo.ward}</Text>
                  </View>
                </View>

                <View style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: '#fff', fontSize: 10, opacity: 0.8 }}>Shift Progress</Text>
                    <Text style={{ color: '#fff', fontSize: 10, opacity: 0.8 }}>{shiftInfo.progress_percent}%</Text>
                  </View>
                  <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2 }}>
                    <View style={{ width: `${shiftInfo.progress_percent}%`, height: '100%', backgroundColor: '#fff', borderRadius: 2 }} />
                  </View>
                </View>
              </View>
            ) : (
              <View style={{ marginTop: 15, backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ color: '#fff', fontSize: 12, opacity: 0.9 }}>Mode</Text>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>ER Monitor</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: '#fff', fontSize: 12, opacity: 0.9 }}>Needs Update</Text>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{erSnapshot.noVitals + erSnapshot.stale}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>

        </View>


        {!isDoctor ? (
          <View style={NurseHomepageStyles.statsRow}>
            <TouchableOpacity 
              style={NurseHomepageStyles.statCard}
              onPress={() => navigation.navigate('Patients')}
            >
              <View style={NurseHomepageStyles.statIconOrange}>
                <Image
                  source={require('../../assets/orange-human-icon.png')}
                  style={NurseHomepageStyles.statIcon}
                />
              </View>

              <Text style={NurseHomepageStyles.statNumber}>
                {stats.patients}
              </Text>

              <Text style={NurseHomepageStyles.statLabel}>
                Patients
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={NurseHomepageStyles.statCard}
              onPress={() => navigation.navigate('InpatientWard')}
            >
              <View style={NurseHomepageStyles.statIconBlue}>
                <Image
                  source={require('../../assets/blue-bed-icon.png')}
                  style={NurseHomepageStyles.statIcon}
                />
              </View>

              <Text style={NurseHomepageStyles.statNumber}>
                {stats.inpatients}
              </Text>

              <Text style={NurseHomepageStyles.statLabel}>
                Inpatient
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={NurseHomepageStyles.statCard}
              onPress={() => navigation.navigate('CriticalList')}
            >
              <View style={NurseHomepageStyles.statIconPlain}>
                <Image
                  source={require('../../assets/heart-rate.png')}
                  style={NurseHomepageStyles.statIcon}
                />
              </View>

              <Text style={NurseHomepageStyles.statNumber}>
                {stats.criticalAlerts}
              </Text>

              <Text style={NurseHomepageStyles.statLabel}>
                Critical Alert
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
            <Text style={[NurseHomepageStyles.sectionTitle, { marginHorizontal: 0, marginTop: 0 }]}>
              ER Snapshot
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => navigation.navigate('Patients')}
                style={{ width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f1f5f9', elevation: 2 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="account-group" size={22} color="#0ea5e9" />
                  <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 18 }}>{erSnapshot.total}</Text>
                </View>
                <Text style={{ marginTop: 8, color: '#334155', fontWeight: '800' }}>ER Patients</Text>
                <Text style={{ marginTop: 2, color: '#64748b', fontSize: 12 }} numberOfLines={1}>Active list</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => navigation.navigate('CriticalList')}
                style={{ width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f1f5f9', elevation: 2 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="heart-pulse" size={22} color="#ef4444" />
                  <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 18 }}>{erSnapshot.critical}</Text>
                </View>
                <Text style={{ marginTop: 8, color: '#334155', fontWeight: '800' }}>Critical</Text>
                <Text style={{ marginTop: 2, color: '#64748b', fontSize: 12 }} numberOfLines={1}>Vitals-based</Text>
              </TouchableOpacity>

              <View style={{ width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f1f5f9', elevation: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#f97316" />
                  <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 18 }}>{erSnapshot.alert}</Text>
                </View>
                <Text style={{ marginTop: 8, color: '#334155', fontWeight: '800' }}>Alert</Text>
                <Text style={{ marginTop: 2, color: '#64748b', fontSize: 12 }} numberOfLines={1}>Vitals-based</Text>
              </View>

              <View style={{ width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f1f5f9', elevation: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="check-circle-outline" size={22} color="#22c55e" />
                  <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 18 }}>{erSnapshot.stable}</Text>
                </View>
                <Text style={{ marginTop: 8, color: '#334155', fontWeight: '800' }}>Stable</Text>
                <Text style={{ marginTop: 2, color: '#64748b', fontSize: 12 }} numberOfLines={1}>Vitals-based</Text>
              </View>

              <View style={{ width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f1f5f9', elevation: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="timer-sand" size={22} color="#0f172a" />
                  <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 18 }}>{erSnapshot.stale}</Text>
                </View>
                <Text style={{ marginTop: 8, color: '#334155', fontWeight: '800' }}>Stale</Text>
                <Text style={{ marginTop: 2, color: '#64748b', fontSize: 12 }} numberOfLines={1}>Vitals ≥ 60m</Text>
              </View>

              <View style={{ width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#f1f5f9', elevation: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="clipboard-alert-outline" size={22} color="#64748b" />
                  <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 18 }}>{erSnapshot.noVitals}</Text>
                </View>
                <Text style={{ marginTop: 8, color: '#334155', fontWeight: '800' }}>No Vitals</Text>
                <Text style={{ marginTop: 2, color: '#64748b', fontSize: 12 }} numberOfLines={1}>Needs assessment</Text>
              </View>
            </View>
          </View>
        )}


        {/* WARD SECTION */}
        <View style={NurseHomepageStyles.sectionHeaderRow}>

          <Text style={NurseHomepageStyles.sectionTitle}>
            Ward Availability
          </Text>

          <TouchableOpacity
            onPress={() =>
              navigation.navigate('OverallWards')
            }
          >
            <Text style={NurseHomepageStyles.viewAllButton}>
              View All
            </Text>
          </TouchableOpacity>

        </View>


        <View style={NurseHomepageStyles.wardCardsRow}>

          <View style={NurseHomepageStyles.wardCardOccupied}>
            <Feather name="x-circle" size={26} color="#c1121f" />
            <Text style={NurseHomepageStyles.wardNumber}>{wards.occupied}</Text>
            <Text style={NurseHomepageStyles.wardLabel}>
              Occupied Wards
            </Text>
          </View>


          <View style={NurseHomepageStyles.wardCardAvailable}>
            <Feather name="check-circle" size={26} color="#2a9d8f" />
            <Text style={NurseHomepageStyles.wardNumber}>{wards.available}</Text>
            <Text style={NurseHomepageStyles.wardLabel}>
              Available Wards
            </Text>
          </View>

        </View>


        <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
          <Text style={[NurseHomepageStyles.sectionTitle, { marginHorizontal: 0, marginTop: 0 }]}>
            Quick Actions
          </Text>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('InpatientWard')}
              style={{
                flex: 1,
                backgroundColor: '#fff',
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: '#f1f5f9',
                elevation: 2,
              }}
            >
              <MaterialCommunityIcons name="bed-outline" size={24} color="#0077B6" />
              <Text style={{ marginTop: 8, fontWeight: '800', color: '#0f172a' }}>Inpatient Ward</Text>
              <Text style={{ marginTop: 2, color: '#64748b', fontSize: 12 }} numberOfLines={2}>
                View admitted patients
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Patients')}
              style={{
                flex: 1,
                backgroundColor: '#fff',
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: '#f1f5f9',
                elevation: 2,
              }}
            >
              <Ionicons name="search" size={24} color="#6366f1" />
              <Text style={{ marginTop: 8, fontWeight: '800', color: '#0f172a' }}>Patients</Text>
              <Text style={{ marginTop: 2, color: '#64748b', fontSize: 12 }} numberOfLines={2}>
                Find patients
              </Text>
            </TouchableOpacity>
          </View>
        </View>


        {/* WATCHLIST */}
        <View style={NurseHomepageStyles.watchlistHeaderRow}>

          <Text style={NurseHomepageStyles.watchlistTitle}>
            Critical Watchlist
          </Text>

          <TouchableOpacity onPress={() => navigation.navigate('CriticalList')}>
            <Text style={NurseHomepageStyles.watchlistActiveText}>
              View All
            </Text>
          </TouchableOpacity>

        </View>


        {/* ✅ FIXED HORIZONTAL SCROLL */}
        {watchlist.length > 0 ? (
          <ScrollView
            horizontal
            nestedScrollEnabled={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={
              NurseHomepageStyles.watchlistHorizontalContainer
            }
          >

            {watchlist.map((patient) => (

              <TouchableOpacity
                key={patient.id}
                style={NurseHomepageStyles.watchlistCardHorizontal}
                onPress={() => navigation.navigate('Options')}
              >

                <Text style={NurseHomepageStyles.watchlistName}>
                  {patient.name}
                </Text>

                <Text style={NurseHomepageStyles.watchlistWard}>
                  {patient.ward}
                </Text>

                <View style={NurseHomepageStyles.watchlistVitalsRow}>

                  <View style={NurseHomepageStyles.watchlistVitalBox}>
                    <Text style={NurseHomepageStyles.watchlistVitalLabel}>
                      BP
                    </Text>

                    <Text style={NurseHomepageStyles.watchlistVitalValue}>
                      {patient.bp}
                    </Text>
                  </View>

                  <View style={NurseHomepageStyles.watchlistVitalBox}>
                    <Text style={NurseHomepageStyles.watchlistVitalLabel}>
                      HR
                    </Text>

                    <Text style={NurseHomepageStyles.watchlistVitalValue}>
                      {patient.hr}
                    </Text>
                  </View>

                </View>

              </TouchableOpacity>

            ))}

          </ScrollView>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingVertical: 10 }}>
            <Text style={{ color: '#999', fontStyle: 'italic' }}>No critical patients at the moment.</Text>
          </View>
        )}

        {isDoctor ? (
          <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={[NurseHomepageStyles.sectionTitle, { marginHorizontal: 0, marginTop: 0 }]}>
                Needs Update
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Options')}>
                <Text style={{ fontSize: 12, color: '#d9802b', fontWeight: '700' }}>View Patients</Text>
              </TouchableOpacity>
            </View>

            {needsUpdate.length ? (
              <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9', padding: 14, elevation: 2 }}>
                {needsUpdate.slice(0, 6).map((x) => {
                  const p = x?.patient || {};
                  const first = `${p?.first_name || ''}`.trim();
                  const middle = `${p?.middle_name || ''}`.trim();
                  const last = `${p?.last_name || ''}`.trim();
                  const name = `${first}${middle ? ` ${middle}` : ''}${last ? ` ${last}` : ''}`.trim() || 'Patient';
                  return (
                    <TouchableOpacity
                      key={String(x?.id)}
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate('Options')}
                      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
                    >
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={{ color: '#0f172a', fontWeight: '800' }} numberOfLines={1}>{name}</Text>
                        <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }} numberOfLines={1}>{`${x?.reason || ''}`.trim()}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={{ paddingVertical: 10 }}>
                <Text style={{ color: '#64748b' }}>All good. No stale/no-vitals patients found.</Text>
              </View>
            )}

            <View style={{ marginTop: 14 }}>
              <Text style={[NurseHomepageStyles.sectionTitle, { marginHorizontal: 0, marginTop: 0 }]}>Triage Summary</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                {[1, 2, 3, 4, 5].map((t) => (
                  <View key={`tri-${t}`} style={{ backgroundColor: '#fff', borderRadius: 999, borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 8, paddingHorizontal: 12 }}>
                    <Text style={{ fontWeight: '900', color: '#0f172a' }}>{`T${t}: ${erSnapshot.triageCounts?.[t] || 0}`}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}



      </ScrollView>

      {/* BURGER MENU MODAL */}
      <NurseSideMenu 
        visible={drawerVisible} 
        onClose={toggleDrawer} 
      />
    </SafeAreaView>

  );
}
