import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import CriticalListStyles from '../../../styles/NurseStyles/MoreNursesStyles/CriticalListStyles';
import { supabase } from '../../../lib/supabase';

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

let cachedTriageTableName = null;
let triageTableProbePromise = null;
let cachedVitalsTableName = null;
let vitalsTableProbePromise = null;
let cachedWardTableName = null;
let wardTableProbePromise = null;

export default function CriticalList({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);

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
    return resolved;
  }, []);

  const isCriticalRow = useCallback((row) => {
    const label = `${row?.priority_label || ''}`.trim().toLowerCase();
    const level = Number(row?.triage_level);
    return level === 1 || label === 'critical';
  }, []);

  const loadCritical = useCallback(async () => {
    setLoading(true);
    try {
      const resolvedWardTable = await ensureWardTableName();
      const occupiedQuery = resolvedWardTable
        ? supabase.from(resolvedWardTable).select('id, status, patient_name').ilike('status', 'occupied%')
        : Promise.resolve({ data: [], error: null });

      const [{ data: allPatients, error: patientError }, { data: occupiedRows, error: occupiedError }] = await Promise.all([
        supabase.from('patients').select('id, first_name, middle_name, last_name, date_of_birth'),
        occupiedQuery,
      ]);

      if (patientError) throw patientError;

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
        setItems([]);
        return;
      }

      const triageTable = await ensureTriageTableName();
      if (!triageTable) {
        setItems([]);
        return;
      }

      let triageRes = await supabase
        .from(triageTable)
        .select('id, patient_id, context, triage_level, priority_score, priority_label, reasons, main_concern, created_at')
        .eq('context', 'ER')
        .in('patient_id', erPatientIds)
        .order('created_at', { ascending: false })
        .limit(400);

      if (triageRes.error?.code === '42703') {
        triageRes = await supabase
          .from(triageTable)
          .select('id, patient_id, triage_level, priority_score, priority_label, reasons, main_concern, created_at')
          .in('patient_id', erPatientIds)
          .order('created_at', { ascending: false })
          .limit(400);
      }

      if (triageRes.error?.code === '42703') {
        triageRes = await supabase
          .from(triageTable)
          .select('id, patient_id, triage_level, priority_score, priority_label, reasons, main_concern')
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
        if (!isCriticalRow(row)) continue;
        if (!latestCriticalByPatient.has(pid)) latestCriticalByPatient.set(pid, row);
      }

      const patientIds = Array.from(latestCriticalByPatient.keys());
      if (patientIds.length === 0) {
        setItems([]);
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
          .select('id, patient_id, context, bp, hr, rr, temp, spo2, created_at')
          .eq('context', 'ER')
          .in('patient_id', patientIds.map(String))
          .order('created_at', { ascending: false })
          .limit(500);

        if (vitalsRes.error?.code === '42703') {
          vitalsRes = await supabase
            .from(vitalsTable)
            .select('id, patient_id, context, bp, hr, rr, temp, spo2')
            .eq('context', 'ER')
            .in('patient_id', patientIds.map(String))
            .order('id', { ascending: false })
            .limit(500);
        }

        if (!vitalsRes.error && Array.isArray(vitalsRes.data)) {
          for (const v of vitalsRes.data) {
            const pid = `${v?.patient_id || ''}`.trim();
            if (!pid) continue;
            if (!latestVitalsByPatient.has(pid)) latestVitalsByPatient.set(pid, v);
          }
        }
      }

      const rows = patientIds
        .map((pid) => {
          const triage = latestCriticalByPatient.get(pid);
          const p = patientById.get(pid);
          const v = latestVitalsByPatient.get(pid);
          const first = `${p?.first_name || ''}`.trim();
          const middle = `${p?.middle_name || ''}`.trim();
          const last = `${p?.last_name || ''}`.trim();
          const name = `${first}${middle ? ` ${middle}` : ''}${last ? ` ${last}` : ''}`.trim() || `Patient #${pid}`;
          const reasonsRaw = triage?.reasons;
          const reasons = Array.isArray(reasonsRaw)
            ? reasonsRaw
            : (() => {
                try {
                  const parsed = JSON.parse(reasonsRaw || '[]');
                  return Array.isArray(parsed) ? parsed : [];
                } catch {
                  return [];
                }
              })();

          return {
            id: pid,
            name,
            triageLevel: triage?.triage_level ?? null,
            priorityLabel: triage?.priority_label ?? 'Critical',
            mainConcern: triage?.main_concern ?? null,
            reasons,
            bp: v?.bp ?? null,
            hr: v?.hr ?? null,
            spo2: v?.spo2 ?? null,
          };
        })
        .sort((a, b) => Number(a.triageLevel) - Number(b.triageLevel));

      setItems(rows);
    } catch (e) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [ensureTriageTableName, ensureVitalsTableName, ensureWardTableName, isCriticalRow]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCritical();
    setRefreshing(false);
  }, [loadCritical]);

  useEffect(() => {
    let triageChannel = null;
    let wardChannel = null;
    let vitalsChannel = null;
    let isActive = true;

    (async () => {
      await loadCritical();
      const triageTable = await ensureTriageTableName();
      const wardTable = await ensureWardTableName();
      const vitalsTable = await ensureVitalsTableName();
      if (!isActive) return;

      if (triageTable) {
        triageChannel = supabase
          .channel('critical-alerts-updates')
          .on('postgres_changes', { event: '*', schema: 'public', table: triageTable }, () => loadCritical())
          .subscribe();
      }

      if (wardTable) {
        wardChannel = supabase
          .channel('critical-ward-updates')
          .on('postgres_changes', { event: '*', schema: 'public', table: wardTable }, () => loadCritical())
          .subscribe();
      }

      if (vitalsTable) {
        vitalsChannel = supabase
          .channel('critical-vitals-updates')
          .on('postgres_changes', { event: '*', schema: 'public', table: vitalsTable }, () => loadCritical())
          .subscribe();
      }
    })();

    return () => {
      isActive = false;
      if (triageChannel) supabase.removeChannel(triageChannel);
      if (wardChannel) supabase.removeChannel(wardChannel);
      if (vitalsChannel) supabase.removeChannel(vitalsChannel);
    };
  }, [ensureTriageTableName, ensureVitalsTableName, ensureWardTableName, loadCritical]);

  const emptyLabel = useMemo(() => {
    if (loading) return '';
    return 'No critical patients right now.';
  }, [loading]);

  const renderItem = ({ item }) => (
    <View
      style={{
        backgroundColor: '#fff',
        padding: 16,
        marginBottom: 12,
        borderRadius: 10,
        elevation: 2,
      }}
    >

      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Text style={{
          fontSize: 16,
          fontWeight: 'bold',
        }}>
          {item.name}
        </Text>

        <Feather name="alert-triangle" size={20} color="red" />
      </View>

      {!!item.mainConcern && (
        <Text style={{ color: '#666', marginTop: 4 }} numberOfLines={2}>
          {item.mainConcern}
        </Text>
      )}

      <View style={{
        flexDirection: 'row',
        marginTop: 10,
        justifyContent: 'space-between',
      }}>

        <Text>BP: {item.bp || 'N/A'}</Text>
        <Text>HR: {item.hr || 'N/A'}</Text>

        <Text style={{
          color: 'red',
          fontWeight: 'bold',
        }}>
          {`${item.priorityLabel || 'Critical'}`.toUpperCase()}
        </Text>

      </View>

    </View>
  );

  return (
    <SafeAreaView style={{
      flex: 1,
      backgroundColor: '#f4f6f8',
      padding: 16,
    }}>

      {loading ? (
        <View style={{ paddingVertical: 24 }}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.id}`}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={{ color: '#999', fontStyle: 'italic', paddingVertical: 12 }}>
              {emptyLabel}
            </Text>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}

    </SafeAreaView>
  );
}
