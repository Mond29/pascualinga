import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet, ActivityIndicator, Modal, TextInput, ScrollView, SafeAreaView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NurseSideMenu from './NurseSideMenu';

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

const MONITOR_TABLE_CANDIDATES = [
  'inpatient_monitoring_logs',
  'ward_monitoring_logs',
  'monitoring_logs',
];

let cachedMonitorTableName = null;
let monitorTableProbePromise = null;

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

export default function NurseInpatientWard() {
  const [role, setRole] = useState('');
  const isDoctor = useMemo(() => `${role || ''}`.trim().toLowerCase() === 'doctor', [role]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wardTableMissing, setWardTableMissing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);

  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [monitorModalVisible, setMonitorModalVisible] = useState(false);
  const [activePatient, setActivePatient] = useState(null);
  const [editedDiagnosis, setEditedDiagnosis] = useState('');
  const [editedStatus, setEditedStatus] = useState('Occupied');

  const [monitorTableMissing, setMonitorTableMissing] = useState(false);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorLogs, setMonitorLogs] = useState([]);
  const [lastVitalsByOccupancyId, setLastVitalsByOccupancyId] = useState({});
  const [drawerVisible, setDrawerVisible] = useState(false);

  const toggleDrawer = () => setDrawerVisible(!drawerVisible);
  const [vitalBp, setVitalBp] = useState('');
  const [vitalHr, setVitalHr] = useState('');
  const [vitalRr, setVitalRr] = useState('');
  const [vitalTemp, setVitalTemp] = useState('');
  const [vitalSpo2, setVitalSpo2] = useState('');
  const [vitalPain, setVitalPain] = useState('');
  const [vitalNotes, setVitalNotes] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadRole = async () => {
      const nextRole = `${(await AsyncStorage.getItem('userRole')) || ''}`.trim().toLowerCase();
      if (!cancelled) setRole(nextRole);
    };
    loadRole();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchInpatients = useCallback(async () => {
    setLoading(true);
    if (!cachedWardTableName) {
      if (!wardTableProbePromise) {
        wardTableProbePromise = (async () => {
          for (const candidate of WARD_TABLE_CANDIDATES) {
            const res = await supabase.from(candidate).select('id').limit(1);
            if (!res.error) return candidate;
            if (res.error?.code !== 'PGRST205') return candidate;
          }
          return null;
        })();
      }
      cachedWardTableName = await wardTableProbePromise;
      wardTableProbePromise = null;
    }

    if (!cachedWardTableName) {
      setWardTableMissing(true);
      setPatients([]);
      setLastVitalsByOccupancyId({});
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from(cachedWardTableName)
      .select('id, ward, status, patient_name, diagnosed')
      .ilike('status', 'occupied%')
      .order('ward', { ascending: true });

    if (error) {
      console.error('Error fetching inpatients:', error);
      setWardTableMissing(true);
    } else {
      setPatients(data || []);
      setWardTableMissing(false);
    }
    setLoading(false);

    const resolvedMonitorTable = await ensureMonitorTableName();
    if (!resolvedMonitorTable) {
      setLastVitalsByOccupancyId({});
      return;
    }

    const ids = (data || []).map((p) => p?.id).filter(Boolean);
    if (ids.length === 0) {
      setLastVitalsByOccupancyId({});
      return;
    }

    const { data: vitalsRows, error: vitalsError } = await supabase
      .from(resolvedMonitorTable)
      .select('id, ward_occupancy_id, created_at, bp, hr, rr, temp, spo2, pain')
      .in('ward_occupancy_id', ids)
      .order('created_at', { ascending: false });

    if (vitalsError) {
      console.error('Error fetching last vitals:', vitalsError);
      setLastVitalsByOccupancyId({});
      return;
    }

    const nextMap = {};
    for (const row of vitalsRows || []) {
      const occId = row?.ward_occupancy_id;
      if (!occId) continue;
      if (nextMap[occId]) continue;
      nextMap[occId] = row;
    }
    setLastVitalsByOccupancyId(nextMap);
  }, []);

  const ensureMonitorTableName = useCallback(async () => {
    if (cachedMonitorTableName) return cachedMonitorTableName;
    if (monitorTableProbePromise) return await monitorTableProbePromise;

    monitorTableProbePromise = (async () => {
      for (const candidate of MONITOR_TABLE_CANDIDATES) {
        const res = await supabase.from(candidate).select('id').limit(1);
        if (!res.error) return candidate;
        if (res.error?.code !== 'PGRST205') return candidate;
      }
      return null;
    })();

    const resolved = await monitorTableProbePromise;
    monitorTableProbePromise = null;
    cachedMonitorTableName = resolved;
    setMonitorTableMissing(!resolved);
    return resolved;
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchInpatients();
    }, [fetchInpatients])
  );

  const closeUpdateModal = () => {
    setUpdateModalVisible(false);
    setActivePatient(null);
    setEditedDiagnosis('');
    setEditedStatus('Occupied');
  };

  const openUpdateModal = (patient) => {
    if (isDoctor) {
      Alert.alert('View Only', 'Doctors can only monitor the inpatient ward.');
      return;
    }
    setActivePatient(patient);
    setEditedDiagnosis(patient?.diagnosed || '');
    setEditedStatus(patient?.status || 'Occupied');
    setUpdateModalVisible(true);
  };

  const applyUpdate = async () => {
    if (isDoctor) {
      Alert.alert('View Only', 'Doctors can only monitor the inpatient ward.');
      return;
    }
    if (!activePatient || !cachedWardTableName) return;

    const nextStatus = `${editedStatus || ''}`.trim() || 'Occupied';
    const willClearPatient = `${nextStatus}`.toLowerCase().startsWith('available') || `${nextStatus}`.toLowerCase().startsWith('clean');

    const payload = {
      status: nextStatus,
      diagnosed: willClearPatient ? '' : `${editedDiagnosis || ''}`.trim(),
      patient_name: willClearPatient ? '' : `${activePatient?.patient_name || ''}`.trim(),
    };

    const { data, error } = await supabase
      .from(cachedWardTableName)
      .update(payload)
      .eq('id', activePatient.id)
      .select('id');

    if (error) {
      console.error('Error updating ward occupancy:', error);
      Alert.alert('Error', 'Failed to update inpatient. Please try again.');
      return;
    }

    if (!data || data.length === 0) {
      Alert.alert('Error', 'No rows updated. Please refresh and try again.');
      return;
    }

    closeUpdateModal();
    fetchInpatients();
  };

  const closeMonitorModal = () => {
    setMonitorModalVisible(false);
    setActivePatient(null);
    setMonitorLogs([]);
    setMonitorLoading(false);
    setVitalBp('');
    setVitalHr('');
    setVitalRr('');
    setVitalTemp('');
    setVitalSpo2('');
    setVitalPain('');
    setVitalNotes('');
  };

  const openMonitorModal = async (patient) => {
    setActivePatient(patient);
    setMonitorModalVisible(true);
    setMonitorLogs([]);
    setVitalBp('');
    setVitalHr('');
    setVitalRr('');
    setVitalTemp('');
    setVitalSpo2('');
    setVitalPain('');
    setVitalNotes('');

    const resolvedMonitorTable = await ensureMonitorTableName();
    if (!resolvedMonitorTable) {
      setMonitorTableMissing(true);
      return;
    }

    setMonitorLoading(true);
    const { data, error } = await supabase
      .from(resolvedMonitorTable)
      .select('id, ward_occupancy_id, created_at, nurse_email, bp, hr, rr, temp, spo2, pain, notes')
      .eq('ward_occupancy_id', patient.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching monitoring logs:', error);
      setMonitorTableMissing(true);
      setMonitorLogs([]);
    } else {
      setMonitorTableMissing(false);
      setMonitorLogs(data || []);
    }
    setMonitorLoading(false);
  };

  const toIntOrNull = (value) => {
    const trimmed = `${value || ''}`.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
  };

  const toFloatOrNull = (value) => {
    const trimmed = `${value || ''}`.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return n;
  };

  const saveMonitoringLog = async () => {
    if (isDoctor) {
      Alert.alert('View Only', 'Doctors can only view monitoring logs.');
      return;
    }
    if (!activePatient) return;
    const resolvedMonitorTable = await ensureMonitorTableName();
    if (!resolvedMonitorTable) {
      setMonitorTableMissing(true);
      Alert.alert('Missing Setup', 'Monitoring table not found in database.');
      return;
    }

    const nurseEmail = (await AsyncStorage.getItem('userEmail')) || null;

    const payload = {
      ward_occupancy_id: activePatient.id,
      nurse_email: nurseEmail,
      bp: `${vitalBp || ''}`.trim() || null,
      hr: toIntOrNull(vitalHr),
      rr: toIntOrNull(vitalRr),
      temp: toFloatOrNull(vitalTemp),
      spo2: toIntOrNull(vitalSpo2),
      pain: toIntOrNull(vitalPain),
      notes: `${vitalNotes || ''}`.trim() || null,
    };

    const { data, error } = await supabase
      .from(resolvedMonitorTable)
      .insert([payload])
      .select('id, ward_occupancy_id, created_at, nurse_email, bp, hr, rr, temp, spo2, pain, notes');

    if (error) {
      console.error('Error saving monitoring log:', error);
      Alert.alert('Error', 'Failed to save monitoring log.');
      return;
    }

    setVitalBp('');
    setVitalHr('');
    setVitalRr('');
    setVitalTemp('');
    setVitalSpo2('');
    setVitalPain('');
    setVitalNotes('');

    setMonitorLogs([...(data || []), ...monitorLogs]);
    const created = (data || [])[0];
    if (created?.ward_occupancy_id) {
      setLastVitalsByOccupancyId((prev) => ({ ...prev, [created.ward_occupancy_id]: created }));
    }
  };

  const TableRow = ({ patient }) => {
    const occupancyStatusText = `${patient?.status || ''}`.trim() || 'Occupied';
    const displayName = `${patient?.patient_name || ''}`.trim() || 'Unknown Patient';
    const lastVitals = lastVitalsByOccupancyId?.[patient?.id] || null;
    
    const vitalsTag = computeVitalsTag(lastVitals);
    const vitalsColor =
      vitalsTag.level === 'critical'
        ? '#ef4444'
        : vitalsTag.level === 'alert'
          ? '#f97316'
          : vitalsTag.level === 'stable'
            ? '#22c55e'
            : '#6b7280';

    return (
      <View style={styles.tableRow}>
        {/* Patient & Room Info */}
        <View style={{ flex: 1.5, paddingRight: 8 }}>
          <Text style={styles.patientNameText} numberOfLines={2}>
            {displayName}
          </Text>
          <Text style={styles.roomLabelText}>
            {formatRoomLabel(patient.ward)}
          </Text>
        </View>

        {/* Status/Vitals Tag */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={[styles.vitalsBadge, { backgroundColor: vitalsColor }]}>
            <Text style={styles.vitalsBadgeText}>{vitalsTag.label}</Text>
          </View>
          <Text style={styles.statusSubText} numberOfLines={1}>{occupancyStatusText}</Text>
        </View>

        {/* Diagnosis (Hidden on small screens or truncated) */}
        <View style={{ flex: 1.2, paddingHorizontal: 4 }}>
          <Text style={styles.diagnosisText} numberOfLines={2}>
            {patient.diagnosed || 'No Diagnosis'}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.rowActions}>
          <TouchableOpacity 
            style={styles.iconBtn} 
            onPress={() => openMonitorModal(patient)}
          >
            <MaterialCommunityIcons name="heart-pulse" size={22} color="#DA7705" />
          </TouchableOpacity>
          {!isDoctor ? (
            <TouchableOpacity 
              style={styles.iconBtn} 
              onPress={() => openUpdateModal(patient)}
            >
              <MaterialCommunityIcons name="pencil-outline" size={22} color="#64748b" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const PAGE_SIZE = 10;

  const filtered = useMemo(() => {
    const q = `${searchQuery || ''}`.trim().toLowerCase();
    const list = Array.isArray(patients) ? patients : [];
    if (!q) return list;
    return list.filter((p) => {
      const name = `${p?.patient_name || ''}`.trim().toLowerCase();
      const ward = `${formatRoomLabel(p?.ward) || ''}`.trim().toLowerCase();
      const status = `${p?.status || ''}`.trim().toLowerCase();
      const diagnosis = `${p?.diagnosed || ''}`.trim().toLowerCase();
      return name.includes(q) || ward.includes(q) || status.includes(q) || diagnosis.includes(q);
    });
  }, [patients, searchQuery]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), [filtered.length]);
  const clampedPage = Math.min(page, pageCount - 1);

  useEffect(() => {
    setPage(0);
  }, [searchQuery]);

  useEffect(() => {
    if (page !== clampedPage) setPage(clampedPage);
  }, [clampedPage, page]);

  const paged = useMemo(() => {
    const start = clampedPage * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [clampedPage, filtered]);

  const showingStart = filtered.length === 0 ? 0 : clampedPage * PAGE_SIZE + 1;
  const showingEnd = filtered.length === 0 ? 0 : Math.min(clampedPage * PAGE_SIZE + PAGE_SIZE, filtered.length);


  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={paged}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <TableRow patient={item} />}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 16, gap: 10 }}>
              <TouchableOpacity onPress={toggleDrawer} style={{ padding: 5 }}>
                <Feather name="menu" size={24} color="#d9802b" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>
                Inpatient Ward
              </Text>
            </View>
            {wardTableMissing && (
              <Text style={{ color: '#b45309', paddingHorizontal: 16, marginBottom: 10 }}>
                Ward table not found in database. Please create/register wards first.
              </Text>
            )}
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color="#64748b" />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search (patient, room, status, diagnosis)…"
                  placeholderTextColor="#94a3b8"
                  style={styles.searchInput}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                disabled={!searchQuery}
                activeOpacity={0.85}
                style={[styles.clearBtn, !searchQuery && styles.clearBtnDisabled]}
              >
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.showingText}>{`Showing ${showingStart}-${showingEnd} of ${filtered.length}`}</Text>

            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.headerText, { flex: 1.5 }]}>Patient / Room</Text>
              <Text style={[styles.headerText, { flex: 1, textAlign: 'center' }]}>Status</Text>
              <Text style={[styles.headerText, { flex: 1.2 }]}>Diagnosis</Text>
              <Text style={[styles.headerText, { flex: 1, textAlign: 'right' }]}>Actions</Text>
            </View>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#f97316" />
            </View>
          ) : (
            <Text style={styles.noPatientsText}>No inpatients found.</Text>
          )
        }
      />

      <View style={styles.pagerRow}>
        <TouchableOpacity
          onPress={() => setPage((p) => Math.max(0, p - 1))}
          disabled={clampedPage <= 0}
          activeOpacity={0.85}
          style={[styles.pagerBtn, clampedPage <= 0 && styles.pagerBtnDisabled]}
        >
          <Text style={styles.pagerBtnText}>Prev</Text>
        </TouchableOpacity>

        <Text style={styles.pagerText}>{`Page ${clampedPage + 1} of ${pageCount}`}</Text>

        <TouchableOpacity
          onPress={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          disabled={clampedPage >= pageCount - 1}
          activeOpacity={0.85}
          style={[styles.pagerBtn, clampedPage >= pageCount - 1 && styles.pagerBtnDisabled]}
        >
          <Text style={styles.pagerBtnText}>Next</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={updateModalVisible} transparent animationType="fade" onRequestClose={closeUpdateModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Update Inpatient</Text>

            <Text style={styles.modalLabel}>Room</Text>
            <Text style={styles.modalValue}>
              {activePatient ? formatRoomLabel(activePatient.ward) : ''}
            </Text>

            <Text style={styles.modalLabel}>Patient</Text>
            <Text style={styles.modalValue}>
              {activePatient ? `${activePatient.patient_name || ''}`.trim() : ''}
            </Text>

            <Text style={styles.modalLabel}>Status</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={editedStatus} onValueChange={(v) => setEditedStatus(v)} style={{ height: 50 }}>
                <Picker.Item label="Occupied" value="Occupied" />
                <Picker.Item label="Clean up" value="Clean up" />
                <Picker.Item label="Available" value="Available" />
              </Picker>
            </View>

            <Text style={styles.modalLabel}>Diagnosis</Text>
            <TextInput
              value={editedDiagnosis}
              onChangeText={setEditedDiagnosis}
              style={styles.modalInput}
              placeholder="Enter diagnosis"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={closeUpdateModal}>
                <Text style={styles.modalBtnTextLight}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalSave]} onPress={applyUpdate}>
                <Text style={styles.modalBtnTextDark}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={monitorModalVisible} transparent animationType="fade" onRequestClose={closeMonitorModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '88%' }]}>
            <Text style={styles.modalTitle}>Monitor</Text>

            <Text style={styles.modalLabel}>Patient</Text>
            <Text style={styles.modalValue}>
              {activePatient ? `${activePatient.patient_name || ''}`.trim() : ''}
            </Text>

            <Text style={styles.modalLabel}>Room</Text>
            <Text style={styles.modalValue}>
              {activePatient ? formatRoomLabel(activePatient.ward) : ''}
            </Text>

            {monitorTableMissing && (
              <Text style={styles.warningText}>
                Monitoring table not found. Create inpatient_monitoring_logs in Supabase to enable saving vitals.
              </Text>
            )}
            {isDoctor ? (
              <Text style={styles.warningText}>View-only mode (Doctor)</Text>
            ) : null}

            <ScrollView showsVerticalScrollIndicator={false}>
              {!isDoctor ? (
                <>
                  <View style={styles.vitalsGrid}>
                    <View style={styles.vitalField}>
                      <Text style={styles.modalLabel}>BP</Text>
                      <TextInput value={vitalBp} onChangeText={setVitalBp} style={styles.modalInput} placeholder="120/80" />
                    </View>
                    <View style={styles.vitalField}>
                      <Text style={styles.modalLabel}>HR</Text>
                      <TextInput value={vitalHr} onChangeText={setVitalHr} style={styles.modalInput} placeholder="75" keyboardType="numeric" />
                    </View>
                    <View style={styles.vitalField}>
                      <Text style={styles.modalLabel}>RR</Text>
                      <TextInput value={vitalRr} onChangeText={setVitalRr} style={styles.modalInput} placeholder="18" keyboardType="numeric" />
                    </View>
                    <View style={styles.vitalField}>
                      <Text style={styles.modalLabel}>Temp</Text>
                      <TextInput value={vitalTemp} onChangeText={setVitalTemp} style={styles.modalInput} placeholder="36.6" keyboardType="numeric" />
                    </View>
                    <View style={styles.vitalField}>
                      <Text style={styles.modalLabel}>SpO₂</Text>
                      <TextInput value={vitalSpo2} onChangeText={setVitalSpo2} style={styles.modalInput} placeholder="98" keyboardType="numeric" />
                    </View>
                    <View style={styles.vitalField}>
                      <Text style={styles.modalLabel}>Pain</Text>
                      <TextInput value={vitalPain} onChangeText={setVitalPain} style={styles.modalInput} placeholder="0-10" keyboardType="numeric" />
                    </View>
                  </View>

                  <Text style={styles.modalLabel}>Notes</Text>
                  <TextInput
                    value={vitalNotes}
                    onChangeText={setVitalNotes}
                    style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                    placeholder="Notes"
                    multiline
                  />
                </>
              ) : null}

              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={closeMonitorModal}>
                  <Text style={styles.modalBtnTextLight}>Close</Text>
                </TouchableOpacity>
                {!isDoctor ? (
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalSave]}
                    onPress={saveMonitoringLog}
                    disabled={monitorTableMissing}
                  >
                    <Text style={styles.modalBtnTextDark}>Save</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <Text style={[styles.modalLabel, { marginTop: 10 }]}>Recent Logs</Text>
              {monitorLoading ? (
                <View style={{ paddingVertical: 10 }}>
                  <ActivityIndicator size="small" color="#f97316" />
                </View>
              ) : monitorLogs.length === 0 ? (
                <Text style={{ color: '#6b7280', marginBottom: 10 }}>No logs yet.</Text>
              ) : (
                monitorLogs.map((log) => {
                  const when = log?.created_at ? new Date(log.created_at).toLocaleString() : '';
                  const summary = [
                    log?.bp ? `BP ${log.bp}` : null,
                    Number.isFinite(log?.hr) ? `HR ${log.hr}` : null,
                    Number.isFinite(log?.rr) ? `RR ${log.rr}` : null,
                    Number.isFinite(log?.temp) ? `Temp ${log.temp}` : null,
                    Number.isFinite(log?.spo2) ? `SpO₂ ${log.spo2}` : null,
                    Number.isFinite(log?.pain) ? `Pain ${log.pain}` : null,
                  ].filter(Boolean).join(' • ');

                  return (
                    <View key={String(log.id)} style={styles.logRow}>
                      <Text style={styles.logWhen}>{when}</Text>
                      <Text style={styles.logSummary}>{summary || '—'}</Text>
                      {log?.notes ? <Text style={styles.logNotes}>{log.notes}</Text> : null}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <NurseSideMenu visible={drawerVisible} onClose={toggleDrawer} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 15,
    backgroundColor: "#ffffff"
  },
  listContent: {
    paddingBottom: 24,
  },
  loadingWrap: {
    paddingTop: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 20,
    color: "#1e293b",
    textAlign: "left",
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '800', 
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  patientNameText: {
    fontSize: 14,
    fontWeight: '700', 
    color: '#1e293b',
  },
  roomLabelText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  vitalsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  vitalsBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusSubText: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '600',
  },
  diagnosisText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  rowActions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  iconBtn: {
    padding: 6,
  },
  noPatientsText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#94a3b8', 
    fontSize: 15,
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 15,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row', 
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: '#1e293b',
    fontSize: 14,
  },
  clearBtn: {
    paddingHorizontal: 15, 
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  clearBtnDisabled: {
    opacity: 0.5,
  },
  clearBtnText: {
    color: '#64748b', 
    fontWeight: '700',
    fontSize: 14,
  },
  showingText: {
    marginBottom: 12, 
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  pagerRow: {
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  pagerBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0', 
  },
  pagerBtnDisabled: {
    opacity: 0.4,
  },
  pagerBtnText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 13,
  },
  pagerText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20, 
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 20, 
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b', 
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 15,
    marginBottom: 6,
  },
  modalValue: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 15, 
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
    color: '#1e293b',
    fontSize: 15,
  },
  pickerWrap: {
    borderWidth: 1, 
    borderColor: '#e2e8f0',
    borderRadius: 12, 
    overflow: 'hidden', 
    backgroundColor: '#f8fafc',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 25,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14, 
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancel: {
    backgroundColor: '#f1f5f9',
  },
  modalSave: {
    backgroundColor: '#DA7705',
  },
  modalBtnTextLight: {
    color: '#64748b', 
    fontWeight: '700',
  },
  modalBtnTextDark: {
    color: '#ffffff', 
    fontWeight: '700',
  },
  warningText: {
    marginTop: 10, 
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap', 
    justifyContent: 'space-between',
    marginTop: 10,
  },
  vitalField: {
    width: '48%',
    marginBottom: 10,
  },
  logRow: {
    backgroundColor: '#f8fafc', 
    padding: 12,
    borderRadius: 10,
    marginBottom: 8, 
    borderLeftWidth: 3,
    borderLeftColor: '#DA7705',
  },
  logWhen: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
  },
  logSummary: {
    fontSize: 13, 
    color: '#334155',
    fontWeight: '700',
    marginTop: 2,
  },
  logNotes: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 4,
  },
});
