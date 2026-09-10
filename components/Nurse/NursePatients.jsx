// NursePatients.jsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import NursePatientsStyles from '../../styles/NurseStyles/NursePatientsStlyes';
import { MaterialIcons, Ionicons } from '@expo/vector-icons'; // For icons
import { Modal, Portal, Provider, Button } from 'react-native-paper'; // Popups
import { supabase } from '../../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import NurseSideMenu from './NurseSideMenu';
import { Feather } from '@expo/vector-icons';

const ER_TRIAGE_MODEL = {
  mildSymptoms: [
    'Mild Fever',
    'Mild Cough',
    'Sore throat',
    'Runny nose',
    'Headache',
    'Dizziness',
    'Nausea',
    'Muscle aches',
    'Others',
  ],
  moderateSymptoms: [
    'High Fever',
    'Severe Cough',
    'Vomiting',
    'Diarrhea',
    'Abdominal pain',
    'Body pain',
    'Rash',
    'Urinary pain',
    'Others',
  ],
  severeSymptoms: [
    'Not breathing',
    'Unconscious',
    'Severe bleeding',
    'Seizure (ongoing)',
    'Chest pain',
    'Shortness of breath',
    'Stroke symptoms',
    'Severe allergic reaction',
    'Severe abdominal pain',
    'Wound / injury',
    'Others',
  ],
  symptomWeights: {
    'Not breathing': 100,
    Unconscious: 100,
    'Severe bleeding': 95,
    'Seizure (ongoing)': 95,
    'Chest pain': 35,
    'Shortness of breath': 35,
    'Stroke symptoms': 35,
    'Severe allergic reaction': 35,
    'Severe abdominal pain': 25,
    'Wound / injury': 15,
    'High Fever': 25,
    'Severe Cough': 20,
    Vomiting: 15,
    Diarrhea: 15,
    'Abdominal pain': 15,
    'Mild Fever': 10,
    'Mild Cough': 8,
    'Sore throat': 8,
    'Runny nose': 6,
    Headache: 10,
    Dizziness: 10,
    Nausea: 10,
    'Muscle aches': 8,
  },
};

const TRIAGE_TABLE_CANDIDATES = [
  'er_triage_logs',
  'patient_triage_logs',
  'triage_logs',
  'er_triage_queue',
];

let cachedTriageTableName = null;
let triageTableProbePromise = null;

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

const toggleInList = (list, value) => {
  const raw = `${value || ''}`.trim();
  const arr = Array.isArray(list) ? list : [];
  if (!raw) return arr;
  return arr.includes(raw) ? arr.filter((v) => v !== raw) : [...arr, raw];
};

const VITALS_TABLE_CANDIDATES = [
  'patient_vitals_logs',
  'er_vitals_logs',
  'er_patient_vitals',
  'vitals_logs',
];

let cachedVitalsTableName = null;
let vitalsTableProbePromise = null;

