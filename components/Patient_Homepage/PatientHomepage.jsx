import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, SafeAreaView, StyleSheet, ScrollView, TextInput, Image, Modal, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import PatientHomepageStyles from '../../styles/PatientStyles/PatientHomepageStyles';
import PatientSideMenu from './PatientSideMenu';
import PatientHeader from './PatientHeader';

const initialAppointments = [];

const verses = [
  { text: "“For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life”", ref: "John 3:16" },
  { text: "“The Lord is my shepherd; I shall not want.”", ref: "Psalm 23:1" },
  { text: "“I can do all things through Christ who strengthens me.”", ref: "Philippians 4:13" },
  { text: "“Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.”", ref: "Joshua 1:9" },
];

export default function PatientHomepage({ navigation }) {
  const [userData, setUserData] = useState({ name: 'Patient', email: '' });
  const [appointments, setAppointments] = useState(initialAppointments);
  const [verse, setVerse] = useState(verses[0]);
  const [vitalsModalVisible, setVitalsModalVisible] = useState(false);
  const [vitals, setVitals] = useState({
    heartRate: '',
    weight: '',
    bloodType: '',
    temperature: '',
    updatedAt: '',
  });
  const [vitalsInput, setVitalsInput] = useState({
    heartRate: '',
    weight: '',
    bloodType: '',
    temperature: '',
  });
  const [vitalsTouched, setVitalsTouched] = useState({
    heartRate: false,
    weight: false,
    bloodType: false,
    temperature: false,
  });
  const [vitalsErrors, setVitalsErrors] = useState({
    heartRate: '',
    weight: '',
    bloodType: '',
    temperature: '',
  });

  const [drawerVisible, setDrawerVisible] = useState(false);
  const toggleDrawer = () => setDrawerVisible(!drawerVisible);

  // SEARCH AND PAGINATION STATE
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 3;

  useEffect(() => {
    fetchUserData();
    fetchUpcomingAppointments();
    
    // Setup real-time listener for appointments
    let channel;
    const setupRealtime = async () => {
      const email = await AsyncStorage.getItem('userEmail');
      if (!email) return;

      channel = supabase
        .channel('homepage-appointments')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'appointments',
          },
          () => {
            fetchUpcomingAppointments();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'appointment_approval_requests',
          },
          () => {
            fetchUpcomingAppointments();
          }
        )
        .subscribe();
    };

    setupRealtime();

    const randomVerse = verses[Math.floor(Math.random() * verses.length)];
    setVerse(randomVerse);

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  useEffect(() => {
    if (!userData.email) return;
    loadVitals(userData.email);
  }, [userData.email]);

  const getVitalsKey = (email) => `patientVitals:${email}`;

  const loadVitals = async (email) => {
    try {
      const raw = await AsyncStorage.getItem(getVitalsKey(email));
      if (!raw) {
        setVitals({
          heartRate: '',
          weight: '',
          bloodType: '',
          temperature: '',
          updatedAt: '',
        });
        setVitalsInput({ heartRate: '', weight: '', bloodType: '', temperature: '' });
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed) return;
      const next = {
        heartRate: typeof parsed.heartRate === 'number' ? parsed.heartRate : '',
        weight: typeof parsed.weight === 'number' ? parsed.weight : '',
        bloodType: typeof parsed.bloodType === 'string' ? parsed.bloodType : '',
        temperature: typeof parsed.temperature === 'number' ? parsed.temperature : '',
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      };
      setVitals(next);
      setVitalsInput({
        heartRate: `${next.heartRate}`,
        weight: `${next.weight}`,
        bloodType: `${next.bloodType}`,
        temperature: `${next.temperature}`,
      });
    } catch (e) {
    }
  };


  const fetchUserData = async () => {
    try {
      const email = await AsyncStorage.getItem('userEmail');
      if (email) {
        const { data, error } = await supabase
          .from('accounts')
          .select('name, email')
          .eq('email', email)
          .single();
        
        if (data) setUserData(data);
      } else {
        setUserData({ name: 'Patient', email: '' });
        setAppointments([]);
      }
    } catch (err) {
      console.log("Error fetching user data for homepage:", err);
    }
  };

  const fetchUpcomingAppointments = async () => {
    try {
      const email = await AsyncStorage.getItem('userEmail');
      if (!email) {
        setAppointments([]);
        return;
      }

      // 1. Get current user's name + id
      const { data: accountData } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('email', email)
        .single();
      
      const userName = accountData?.name || '';
      const userId = accountData?.id || '';

      const approvalIsVideoLike = (reason) => {
        const r = `${reason || ''}`.toLowerCase().trim();
        return r.includes('payref:') || r.includes('video consultation') || r.includes('[video]') || r.includes('video call');
      };

      const fetchApprovalRequests = async () => {
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

        const base = () =>
          supabase
            .from('appointment_approval_requests')
            .select(selectCols)
            .neq('status', 'Declined')
            .neq('status', 'Cancelled')
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

      // 2. Fetch from service_appointment (legacy), approval requests, and appointments (approved)
      const [pendingRes, approvedRes, approvalRes] = await Promise.all([
        supabase
          .from('service_appointment')
          .select('*')
          .eq('patient_email', email)
          .neq('status', 'Declined'),
        supabase
          .from('appointments')
          .select('*')
          .eq('email', email),
        fetchApprovalRequests(),
      ]);
      
      let combined = [];

      if (pendingRes.data) {
        combined = [...combined, ...pendingRes.data.map(app => ({
          id: app.id,
          time: app.appointment_time,
          date: app.appointment_date,
          type: app.service_type,
          status: 'Pending'
        }))];
      }

      if (approvalRes?.data) {
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
        const normalizeKey = (v) => `${v || ''}`.trim().toLowerCase().replace(/\s+/g, '_');
        const extractMeta = (row) => {
          const obj = parseJsonSafe(row?.suggested_note ?? row?.suggestedNote);
          if (obj && typeof obj === 'object') return obj.__appointmentMeta || obj.appointmentMeta || null;
          return null;
        };

        const items = (approvalRes.data || [])
          .filter((r) => r?.id)
          .filter((r) => `${r.status || ''}`.toLowerCase().includes('approved') ? !approvalIsVideoLike(r.reason) : true)
          .map((r) => {
            const meta = extractMeta(r) || {};
            const assignmentStatus =
              r?.assignment_status || r?.assignmentStatus || meta?.assignmentStatus || meta?.assignment_status || '';
            const assignmentKey = normalizeKey(assignmentStatus);
            const displayStatus = assignmentKey === 'pending_assignment' ? 'Pending Assignment' : r.status || 'Pending Approval';
            return {
              id: `req-${r.id}`,
              time: r.requested_time,
              date: r.requested_date,
              type: r.reason || 'Service Booking',
              status: displayStatus,
              assignmentStatus,
              requestedTimeFrom: r?.requested_time_from || r?.requestedTimeFrom || meta?.requestedTimeFrom || meta?.requested_time_from || '',
              requestedTimeTo: r?.requested_time_to || r?.requestedTimeTo || meta?.requestedTimeTo || meta?.requested_time_to || '',
              department: r?.department || meta?.department || '',
              raw: r,
            };
          });
        combined = [...combined, ...items];
      }

      if (approvedRes.data) {
        combined = [...combined, ...(approvedRes.data || []).map(app => ({
          id: app.id,
          time: app.appointment_time,
          date: app.appointment_date,
          type: app.service_type,
          status: 'Approved'
        }))];
      }

      // Sort by date (you might need a more robust date parser)
      combined.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      setAppointments(combined);
    } catch (err) {
      console.log("Error fetching appointments:", err);
    }
  };

  // FILTER AND PAGINATION LOGIC
  const filteredAppointments = appointments.filter(app => {
    const matchesSearch = (app.type || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'All' || app.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);
  const paginatedAppointments = filteredAppointments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const validateBloodType = (value) => {
    const trimmed = (value || '').trim().toUpperCase();
    if (!trimmed) return 'Blood type is required.';
    const allowed = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
    if (!allowed.has(trimmed)) return 'Use: A+, A-, B+, B-, AB+, AB-, O+, O-.';
    return '';
  };

  const validateHeartRate = (value) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return 'Heart rate is required.';
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return 'Heart rate must be a number.';
    if (n < 30 || n > 220) return 'Heart rate should be between 30 and 220 bpm.';
    return '';
  };

  const validateWeight = (value) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return 'Weight is required.';
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return 'Weight must be a number.';
    if (n < 1 || n > 500) return 'Weight should be between 1 and 500 kg.';
    return '';
  };

  const validateTemperature = (value) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return 'Temperature is required.';
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return 'Temperature must be a number.';
    if (n < 30 || n > 45) return 'Temperature should be between 30 and 45 °C.';
    return '';
  };

  const openVitalsModal = () => {
    setVitalsInput({
      heartRate: `${vitals.heartRate}`,
      weight: `${vitals.weight}`,
      bloodType: `${vitals.bloodType}`,
      temperature: `${vitals.temperature}`,
    });
    setVitalsTouched({ heartRate: false, weight: false, bloodType: false, temperature: false });
    setVitalsErrors({ heartRate: '', weight: '', bloodType: '', temperature: '' });
    setVitalsModalVisible(true);
  };

  const saveVitals = async () => {
    const heartRateError = validateHeartRate(vitalsInput.heartRate);
    const weightError = validateWeight(vitalsInput.weight);
    const bloodTypeError = validateBloodType(vitalsInput.bloodType);
    const temperatureError = validateTemperature(vitalsInput.temperature);

    setVitalsTouched({ heartRate: true, weight: true, bloodType: true, temperature: true });
    setVitalsErrors({
      heartRate: heartRateError,
      weight: weightError,
      bloodType: bloodTypeError,
      temperature: temperatureError,
    });

    if (heartRateError || weightError || bloodTypeError || temperatureError) {
      Alert.alert('Fix Required Fields', 'Please correct the highlighted vitals.');
      return;
    }

    const next = {
      heartRate: Number(vitalsInput.heartRate.trim()),
      weight: Number(vitalsInput.weight.trim()),
      bloodType: vitalsInput.bloodType.trim().toUpperCase(),
      temperature: Number(vitalsInput.temperature.trim()),
      updatedAt: new Date().toISOString(),
    };
    setVitals(next);
    setVitalsModalVisible(false);

    try {
      const email = userData.email || (await AsyncStorage.getItem('userEmail')) || '';
      if (email) await AsyncStorage.setItem(getVitalsKey(email), JSON.stringify(next));
    } catch (e) {
    }
  };

  return (
    <SafeAreaView style={PatientHomepageStyles.container}>
      <Modal
        animationType="slide"
        transparent={true}
        visible={vitalsModalVisible}
        onRequestClose={() => setVitalsModalVisible(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlayCenter} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.vitalsModalCard}>
            <View style={styles.vitalsModalHeader}>
              <Text style={styles.vitalsModalTitle}>Update Vitals</Text>
              <TouchableOpacity onPress={() => setVitalsModalVisible(false)}>
                <Feather name="x" size={20} color="#999" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingBottom: 10 }}
            >
              <Text style={styles.inputLabel}>Heart Rate (bpm) *</Text>
              <TextInput
                value={vitalsInput.heartRate}
                onChangeText={(t) => {
                  setVitalsInput((p) => ({ ...p, heartRate: t }));
                  if (vitalsTouched.heartRate) setVitalsErrors((p) => ({ ...p, heartRate: validateHeartRate(t) }));
                }}
                onBlur={() => {
                  setVitalsTouched((p) => ({ ...p, heartRate: true }));
                  setVitalsErrors((p) => ({ ...p, heartRate: validateHeartRate(vitalsInput.heartRate) }));
                }}
                keyboardType="numeric"
                placeholder="e.g., 72"
                placeholderTextColor="#aaa"
                style={[styles.input, vitalsTouched.heartRate && vitalsErrors.heartRate ? styles.inputError : null]}
              />
              {vitalsTouched.heartRate && !!vitalsErrors.heartRate && <Text style={styles.errorText}>{vitalsErrors.heartRate}</Text>}

              <Text style={styles.inputLabel}>Weight (kg) *</Text>
              <TextInput
                value={vitalsInput.weight}
                onChangeText={(t) => {
                  setVitalsInput((p) => ({ ...p, weight: t }));
                  if (vitalsTouched.weight) setVitalsErrors((p) => ({ ...p, weight: validateWeight(t) }));
                }}
                onBlur={() => {
                  setVitalsTouched((p) => ({ ...p, weight: true }));
                  setVitalsErrors((p) => ({ ...p, weight: validateWeight(vitalsInput.weight) }));
                }}
                keyboardType="numeric"
                placeholder="e.g., 68"
                placeholderTextColor="#aaa"
                style={[styles.input, vitalsTouched.weight && vitalsErrors.weight ? styles.inputError : null]}
              />
              {vitalsTouched.weight && !!vitalsErrors.weight && <Text style={styles.errorText}>{vitalsErrors.weight}</Text>}

              <Text style={styles.inputLabel}>Blood Type *</Text>
              <TextInput
                value={vitalsInput.bloodType}
                onChangeText={(t) => {
                  setVitalsInput((p) => ({ ...p, bloodType: t }));
                  if (vitalsTouched.bloodType) setVitalsErrors((p) => ({ ...p, bloodType: validateBloodType(t) }));
                }}
                onBlur={() => {
                  setVitalsTouched((p) => ({ ...p, bloodType: true }));
                  setVitalsErrors((p) => ({ ...p, bloodType: validateBloodType(vitalsInput.bloodType) }));
                }}
                autoCapitalize="characters"
                placeholder="e.g., O+"
                placeholderTextColor="#aaa"
                style={[styles.input, vitalsTouched.bloodType && vitalsErrors.bloodType ? styles.inputError : null]}
              />
              {vitalsTouched.bloodType && !!vitalsErrors.bloodType && <Text style={styles.errorText}>{vitalsErrors.bloodType}</Text>}

              <Text style={styles.inputLabel}>Temperature (°C) *</Text>
              <TextInput
                value={vitalsInput.temperature}
                onChangeText={(t) => {
                  setVitalsInput((p) => ({ ...p, temperature: t }));
                  if (vitalsTouched.temperature) setVitalsErrors((p) => ({ ...p, temperature: validateTemperature(t) }));
                }}
                onBlur={() => {
                  setVitalsTouched((p) => ({ ...p, temperature: true }));
                  setVitalsErrors((p) => ({ ...p, temperature: validateTemperature(vitalsInput.temperature) }));
                }}
                keyboardType="numeric"
                placeholder="e.g., 36.5"
                placeholderTextColor="#aaa"
                style={[styles.input, vitalsTouched.temperature && vitalsErrors.temperature ? styles.inputError : null]}
              />
              {vitalsTouched.temperature && !!vitalsErrors.temperature && <Text style={styles.errorText}>{vitalsErrors.temperature}</Text>}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setVitalsModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveVitals}>
                <Text style={styles.confirmText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* TOP NAVIGATION */}
      <PatientHeader 
        navigation={navigation} 
        onMenuPress={toggleDrawer} 
        userData={userData} 
      />

      <FlatList
        data={paginatedAppointments}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* VERSE OF THE DAY */}
            <View style={PatientHomepageStyles.votdWrapper}>
              <Text style={PatientHomepageStyles.votd}>Verse of the Day</Text>
              <Text style={PatientHomepageStyles.subVotd}>{verse.ref}</Text>
              <Text style={PatientHomepageStyles.subGreeting}>
                {verse.text}
              </Text>
            </View>

            {/* WELLNESS TIP */}
            <TouchableOpacity style={styles.tipCard} onPress={() => Alert.alert("Health Tip", "Staying hydrated improves circulation and brain function.")}>
              <View style={styles.tipTextContainer}>
                <Text style={styles.tipTitle}>Wellness Tip</Text>
                <Text style={styles.tipContent}>Drink 8 glasses of water today to stay hydrated and energized.</Text>
              </View>
              <MaterialCommunityIcons name="lightbulb-on" size={32} color="#fbbf24" />
            </TouchableOpacity>

            {/* HEALTH VITALS */}
            <View style={styles.sectionHeader}>
              <Text style={styles.internalSectionTitleInline}>Health Vitals</Text>
              <TouchableOpacity onPress={openVitalsModal}>
                <Text style={styles.seeAll}>Update</Text>
              </TouchableOpacity>
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              contentContainerStyle={styles.vitalsScroll}
            >
              <TouchableOpacity style={[styles.vitalCard, { backgroundColor: '#fff1f2' }]} onPress={openVitalsModal}>
                <FontAwesome5 name="heartbeat" size={18} color="#e11d48" />
                <Text style={styles.vitalValue}>{vitals.heartRate}</Text>
                <Text style={styles.vitalLabel}>bpm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.vitalCard, { backgroundColor: '#f0fdf4' }]} onPress={openVitalsModal}>
                <FontAwesome5 name="weight" size={18} color="#16a34a" />
                <Text style={styles.vitalValue}>{vitals.weight}</Text>
                <Text style={styles.vitalLabel}>kg</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.vitalCard, { backgroundColor: '#eff6ff' }]} onPress={openVitalsModal}>
                <FontAwesome5 name="tint" size={18} color="#2563eb" />
                <Text style={styles.vitalValue}>{vitals.bloodType}</Text>
                <Text style={styles.vitalLabel}>Blood</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.vitalCard, { backgroundColor: '#faf5ff' }]} onPress={openVitalsModal}>
                <FontAwesome5 name="thermometer-half" size={18} color="#9333ea" />
                <Text style={styles.vitalValue}>{vitals.temperature}</Text>
                <Text style={styles.vitalLabel}>Temp</Text>
              </TouchableOpacity>
            </ScrollView>
            {!!vitals.updatedAt && (
              <Text style={styles.vitalsUpdatedText}>
                Last updated: {new Date(vitals.updatedAt).toLocaleString()}
              </Text>
            )}

            {/* QUICK ACTIONS */}
            <View style={styles.actionGridCenter}>
              <TouchableOpacity style={styles.actionCardWide} onPress={() => navigation.navigate('Services')}>
                <View style={[styles.iconCircle, { backgroundColor: '#FFFAF0' }]}>
                  <MaterialCommunityIcons name="calendar-plus" size={26} color="#DA7705" />
                </View>
                <Text style={styles.actionLabel}>Book</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionCardWide} onPress={() => navigation.navigate('Records')}>
                <View style={[styles.iconCircle, { backgroundColor: '#eff6ff' }]}>
                  <MaterialCommunityIcons name="file-document-outline" size={26} color="#2563eb" />
                </View>
                <Text style={styles.actionLabel}>Records</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={PatientHomepageStyles.sectionTitle}>Upcoming Appointments</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Schedule')}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>

            {/* SEARCH AND FILTER */}
            <View style={styles.searchContainer}>
              <Feather name="search" size={18} color="#999" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search appointments..."
                value={searchQuery}
                onChangeText={(t) => {
                  setSearchQuery(t);
                  setCurrentPage(1);
                }}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setCurrentPage(1); }} style={styles.searchClear}>
                  <Feather name="x" size={14} color="#666" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              contentContainerStyle={styles.filterScroll}
            >
              {['All', 'Approved', 'Pending Approval', 'Pending Assignment'].map((status) => (
                <TouchableOpacity 
                  key={status}
                  style={[
                    styles.filterChip, 
                    filterStatus === status && styles.filterChipActive
                  ]}
                  onPress={() => {
                    setFilterStatus(status);
                    setCurrentPage(1);
                  }}
                >
                  <Text style={[
                    styles.filterChipText,
                    filterStatus === status && styles.filterChipTextActive
                  ]}>
                    {status}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        }
        renderItem={({ item }) => {
          const raw = `${item?.date || item?.appointment_date || item?.requested_date || ''}`.trim();
          let cleanDate = '';
          if (raw) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
              cleanDate = raw;
            } else {
              const d = new Date(raw);
              if (!Number.isNaN(d.getTime())) {
                const yyyy = d.getFullYear();
                const mm = `${d.getMonth() + 1}`.padStart(2, '0');
                const dd = `${d.getDate()}`.padStart(2, '0');
                cleanDate = `${yyyy}-${mm}-${dd}`;
              }
            }
          }
          return (
          <TouchableOpacity style={PatientHomepageStyles.appointmentCard} onPress={() => navigation.navigate('Schedule', cleanDate ? { initialDate: cleanDate } : undefined)}>
            {(() => {
              const normalizeKey = (v) => `${v || ''}`.trim().toLowerCase().replace(/\s+/g, '_');
              const formatTimeDisplay = (timeStr) => {
                const t = `${timeStr || ''}`.trim();
                if (!t) return '';
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
              };

              const assignmentKey = normalizeKey(item?.assignmentStatus);
              const isPendingAssignment = assignmentKey === 'pending_assignment' || item.status === 'Pending Assignment';
              const from = `${item?.requestedTimeFrom || ''}`.trim();
              const to = `${item?.requestedTimeTo || ''}`.trim();
              const range = from && to ? `${formatTimeDisplay(from)}–${formatTimeDisplay(to)}` : '';
              const timeLine = isPendingAssignment && range ? `${item.date} • ${range}` : `${item.time} • ${item.date}`;
              const statusColor =
                item.status === 'Confirmed' || item.status === 'Completed' || item.status === 'Approved' ? '#22c55e' : '#DA7705';

              return (
                <>
                  <View style={[PatientHomepageStyles.timeIndicator, {backgroundColor: '#DA7705'}]} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={[PatientHomepageStyles.timeText, { flex: 1 }]}>{timeLine}</Text>
                      <Text style={[styles.statusTag, { color: statusColor }]}>
                        {item.status}
                      </Text>
                    </View>
                    <Text style={PatientHomepageStyles.patientName}>{item.type}</Text>
                    {isPendingAssignment ? (
                      <Text style={PatientHomepageStyles.timeText}>
                        Waiting for the secretary to assign an available doctor.
                      </Text>
                    ) : null}
                    {/* Doctor info hidden for privacy */}
                  </View>
                  <Feather name="chevron-right" size={18} color="#ccc" style={{ marginLeft: 10 }} />
                </>
              );
            })()}
          </TouchableOpacity>
        );
      }}
        ListFooterComponent={
          totalPages > 1 ? (
            <View style={styles.paginationContainer}>
              <TouchableOpacity 
                style={[styles.paginationButton, currentPage === 1 && styles.paginationButtonDisabled]}
                onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <Feather name="chevron-left" size={20} color={currentPage === 1 ? '#ccc' : '#DA7705'} />
              </TouchableOpacity>
              
              <Text style={styles.paginationText}>Page {currentPage} of {totalPages}</Text>

              <TouchableOpacity 
                style={[styles.paginationButton, currentPage === totalPages && styles.paginationButtonDisabled]}
                onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <Feather name="chevron-right" size={20} color={currentPage === totalPages ? '#ccc' : '#DA7705'} />
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={PatientHomepageStyles.noAppointments}>No matching appointments found.</Text>
        }
        contentContainerStyle={PatientHomepageStyles.listPadding}
      />

      <PatientSideMenu 
        visible={drawerVisible} 
        onClose={toggleDrawer} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerContent: {
    width: '75%',
    height: '100%',
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingHorizontal: 20,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 5, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    marginBottom: 20,
  },
  drawerProfileCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#DA7705',
    overflow: 'hidden',
  },
  drawerProfilePic: {
    width: '100%',
    height: '100%',
  },
  drawerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  drawerEmail: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  drawerList: {
    flex: 1,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
  },
  drawerItemLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#444',
    marginLeft: 15,
  },
  drawerFooter: {
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    alignItems: 'center',
  },
  versionText: {
    fontSize: 12,
    color: '#ccc',
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    marginHorizontal: 20,
    paddingHorizontal: 15,
    borderRadius: 15,
    height: 45,
    marginTop: 5,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: '#333',
  },
  searchClear: {
    marginLeft: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e7eb',
  },
  inlineError: {
    marginHorizontal: 20,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
  },
  internalSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold', 
    color: '#333',
    marginLeft: 20,
    marginTop: 15,
    marginBottom: 10,
  },
  internalSectionTitleInline: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  medContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    padding: 15,
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  medRow: {
    flexDirection: 'row', 
    alignItems: 'center',
    marginBottom: 8,
  },
  medName: { fontWeight: 'bold', fontSize: 15, color: '#333' },
  medTime: { fontSize: 12, color: '#888' },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: '#DA7705', 
    marginHorizontal: 20,
    padding: 15,
    borderRadius: 20,
    alignItems: 'center', 
    marginTop: 20,
  },
  tipTextContainer: { flex: 1, paddingRight: 10 },
  tipTitle: { color: '#fff', fontWeight: 'bold', fontSize: 15, marginBottom: 2 },
  tipContent: { color: '#fff', fontSize: 12, lineHeight: 16, opacity: 0.9 },
  vitalsScroll: {
    paddingLeft: 20,
    paddingRight: 10, 
    paddingBottom: 5,
  },
  vitalCard: {
    width: 90, 
    height: 100,
    borderRadius: 20,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center', 
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  vitalValue: {
    fontSize: 20, 
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  vitalLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  vitalsUpdatedText: {
    marginLeft: 20,
    marginTop: 4,
    fontSize: 11,
    color: '#888',
    fontWeight: '600',
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  vitalsModalCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    maxHeight: '85%',
  },
  vitalsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  vitalsModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#333',
  },
  inputLabel: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '800',
    color: '#444',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fff',
  },
  inputError: {
    borderColor: '#dc2626',
  },
  errorText: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 15,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  modalSave: {
    flex: 2,
    paddingVertical: 15,
    borderRadius: 15,
    backgroundColor: '#DA7705',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#666',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
  },
  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between', 
    paddingHorizontal: 20,
    marginVertical: 25,
  },
  actionGridCenter: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 0,
    paddingHorizontal: 20,
    marginVertical: 25,
  },
  actionCard: {
    alignItems: 'center',
    width: '22%',
  },
  actionCardWide: {
    alignItems: 'center',
    width: 120,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6, 
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  actionLabel: {
    fontSize: 12, 
    fontWeight: '700',
    color: '#444',
  },
  sectionHeader: {
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20,
    marginBottom: 10
  },
  seeAll: {
    color: '#DA7705', 
    fontSize: 13,
    fontWeight: '600',
  },
  filterScroll: {
    paddingHorizontal: 20,
    paddingBottom: 15,
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#DA7705',
    borderColor: '#DA7705',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 20,
  },
  paginationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  paginationButtonDisabled: {
    backgroundColor: '#f9fafb',
    elevation: 0,
    shadowOpacity: 0,
  },
  paginationText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#444',
  },
  statusTag: {
    fontSize: 11, 
    fontWeight: 'bold',
    textTransform: 'uppercase',
    textAlign: 'right',
    flexShrink: 0,
    marginLeft: 10,
  },
  primaryActionsRow: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 12,
  },
  primaryActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    elevation: 2,
  },
  primaryActionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryActionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
  },
  primaryActionSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  }
});