export default function NursePatients() {
  const [role, setRole] = useState('');
  const isDoctor = useMemo(() => `${role || ''}`.trim().toLowerCase() === 'doctor', [role]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wardTableName, setWardTableName] = useState(cachedWardTableName);
  const [wardTableMissing, setWardTableMissing] = useState(false);
  const [vitalsTableMissing, setVitalsTableMissing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const toggleDrawer = () => setDrawerVisible(!drawerVisible);

  const [selectedPatient, setSelectedPatient] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedFirstName, setEditedFirstName] = useState('');
  const [editedMiddleName, setEditedMiddleName] = useState('');
  const [editedLastName, setEditedLastName] = useState('');
  const [editedDateOfBirth, setEditedDateOfBirth] = useState('');

  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferPatient, setTransferPatient] = useState(null);
  const [availableWards, setAvailableWards] = useState([]);
  const [selectedWardOccupancyId, setSelectedWardOccupancyId] = useState(null);
  const [transferDiagnosis, setTransferDiagnosis] = useState('');

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addStep, setAddStep] = useState(0);
  const [addFirstName, setAddFirstName] = useState('');
  const [addMiddleName, setAddMiddleName] = useState('');
  const [addLastName, setAddLastName] = useState('');
  const [addDateOfBirth, setAddDateOfBirth] = useState('');
  const [addDobYear, setAddDobYear] = useState(new Date().getFullYear() - 20);
  const [addDobMonth, setAddDobMonth] = useState(1);
  const [addDobDay, setAddDobDay] = useState(1);
  const [addErrors, setAddErrors] = useState({});

  const [addBp, setAddBp] = useState('');
  const [addHr, setAddHr] = useState('');
  const [addRr, setAddRr] = useState('');
  const [addTemp, setAddTemp] = useState('');
  const [addSpo2, setAddSpo2] = useState('');
  const [addPain, setAddPain] = useState('');
  const [addVitalsNotes, setAddVitalsNotes] = useState('');
  const [addMainConcern, setAddMainConcern] = useState('');
  const [addExistingConditions, setAddExistingConditions] = useState('');
  const [addSelectedSymptoms, setAddSelectedSymptoms] = useState([]);
  const [addMildOthers, setAddMildOthers] = useState('');
  const [addModerateOthers, setAddModerateOthers] = useState('');
  const [addSevereOthers, setAddSevereOthers] = useState('');
  const [manualTriageLevel, setManualTriageLevel] = useState(null);

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
    setWardTableName(resolved);
    setWardTableMissing(!resolved);
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
    setVitalsTableMissing(!resolved);
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

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    const resolvedWardTable = await ensureWardTableName();
    const occupiedQuery = resolvedWardTable
      ? supabase.from(resolvedWardTable).select('id, status, patient_name').ilike('status', 'occupied%')
      : Promise.resolve({ data: [], error: null });

    const [{ data: patientRows, error: patientError }, { data: occupiedRows, error: occupiedError }] = await Promise.all([
      supabase.from('patients').select('id, first_name, middle_name, last_name, date_of_birth'),
      occupiedQuery,
    ]);

    if (patientError) {
      console.error('Error fetching ER patients:', patientError);
      Alert.alert('Error', 'Failed to fetch ER patients.');
      setPatients([]);
      setLoading(false);
      return;
    }

    if (occupiedError) {
      console.error('Error fetching ER patients:', occupiedError);
      setWardTableMissing(true);
      setPatients(patientRows || []);
      setLoading(false);
      return;
    }

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

    const resolvedTriageTable = await ensureTriageTableName();
    const resolvedVitalsTable = await ensureVitalsTableName();

    const ids = erPatients.map((p) => p?.id).filter(Boolean);
    if (ids.length === 0) {
      setPatients(erPatients);
      setLoading(false);
      return;
    }

    const triageMap = {};
    if (resolvedTriageTable) {
      const { data: triageRows, error: triageError } = await supabase
        .from(resolvedTriageTable)
        .select('id, patient_id, created_at, triage_level, priority_score, priority_label, main_concern, symptoms, existing_conditions, explanation')
        .in('patient_id', ids.map(String))
        .order('created_at', { ascending: false })
        .limit(200);

      if (!triageError) {
        for (const row of triageRows || []) {
          const pid = `${row?.patient_id || ''}`.trim();
          if (!pid) continue;
          if (triageMap[pid]) continue;
          triageMap[pid] = row;
        }
      }
    }

    const vitalsMap = {};
    if (resolvedVitalsTable) {
      let vitalsRes = await supabase
        .from(resolvedVitalsTable)
        .select('id, patient_id, created_at, context, bp, hr, rr, temp, spo2, pain')
        .eq('context', 'ER')
        .in('patient_id', ids.map(String))
        .order('created_at', { ascending: false })
        .limit(300);

      if (vitalsRes.error?.code === '42703') {
        vitalsRes = await supabase
          .from(resolvedVitalsTable)
          .select('id, patient_id, created_at, bp, hr, rr, temp, spo2, pain')
          .in('patient_id', ids.map(String))
          .order('created_at', { ascending: false })
          .limit(300);
      }

      if (vitalsRes.error?.code === '42703') {
        vitalsRes = await supabase
          .from(resolvedVitalsTable)
          .select('id, patient_id, bp, hr, rr, temp, spo2, pain')
          .in('patient_id', ids.map(String))
          .order('id', { ascending: false })
          .limit(300);
      }

      if (!vitalsRes.error) {
        for (const row of vitalsRes.data || []) {
          const pid = `${row?.patient_id || ''}`.trim();
          if (!pid) continue;
          if (vitalsMap[pid]) continue;
          vitalsMap[pid] = row;
        }
      }
    }

    const withTriage = erPatients.map((p) => {
      const t = triageMap[String(p?.id)] || null;
      const v = vitalsMap[String(p?.id)] || null;
      return { ...p, _triage: t, _vitals: v };
    });

    withTriage.sort((a, b) => {
      const as = Number(a?._triage?.priority_score ?? -1);
      const bs = Number(b?._triage?.priority_score ?? -1);
      if (bs !== as) return bs - as;
      const at = a?._triage?.created_at ? new Date(a._triage.created_at).getTime() : 0;
      const bt = b?._triage?.created_at ? new Date(b._triage.created_at).getTime() : 0;
      if (bt !== at) return bt - at;
      const an = `${a?.last_name || ''} ${a?.first_name || ''}`.toLowerCase();
      const bn = `${b?.last_name || ''} ${b?.first_name || ''}`.toLowerCase();
      return an.localeCompare(bn);
    });

    setPatients(withTriage);
    setLoading(false);
  }, []);

  const fetchAvailableWards = useCallback(async () => {
    const resolvedWardTable = await ensureWardTableName();
    if (!resolvedWardTable) {
      setWardTableMissing(true);
      setAvailableWards([]);
      return [];
    }
    const { data, error } = await supabase
      .from(resolvedWardTable)
      .select('id, ward, status')
      .ilike('status', 'available%')
      .order('ward', { ascending: true });

    if (error) {
      console.error('Error fetching available wards:', error);
      setWardTableMissing(true);
      setAvailableWards([]);
      return [];
    }

    setAvailableWards(data || []);
    return data || [];
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPatients();
    }, [fetchPatients])
  );

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

  useEffect(() => {
    const channel = supabase
      .channel('patients-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, () => {
        fetchPatients();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'er_triage_logs' }, () => {
        fetchPatients();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_triage_logs' }, () => {
        fetchPatients();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'triage_logs' }, () => {
        fetchPatients();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPatients]);

  useEffect(() => {
    if (!addModalVisible) return;
    const pad2 = (n) => String(n).padStart(2, '0');
    const daysInMonth = (year, month) => new Date(year, month, 0).getDate();
    const maxDay = daysInMonth(addDobYear, addDobMonth);
    if (addDobDay > maxDay) {
      setAddDobDay(maxDay);
      return;
    }
    setAddDateOfBirth(`${addDobYear}-${pad2(addDobMonth)}-${pad2(addDobDay)}`);
  }, [addModalVisible, addDobYear, addDobMonth, addDobDay]);

  // Handle Delete
  const handleDelete = async (id) => {
    if (isDoctor) {
      Alert.alert('View Only', 'Doctors can only view the patient list.');
      return;
    }
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this patient? This will also remove their triage and vitals records.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            try {
              setLoading(true);
              
              const callerEmail = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
              const callerRole = `${(await AsyncStorage.getItem('userRole')) || ''}`.trim().toLowerCase();

              // Use the Edge Function to delete (it has admin privileges)
              const res = await supabase.functions.invoke('er-add-patient', {
                headers: {
                  'x-user-email': callerEmail,
                  'x-user-role': callerRole,
                },
                body: {
                  action: 'delete',
                  patientId: id,
                },
              });

              const out = res?.data || null;

              if (res?.error || !out?.ok) {
                const msg = out?.error || res?.error?.message || 'Failed to delete patient.';
                console.error('Delete error:', msg);
                Alert.alert('Error', msg);
              } else {
                // Optimistic UI update
                setPatients((prev) => prev.filter((p) => p.id !== id));
                Alert.alert('Success', 'Patient and associated records deleted.');
                fetchPatients();
              }
            } catch (err) {
              console.error('Delete operation failed:', err);
              Alert.alert('Error', 'An unexpected error occurred during deletion.');
            } finally {
              setLoading(false);
            }
          }
        },
      ]
    );
  };

  // Handle View / Edit
  const handleViewEdit = (patient, editMode = false) => {
    setSelectedPatient(patient);
    setEditedFirstName(patient.first_name);
    setEditedMiddleName(patient.middle_name || '');
    setEditedLastName(patient.last_name);
    setEditedDateOfBirth(patient.date_of_birth);
    setIsEditMode(isDoctor ? false : editMode);
    setModalVisible(true);
  };

  // Save edits
  const saveEdits = async () => {
    if (isDoctor) {
      Alert.alert('View Only', 'Doctors can only view patient details.');
      return;
    }
    const { error } = await supabase
      .from('patients')
      .update({
        first_name: editedFirstName,
        middle_name: editedMiddleName,
        last_name: editedLastName,
        date_of_birth: editedDateOfBirth,
      })
      .eq('id', selectedPatient.id);

    if (error) {
      console.error('Error saving patient:', error);
      Alert.alert('Error', 'Failed to save patient details.');
    } else {
      fetchPatients(); // Refresh the list
      setModalVisible(false);
    }
  };

  const resetAddWizard = () => {
    const now = new Date();
    const defaultYear = now.getFullYear() - 20;
    setAddStep(0);
    setAddFirstName('');
    setAddMiddleName('');
    setAddLastName('');
    setAddDobYear(defaultYear);
    setAddDobMonth(1);
    setAddDobDay(1);
    setAddDateOfBirth(`${defaultYear}-01-01`);
    setAddBp('');
    setAddHr('');
    setAddRr('');
    setAddTemp('');
    setAddSpo2('');
    setAddPain('');
    setAddVitalsNotes('');
    setAddMainConcern('');
    setAddExistingConditions('');
    setAddSelectedSymptoms([]);
    setAddMildOthers('');
    setAddModerateOthers('');
    setAddSevereOthers('');
    setManualTriageLevel(null);
    setAddErrors({});
  };

  const openAddPatient = async () => {
    if (isDoctor) {
      Alert.alert('View Only', 'Doctors can only view the patient list.');
      return;
    }
    resetAddWizard();
    setAddModalVisible(true);
    await ensureVitalsTableName();
  };

  const closeAddPatient = () => {
    setAddModalVisible(false);
    resetAddWizard();
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

  const addTriage = useMemo(() => {
    const symptoms = Array.isArray(addSelectedSymptoms) ? [...addSelectedSymptoms] : [];
    if (addMildOthers.trim()) symptoms.push(`Mild: ${addMildOthers.trim()}`);
    if (addModerateOthers.trim()) symptoms.push(`Moderate: ${addModerateOthers.trim()}`);
    if (addSevereOthers.trim()) symptoms.push(`Severe: ${addSevereOthers.trim()}`);

    const concern = `${addMainConcern || ''}`.trim();
    const conditions = `${addExistingConditions || ''}`.trim().toLowerCase();

    const hr = toIntOrNull(addHr);
    const rr = toIntOrNull(addRr);
    const spo2 = toIntOrNull(addSpo2);
    const temp = toFloatOrNull(addTemp);

    const bpRaw = `${addBp || ''}`.trim();
    const bpParts = bpRaw.split(/[^0-9]+/).filter(Boolean);
    const sys = bpParts[0] ? Number(bpParts[0]) : null;
    const dia = bpParts[1] ? Number(bpParts[1]) : null;
    const sysN = Number.isFinite(sys) ? sys : null;
    const diaN = Number.isFinite(dia) ? dia : null;

    const reasons = [];
    let isInconsistent = false;

    // 1. Check for Inconsistent Data
    // "Impossibleng may vitals pa pero hindi na humihinga"
    // If HR is normal but RR is 0 or SpO2 is 0/null while other vitals seem fine.
    const hasPulse = hr !== null && hr > 0;
    const notBreathingSymptom = symptoms.includes('Not breathing');
    const rrZero = rr !== null && rr === 0;

    if (hasPulse && (notBreathingSymptom || rrZero) && (hr >= 60 && hr <= 100)) {
      isInconsistent = true;
      reasons.push('Inconsistent Data: Normal heart rate but reported as not breathing.');
    }

    // 2. Vitals Analysis (Highest Priority)
    let vitalLevel = 5;
    const vitalReasons = [];

    if (spo2 !== null && spo2 < 90) {
      vitalLevel = Math.min(vitalLevel, 1);
      vitalReasons.push(`Critical SpO2 (${spo2}%)`);
    }
    if (hr !== null && (hr < 40 || hr >= 130)) {
      vitalLevel = Math.min(vitalLevel, 1);
      vitalReasons.push(`Critical Heart Rate (${hr} bpm)`);
    }
    if (rr !== null && (rr < 8 || rr >= 30)) {
      vitalLevel = Math.min(vitalLevel, 1);
      vitalReasons.push(`Critical Respiratory Rate (${rr} cpm)`);
    }
    if (temp !== null && temp >= 39.5) {
      vitalLevel = Math.min(vitalLevel, 1);
      vitalReasons.push(`Critical Temperature (${temp}°C)`);
    }
    if (sysN !== null && (sysN < 80 || sysN >= 200)) {
      vitalLevel = Math.min(vitalLevel, 1);
      vitalReasons.push(`Critical Blood Pressure (${bpRaw})`);
    } else if (sysN !== null && sysN >= 180) {
      vitalLevel = Math.min(vitalLevel, 2);
      vitalReasons.push(`Severe Hypertension (${bpRaw})`);
    }

    // 3. Symptoms & Concern Analysis
    let symptomLevel = 5;
    let score = 0;

    const addSymptomScore = (label) => {
      const w = ER_TRIAGE_MODEL.symptomWeights[label] || 0;
      if (w > 0) {
        score += w;
        if (ER_TRIAGE_MODEL.severeSymptoms.includes(label)) {
          symptomLevel = Math.min(symptomLevel, 2);
          if (label === 'Not breathing' || label === 'Unconscious') symptomLevel = 1;
        } else if (ER_TRIAGE_MODEL.moderateSymptoms.includes(label)) {
          symptomLevel = Math.min(symptomLevel, 3);
        } else if (ER_TRIAGE_MODEL.mildSymptoms.includes(label)) {
          symptomLevel = Math.min(symptomLevel, 4);
        }
      }
    };

    symptoms.forEach(addSymptomScore);

    const concernLower = concern.toLowerCase();
    if (concernLower.includes('chest') || concernLower.includes('dibdib')) {
      score += 20;
      symptomLevel = Math.min(symptomLevel, 2);
    }
    if (concernLower.includes('hinga') || concernLower.includes('breath')) {
      score += 20;
      symptomLevel = Math.min(symptomLevel, 2);
    }

    // Determine final AI level
    let aiLevel = Math.min(vitalLevel, symptomLevel);
    if (score >= 80) aiLevel = Math.min(aiLevel, 2);
    else if (score >= 60) aiLevel = Math.min(aiLevel, 3);
    else if (score >= 35) aiLevel = Math.min(aiLevel, 4);

    if (isInconsistent) {
      // If inconsistent, we still provide a level but flag the reason
    }

    // Collect all reasons
    if (vitalReasons.length > 0) reasons.push(...vitalReasons);
    symptoms.filter(s => ER_TRIAGE_MODEL.symptomWeights[s] > 15).forEach(s => reasons.push(s));
    if (concern && score > 10) reasons.push(`Chief Complaint: ${concern}`);

    const priorityLabel = isInconsistent 
      ? 'Inconsistent Data' 
      : (aiLevel === 1 ? 'Critical' : aiLevel === 2 ? 'Urgent' : aiLevel === 3 ? 'High' : aiLevel === 4 ? 'Standard' : 'Low');

    // Narrative Generation
    let explanation = '';
    if (isInconsistent) {
      explanation = `The AI has detected inconsistent data: a normal heart rate of ${hr} bpm was recorded, but the patient is reported as not breathing. This is a medical contradiction that requires immediate verification by the nurse before proceeding.`;
    } else if (aiLevel === 1) {
      explanation = `The recommendation is Critical (T1) due to life-threatening indicators such as ${vitalReasons.length ? vitalReasons.join(', ') : 'critical condition'}. The symptoms ${symptoms.slice(0, 3).join(', ')} indicate a severe risk to life. Immediate medical intervention is required within minutes.`;
    } else if (aiLevel === 2) {
      const factors = [...vitalReasons, ...symptoms.filter(s => ER_TRIAGE_MODEL.symptomWeights[s] > 20)].slice(0, 3);
      explanation = `This case is classified as Urgent (T2) based on ${factors.length ? `abnormal findings such as ${factors.join(', ')}` : 'urgent clinical conditions'}. Given the chief complaint of "${concern}", prompt medical attention is necessary to prevent further deterioration.`;
    } else if (aiLevel === 3) {
      const factors = [...vitalReasons, ...symptoms.filter(s => ER_TRIAGE_MODEL.symptomWeights[s] > 10)].slice(0, 3);
      explanation = `The priority is High (T3). While the patient is currently stable, the presence of ${factors.length ? factors.join(' and ') : 'certain symptoms'} requires careful observation and a medical check-up as soon as possible.`;
    } else if (aiLevel === 4) {
      explanation = `The status is Standard (T4). The patient's vital signs are stable, and symptoms such as ${symptoms.length ? symptoms.slice(0, 2).join(', ') : 'the mentioned concerns'} are considered non-urgent. The patient can wait for a routine assessment.`;
    } else {
      explanation = `The recommendation is Low priority (T5). All vitals are within normal ranges and the reported symptoms are mild. The patient may follow the regular queue for consultation.`;
    }

    return {
      triage_level: aiLevel,
      priority_label: priorityLabel,
      reasons: Array.from(new Set(reasons)).slice(0, 5),
      explanation,
      isInconsistent
    };
  }, [
    addBp,
    addExistingConditions,
    addHr,
    addMainConcern,
    addRr,
    addSelectedSymptoms,
    addMildOthers,
    addModerateOthers,
    addSevereOthers,
    addSpo2,
    addTemp,
  ]);

  const setFieldError = (key, message) => {
    setAddErrors((prev) => {
      if (!prev || prev[key] === message) return prev;
      return { ...prev, [key]: message };
    });
  };

  const clearFieldError = (key) => {
    setAddErrors((prev) => {
      if (!prev || !prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const sanitizeNameInput = (value) => {
    const raw = `${value || ''}`;
    const cleaned = raw.replace(/[^A-Za-z\s]/g, '').replace(/\s+/g, ' ').slice(0, 60);
    return cleaned;
  };

  const sanitizeDigitsInput = (value, maxLen = 4) => {
    const raw = `${value || ''}`;
    return raw.replace(/[^0-9]/g, '').slice(0, maxLen);
  };

  const sanitizeTempInput = (value) => {
    const raw = `${value || ''}`.replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    const left = (parts[0] || '').slice(0, 2);
    const right = (parts[1] || '').slice(0, 2);
    return parts.length > 1 ? `${left}.${right}` : left;
  };

  const sanitizeBpInput = (value) => {
    const raw = `${value || ''}`.replace(/[^0-9/]/g, '');
    const parts = raw.split('/').slice(0, 2);
    const sys = (parts[0] || '').slice(0, 3);
    const dia = (parts[1] || '').slice(0, 3);
    if (raw.includes('/')) return `${sys}/${dia}`;
    return sys;
  };

  const validatePersonalInfo = () => {
    const now = new Date();
    const currentYear = now.getFullYear();

    const firstName = `${addFirstName || ''}`.trim();
    const middleName = `${addMiddleName || ''}`.trim();
    const lastName = `${addLastName || ''}`.trim();
    const year = Number(addDobYear);
    const month = Number(addDobMonth);
    const day = Number(addDobDay);

    const errors = {};
    if (!firstName) errors.firstName = 'First name is required.';
    if (firstName && /[^A-Za-z\s]/.test(firstName)) errors.firstName = 'First name must contain letters only.';
    if (middleName && /[^A-Za-z\s]/.test(middleName)) errors.middleName = 'Middle name must contain letters only.';
    if (!lastName) errors.lastName = 'Last name is required.';
    if (lastName && /[^A-Za-z\s]/.test(lastName)) errors.lastName = 'Last name must contain letters only.';
    if (!Number.isFinite(year) || year < 1900 || year > currentYear) errors.dob = 'Birth year is invalid.';
    if (!Number.isFinite(month) || month < 1 || month > 12) errors.dob = 'Birth month is invalid.';
    if (!Number.isFinite(day) || day < 1 || day > 31) errors.dob = 'Birth day is invalid.';
    if (!errors.dob) {
      const maxDay = new Date(year, month, 0).getDate();
      if (day > maxDay) errors.dob = 'Birth date is invalid.';
    }

    setAddErrors((prev) => {
      const next = { ...prev };
      // Clear fields we validate here to avoid persistent error messages
      const keysToClear = ['bp', 'hr', 'rr', 'temp', 'spo2', 'pain', 'mainConcern', 'symptoms'];
      keysToClear.forEach((k) => { delete next[k]; });
      return { ...next, ...errors };
    });
    return Object.keys(errors).length === 0;
  };

  const validateVitals = () => {
    const errors = {};

    const bpRaw = `${addBp || ''}`.trim();
    if (!bpRaw) {
      errors.bp = 'BP is required.';
    } else {
      const parts = bpRaw.split(/[^0-9]+/).filter(Boolean);
      const sys = parts[0] ? Number(parts[0]) : null;
      const dia = parts[1] ? Number(parts[1]) : null;
      const okSys = Number.isFinite(sys) && sys >= 50 && sys <= 250;
      const okDia = Number.isFinite(dia) && dia >= 30 && dia <= 150;
      if (!okSys || !okDia) errors.bp = 'BP format should be like 120/80.';
    }

    const hr = toIntOrNull(addHr);
    if (hr === null) errors.hr = 'HR is required.';
    else if (hr < 20 || hr > 250) errors.hr = 'HR must be between 20 and 250.';

    const rr = toIntOrNull(addRr);
    if (rr === null) errors.rr = 'RR is required.';
    else if (rr < 5 || rr > 60) errors.rr = 'RR must be between 5 and 60.';

    const temp = toFloatOrNull(addTemp);
    if (temp === null) errors.temp = 'Temp is required.';
    else if (temp < 30 || temp > 45) errors.temp = 'Temp must be between 30 and 45.';

    const spo2 = toIntOrNull(addSpo2);
    if (spo2 === null) errors.spo2 = 'SpO₂ is required.';
    else if (spo2 < 50 || spo2 > 100) errors.spo2 = 'SpO₂ must be between 50 and 100.';

    const pain = toIntOrNull(addPain);
    if (pain !== null && (pain < 0 || pain > 10)) errors.pain = 'Pain must be between 0 and 10.';

    const concern = `${addMainConcern || ''}`.trim();
    if (!concern) errors.mainConcern = 'Main concern is required.';
    const hasAtLeastOne = 
      (addSelectedSymptoms || []).length > 0 || 
      addMildOthers.trim() || 
      addModerateOthers.trim() || 
      addSevereOthers.trim();
    if (!hasAtLeastOne) errors.symptoms = 'Select at least one symptom.';

    setAddErrors((prev) => ({ ...prev, ...errors }));
    return Object.keys(errors).length === 0;
  };

  const handleAddNext = async () => {
    if (addStep === 0) {
      const ok = validatePersonalInfo();
      if (!ok) return;

      // --- CLIENT-SIDE TRAPPING: Check for duplicate before moving to Vitals ---
      const firstName = `${addFirstName || ''}`.trim();
      const middleName = `${addMiddleName || ''}`.trim();
      const lastName = `${addLastName || ''}`.trim();
      const dob = `${addDateOfBirth || ''}`.trim();

      try {
        let query = supabase
          .from('patients')
          .select('id, first_name, last_name, date_of_birth')
          .ilike('first_name', firstName)
          .ilike('last_name', lastName)
          .eq('date_of_birth', dob);

        if (middleName) {
          query = query.ilike('middle_name', middleName);
        }

        const { data: existing, error } = await query.limit(1);

        if (error) {
          console.error('Trapping check failed:', error);
        } else if (existing && existing.length > 0) {
          Alert.alert(
            'Patient Identity Conflict',
            `A patient record for "${firstName} ${lastName}" (DOB: ${dob}) is already registered in the system. \n\nDuplicate entries are restricted to maintain record integrity.`,
            [{ text: 'Review Info' }]
          );
          return;
        }
      } catch (e) {
        console.error('Trapping check exception:', e);
      }

      setAddStep(1);
      return;
    }
    if (addStep === 1) {
      const ok = validateVitals();
      if (!ok) return;
      setAddStep(2);
      return;
    }
    setAddStep((s) => Math.min(2, s + 1));
  };

  const submitAddPatient = async () => {
    if (isDoctor) {
      Alert.alert('View Only', 'Doctors cannot add patients.');
      return;
    }
    const okPersonal = validatePersonalInfo();
    if (!okPersonal) {
      setAddStep(0);
      Alert.alert('Required', 'Please complete the personal information.');
      return;
    }

    const okVitals = validateVitals();
    if (!okVitals) {
      setAddStep(1);
      Alert.alert('Required', 'Please complete the vitals.');
      return;
    }

    const firstName = `${addFirstName || ''}`.trim();
    const lastName = `${addLastName || ''}`.trim();
    const dateOfBirth = `${addDateOfBirth || ''}`.trim();
    try {
      const callerEmail = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
      const callerRole = `${(await AsyncStorage.getItem('userRole')) || ''}`.trim().toLowerCase();

      const symptoms = Array.isArray(addSelectedSymptoms) ? [...addSelectedSymptoms] : [];
      if (addMildOthers.trim()) symptoms.push(`Mild: ${addMildOthers.trim()}`);
      if (addModerateOthers.trim()) symptoms.push(`Moderate: ${addModerateOthers.trim()}`);
      if (addSevereOthers.trim()) symptoms.push(`Severe: ${addSevereOthers.trim()}`);

      const finalTriageLevel = manualTriageLevel !== null ? manualTriageLevel : addTriage.triage_level;
      const finalPriorityLabel = manualTriageLevel !== null 
        ? (manualTriageLevel === 1 ? 'Critical' : manualTriageLevel === 2 ? 'Urgent' : manualTriageLevel === 3 ? 'High' : manualTriageLevel === 4 ? 'Standard' : 'Low')
        : addTriage.priority_label;

      const triagePayload = {
        context: 'ER',
        main_concern: `${addMainConcern || ''}`.trim() || null,
        existing_conditions: `${addExistingConditions || ''}`.trim() || null,
        symptoms: symptoms,
        triage_level: finalTriageLevel,
        priority_label: finalPriorityLabel,
        reasons: Array.isArray(addTriage.reasons) ? addTriage.reasons : [],
        explanation: addTriage.explanation,
      };

      const vitalsPayload = {
        context: 'ER',
        bp: `${addBp || ''}`.trim() || null,
        hr: toIntOrNull(addHr),
        rr: toIntOrNull(addRr),
        temp: toFloatOrNull(addTemp),
        spo2: toIntOrNull(addSpo2),
        pain: toIntOrNull(addPain),
        notes: `${addVitalsNotes || ''}`.trim() || null,
      };

      const res = await supabase.functions.invoke('er-add-patient', {
        headers: {
          'x-user-email': callerEmail,
          'x-user-role': callerRole,
        },
        body: {
          patient: {
            first_name: firstName,
            middle_name: `${addMiddleName || ''}`.trim() || null,
            last_name: lastName,
            date_of_birth: dateOfBirth,
          },
          vitals: vitalsPayload,
          triage: triagePayload,
        },
      });

      if (res?.error) {
        const msg = `${res.error?.message || res.error}`.trim();
        Alert.alert('System Error', msg || 'Failed to process patient registration.');
        return;
      }

      const out = res?.data || null;
      if (!out?.ok) {
        const isTrapping = `${out?.error || ''}`.toLowerCase().includes('trapping');
        Alert.alert(
          isTrapping ? 'Patient Identity Conflict' : 'Registration Issue',
          `${out?.error || 'Failed to complete registration.'}`.trim()
        );
        return;
      }

      const vitalsSaved = !!out?.vitals?.saved;
      const triageSaved = !!out?.triage?.saved;

      if (!out?.vitals?.table) setVitalsTableMissing(true);

      closeAddPatient();
      fetchPatients();

      if (vitalsSaved && triageSaved) {
        Alert.alert('Saved Patient', 'Patient added successfully.');
        return;
      }
      if (!vitalsSaved && triageSaved) {
        Alert.alert('Saved Patient', 'Patient was added, but vitals could not be saved.');
        return;
      }
      if (vitalsSaved && !triageSaved) {
        Alert.alert('Saved Patient', 'Patient was added, but triage could not be saved.');
        return;
      }
      Alert.alert('Saved Patient', 'Patient was added, but vitals/triage could not be saved.');
    } catch (e) {
      const msg = `${e?.message || e || ''}`.trim();
      Alert.alert('Error', msg || 'Failed to add patient.');
    }
  };

  const openTransferModal = async (patient) => {
    if (isDoctor) {
      Alert.alert('View Only', 'Doctors can only view ER patients.');
      return;
    }
    setTransferPatient(patient);
    setTransferDiagnosis('');
    setSelectedWardOccupancyId(null);
    setTransferModalVisible(true);
    const wards = await fetchAvailableWards();
    if (wards.length > 0) setSelectedWardOccupancyId(wards[0].id);
  };

  const confirmTransfer = async () => {
    if (isDoctor) {
      Alert.alert('View Only', 'Doctors can only view inpatient ward.');
      return;
    }
    if (!transferPatient) return;
    const resolvedWardTable = await ensureWardTableName();
    if (!resolvedWardTable) {
      setWardTableMissing(true);
      Alert.alert('Missing Setup', 'Ward occupancy table not found in the database. Please create/register wards first.');
      return;
    }
    if (!selectedWardOccupancyId) {
      Alert.alert('Required', 'Please select a target ward/room.');
      return;
    }

    const fullName = `${transferPatient?.first_name || ''} ${transferPatient?.middle_name || ''} ${transferPatient?.last_name || ''}`
      .replace(/\s+/g, ' ')
      .trim();

    const { data, error } = await supabase
      .from(resolvedWardTable)
      .update({
        status: 'Occupied',
        patient_name: fullName,
        diagnosed: transferDiagnosis,
      })
      .eq('id', selectedWardOccupancyId)
      .ilike('status', 'available%')
      .select('id');

    if (error) {
      console.error('Error transferring patient:', error);
      Alert.alert('Error', 'Failed to transfer patient. Please try again.');
      return;
    }

    if (!data || data.length === 0) {
      Alert.alert('Not Available', 'Selected room is no longer available. Please pick another room.');
      const wards = await fetchAvailableWards();
      if (wards.length > 0) setSelectedWardOccupancyId(wards[0].id);
      return;
    }

    Alert.alert('Success', 'Patient transferred to inpatient ward.');
    setTransferModalVisible(false);
    setTransferPatient(null);
    setTransferDiagnosis('');
    setSelectedWardOccupancyId(null);
    fetchPatients();
  };

  // Render each patient
  const renderItem = ({ item }) => {
    const triage = item?._triage || null;
    const triageLabel = `${triage?.priority_label || ''}`.trim();
    const triageLevel = Number(triage?.triage_level ?? 0);
    const triageScore = Number(triage?.priority_score ?? -1);
    const triageColor =
      triageLevel === 1
        ? '#ef4444'
        : triageLevel === 2
          ? '#f97316'
          : triageLevel === 3
            ? '#f59e0b'
            : triageLevel === 4
              ? '#3b82f6'
              : triageLevel === 5
                ? '#22c55e'
                : '#6b7280';

    const vitals = item?._vitals || null;
    const vitalsTag = computeVitalsTag(vitals);
    const vitalsColor =
      vitalsTag.level === 'critical'
        ? '#ef4444'
        : vitalsTag.level === 'alert'
          ? '#f97316'
          : vitalsTag.level === 'stable'
            ? '#22c55e'
            : '#6b7280';
    const vitalsWhen =
      vitals?.created_at && !Number.isNaN(Date.parse(vitals.created_at)) ? new Date(vitals.created_at).toLocaleString() : '';

    const displayName = `${item?.last_name || ''}, ${item?.first_name || ''}${item?.middle_name ? ` ${item.middle_name}` : ''}`
      .replace(/\s+/g, ' ')
      .trim();

    return (
      <View
        style={{
          backgroundColor: '#ffffff',
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#f1f5f9',
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        {/* Patient Name & DOB */}
        <View style={{ flex: 2, paddingRight: 10 }}>
          <Text style={{ color: '#1e293b', fontWeight: '700', fontSize: 14 }} numberOfLines={2}>
            {displayName || 'Patient'}
          </Text>
          <Text style={{ color: '#64748b', fontWeight: '500', fontSize: 11, marginTop: 2 }}>
            {item?.date_of_birth ? `DOB: ${item.date_of_birth}` : 'DOB: —'}
          </Text>
          <Text style={{ color: '#334155', fontWeight: '700', fontSize: 11, marginTop: 4 }} numberOfLines={1}>
            {`Status: ${vitalsTag.label}${triageLabel ? ` • ${triageLabel}` : ''}${vitalsWhen ? ` • ${vitalsWhen}` : ''}`}
          </Text>
        </View>

        {/* Triage Info */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {triageLabel ? (
            <View style={{ backgroundColor: triageColor, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, minWidth: 35, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>
                {triageLevel ? `T${triageLevel}` : 'T—'}
              </Text>
            </View>
          ) : (
            <View style={{ width: 35, alignItems: 'center' }}>
              <Text style={{ color: '#cbd5e1', fontWeight: '600', fontSize: 12 }}>—</Text>
            </View>
          )}
          <View style={{ marginTop: 6, backgroundColor: vitalsColor, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, minWidth: 35, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>
              {vitalsTag.label}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={{ flex: 2.2, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity
            style={{ padding: 6 }}
            onPress={() => handleViewEdit(item, false)}
          >
            <Ionicons name="eye-outline" size={20} color="#64748b" />
          </TouchableOpacity>
          {!isDoctor ? (
            <>
              <TouchableOpacity
                style={{ padding: 6 }}
                onPress={() => openTransferModal(item)}
                disabled={!wardTableName}
              >
                <Ionicons name="swap-horizontal-outline" size={20} color={wardTableName ? "#DA7705" : "#cbd5e1"} />
              </TouchableOpacity>

              <TouchableOpacity
                style={{ padding: 6 }}
                onPress={() => handleViewEdit(item, true)}
              >
                <Ionicons name="create-outline" size={20} color="#64748b" />
              </TouchableOpacity>

              <TouchableOpacity
                style={{ padding: 6 }}
                onPress={() => handleDelete(item.id)}
              >
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </View>
    );
  };

  const PAGE_SIZE = 8;

  const filteredPatients = useMemo(() => {
    const q = `${searchQuery || ''}`.trim().toLowerCase();
    const list = Array.isArray(patients) ? patients : [];
    if (!q) return list;
    return list.filter((p) => {
      const first = `${p?.first_name || ''}`.trim().toLowerCase();
      const middle = `${p?.middle_name || ''}`.trim().toLowerCase();
      const last = `${p?.last_name || ''}`.trim().toLowerCase();
      const dob = `${p?.date_of_birth || ''}`.trim().toLowerCase();
      const full = `${first} ${middle} ${last}`.replace(/\s+/g, ' ').trim();
      return full.includes(q) || first.includes(q) || last.includes(q) || middle.includes(q) || dob.includes(q);
    });
  }, [patients, searchQuery]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(filteredPatients.length / PAGE_SIZE)), [filteredPatients.length]);
  const clampedPage = Math.min(page, pageCount - 1);

  useEffect(() => {
    setPage(0);
  }, [searchQuery]);

  useEffect(() => {
    if (page !== clampedPage) setPage(clampedPage);
  }, [clampedPage, page]);

  const pagePatients = useMemo(() => {
    const start = clampedPage * PAGE_SIZE;
    return filteredPatients.slice(start, start + PAGE_SIZE);
  }, [clampedPage, filteredPatients]);

  const showingStart = filteredPatients.length === 0 ? 0 : clampedPage * PAGE_SIZE + 1;
  const showingEnd = filteredPatients.length === 0 ? 0 : Math.min(clampedPage * PAGE_SIZE + PAGE_SIZE, filteredPatients.length);

  if (loading) {
    return (
      <Provider>
        <View style={[NursePatientsStyles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={{ marginTop: 10, color: '#666' }}>Loading patients...</Text>
        </View>
      </Provider>
    );
  }

  return (
    <Provider>
      <View style={NursePatientsStyles.container}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={toggleDrawer} style={{ padding: 5 }}>
              <Feather name="menu" size={24} color="#d9802b" />
            </TouchableOpacity>
            <Text style={NursePatientsStyles.title}>ER Patients</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {!isDoctor ? (
              <TouchableOpacity
                onPress={openAddPatient}
                style={{
                  backgroundColor: '#16a34a',
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <MaterialIcons name="person-add" size={22} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        {isDoctor ? (
          <Text style={{ marginBottom: 10, color: '#0f172a' }}>View-only mode (Doctor)</Text>
        ) : null}
        {wardTableMissing && (
          <Text style={{ marginBottom: 10, color: '#b45309' }}>
            Ward table not found. Transfer/Inpatient features are disabled until wards are created in the database.
          </Text>
        )}
        {vitalsTableMissing && (
          <Text style={{ marginBottom: 10, color: '#b45309' }}>
            Vitals table not found. Add Patient will still work but vitals may not be saved until database setup is done.
          </Text>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#f1f5f9',
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <Ionicons name="search" size={16} color="#64748b" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search patient (name or DOB)…"
              placeholderTextColor="#94a3b8"
              style={{ flex: 1, marginLeft: 8, color: '#0f172a' }}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            activeOpacity={0.8}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: searchQuery ? '#e2e8f0' : '#f1f5f9',
              borderWidth: 1,
              borderColor: '#e2e8f0',
            }}
            disabled={!searchQuery}
          >
            <Text style={{ color: '#334155', fontWeight: '700' }}>Clear</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ marginBottom: 8, color: '#64748b', fontSize: 12 }}>
          {`Showing ${showingStart}-${showingEnd} of ${filteredPatients.length}`}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
            borderWidth: 1,
            borderColor: '#e2e8f0',
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 16,
            marginBottom: 10,
          }}
        >
          <Text style={{ flex: 2, color: '#64748b', fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Patient</Text>
          <Text style={{ flex: 1, color: '#64748b', fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>Triage</Text>
          <Text style={{ flex: 2.2, color: '#64748b', fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Actions</Text>
        </View>

        <FlatList
          data={pagePatients}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 20 }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <TouchableOpacity
            onPress={() => setPage((p) => Math.max(0, p - 1))}
            disabled={clampedPage <= 0}
            activeOpacity={0.85}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: clampedPage <= 0 ? '#f1f5f9' : '#e2e8f0',
              borderWidth: 1,
              borderColor: '#e2e8f0',
            }}
          >
            <Text style={{ color: '#334155', fontWeight: '800' }}>Prev</Text>
          </TouchableOpacity>

          <Text style={{ color: '#334155', fontWeight: '700' }}>{`Page ${clampedPage + 1} of ${pageCount}`}</Text>

          <TouchableOpacity
            onPress={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={clampedPage >= pageCount - 1}
            activeOpacity={0.85}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: clampedPage >= pageCount - 1 ? '#f1f5f9' : '#e2e8f0',
              borderWidth: 1,
              borderColor: '#e2e8f0',
            }}
          >
            <Text style={{ color: '#334155', fontWeight: '800' }}>Next</Text>
          </TouchableOpacity>
        </View>

        {/* Modal for View/Edit */}
        <Portal>
          <Modal visible={modalVisible} onDismiss={() => setModalVisible(false)} contentContainerStyle={NursePatientsStyles.modalContainer}>
            <Text style={NursePatientsStyles.modalTitle}>
              {isEditMode ? 'Edit Patient' : 'Patient Information'}
            </Text>

            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
              {!isEditMode && selectedPatient && (
                <View style={{ marginBottom: 20 }}>
                  {/* Triage Status Section */}
                  <View style={{ backgroundColor: '#f8fafc', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 15 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e293b' }}>Triage Summary</Text>
                      {selectedPatient?._triage?.triage_level && (
                        <View style={{ 
                          backgroundColor: 
                            selectedPatient._triage.triage_level === 1 ? '#ef4444' : 
                            selectedPatient._triage.triage_level === 2 ? '#f97316' : 
                            selectedPatient._triage.triage_level === 3 ? '#f59e0b' : 
                            '#3b82f6', 
                          paddingHorizontal: 10, 
                          paddingVertical: 4, 
                          borderRadius: 6 
                        }}>
                          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>T{selectedPatient._triage.triage_level}</Text>
                        </View>
                      )}
                    </View>
                    
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#475569' }}>
                      Priority: <Text style={{ color: '#1e293b' }}>{selectedPatient?._triage?.priority_label || 'Not Set'}</Text>
                    </Text>

                    {selectedPatient?._triage?.explanation && (
                      <View style={{ marginTop: 10, padding: 10, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#f1f5f9' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 4 }}>System Explanation:</Text>
                        <Text style={{ fontSize: 13, color: '#334155', fontStyle: 'italic' }}>{selectedPatient._triage.explanation}</Text>
                      </View>
                    )}
                  </View>

                  {/* Medical Context Section */}
                  {(selectedPatient?._triage?.main_concern || selectedPatient?._triage?.symptoms || selectedPatient?._triage?.existing_conditions) && (
                    <View style={{ backgroundColor: '#fff', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 15 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e293b', marginBottom: 12 }}>Medical Context</Text>
                      
                      {selectedPatient?._triage?.main_concern && (
                        <View style={{ marginBottom: 10 }}>
                          <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Chief Complaint</Text>
                          <Text style={{ fontSize: 14, color: '#1e293b', fontWeight: '600' }}>{selectedPatient._triage.main_concern}</Text>
                        </View>
                      )}

                      {selectedPatient?._triage?.symptoms && Array.isArray(selectedPatient._triage.symptoms) && selectedPatient._triage.symptoms.length > 0 && (
                        <View style={{ marginBottom: 10 }}>
                          <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '700', textTransform: 'uppercase', marginBottom: 5 }}>Symptoms</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {selectedPatient._triage.symptoms.map((s, idx) => (
                              <View key={idx} style={{ backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                                <Text style={{ fontSize: 12, color: '#334155', fontWeight: '600' }}>{s}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {selectedPatient?._triage?.existing_conditions && (
                        <View>
                          <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Known Conditions</Text>
                          <Text style={{ fontSize: 14, color: '#1e293b', fontWeight: '600' }}>{selectedPatient._triage.existing_conditions}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Vitals Section */}
                  <View style={{ backgroundColor: '#fff', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 15 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e293b' }}>Current Vitals</Text>
                      {selectedPatient?._vitals?.created_at && (
                        <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '600' }}>
                          Last: {new Date(selectedPatient._vitals.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {[
                        { label: 'BP', value: selectedPatient?._vitals?.bp, icon: 'heart', color: '#ef4444' },
                        { label: 'HR', value: selectedPatient?._vitals?.hr, icon: 'pulse', color: '#f43f5e' },
                        { label: 'RR', value: selectedPatient?._vitals?.rr, icon: 'leaf', color: '#10b981' },
                        { label: 'Temp', value: selectedPatient?._vitals?.temp ? `${selectedPatient._vitals.temp}°C` : null, icon: 'thermometer', color: '#f59e0b' },
                        { label: 'SpO₂', value: selectedPatient?._vitals?.spo2 ? `${selectedPatient._vitals.spo2}%` : null, icon: 'water', color: '#3b82f6' },
                        { label: 'Pain', value: selectedPatient?._vitals?.pain ? `${selectedPatient._vitals.pain}/10` : null, icon: 'warning', color: '#6366f1' },
                      ].map((item, idx) => item.value ? (
                        <View key={idx} style={{ width: '47%', flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' }}>
                          <Ionicons name={item.icon} size={16} color={item.color} style={{ marginRight: 8 }} />
                          <View>
                            <Text style={{ fontSize: 10, color: '#64748b', fontWeight: '700' }}>{item.label}</Text>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#1e293b' }}>{item.value}</Text>
                          </View>
                        </View>
                      ) : null)}
                    </View>
                  </View>
                </View>
              )}

              <Text style={NursePatientsStyles.modalLabel}>First Name:</Text>
              <TextInput
                style={NursePatientsStyles.modalInput}
                value={editedFirstName}
                editable={isEditMode}
                onChangeText={setEditedFirstName}
              />

              <Text style={NursePatientsStyles.modalLabel}>Middle Name:</Text>
              <TextInput
                style={NursePatientsStyles.modalInput}
                value={editedMiddleName}
                editable={isEditMode}
                onChangeText={setEditedMiddleName}
              />

              <Text style={NursePatientsStyles.modalLabel}>Last Name:</Text>
              <TextInput
                style={NursePatientsStyles.modalInput}
                value={editedLastName}
                editable={isEditMode}
                onChangeText={setEditedLastName}
              />

              <Text style={NursePatientsStyles.modalLabel}>Date of Birth:</Text>
              <TextInput
                style={NursePatientsStyles.modalInput}
                value={editedDateOfBirth}
                editable={isEditMode}
                onChangeText={setEditedDateOfBirth}
              />
            </ScrollView>

            <View style={NursePatientsStyles.modalButtonContainer}>
              <Button
                mode="contained"
                onPress={() => setModalVisible(false)}
                style={[NursePatientsStyles.modalButton, NursePatientsStyles.cancelButton]}
                labelStyle={NursePatientsStyles.modalButtonText}
              >
                {isEditMode ? 'Cancel' : 'Close'}
              </Button>
              {isEditMode && (
                <Button
                  mode="contained"
                  onPress={saveEdits}
                  style={[NursePatientsStyles.modalButton, NursePatientsStyles.saveButton]}
                  labelStyle={NursePatientsStyles.modalButtonText}
                >
                  Save
                </Button>
              )}
            </View>
          </Modal>
        </Portal>

        <Portal>
          <Modal visible={addModalVisible} onDismiss={closeAddPatient} contentContainerStyle={NursePatientsStyles.modalContainer}>
            <Text style={NursePatientsStyles.modalTitle}>
              {addStep === 0 ? 'Add Patient (1/3)' : addStep === 1 ? 'Vitals (2/3)' : 'Submit (3/3)'}
            </Text>

            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
            {addStep === 0 && (
              <>
                <Text style={NursePatientsStyles.modalLabel}>First Name:</Text>
                <TextInput
                  style={NursePatientsStyles.modalInput}
                  value={addFirstName}
                  onChangeText={(v) => {
                    const cleaned = sanitizeNameInput(v);
                    setAddFirstName(cleaned);
                    if (!`${cleaned}`.trim()) clearFieldError('firstName');
                    else if (`${cleaned}` !== `${v}`) setFieldError('firstName', 'First name must contain letters only.');
                    else clearFieldError('firstName');
                  }}
                />
                {!!addErrors.firstName && <Text style={{ color: '#ef4444', marginTop: 4 }}>{addErrors.firstName}</Text>}

                <Text style={NursePatientsStyles.modalLabel}>Middle Name:</Text>
                <TextInput
                  style={NursePatientsStyles.modalInput}
                  value={addMiddleName}
                  onChangeText={(v) => {
                    const cleaned = sanitizeNameInput(v);
                    setAddMiddleName(cleaned);
                    if (!`${cleaned}`.trim()) clearFieldError('middleName');
                    else if (`${cleaned}` !== `${v}`) setFieldError('middleName', 'Middle name must contain letters only.');
                    else clearFieldError('middleName');
                  }}
                />
                {!!addErrors.middleName && <Text style={{ color: '#ef4444', marginTop: 4 }}>{addErrors.middleName}</Text>}

                <Text style={NursePatientsStyles.modalLabel}>Last Name:</Text>
                <TextInput
                  style={NursePatientsStyles.modalInput}
                  value={addLastName}
                  onChangeText={(v) => {
                    const cleaned = sanitizeNameInput(v);
                    setAddLastName(cleaned);
                    if (!`${cleaned}`.trim()) clearFieldError('lastName');
                    else if (`${cleaned}` !== `${v}`) setFieldError('lastName', 'Last name must contain letters only.');
                    else clearFieldError('lastName');
                  }}
                />
                {!!addErrors.lastName && <Text style={{ color: '#ef4444', marginTop: 4 }}>{addErrors.lastName}</Text>}

                <Text style={NursePatientsStyles.modalLabel}>Date of Birth:</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <View style={{ flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, overflow: 'hidden', backgroundColor: '#f1f5f9' }}>
                    <Picker selectedValue={addDobMonth} onValueChange={(v) => { setAddDobMonth(v); clearFieldError('dob'); }} style={{ height: 50 }}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <Picker.Item key={`m-${m}`} label={String(m)} value={m} />
                      ))}
                    </Picker>
                  </View>
                  <View style={{ flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, overflow: 'hidden', backgroundColor: '#f1f5f9' }}>
                    <Picker selectedValue={addDobDay} onValueChange={(v) => { setAddDobDay(v); clearFieldError('dob'); }} style={{ height: 50 }}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <Picker.Item key={`d-${d}`} label={String(d)} value={d} />
                      ))}
                    </Picker>
                  </View>
                  <View style={{ flex: 1.2, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, overflow: 'hidden', backgroundColor: '#f1f5f9' }}>
                    <Picker
                      selectedValue={addDobYear}
                      onValueChange={(v) => { setAddDobYear(v); clearFieldError('dob'); }}
                      style={{ height: 50 }}
                    >
                      {Array.from({ length: new Date().getFullYear() - 1900 + 1 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                        <Picker.Item key={`y-${y}`} label={String(y)} value={y} />
                      ))}
                    </Picker>
                  </View>
                </View>
                <Text style={{ marginTop: 6, color: '#6b7280' }}>{addDateOfBirth}</Text>
                {!!addErrors.dob && <Text style={{ color: '#ef4444', marginTop: 4 }}>{addErrors.dob}</Text>}
              </>
            )}

            {addStep === 1 && (
              <>
                <Text style={NursePatientsStyles.modalLabel}>BP:</Text>
                <TextInput
                  style={NursePatientsStyles.modalInput}
                  value={addBp}
                  onChangeText={(v) => {
                    const cleaned = sanitizeBpInput(v);
                    setAddBp(cleaned);
                    if (!`${cleaned}`.trim()) clearFieldError('bp');
                    else if (`${cleaned}` !== `${v}`) setFieldError('bp', 'BP format should be like 120/80.');
                    else clearFieldError('bp');
                  }}
                  placeholder="120/80"
                />
                {!!addErrors.bp && <Text style={{ color: '#ef4444', marginTop: 4 }}>{addErrors.bp}</Text>}

                <Text style={NursePatientsStyles.modalLabel}>HR:</Text>
                <TextInput
                  style={NursePatientsStyles.modalInput}
                  value={addHr}
                  onChangeText={(v) => {
                    const cleaned = sanitizeDigitsInput(v, 3);
                    setAddHr(cleaned);
                    if (!`${cleaned}`.trim()) clearFieldError('hr');
                    else if (`${cleaned}` !== `${v}`) setFieldError('hr', 'HR must be a number.');
                    else clearFieldError('hr');
                  }}
                  keyboardType="numeric"
                  placeholder="75"
                />
                {!!addErrors.hr && <Text style={{ color: '#ef4444', marginTop: 4 }}>{addErrors.hr}</Text>}

                <Text style={NursePatientsStyles.modalLabel}>RR:</Text>
                <TextInput
                  style={NursePatientsStyles.modalInput}
                  value={addRr}
                  onChangeText={(v) => {
                    const cleaned = sanitizeDigitsInput(v, 2);
                    setAddRr(cleaned);
                    if (!`${cleaned}`.trim()) clearFieldError('rr');
                    else if (`${cleaned}` !== `${v}`) setFieldError('rr', 'RR must be a number.');
                    else clearFieldError('rr');
                  }}
                  keyboardType="numeric"
                  placeholder="18"
                />
                {!!addErrors.rr && <Text style={{ color: '#ef4444', marginTop: 4 }}>{addErrors.rr}</Text>}

                <Text style={NursePatientsStyles.modalLabel}>Temp:</Text>
                <TextInput
                  style={NursePatientsStyles.modalInput}
                  value={addTemp}
                  onChangeText={(v) => {
                    const cleaned = sanitizeTempInput(v);
                    setAddTemp(cleaned);
                    if (!`${cleaned}`.trim()) clearFieldError('temp');
                    else if (`${cleaned}` !== `${v}`) setFieldError('temp', 'Temp must be a number.');
                    else clearFieldError('temp');
                  }}
                  keyboardType="numeric"
                  placeholder="36.6"
                />
                {!!addErrors.temp && <Text style={{ color: '#ef4444', marginTop: 4 }}>{addErrors.temp}</Text>}

                <Text style={NursePatientsStyles.modalLabel}>SpO₂:</Text>
                <TextInput
                  style={NursePatientsStyles.modalInput}
                  value={addSpo2}
                  onChangeText={(v) => {
                    const cleaned = sanitizeDigitsInput(v, 3);
                    setAddSpo2(cleaned);
                    if (!`${cleaned}`.trim()) clearFieldError('spo2');
                    else if (`${cleaned}` !== `${v}`) setFieldError('spo2', 'SpO₂ must be a number.');
                    else clearFieldError('spo2');
                  }}
                  keyboardType="numeric"
                  placeholder="98"
                />
                {!!addErrors.spo2 && <Text style={{ color: '#ef4444', marginTop: 4 }}>{addErrors.spo2}</Text>}

                <Text style={NursePatientsStyles.modalLabel}>Pain (0-10):</Text>
                <TextInput
                  style={NursePatientsStyles.modalInput}
                  value={addPain}
                  onChangeText={(v) => {
                    const cleaned = sanitizeDigitsInput(v, 2);
                    setAddPain(cleaned);
                    if (!`${cleaned}`.trim()) clearFieldError('pain');
                    else if (`${cleaned}` !== `${v}`) setFieldError('pain', 'Pain must be a number.');
                    else clearFieldError('pain');
                  }}
                  keyboardType="numeric"
                  placeholder="0"
                />
                {!!addErrors.pain && <Text style={{ color: '#ef4444', marginTop: 4 }}>{addErrors.pain}</Text>}

                <Text style={NursePatientsStyles.modalLabel}>Main Concern:</Text>
                <TextInput
                  style={NursePatientsStyles.modalInput}
                  value={addMainConcern}
                  onChangeText={(v) => {
                    setAddMainConcern(v);
                    clearFieldError('mainConcern');
                  }}
                  placeholder="Chief complaint"
                />
                {!!addErrors.mainConcern && <Text style={{ color: '#ef4444', marginTop: 4 }}>{addErrors.mainConcern}</Text>}

                <Text style={NursePatientsStyles.modalLabel}>Existing Medical Conditions (optional):</Text>
                <TextInput
                  style={NursePatientsStyles.modalInput}
                  value={addExistingConditions}
                  onChangeText={setAddExistingConditions}
                  placeholder="e.g. Diabetes, Hypertension, Asthma"
                />

                <Text style={[NursePatientsStyles.modalLabel, { color: '#22c55e' }]}>Mild Symptoms:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {ER_TRIAGE_MODEL.mildSymptoms.map((s) => {
                    if (s === 'Others') return null;
                    const selected = (addSelectedSymptoms || []).includes(s);
                    return (
                      <TouchableOpacity
                        key={`sx-mild-${s}`}
                        onPress={() => {
                          setAddSelectedSymptoms((prev) => toggleInList(prev, s));
                          clearFieldError('symptoms');
                        }}
                        activeOpacity={0.85}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: selected ? '#22c55e' : '#cbd5e1',
                          backgroundColor: selected ? '#f0fdf4' : '#f8fafc',
                        }}
                      >
                        <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={16} color={selected ? '#22c55e' : '#64748b'} />
                        <Text style={{ color: '#334155', fontWeight: '600' }} numberOfLines={1}>{s}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  style={[NursePatientsStyles.modalInput, { height: 40, fontSize: 12 }]}
                  value={addMildOthers}
                  onChangeText={setAddMildOthers}
                  placeholder="Others (Mild)..."
                />

                <Text style={[NursePatientsStyles.modalLabel, { color: '#f59e0b', marginTop: 10 }]}>Moderate Symptoms:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {ER_TRIAGE_MODEL.moderateSymptoms.map((s) => {
                    if (s === 'Others') return null;
                    const selected = (addSelectedSymptoms || []).includes(s);
                    return (
                      <TouchableOpacity
                        key={`sx-mod-${s}`}
                        onPress={() => {
                          setAddSelectedSymptoms((prev) => toggleInList(prev, s));
                          clearFieldError('symptoms');
                        }}
                        activeOpacity={0.85}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: selected ? '#f59e0b' : '#cbd5e1',
                          backgroundColor: selected ? '#fffbeb' : '#f8fafc',
                        }}
                      >
                        <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={16} color={selected ? '#f59e0b' : '#64748b'} />
                        <Text style={{ color: '#334155', fontWeight: '600' }} numberOfLines={1}>{s}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  style={[NursePatientsStyles.modalInput, { height: 40, fontSize: 12 }]}
                  value={addModerateOthers}
                  onChangeText={setAddModerateOthers}
                  placeholder="Others (Moderate)..."
                />

                <Text style={[NursePatientsStyles.modalLabel, { color: '#ef4444', marginTop: 10 }]}>Severe Symptoms:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {ER_TRIAGE_MODEL.severeSymptoms.map((s) => {
                    if (s === 'Others') return null;
                    const selected = (addSelectedSymptoms || []).includes(s);
                    return (
                      <TouchableOpacity
                        key={`sx-sev-${s}`}
                        onPress={() => {
                          setAddSelectedSymptoms((prev) => toggleInList(prev, s));
                          clearFieldError('symptoms');
                        }}
                        activeOpacity={0.85}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: selected ? '#ef4444' : '#cbd5e1',
                          backgroundColor: selected ? '#fee2e2' : '#f8fafc',
                        }}
                      >
                        <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={16} color={selected ? '#ef4444' : '#64748b'} />
                        <Text style={{ color: '#334155', fontWeight: '600' }} numberOfLines={1}>{s}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  style={[NursePatientsStyles.modalInput, { height: 40, fontSize: 12 }]}
                  value={addSevereOthers}
                  onChangeText={setAddSevereOthers}
                  placeholder="Others (Severe)..."
                />
                {!!addErrors.symptoms && <Text style={{ color: '#ef4444', marginTop: 4 }}>{addErrors.symptoms}</Text>}

                <Text style={NursePatientsStyles.modalLabel}>Notes:</Text>
                <TextInput
                  style={NursePatientsStyles.modalInput}
                  value={addVitalsNotes}
                  onChangeText={setAddVitalsNotes}
                  placeholder="Notes"
                />
              </>
            )}

            {addStep === 2 && (
              <>
                <Text style={{ marginBottom: 6, color: '#111827', fontWeight: '800', fontSize: 16 }}>
                  {`${addFirstName} ${addMiddleName ? `${addMiddleName} ` : ''}${addLastName}`.replace(/\s+/g, ' ').trim()}
                </Text>
                <Text style={{ marginBottom: 10, color: '#6b7280', fontSize: 13 }}>DOB: {addDateOfBirth || 'N/A'}</Text>
                
                <View style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 }}>
                  <Text style={{ fontWeight: '700', color: '#334155', marginBottom: 4, fontSize: 13 }}>Vital Signs:</Text>
                  <Text style={{ color: '#64748b', fontSize: 12, lineHeight: 18 }}>
                    {`${addBp ? `BP: ${addBp}` : ''}${addHr ? ` • HR: ${addHr}` : ''}${addRr ? ` • RR: ${addRr}` : ''}${addTemp ? ` • Temp: ${addTemp}` : ''}${addSpo2 ? ` • SpO₂: ${addSpo2}` : ''}${addPain ? ` • Pain: ${addPain}` : ''}`.trim() || 'N/A'}
                  </Text>
                </View>

                <View style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 }}>
                  <Text style={{ fontWeight: '700', color: '#334155', marginBottom: 4, fontSize: 13 }}>Chief Complaint:</Text>
                  <Text style={{ color: '#64748b', fontSize: 12 }}>{addMainConcern || 'N/A'}</Text>
                </View>

                <View style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 }}>
                  <Text style={{ fontWeight: '700', color: '#334155', marginBottom: 4, fontSize: 13 }}>Symptoms:</Text>
                  <Text style={{ color: '#64748b', fontSize: 12 }}>
                    {[
                      ...(addSelectedSymptoms || []),
                      addMildOthers ? `Others (Mild): ${addMildOthers}` : '',
                      addModerateOthers ? `Others (Mod): ${addModerateOthers}` : '',
                      addSevereOthers ? `Others (Sev): ${addSevereOthers}` : '',
                    ].filter(Boolean).join(', ') || 'N/A'}
                  </Text>
                </View>

                <View style={{ backgroundColor: '#f1f5f9', borderRadius: 12, padding: 15, borderWidth: 1, borderColor: '#cbd5e1' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontWeight: '800', color: '#0f172a', fontSize: 14 }}>
                      AI Recommendation: {addTriage.priority_label} (T{addTriage.triage_level})
                    </Text>
                    {addTriage.isInconsistent && (
                      <Ionicons name="warning" size={20} color="#ef4444" />
                    )}
                  </View>
                  
                  {!!addTriage.explanation && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ color: '#334155', fontSize: 12, lineHeight: 18, fontStyle: 'italic' }}>
                        {addTriage.explanation}
                      </Text>
                    </View>
                  )}

                  <View style={{ marginTop: 15, borderTopWidth: 1, borderTopColor: '#cbd5e1', paddingTop: 12 }}>
                    <Text style={{ fontWeight: '700', color: '#334155', marginBottom: 8, fontSize: 13 }}>Manual Override (Optional):</Text>
                    <View style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' }}>
                      <Picker
                        selectedValue={manualTriageLevel}
                        onValueChange={(v) => setManualTriageLevel(v)}
                        style={{ height: 45 }}
                      >
                        <Picker.Item label={`Follow AI (${addTriage.priority_label})`} value={null} />
                        <Picker.Item label="T1 - Critical" value={1} />
                        <Picker.Item label="T2 - Urgent" value={2} />
                        <Picker.Item label="T3 - High" value={3} />
                        <Picker.Item label="T4 - Standard" value={4} />
                        <Picker.Item label="T5 - Low" value={5} />
                      </Picker>
                    </View>
                    <Text style={{ fontSize: 10, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>
                      * Use manual override if your clinical experience suggests a different priority.
                    </Text>
                  </View>
                </View>
              </>
            )}
            </ScrollView>

            <View style={NursePatientsStyles.modalButtonContainer}>
              <Button
                mode="contained"
                onPress={() => {
                  if (addStep === 0) closeAddPatient();
                  else setAddStep((s) => Math.max(0, s - 1));
                }}
                style={[NursePatientsStyles.modalButton, NursePatientsStyles.cancelButton]}
                labelStyle={NursePatientsStyles.modalButtonText}
              >
                {addStep === 0 ? 'Cancel' : 'Back'}
              </Button>

              {addStep < 2 ? (
                <Button
                  mode="contained"
                  onPress={handleAddNext}
                  style={[NursePatientsStyles.modalButton, NursePatientsStyles.saveButton]}
                  labelStyle={NursePatientsStyles.modalButtonText}
                >
                  Next
                </Button>
              ) : (
                <Button
                  mode="contained"
                  onPress={submitAddPatient}
                  style={[NursePatientsStyles.modalButton, NursePatientsStyles.saveButton]}
                  labelStyle={NursePatientsStyles.modalButtonText}
                >
                  Submit
                </Button>
              )}
            </View>
          </Modal>
        </Portal>

        <Portal>
          <Modal
            visible={transferModalVisible}
            onDismiss={() => {
              setTransferModalVisible(false);
              setTransferPatient(null);
              setTransferDiagnosis('');
              setSelectedWardOccupancyId(null);
            }}
            contentContainerStyle={NursePatientsStyles.modalContainer}
          >
            <Text style={NursePatientsStyles.modalTitle}>Transfer to Inpatient Ward</Text>

            <Text style={NursePatientsStyles.modalLabel}>Patient:</Text>
            <Text style={{ marginBottom: 10, color: '#111827' }}>
              {transferPatient
                ? `${transferPatient.first_name} ${transferPatient.middle_name ? `${transferPatient.middle_name} ` : ''}${transferPatient.last_name}`
                : ''}
            </Text>

            <Text style={NursePatientsStyles.modalLabel}>Target Ward / Room:</Text>
            <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
              <Picker
                selectedValue={selectedWardOccupancyId}
                onValueChange={(val) => setSelectedWardOccupancyId(val)}
                style={{ height: 50 }}
              >
                {availableWards.length === 0 ? (
                  <Picker.Item label="No available wards" value={null} />
                ) : (
                  availableWards.map((w) => (
                    <Picker.Item key={String(w.id)} label={formatRoomLabel(w.ward)} value={w.id} />
                  ))
                )}
              </Picker>
            </View>

            <Text style={NursePatientsStyles.modalLabel}>Diagnosis (optional):</Text>
            <TextInput
              style={NursePatientsStyles.modalInput}
              value={transferDiagnosis}
              onChangeText={setTransferDiagnosis}
              placeholder="e.g. Pneumonia"
            />

            <View style={NursePatientsStyles.modalButtonContainer}>
              <Button
                mode="contained"
                onPress={() => {
                  setTransferModalVisible(false);
                  setTransferPatient(null);
                  setTransferDiagnosis('');
                  setSelectedWardOccupancyId(null);
                }}
                style={[NursePatientsStyles.modalButton, NursePatientsStyles.cancelButton]}
                labelStyle={NursePatientsStyles.modalButtonText}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={confirmTransfer}
                style={[NursePatientsStyles.modalButton, NursePatientsStyles.saveButton]}
                labelStyle={NursePatientsStyles.modalButtonText}
                disabled={availableWards.length === 0 || !selectedWardOccupancyId}
              >
                Transfer
              </Button>
            </View>
          </Modal>
        </Portal>

        <NurseSideMenu visible={drawerVisible} onClose={toggleDrawer} />
      </View>
    </Provider>
  );
}
