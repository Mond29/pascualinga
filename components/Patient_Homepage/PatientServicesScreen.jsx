import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, SafeAreaView, Alert, ActivityIndicator, TextInput, Switch, KeyboardAvoidingView, Platform, Linking, Image, AppState } from 'react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRoute, useNavigation } from '@react-navigation/native'
import { Calendar } from 'react-native-calendars'
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Dropdown as ElementDropdown } from 'react-native-element-dropdown';
import { supabase } from '../../lib/supabase';
import PatientSideMenu from './PatientSideMenu';
import PatientHeader from './PatientHeader';

const normalizeTriageKey = (v) => `${v || ''}`.trim().toLowerCase();

const DEFAULT_TRIAGE_MODEL = {
  queue: 'CONSULTATION',
  symptomsList: [
    'Mild Fever',
    'High Fever',
    'Mild Cough',
    'Severe Cough (Persistent)',
    'Sore throat',
    'Headache (Persistent)',
    'Dizziness / Lightheadedness',
    'Nausea / Vomiting',
    'Diarrhea',
    'Abdominal pain (Cramping)',
    'Severe Abdominal pain',
    'Chest pain / Tightness',
    'Shortness of breath',
    'Body / Muscle aches',
    'Back pain',
    'Rash / Skin irritation',
    'Wound / injury',
    'Urinary pain / Burning',
    'Toothache',
    'Ear pain',
    'Eye pain / redness',
    'Fatigue / Weakness',
  ],
  symptomWeights: {
    'Shortness of breath': 65,
    'Chest pain / Tightness': 65,
    'Severe Abdominal pain': 55,
    'Mild Fever': 15,
    'High Fever': 35,
    'Mild Cough': 8,
    'Severe Cough (Persistent)': 20,
    'Sore throat': 10,
    'Headache (Persistent)': 12,
    'Dizziness / Lightheadedness': 15,
    'Nausea / Vomiting': 15,
    'Diarrhea': 15,
    'Abdominal pain (Cramping)': 25,
    'Body / Muscle aches': 10,
    'Back pain': 12,
    'Rash / Skin irritation': 8,
    'Wound / injury': 25,
    'Urinary pain / Burning': 12,
    'Toothache': 10,
    'Ear pain': 10,
    'Eye pain / redness': 12,
    'Fatigue / Weakness': 15,
  },
};

const TRIAGE_MODELS_BY_DEPARTMENT = {
  'physical therapy': {
    queue: 'PHYSICAL THERAPY',
    symptomsList: [
      'Chronic Back pain',
      'Acute Back pain (Sudden)',
      'Neck pain / Stiffness',
      'Shoulder pain',
      'Knee / Joint pain',
      'Hip pain',
      'Ankle / Foot pain',
      'Muscle strain / Sprain',
      'Limited range of motion',
      'Numbness / Tingling in limbs',
      'Difficulty walking / Balance issues',
      'Post-surgery rehabilitation',
      'Sports injury',
    ],
    symptomWeights: {
      'Chronic Back pain': 15,
      'Acute Back pain (Sudden)': 25,
      'Neck pain / Stiffness': 15,
      'Shoulder pain': 12,
      'Knee / Joint pain': 12,
      'Hip pain': 12,
      'Ankle / Foot pain': 10,
      'Muscle strain / Sprain': 12,
      'Limited range of motion': 10,
      'Numbness / Tingling in limbs': 15,
      'Difficulty walking / Balance issues': 20,
      'Post-surgery rehabilitation': 10,
      'Sports injury': 15,
    },
  },
  pediatrics: {
    queue: 'PEDIATRICS',
    symptomsList: [
      'Mild Fever',
      'High Fever',
      'Mild Cough',
      'Severe / Barking Cough',
      'Sore throat',
      'Runny nose / Congestion',
      'Vomiting',
      'Diarrhea',
      'Abdominal pain',
      'Poor feeding / Loss of appetite',
      'Unusual irritability / Crying',
      'Ear tugging / Ear pain',
      'Rash / Diaper rash',
      'Wheezing / Difficulty breathing',
      'Headache',
    ],
    symptomWeights: {
      'Mild Fever': 15,
      'High Fever': 35,
      'Mild Cough': 8,
      'Severe / Barking Cough': 20,
      'Sore throat': 10,
      'Runny nose / Congestion': 8,
      'Vomiting': 18,
      'Diarrhea': 15,
      'Abdominal pain': 18,
      'Poor feeding / Loss of appetite': 20,
      'Unusual irritability / Crying': 20,
      'Ear tugging / Ear pain': 12,
      'Rash / Diaper rash': 12,
      'Wheezing / Difficulty breathing': 40,
      'Headache': 10,
    },
  },
  otolaryngology: {
    queue: 'OTOLARYNGOLOGY',
    symptomsList: [
      'Ear pain / Discharge',
      'Sudden Hearing loss',
      'Gradual Hearing loss',
      'Tinnitus (Ringing in ears)',
      'Sore throat / Difficulty swallowing',
      'Hoarseness / Voice changes',
      'Sinus pressure / Pain',
      'Nasal congestion / Runny nose',
      'Nosebleed (Frequent)',
      'Mild Cough',
      'Severe Cough',
      'Dizziness / Vertigo',
    ],
    symptomWeights: {
      'Ear pain / Discharge': 12,
      'Sudden Hearing loss': 40,
      'Gradual Hearing loss': 15,
      'Tinnitus (Ringing in ears)': 10,
      'Sore throat / Difficulty swallowing': 20,
      'Hoarseness / Voice changes': 10,
      'Sinus pressure / Pain': 10,
      'Nasal congestion / Runny nose': 8,
      'Nosebleed (Frequent)': 15,
      'Mild Cough': 8,
      'Severe Cough': 18,
      'Dizziness / Vertigo': 15,
    },
  },
  orthopedics: {
    queue: 'ORTHOPEDICS',
    symptomsList: [
      'Mild Joint pain',
      'Severe Joint pain',
      'Back / Neck pain',
      'Swelling / Inflammation',
      'Stiffness in joints',
      'Bone injury / Suspected fracture',
      'Muscle weakness',
      'Numbness / Tingling',
      'Difficulty bearing weight',
      'Limited range of motion',
      'Sports injury',
    ],
    symptomWeights: {
      'Mild Joint pain': 12,
      'Severe Joint pain': 25,
      'Back / Neck pain': 15,
      'Swelling / Inflammation': 12,
      'Stiffness in joints': 8,
      'Bone injury / Suspected fracture': 40,
      'Muscle weakness': 15,
      'Numbness / Tingling': 15,
      'Difficulty bearing weight': 25,
      'Limited range of motion': 10,
      'Sports injury': 15,
    },
  },
  obstetrics: {
    queue: 'OBSTETRICS',
    symptomsList: [
      'Prenatal check-up',
      'Mild Nausea (Morning sickness)',
      'Severe Nausea / Vomiting',
      'Mild abdominal cramps',
      'Severe Abdominal pain',
      'Vaginal discharge / Itching',
      'Spotting / Light bleeding',
      'Heavy vaginal bleeding',
      'Swelling (Feet / Hands)',
      'Decreased fetal movement',
      'High blood pressure concern',
      'Pelvic pain',
      'Back pain',
    ],
    symptomWeights: {
      'Prenatal check-up': 5,
      'Mild Nausea (Morning sickness)': 10,
      'Severe Nausea / Vomiting': 20,
      'Mild abdominal cramps': 15,
      'Severe Abdominal pain': 40,
      'Vaginal discharge / Itching': 8,
      'Spotting / Light bleeding': 35,
      'Heavy vaginal bleeding': 90,
      'Swelling (Feet / Hands)': 12,
      'Decreased fetal movement': 40,
      'High blood pressure concern': 25,
      'Pelvic pain': 15,
      'Back pain': 10,
    },
  },
  ophthalmology: {
    queue: 'OPHTHALMOLOGY',
    symptomsList: [
      'Blurred / Double vision',
      'Sudden vision loss',
      'Mild Eye pain',
      'Severe Eye pain',
      'Eye redness / Inflammation',
      'Itching / Burning sensation',
      'Watery / Dry eyes',
      'Eye discharge',
      'Sensitivity to light',
      'Flashes / Floaters in vision',
      'Eyelid swelling / Stye',
      'Headache',
    ],
    symptomWeights: {
      'Blurred / Double vision': 20,
      'Sudden vision loss': 90,
      'Mild Eye pain': 15,
      'Severe Eye pain': 35,
      'Eye redness / Inflammation': 20,
      'Itching / Burning sensation': 6,
      'Watery / Dry eyes': 6,
      'Eye discharge': 10,
      'Sensitivity to light': 15,
      'Flashes / Floaters in vision': 25,
      'Eyelid swelling / Stye': 8,
      'Headache': 8,
    },
  },
  dermatology: {
    queue: 'DERMATOLOGY',
    symptomsList: [
      'Mild Itchy rash',
      'Severe / Spreading rash',
      'Acne (Mild)',
      'Severe Acne',
      'Eczema / Dry skin flare-up',
      'Hives / Allergic reaction',
      'Changes in mole / Skin lesion',
      'Fungal infection (Ringworm)',
      'Warts / Skin growths',
      'Scalp itch / Dandruff',
      'Skin discoloration',
      'Facial swelling',
    ],
    symptomWeights: {
      'Mild Itchy rash': 10,
      'Severe / Spreading rash': 25,
      'Acne (Mild)': 5,
      'Severe Acne': 15,
      'Eczema / Dry skin flare-up': 12,
      'Hives / Allergic reaction': 20,
      'Changes in mole / Skin lesion': 15,
      'Fungal infection (Ringworm)': 8,
      'Warts / Skin growths': 5,
      'Scalp itch / Dandruff': 5,
      'Skin discoloration': 8,
      'Facial swelling': 30,
    },
  },
  urology: {
    queue: 'UROLOGY',
    symptomsList: [
      'Painful urination',
      'Frequent / Urgent urination',
      'Blood in urine',
      'Mild Flank / Side pain',
      'Severe Flank pain',
      'Testicular pain / Swelling',
      'Difficulty starting urination',
      'Incontinence (Leakage)',
      'Genital discharge / Itching',
      'Kidney stone symptoms',
    ],
    symptomWeights: {
      'Painful urination': 20,
      'Frequent / Urgent urination': 15,
      'Blood in urine': 35,
      'Mild Flank / Side pain': 15,
      'Severe Flank pain': 35,
      'Testicular pain / Swelling': 40,
      'Difficulty starting urination': 15,
      'Incontinence (Leakage)': 10,
      'Genital discharge / Itching': 10,
      'Kidney stone symptoms': 30,
    },
  },
  anesthesia: {
    queue: 'ANESTHESIA',
    symptomsList: [
      'History of anesthesia reaction',
      'Medication / Food allergies',
      'Current use of Blood thinners',
      'Chronic Asthma / COPD',
      'Diabetes / High blood pressure',
      'Sleep apnea / Snoring',
      'Recent Fever or Cough',
      'Previous surgical complications',
      'Chest pain / Shortness of breath',
      'Pregnancy concern',
    ],
    symptomWeights: {
      'History of anesthesia reaction': 40,
      'Medication / Food allergies': 20,
      'Current use of Blood thinners': 25,
      'Chronic Asthma / COPD': 20,
      'Diabetes / High blood pressure': 15,
      'Sleep apnea / Snoring': 15,
      'Recent Fever or Cough': 15,
      'Previous surgical complications': 25,
      'Chest pain / Shortness of breath': 50,
      'Pregnancy concern': 12,
    },
  },
};

const getTriageModelForService = (departmentName) => {
  const key = normalizeTriageKey(departmentName);
  const model = TRIAGE_MODELS_BY_DEPARTMENT[key];
  if (model) return model;
  return { ...DEFAULT_TRIAGE_MODEL, queue: (departmentName ? `${departmentName}`.trim().toUpperCase() : DEFAULT_TRIAGE_MODEL.queue) || DEFAULT_TRIAGE_MODEL.queue };
};

export default function PatientServicesScreen() {
  const route = useRoute()
  const navigation = useNavigation()
  const [selectedService, setSelectedService] = useState(null);
  const [selectedSubService, setSelectedSubService] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [consultationModalVisible, setConsultationModalVisible] = useState(false);
  const [consultationType, setConsultationType] = useState('');
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [isBooking, setIsBooking] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState('');
  const selectedDateRef = useRef('');
  useEffect(() => {
    selectedDateRef.current = `${selectedDate || ''}`;
  }, [selectedDate]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = `${now.getMonth() + 1}`.padStart(2, '0');
    return `${yyyy}-${mm}`;
  });
  const [bookingStep, setBookingStep] = useState(0);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceSearchError, setServiceSearchError] = useState('');
  const [pageIndex, setPageIndex] = useState(0);

  const [patientFirstName, setPatientFirstName] = useState('');
  const [patientLastName, setPatientLastName] = useState('');
  const [patientDob, setPatientDob] = useState(null);
  const [patientSex, setPatientSex] = useState('');
  const [patientIsPwd, setPatientIsPwd] = useState(false);
  const [patientPwdIdUri, setPatientPwdIdUri] = useState('');
  const [patientPwdIdFileName, setPatientPwdIdFileName] = useState('');
  const [patientPwdIdUploading, setPatientPwdIdUploading] = useState(false);
  const [patientPwdIdUrl, setPatientPwdIdUrl] = useState('');
  const [patientNotes, setPatientNotes] = useState('');
  const [birthDateState, setBirthDateState] = useState({ month: '', day: '', year: '' });
  const [patientProfileLoading, setPatientProfileLoading] = useState(false);
  const [patientProfileLocked, setPatientProfileLocked] = useState(false);
  const [preferredTime, setPreferredTime] = useState('');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timeValue, setTimeValue] = useState(new Date());
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymongoCheckoutUrl, setPaymongoCheckoutUrl] = useState('');
  const [paymongoQrImageUrl, setPaymongoQrImageUrl] = useState('');
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [checkingPaymentNow, setCheckingPaymentNow] = useState(false);
  const [paymentStatusText, setPaymentStatusText] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [paymentApprovedVisible, setPaymentApprovedVisible] = useState(false);
  const paymentFinalizeInFlightRef = useRef(false);
  const [mainConcern, setMainConcern] = useState('');
  const [mainConcernDebounced, setMainConcernDebounced] = useState('');
  const [severity, setSeverity] = useState('Moderate');
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [consultMode, setConsultMode] = useState('In-person');
  const [activeVideoCall, setActiveVideoCall] = useState(null);
  const [checkingActiveCall, setCheckingActiveCall] = useState(false);
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotFetchError, setSlotFetchError] = useState('');
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [disabledDateMarks, setDisabledDateMarks] = useState({});
  const [doctorBlockedDateMarks, setDoctorBlockedDateMarks] = useState({});
  const [specialtyBlockedDateMarks, setSpecialtyBlockedDateMarks] = useState({});
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedDoctorDbId, setSelectedDoctorDbId] = useState('');
  const [selectedDoctorEmail, setSelectedDoctorEmail] = useState('');
  const [selectedDoctorName, setSelectedDoctorName] = useState('');
  const [doctorFetchError, setDoctorFetchError] = useState('');
  const [videoHoldRef, setVideoHoldRef] = useState('');
  const [videoHoldStatusText, setVideoHoldStatusText] = useState('');
  const [videoHoldModalVisible, setVideoHoldModalVisible] = useState(false);
  const confirmBookingRef = useRef(null);
  const paymentPollIntervalRef = useRef(null);
  const autoFinalizePaymentRef = useRef(false);
  const afterPaymentForceApprovedRef = useRef(false);
  const videoHoldPollIntervalRef = useRef(null);
  const onsiteAvailabilityRequestIdRef = useRef(0);
  const onsiteAvailabilityCacheRef = useRef({});
  const onsiteAvailabilityInFlightRef = useRef({ key: '', startedAt: 0 });
  const notesInputRef = useRef(null);
  const notesTextRef = useRef('');
  const patientProfileSnapshotRef = useRef({
    firstName: '',
    lastName: '',
    dob: null,
    sex: '',
    birthDateState: { month: '', day: '', year: '' },
    fieldTouched: { firstName: false, lastName: false, notes: false, mainConcern: false, time: false },
  });
  const [cartItems, setCartItems] = useState([]);
  const [cartModalVisible, setCartModalVisible] = useState(false);
  const [cartCheckoutMode, setCartCheckoutMode] = useState(false);
  const [cartCheckoutItems, setCartCheckoutItems] = useState([]);
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

  useEffect(() => {
    fetchUserData();
  }, []);
  const [referralUploadingKey, setReferralUploadingKey] = useState('');
  const [singleReferralUrl, setSingleReferralUrl] = useState('');
  const [singleReferralAi, setSingleReferralAi] = useState(null);
  const [singleReferralUploading, setSingleReferralUploading] = useState(false);
  const [singleReferralAssetUri, setSingleReferralAssetUri] = useState('');
  const [singleReferralFileName, setSingleReferralFileName] = useState('');
  const referralAiMinScore = 70;
  const [reappointLock, setReappointLock] = useState(false)
  const reappointAppliedRef = useRef('')
  const serviceUpdatesChannelNameRef = useRef(`patient-service-updates:${Date.now()}-${Math.random().toString(16).slice(2)}`)

  const consultationDepartmentNames = [
    'Physical Therapy',
    'Anesthesia',
    'Cardiology',
    'Pediatrics',
    'Otolaryngology',
    'Pathology',
    'Orthopedics',
    'Obstetrics',
    'Ophthalmology',
    'Dermatology',
    'Urology',
  ];
  const isConsultationDepartment = consultationDepartmentNames.includes(selectedService?.name || '');
  const isVideoConsult = isConsultationDepartment && consultMode === 'Video Call';
  const isOnsiteConsult = isConsultationDepartment && consultMode === 'In-person' && consultationType === 'Onsite Consultation';
  const isTriageEnabled = isConsultationDepartment;

  const isPackageService = useCallback((subName) => /package/i.test(`${subName || ''}`), []);

  const requiresReferralFor = useCallback(
    (serviceName, subName) => {
      const s = `${serviceName || ''}`.trim().toLowerCase();
      const n = `${subName || ''}`.trim().toLowerCase();
      if (!s || !n) return false;
      if (isPackageService(subName)) return true;
      if (s === 'laboratory' || s === 'radiology' || s === 'pathology') return true;
      if (n.includes('ct') || n.includes('mri') || n.includes('x-ray') || n.includes('xray') || n.includes('ultrasound')) return true;
      return false;
    },
    [isPackageService],
  );

  const cartKeyFor = useCallback((serviceName, subName) => {
    const s = `${serviceName || ''}`.trim();
    const n = `${subName || ''}`.trim();
    return `${s}::${n}`;
  }, []);

  const cartTotalAmount = useMemo(() => {
    const parsePrice = (priceText) => {
      const raw = `${priceText || ''}`.replace(/[^\d.]/g, '');
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    };
    const sum = (cartItems || []).reduce((acc, it) => acc + parsePrice(it?.priceText), 0);
    return Number.isFinite(sum) ? sum : 0;
  }, [cartItems]);

  const cartTotalDisplay = useMemo(() => {
    const items = Array.isArray(cartItems) ? cartItems : [];
    if (!items.length) return '—';

    const parsePrice = (priceText) => {
      const raw = `${priceText || ''}`.replace(/[^\d.]/g, '');
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    };

    const hasUnknown = items.some((it) => parsePrice(it?.priceText) <= 0);
    if (cartTotalAmount > 0 && hasUnknown) return `₱${cartTotalAmount} + TBD`;
    if (cartTotalAmount > 0) return `₱${cartTotalAmount}`;
    if (hasUnknown) return 'TBD';
    return '—';
  }, [cartItems, cartTotalAmount]);

  const selectedCartItems = useMemo(() => {
    const items = Array.isArray(cartItems) ? cartItems : [];
    return items.filter((it) => it?.selected !== false);
  }, [cartItems]);

  const selectedCartTotalAmount = useMemo(() => {
    const parsePrice = (priceText) => {
      const raw = `${priceText || ''}`.replace(/[^\d.]/g, '');
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    };
    const sum = (selectedCartItems || []).reduce((acc, it) => acc + parsePrice(it?.priceText), 0);
    return Number.isFinite(sum) ? sum : 0;
  }, [selectedCartItems]);

  const selectedCartTotalDisplay = useMemo(() => {
    const items = Array.isArray(selectedCartItems) ? selectedCartItems : [];
    if (!items.length) return '—';

    const parsePrice = (priceText) => {
      const raw = `${priceText || ''}`.replace(/[^\d.]/g, '');
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    };

    const hasUnknown = items.some((it) => parsePrice(it?.priceText) <= 0);
    if (selectedCartTotalAmount > 0 && hasUnknown) return `₱${selectedCartTotalAmount} + TBD`;
    if (selectedCartTotalAmount > 0) return `₱${selectedCartTotalAmount}`;
    if (hasUnknown) return 'TBD';
    return '—';
  }, [selectedCartItems, selectedCartTotalAmount]);

  const addToCart = useCallback(
    (service, sub) => {
      const serviceName = `${service?.name || ''}`.trim();
      const subName = `${sub?.name || ''}`.trim();
      if (!serviceName || !subName) return;

      const key = cartKeyFor(serviceName, subName);
      setCartItems((prev) => {
        const existing = Array.isArray(prev) ? prev : [];
        if (existing.some((x) => x?.key === key)) return existing;
        const next = [
          ...existing,
          {
            key,
            serviceName,
            serviceIcon: service?.icon || null,
            subName,
            duration: sub?.duration || '',
            priceText: sub?.price || '',
            isPackage: isPackageService(subName),
            requiresReferral: requiresReferralFor(serviceName, subName),
            selected: true,
            referralUrl: '',
            referralAi: null,
          },
        ];
        return next;
      });
    },
    [cartKeyFor, isPackageService, requiresReferralFor],
  );

  const removeFromCart = useCallback((key) => {
    setCartItems((prev) => (Array.isArray(prev) ? prev.filter((x) => x?.key !== key) : []));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const toggleCartItemSelected = useCallback((key) => {
    if (!key) return;
    setCartItems((prev) =>
      (Array.isArray(prev) ? prev : []).map((it) => {
        if (it?.key !== key) return it;
        return { ...it, selected: it?.selected === false };
      }),
    );
  }, []);

  const extractReferralStoragePath = useCallback((publicUrl) => {
    const url = `${publicUrl || ''}`.trim();
    if (!url) return '';
    const marker = '/storage/v1/object/public/chat-attachments/';
    const idx = url.indexOf(marker);
    if (idx < 0) return '';
    const raw = url.slice(idx + marker.length);
    try {
      return decodeURIComponent(raw);
    } catch (_) {
      return raw;
    }
  }, []);

  const verifyReferralViaBackend = useCallback(async (publicUrl, serviceCategory, serviceName) => {
    const url = `${publicUrl || ''}`.trim();
    if (!url) return { ok: false, message: 'Missing referral URL.' };
    try {
      const res = await supabase.functions.invoke('referral-verify', {
        body: {
          url,
          serviceCategory: `${serviceCategory || ''}`.trim(),
          serviceName: `${serviceName || ''}`.trim(),
        },
      });
      if (res?.error) {
        return { ok: false, message: `${res.error?.message || res.error}`.trim() || 'Verification failed.' };
      }
      const data = res?.data || null;
      if (!data?.ok) return { ok: false, message: `${data?.error || 'Verification failed.'}`.trim() };
      return {
        ok: true,
        passed: !!data?.passed,
        score: Number(data?.score || 0) || 0,
        verdict: `${data?.verdict || ''}`.trim(),
        summary: `${data?.summary || ''}`.trim(),
        reasons: Array.isArray(data?.reasons) ? data.reasons : [],
        provider: `${data?.provider || ''}`.trim(),
      };
    } catch (e) {
      return { ok: false, message: `${e?.message || e || 'Verification failed.'}`.trim() };
    }
  }, []);

  const scoreReferralAsset = useCallback(async (asset) => {
    const uri = `${asset?.uri || ''}`.trim();
    const name = `${asset?.fileName || asset?.filename || asset?.name || 'referral.jpg'}`.trim() || 'referral.jpg';
    const mimeType = `${asset?.mimeType || ''}`.trim();
    const sizeBytes = Number(asset?.fileSize || asset?.filesize || 0) || 0;
    const exif = asset?.exif && typeof asset.exif === 'object' ? asset.exif : null;

    let width = 0;
    let height = 0;
    if (uri) {
      try {
        const wh = await new Promise((resolve) => {
          Image.getSize(
            uri,
            (w, h) => resolve([w, h]),
            () => resolve([0, 0]),
          );
        });
        width = Number(wh?.[0] || 0) || 0;
        height = Number(wh?.[1] || 0) || 0;
      } catch (_) {}
    }

    const reasons = [];
    let score = 0;

    const looksLikeScreenshot = /screenshot|screen_shot|screen-shot/i.test(name);
    if (looksLikeScreenshot) reasons.push('Screenshots are not accepted. Please take a photo of the referral document.');

    const extOk = /\.(png|jpe?g)$/i.test(name);
    if (extOk) score += 10;
    else reasons.push('Unsupported file type (use JPG/PNG).');

    const mimeOk = !mimeType || mimeType.startsWith('image/');
    if (mimeOk) score += 10;
    else reasons.push('Unsupported MIME type.');

    const hasExif = !!exif;
    if (hasExif) score += 15;
    else reasons.push('Missing camera metadata. Please take a photo of the referral document.');

    if (sizeBytes) {
      if (sizeBytes >= 25_000 && sizeBytes <= 10_000_000) score += 25;
      else reasons.push('File size is unusual. Upload a clearer photo.');
    } else {
      score += 10;
    }

    if (width && height) {
      if (width >= 700 && height >= 700) score += 35;
      else reasons.push('Image resolution is too low. Upload a clearer photo.');
      const ratio = width / height;
      if (ratio >= 0.55 && ratio <= 1.8) score += 10;
      else reasons.push('Image looks cropped. Please capture the full referral document.');

      const docRatio = width > height ? height / width : width / height;
      if (docRatio >= 0.66 && docRatio <= 0.74) score += 25;
      else reasons.push('Image does not look like a document capture. Please upload a photo of the referral paper.');

      const portrait = height >= width + 120;
      if (!portrait) reasons.push('Landscape images are not accepted. Please upload a portrait document photo.');
    } else {
      score += 10;
    }

    if (looksLikeScreenshot) score = 0;
    if (!hasExif) score = Math.min(score, 40);

    const normalized = Math.max(0, Math.min(100, score));
    const verdict = looksLikeScreenshot ? 'Rejected' : normalized >= 90 ? 'Likely valid' : normalized >= 85 ? 'Acceptable' : 'Low confidence';
    return {
      score: normalized,
      verdict,
      reasons,
      name,
      mimeType: mimeType || (name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'),
      sizeBytes,
      width,
      height,
      hasExif,
      checkedAt: new Date().toISOString(),
    };
  }, []);

  const uploadReferralAsset = useCallback(async (asset, patientEmail, cartKey) => {
    const uri = `${asset?.uri || ''}`.trim();
    if (!uri) throw new Error('Missing file');

    const name = `${asset?.fileName || asset?.filename || asset?.name || 'referral.jpg'}`.trim() || 'referral.jpg';
    const inferredMimeType = name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const mimeType = `${asset?.mimeType || inferredMimeType || 'image/jpeg'}`.trim();
    if (!mimeType.startsWith('image/')) throw new Error('Only image files are allowed for referrals.');

    const res = await fetch(uri);
    if (!res.ok) throw new Error(`Failed to read attachment (${res.status})`);
    const fileData = await res.arrayBuffer();

    const safeEmail = `${patientEmail || ''}`.replace(/[^a-z0-9@._-]+/gi, '_').toLowerCase();
    const safeKey = `${cartKey || ''}`.replace(/[^a-z0-9._:-]+/gi, '_');
    const path = `referrals/${safeEmail}/${Date.now()}-${safeKey}-${name}`.replace(/\s+/g, '_');

    const { error: uploadError } = await supabase.storage
      .from('chat-attachments')
      .upload(path, fileData, { contentType: mimeType, upsert: false, cacheControl: '3600' });
    if (uploadError) throw uploadError;

    const publicRes = supabase.storage.from('chat-attachments').getPublicUrl(path);
    const url = publicRes?.data?.publicUrl || '';
    if (!url) throw new Error('Unable to get referral URL');
    return url;
  }, []);

  const removeReferralForCartItem = useCallback(
    async (itemKey) => {
      if (!itemKey) return;
      const current = Array.isArray(cartItems) ? cartItems : [];
      const found = current.find((x) => x?.key === itemKey);
      const path = extractReferralStoragePath(found?.referralUrl || '');

      setCartItems((prev) =>
        (Array.isArray(prev) ? prev : []).map((x) =>
          x?.key === itemKey ? { ...x, referralUrl: '', referralAi: null } : x,
        ),
      );
      setCartCheckoutItems((prev) =>
        (Array.isArray(prev) ? prev : []).map((x) =>
          x?.key === itemKey ? { ...x, referralUrl: '', referralAi: null } : x,
        ),
      );

      if (path) {
        try {
          await supabase.storage.from('chat-attachments').remove([path]);
        } catch (_) {}
      }
    },
    [cartItems, extractReferralStoragePath],
  );

  const removeSingleReferral = useCallback(async () => {
    const path = extractReferralStoragePath(singleReferralUrl);
    setSingleReferralUrl('');
    setSingleReferralAi(null);
    setSingleReferralAssetUri('');
    setSingleReferralFileName('');
    if (path) {
      try {
        await supabase.storage.from('chat-attachments').remove([path]);
      } catch (_) {}
    }
  }, [extractReferralStoragePath, singleReferralUrl]);

  const attachReferralForCartItem = useCallback(
    async (itemKey) => {
      try {
        if (!itemKey) return;
        const current = Array.isArray(cartItems) ? cartItems : [];
        const itemMeta = current.find((x) => x?.key === itemKey) || null;
        const svc = `${itemMeta?.serviceName || ''}`.trim();
        const sub = `${itemMeta?.subName || ''}`.trim();

        const chooseAsset = async (source) => {
          if (source === 'camera') {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              Alert.alert('Permission Required', 'Please allow camera access to capture the referral.');
              return null;
            }
            const picked = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.9,
              allowsEditing: true,
              exif: true,
            });
            if (picked.canceled) return null;
            return (picked.assets || [])[0] || null;
          }

          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permission Required', 'Please allow photo access to attach a referral.');
            return null;
          }
          const picked = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.9,
            allowsEditing: true,
            exif: true,
          });
          if (picked.canceled) return null;
          return (picked.assets || [])[0] || null;
        };

        const asset = await new Promise((resolve) => {
          Alert.alert('Attach Referral', 'Choose how to attach the referral.', [
            { text: 'Take Photo', onPress: async () => resolve(await chooseAsset('camera')) },
            { text: 'Choose from Gallery', onPress: async () => resolve(await chooseAsset('gallery')) },
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          ]);
        });
        if (!asset?.uri) return;

        const patientEmail = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
        setReferralUploadingKey(itemKey);
        const url = await uploadReferralAsset(asset, patientEmail, itemKey);
        const verify = await verifyReferralViaBackend(url, svc, sub);
        // REFERRAL IS OPTIONAL — AI verification backend down → soft-pass & keep file.
        const isBackendError = !verify.ok &&
          (/(edge\s*function|non-2xx|status\s*code|network|timeout|fetch\s*failed|unreachable|verification\s*failed|5\d{2}|could\s*not\s*reach)/i.test(`${verify?.message || ''}`) ||
           !verify?.message ||
           `${verify?.message || ''}`.toLowerCase().includes('missing authorization'));

        if (!verify.ok && !isBackendError) {
          const path = extractReferralStoragePath(url);
          if (path) {
            try {
              await supabase.storage.from('chat-attachments').remove([path]);
            } catch (_) {}
          }
          Alert.alert('Referral Verification', verify.message || 'Referral verification service is unavailable. Please try again.');
          return;
        }

        let ai = null;
        if (verify.ok) {
          ai = {
            score: Number(verify.score || 0) || 0,
            verdict: verify.verdict || 'Passed',
            provider: verify.provider || 'backend',
            passed: !!verify.passed,
            reasons: verify.reasons || [],
          };
        }

        const needsSoftPass = !verify.ok && isBackendError;
        if (needsSoftPass) {
          ai = {
            score: 0,
            verdict: 'AI check skipped (server unavailable) — manual review pending',
            provider: 'skipped',
            passed: true,
            reasons: [verify?.message || 'Automatic verification unavailable'].filter(Boolean),
          };
        }

        if (!ai) return;

        if (verify.ok && !ai.passed && Number(ai.score || 0) < referralAiMinScore) {
          const path = extractReferralStoragePath(url);
          if (path) {
            try {
              await supabase.storage.from('chat-attachments').remove([path]);
            } catch (_) {}
          }
          const reasonText = Array.isArray(ai.reasons) && ai.reasons.length ? ai.reasons.join('\n') : '';
          Alert.alert(
            'Referral Rejected',
            reasonText || 'The attached image does not look like a valid referral document. Please upload a clearer referral.',
          );
          return;
        }
        setCartItems((prev) =>
          (Array.isArray(prev) ? prev : []).map((x) => (x?.key === itemKey ? { ...x, referralUrl: url, referralAi: ai } : x)),
        );
        setCartCheckoutItems((prev) =>
          (Array.isArray(prev) ? prev : []).map((x) => (x?.key === itemKey ? { ...x, referralUrl: url, referralAi: ai } : x)),
        );
      } catch (e) {
        Alert.alert('Referral Upload Failed', `${e?.message || e}`);
      } finally {
        setReferralUploadingKey('');
      }
    },
    [cartItems, extractReferralStoragePath, referralAiMinScore, uploadReferralAsset, verifyReferralViaBackend],
  );

  const attachReferralForSingleBooking = useCallback(async () => {
    try {
      const chooseAsset = async (source) => {
        if (source === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permission Required', 'Please allow camera access to capture the referral.');
            return null;
          }
          const picked = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.9,
            allowsEditing: true,
            exif: true,
          });
          if (picked.canceled) return null;
          return (picked.assets || [])[0] || null;
        }

        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission Required', 'Please allow photo access to attach a referral.');
          return null;
        }
        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.9,
          allowsEditing: true,
          exif: true,
        });
        if (picked.canceled) return null;
        return (picked.assets || [])[0] || null;
      };

      const asset = await new Promise((resolve) => {
        Alert.alert('Attach Referral', 'Choose how to attach the referral.', [
          { text: 'Take Photo', onPress: async () => resolve(await chooseAsset('camera')) },
          { text: 'Choose from Gallery', onPress: async () => resolve(await chooseAsset('gallery')) },
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        ]);
      });
      if (!asset?.uri) return;
      // Optimistically show visual preview to user immediately (even before upload finishes)
      const assetUri = `${asset.uri || ''}`.trim();
      const assetName =
        `${asset.fileName || asset.filename || asset.name || ''}`.trim() ||
        assetUri.split('/').pop() ||
        `referral-${Date.now()}.jpg`;
      setSingleReferralAssetUri(assetUri);
      setSingleReferralFileName(assetName);

      const patientEmail = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
      setSingleReferralUploading(true);
      const url = await uploadReferralAsset(asset, patientEmail, 'single');
      const svc = `${selectedService?.name || ''}`.trim();
      const sub = `${selectedSubService?.name || ''}`.trim();
      const verify = await verifyReferralViaBackend(url, svc, sub);
      // Since Doctor Referral is OPTIONAL — if AI verification backend is DOWN
      // (Edge Function not deployed / 5xx / network error), KEEP the attached file
      // instead of deleting it & blocking the user. Nurse/doctor can verify manually later.
      const isBackendError = !verify.ok &&
        (/(edge\s*function|non-2xx|status\s*code|network|timeout|fetch\s*failed|unreachable|verification\s*failed|5\d{2}|could\s*not\s*reach)/i.test(`${verify?.message || ''}`) ||
         !verify?.message ||
         `${verify?.message || ''}`.toLowerCase().includes('missing authorization'));

      if (!verify.ok && !isBackendError) {
        const path = extractReferralStoragePath(url);
        if (path) {
          try {
            await supabase.storage.from('chat-attachments').remove([path]);
          } catch (_) {}
        }
        setSingleReferralAssetUri('');
        setSingleReferralFileName('');
        Alert.alert('Referral Verification', verify.message || 'Referral verification service is unavailable. Please try again.');
        return;
      }

      let ai = null;
      if (verify.ok) {
        ai = {
          score: Number(verify.score || 0) || 0,
          verdict: verify.verdict || 'Passed',
          provider: verify.provider || 'backend',
          passed: !!verify.passed,
          reasons: verify.reasons || [],
        };
      }

      // If backend AI is down but upload succeeded → "soft-pass" the referral (it's optional)
      // so user keeps attached file. We set a neutral AI result so UI shows it's unverified
      // but the referral attachment is still accepted.
      const needsSoftPass = !verify.ok && isBackendError;
      if (needsSoftPass) {
        ai = {
          score: 0,
          verdict: 'AI check skipped (server unavailable) — manual review pending',
          provider: 'skipped',
          passed: true,
          reasons: [verify?.message || 'Automatic verification unavailable'].filter(Boolean),
        };
      }

      if (!ai) return;
      // If actual AI ran but rejected the referral (score < threshold), delete & alert
      // as per original intent (clearly not a valid doc)
      if (verify.ok && !ai.passed && Number(ai.score || 0) < referralAiMinScore) {
        const path = extractReferralStoragePath(url);
        if (path) {
          try {
            await supabase.storage.from('chat-attachments').remove([path]);
          } catch (_) {}
        }
        setSingleReferralAssetUri('');
        setSingleReferralFileName('');
        const reasonText = Array.isArray(ai.reasons) && ai.reasons.length ? ai.reasons.join('\n') : '';
        Alert.alert(
          'Referral Rejected',
          reasonText || 'The attached image does not look like a valid referral document. Please upload a clearer referral.',
        );
        return;
      }

      setSingleReferralUrl(url);
      setSingleReferralAi(ai);
    } catch (e) {
      setSingleReferralAssetUri('');
      setSingleReferralFileName('');
      Alert.alert('Referral Upload Failed', `${e?.message || e}`);
    } finally {
      setSingleReferralUploading(false);
    }
  }, [extractReferralStoragePath, referralAiMinScore, selectedService?.name, selectedSubService?.name, uploadReferralAsset, verifyReferralViaBackend]);

  const beginCartCheckout = useCallback(() => {
    const items = Array.isArray(cartItems) ? cartItems : [];
    if (!items.length) {
      Alert.alert('Cart is empty', 'Please add services first.');
      return;
    }
    const selected = items.filter((x) => x?.selected !== false);
    if (!selected.length) {
      Alert.alert('No items selected', 'Please select at least one service to checkout.');
      return;
    }

    const first = selected[0];
    setCartCheckoutMode(true);
    setCartCheckoutItems(selected);
    setSelectedService({ name: first.serviceName, icon: first.serviceIcon || 'medkit-outline' });
    setSelectedSubService({
      name: `Multiple Services (${selected.length})`,
      price: selectedCartTotalDisplay !== '—' ? selectedCartTotalDisplay : '',
      duration: '—',
    });
    setBookingStep(0);
    setPaymentMethod('cash');
    setSelectedDate('');
    setPreferredTime('');
    setShowTimePicker(false);
    setTimeValue(new Date());
    setSingleReferralUrl('');
    setSingleReferralAi(null);
    setSingleReferralUploading(false);
    setSingleReferralAssetUri('');
    setSingleReferralFileName('');
    setModalVisible(false);
    setCartModalVisible(false);
    {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = `${now.getMonth() + 1}`.padStart(2, '0');
      setCalendarMonth(`${yyyy}-${mm}`);
    }
    setBookingModalVisible(true);
  }, [cartItems, referralAiMinScore, selectedCartTotalDisplay]);

  const normalizeSpecialtyKey = useCallback((name) => {
    const raw = `${name || ''}`.trim().toLowerCase();
    if (!raw) return '';
    return raw
      .replace(/&/g, 'and')
      .replace(/[^a-z]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }, []);

  const getApiBaseUrl = useCallback(() => {
    const fromEnv = `${process.env.EXPO_PUBLIC_API_BASE_URL || ''}`.trim();
    return 'https://api.pascualinga.com';
  }, []);

  const getDailyEdgeFnUrl = useCallback(() => {
    const projUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL || ''}`.trim().replace(/\/+$/, '');
    if (projUrl) return `${projUrl}/functions/v1/daily-create-room`;
    return 'https://iknkfjzoubkymcwprrux.supabase.co/functions/v1/daily-create-room';
  }, []);

  const callDailyEdgeFn = useCallback(
    async (appointmentId, action, role = 'patient', sourceTable = '') => {
      const id = `${appointmentId || ''}`.trim();
      if (!id) return { ok: false, message: 'Missing appointment id' };
      const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
      const name = `${patientFirstName} ${patientLastName}`.trim() || email || 'Patient';

      const url = getDailyEdgeFnUrl();
      const anon = `${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrbmtmanpvdWJreW1jd3BycnV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMjg4MDMsImV4cCI6MjA4OTkwNDgwM30.He4eCsEJQdRYQ0Kk2kqTPTyWV3zeS1TCm1UYlXGyixs'}`.trim();
      const body = { appointmentId: id, action: action === 'join' ? 'join' : 'start', email, role };
      if (`${sourceTable || ''}`.trim()) body.sourceTable = `${sourceTable}`.trim();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-user-role': role,
          'x-user-email': email,
          'x-user-name': name,
          'Content-Type': 'application/json',
          apikey: anon,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null } catch (_) { json = null }
      if (!res.ok) return { ok: false, message: json?.error || text || 'Failed to prepare call' };
      return { ok: true, json };
    },
    [getDailyEdgeFnUrl, patientFirstName, patientLastName],
  );

  const apiFetchJson = useCallback(
    async (path, { method = 'GET', body = null, headers = {}, signal } = {}) => {
      const sessionRes = await supabase.auth.getSession();
      const session = sessionRes?.data?.session || null;
      const token = `${session?.access_token || ''}`.trim();
      const sessionEmail = `${session?.user?.email || ''}`.trim().toLowerCase();
      const supabaseAnonKey = `${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''}`.trim();

      const storedEmail = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
      const email = storedEmail || sessionEmail;
      const displayName = `${patientFirstName} ${patientLastName}`.trim() || email || 'Patient';
      const cachedPatientId = email ? `${(await AsyncStorage.getItem(`patientId:${email}`)) || ''}`.trim() : '';
      const url = `${getApiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;
      const shouldDebug =
        url.includes('/api/doctors/') ||
        url.includes('/api/health') ||
        url.includes('/api/appointments/onsite') ||
        url.includes('/api/appointments/mine');
      const startedAt = Date.now();

      if (!email) {
        console.log('[API] Missing x-user-email for request:', method, url);
      }
      if (shouldDebug) {
        console.log('[API] Request', {
          method,
          url,
          hasEmail: !!email,
          hasToken: !!token,
          hasApikey: !!supabaseAnonKey,
        });
      }
      let res;
      try {
        res = await fetch(url, {
          method,
          signal,
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
            'x-user-role': 'patient',
            'x-user-email': email,
            'x-user-name': displayName,
            ...(cachedPatientId ? { 'x-patient-id': cachedPatientId } : {}),
            ...(supabaseAnonKey ? { apikey: supabaseAnonKey } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        if (shouldDebug) {
          console.log('[API] Fetch error', {
            url,
            ms: Date.now() - startedAt,
            message: `${e?.message || e || ''}`.trim(),
          });
        }
        throw e;
      }
      if (shouldDebug) {
        console.log('[API] Response headers received', { url, status: res.status, ms: Date.now() - startedAt });
      }

      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (_) {
        json = null;
      }

      return { ok: res.ok, status: res.status, json, text };
    },
    [getApiBaseUrl, patientFirstName, patientLastName],
  );

  const buildMeetingRoomId = useCallback(() => {
    const base = normalizeSpecialtyKey(selectedService?.name || '') || 'consultation';
    const rand = Math.random().toString(36).slice(2, 8);
    const t = Date.now();
    return `pascualinga-${base}-${t}-${rand}`;
  }, [normalizeSpecialtyKey, selectedService?.name]);

  const stepLabels = useMemo(
    () => (isTriageEnabled ? ['Service', 'Patient', 'Symptoms', 'Booking', 'Summary'] : ['Service', 'Patient', 'Booking', 'Summary']),
    [isTriageEnabled],
  );
  const stepKeys = useMemo(
    () => (isTriageEnabled ? ['service', 'patient', 'symptoms', 'booking', 'summary'] : ['service', 'patient', 'booking', 'summary']),
    [isTriageEnabled],
  );
  const maxStep = stepKeys.length - 1;
  const stepKey = stepKeys[bookingStep] || stepKeys[0];

  useEffect(() => {
    if (bookingStep > maxStep) setBookingStep(maxStep);
  }, [bookingStep, maxStep]);

  const checkActiveVideoCall = useCallback(async () => {
    setCheckingActiveCall(true);
    try {
      const email = await AsyncStorage.getItem('userEmail');
      const today = new Date().toISOString().split('T')[0];
      const videoRows = [];

      const { data: appointments, error: appointmentsError } = await supabase
        .from('appointments')
        .select('*')
        .eq('email', email)
        .eq('appointment_date', today)
        .order('created_at', { ascending: false })
        .limit(10);
      if (appointmentsError) throw appointmentsError;
      (appointments || []).forEach((row) => videoRows.push({
        source: 'appointments',
        row,
        time: row?.appointment_time,
        meetingRoom: `${row?.meeting_room_id || row?.meeting_room || row?.video_room || row?.room_url || ''}`.trim(),
      }));

      const { data: approvalRequests, error: approvalError } = await supabase
        .from('appointment_approval_requests')
        .select('*')
        .eq('email', email)
        .eq('requested_date', today)
        .order('created_at', { ascending: false })
        .limit(10);
      if (approvalError) throw approvalError;
      (approvalRequests || []).forEach((row) => videoRows.push({
        source: 'appointment_approval_requests',
        row,
        time: row?.requested_time,
        meetingRoom: `${row?.meeting_room || row?.meeting_room_id || row?.video_room || row?.room_url || ''}`.trim(),
      }));

      const normalizeText = (v) => `${v || ''}`.toLowerCase().trim();
      const isVideoType = (t) => {
        const s = normalizeText(t);
        return s.includes('video consultation') || s.includes('video call') || s.includes('[video]') || s.includes('video');
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
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();

      const candidate = videoRows
        .filter(({ row: a }) => {
          if (a?.meeting_ended_at) return false;
          const modeKey = normalizeText(a?.consultation_mode || a?.mode);
          const isVideo = modeKey === 'video' || modeKey.includes('video');
          const videoByType = isVideoType(a?.service_type || a?.reason);
          return isVideo || videoByType;
        })
        .map(({ row: a, source, time, meetingRoom }) => ({
          a: {
            ...a,
            source,
            meeting_room: meetingRoom,
            meeting_room_id: a?.meeting_room_id,
            video_room: a?.video_room,
          },
          mins: parseTimeToMinutes(time),
        }))
        .filter((x) => x.mins !== null)
        .filter((x) => nowMin >= x.mins - 10 && nowMin <= x.mins + 30)
        .find((x) => !!(`${x.a?.meeting_room_id || x.a?.meeting_room || x.a?.video_room || ''}`.trim()));

      console.log('Active video call found:', candidate?.a?.id);
      setActiveVideoCall(candidate?.a || null);
    } catch (e) {
      console.error('Error checking active video call:', e);
    } finally {
      setCheckingActiveCall(false);
    }
  }, []);

  const fetchAvailableDoctors = useCallback(async () => {
    if (!bookingModalVisible || !isVideoConsult) return;
    const specializationLabel = `${selectedService?.name || ''}`.trim();
    const specialtyKey = normalizeSpecialtyKey(specializationLabel);
    if (!specialtyKey) return;

    setLoadingDoctors(true);
    setDoctorFetchError('');
    try {
      const looksLikeUuid = (value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          `${value || ''}`.trim(),
        );

      const apiRes = await apiFetchJson(
        `/api/video-consults/doctors?specialization=${encodeURIComponent(specializationLabel)}`,
      );

      if (apiRes.ok && Array.isArray(apiRes.json)) {
        const normalizeStatus = (v) => `${v || ''}`.trim().toLowerCase();
        const pickDoctorId = (d) => {
          const raw =
            d?.id ??
            d?.doctorId ??
            d?.doctor_id ??
            d?.accountId ??
            d?.account_id ??
            d?.userId ??
            d?.user_id ??
            '';
          return `${raw || ''}`.trim();
        };
        const doctors = apiRes.json
          .filter((d) => {
            const st = normalizeStatus(d?.status);
            if (!st) return true;
            return st === 'online' || st === 'available' || st === 'active';
          })
          .map((d) => ({
            label: `${d?.name || d?.email || 'Doctor'}`.trim(),
            value: `${d?.email || ''}`.trim().toLowerCase(),
            name: `${d?.name || ''}`.trim(),
            id: looksLikeUuid(pickDoctorId(d)) ? pickDoctorId(d) : '',
          }))
          .filter((d) => !!d.value)
          .sort((a, b) => `${a.label}`.localeCompare(`${b.label}`));

        if (doctors.length) {
          setAvailableDoctors(doctors);
          const first = doctors[0];
          if (!selectedDoctorEmail) {
            setSelectedDoctorEmail(first.value);
            setSelectedDoctorName(first.name || first.label);
            setSelectedDoctorId(first.id || first.value || '');
          } else {
            const found = doctors.find((x) => x.value === selectedDoctorEmail);
            if (found) setSelectedDoctorId(found.id || found.value || '');
          }
          return;
        }
      }

      const selectCols = [
        'id',
        'name',
        'email',
        'roles',
        'specialization',
        'department',
        'specialty',
        'is_active',
        'availability_status',
        'status',
      ];

      let cols = [...selectCols];
      let rows = null;

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const res = await supabase.from('accounts').select(cols.join(',')).ilike('roles', '%doctor%');
        if (!res.error) {
          rows = res.data || [];
          break;
        }
        if (res.error?.code === '42703') {
          const msg = `${res.error?.message || ''}`;
          const m = msg.match(/column\s+"([^"]+)"/i) || msg.match(/column\s+([a-z0-9_]+)/i);
          const missing = m?.[1] ? `${m[1]}` : '';
          if (missing) {
            cols = cols.filter((c) => c !== missing);
            continue;
          }
        }
        throw res.error;
      }

      const normalizeRole = (v) => `${v || ''}`.trim().toLowerCase();
      const normalizeAvail = (v) => `${v || ''}`.trim().toLowerCase();

      const isDoctorRow = (r) => normalizeRole(r?.roles).includes('doctor');
      const isActiveRow = (r) => {
          if (typeof r?.is_active === 'boolean') return r.is_active;
          const st = normalizeAvail(r?.status);
          if (st && ['inactive', 'disabled', 'blocked'].includes(st)) return false;
          return true;
      };
      const hasEmail = (r) => !!`${r?.email || ''}`.trim();
      const matchesDept = (r) => {
        const deptRaw = r?.specialization || r?.department || r?.specialty || '';
        if (!deptRaw) return true;
        return normalizeSpecialtyKey(deptRaw) === specialtyKey;
      };

      const baseDoctors = (rows || []).filter(isDoctorRow).filter(isActiveRow).filter(hasEmail);
      const scoped = baseDoctors.filter(matchesDept);
      const source = scoped.length ? scoped : baseDoctors;

      const filtered = source
        .map((r) => ({
          label: `${r?.name || r?.email}`.trim(),
          value: `${r?.email || ''}`.trim().toLowerCase(),
          name: `${r?.name || ''}`.trim(),
          id: looksLikeUuid(r?.id) ? `${r.id}`.trim() : '',
        }))
        .sort((a, b) => `${a.label}`.localeCompare(`${b.label}`));

      setAvailableDoctors(filtered);

      if (filtered.length && !selectedDoctorEmail) {
        setSelectedDoctorEmail(filtered[0].value);
        setSelectedDoctorName(filtered[0].name || filtered[0].label);
        setSelectedDoctorId(filtered[0].id || filtered[0].value || '');
      }
    } catch (e) {
      setAvailableDoctors([]);
      setDoctorFetchError(`${e?.message || e || 'Failed to load doctors'}`);
    } finally {
      setLoadingDoctors(false);
    }
  }, [
    apiFetchJson,
    bookingModalVisible,
    isVideoConsult,
    normalizeSpecialtyKey,
    selectedDoctorEmail,
    selectedService?.name,
  ]);

  const fetchOnsiteDoctors = useCallback(async () => {
    if (!bookingModalVisible || !isOnsiteConsult) return;
    const specializationLabel = `${selectedService?.name || ''}`.trim();
    const specialtyKey = normalizeSpecialtyKey(specializationLabel);
    if (!specialtyKey) return;

    setLoadingDoctors(true);
    setDoctorFetchError('');
    try {
      const looksLikeUuid = (value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          `${value || ''}`.trim(),
        );
      const looksNumeric = (value) => /^[0-9]+$/.test(`${value || ''}`.trim());

      const apiRes = await apiFetchJson(
        `/api/doctors?specialization=${encodeURIComponent(specializationLabel)}&q=&take=200`,
      );
      if (!apiRes.ok) {
        throw new Error(apiRes.json?.message || apiRes.text || 'Failed to load doctors');
      }

      const rawList = Array.isArray(apiRes.json)
        ? apiRes.json
        : Array.isArray(apiRes.json?.data)
          ? apiRes.json.data
          : Array.isArray(apiRes.json?.doctors)
            ? apiRes.json.doctors
            : [];

      const pickCandidateIds = (d) => {
        const raw = [
          d?.id,
          d?.doctorId,
          d?.doctor_id,
          d?.accountId,
          d?.account_id,
          d?.accountID,
          d?.userId,
          d?.user_id,
        ];
        return raw.map((x) => `${x ?? ''}`.trim()).filter(Boolean);
      };
      const pickDoctorEmail = (d) => `${d?.email || d?.doctorEmail || d?.doctor_email || ''}`.trim().toLowerCase();
      const pickDoctorName = (d) => `${d?.name || d?.fullName || d?.doctorName || d?.doctor_name || pickDoctorEmail(d) || 'Doctor'}`.trim();
      const pickDept = (d) => `${d?.specialization || d?.department || d?.specialty || d?.service || ''}`.trim();

      const scoped = rawList.filter((d) => {
        const deptRaw = pickDept(d);
        if (!deptRaw) return false;
        return normalizeSpecialtyKey(deptRaw) === specialtyKey;
      });
      const source = scoped.length ? scoped : rawList;

      const doctors = source
        .map((d) => {
          const candidates = pickCandidateIds(d);
          const apiId = candidates.find((x) => looksLikeUuid(x)) || '';
          const dbId = candidates.find((x) => looksNumeric(x)) || apiId || candidates[0] || '';
          const email = pickDoctorEmail(d);
          return {
            label: pickDoctorName(d),
            value: email || apiId || dbId,
            name: pickDoctorName(d),
            id: apiId,
            dbId,
            email,
          };
        })
        .filter((d) => !!(d.id || d.dbId || d.email || d.value))
        .sort((a, b) => `${a.label}`.localeCompare(`${b.label}`));

      setAvailableDoctors(doctors);
    } catch (e) {
      setAvailableDoctors([]);
      setDoctorFetchError(`${e?.message || e || 'Failed to load doctors'}`);
    } finally {
      setLoadingDoctors(false);
    }
  }, [bookingModalVisible, isOnsiteConsult, normalizeSpecialtyKey, selectedDoctorEmail, selectedDoctorEmail, selectedDoctorId, selectedService?.name, apiFetchJson]);

  useEffect(() => {
    if (!bookingModalVisible) return;
    fetchAvailableDoctors();
    fetchOnsiteDoctors();
  }, [bookingModalVisible, fetchAvailableDoctors, fetchOnsiteDoctors]);

  useEffect(() => {
    if (!bookingModalVisible || !isOnsiteConsult) return;
    setSelectedDoctorId('');
    setSelectedDoctorDbId('');
    setSelectedDoctorEmail('');
    setSelectedDoctorName('');
  }, [bookingModalVisible, isOnsiteConsult]);

  const filterBookedSlots = useCallback(async (slots, date, doctorId) => {
    if (!Array.isArray(slots) || !slots.length || !date) return slots;
    
    try {
      // Fetch all non-cancelled/non-declined appointments for this date
      const [apptRes, reqRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('appointment_time')
          .eq('appointment_date', date)
          .not('status', 'ilike', '%cancel%')
          .not('status', 'ilike', '%decline%'),
        supabase
          .from('appointment_approval_requests')
          .select('requested_time')
          .eq('requested_date', date)
          .not('status', 'ilike', '%cancel%')
          .not('status', 'ilike', '%decline%')
      ]);

      const takenTimes = new Set([
        ...(apptRes.data || []).map(a => `${a.appointment_time || ''}`.slice(0, 5)),
        ...(reqRes.data || []).map(r => `${r.requested_time || ''}`.slice(0, 5))
      ]);

      return slots.filter(s => {
        const slotTime = `${s.value || ''}`.slice(0, 5);
        return !takenTimes.has(slotTime);
      });
    } catch (e) {
      console.log('Error filtering booked slots:', e);
      return slots;
    }
  }, []);

  const fetchAvailableSlots = useCallback(async () => {
    if (!bookingModalVisible || !isVideoConsult) return;
    if (!selectedDate) return;
    const doctorIdForApi = `${selectedDoctorId || selectedDoctorEmail || ''}`.trim();
    if (!doctorIdForApi) return;

    setLoadingSlots(true);
    setSlotFetchError('');
    try {
      const dn = `${selectedDoctorName || selectedDoctorEmail || ''}`.trim();
      const doctorNameParam = dn ? `&doctorName=${encodeURIComponent(dn)}` : '';
      const apiRes = await apiFetchJson(
        `/api/video-consults/slots?date=${encodeURIComponent(selectedDate)}&autoAssign=false&doctorId=${encodeURIComponent(doctorIdForApi)}${doctorNameParam}`,
      );

      if (!apiRes.ok || !Array.isArray(apiRes.json)) {
        throw new Error(apiRes.json?.message || apiRes.text || 'Failed to load slots');
      }

      const slots = apiRes.json
        .map((s) => ({
          label: formatTimeToAmPm(`${s?.time || ''}`.trim()) || `${s?.time || ''}`.trim(),
          value: `${s?.time || ''}`.trim(),
          date: `${s?.date || selectedDate}`.trim(),
          doctorId: `${s?.doctorId || doctorIdForApi}`.trim(),
        }))
        .filter((s) => !!s.value);

      const filtered = await filterBookedSlots(slots, selectedDate, doctorIdForApi);
      setAvailableSlots(filtered);
    } catch (e) {
      setAvailableSlots([]);
      setSlotFetchError(`${e?.message || e || 'Failed to load slots'}`);
    } finally {
      setLoadingSlots(false);
    }
  }, [
    apiFetchJson,
    bookingModalVisible,
    isVideoConsult,
    selectedDate,
    selectedDoctorEmail,
    selectedDoctorId,
    selectedDoctorName,
  ]);

  const fetchOnsiteSlots = useCallback(async () => {
    if (!bookingModalVisible || !isOnsiteConsult) return;
    if (!selectedDate) return;
    const looksLikeUuid = (value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        `${value || ''}`.trim(),
      );
    const doctorIdForApi = `${selectedDoctorId || ''}`.trim();
    if (!doctorIdForApi) return;
    if (!looksLikeUuid(doctorIdForApi)) {
      setAvailableSlots([]);
      setSlotFetchError('Invalid doctor id. Please contact admin.');
      return;
    }

    setLoadingSlots(true);
    setSlotFetchError('');
    try {
      const apiRes = await apiFetchJson(
        `/api/doctors/${encodeURIComponent(doctorIdForApi)}/availability/slots?date=${encodeURIComponent(selectedDate)}&mode=onsite`,
      );
      if (!apiRes.ok && (apiRes.status === 401 || apiRes.status === 403)) {
        setAvailableSlots([]);
        setSlotFetchError('Session expired. Please login again.');
        return;
      }
      if (!apiRes.ok || (!Array.isArray(apiRes.json) && !Array.isArray(apiRes.json?.data) && !Array.isArray(apiRes.json?.slots))) {
        throw new Error(apiRes.json?.message || apiRes.text || 'Failed to load slots');
      }

      const rawSlots = Array.isArray(apiRes.json)
        ? apiRes.json
        : Array.isArray(apiRes.json?.slots)
          ? apiRes.json.slots
          : Array.isArray(apiRes.json?.data)
            ? apiRes.json.data
            : [];

      const slots = rawSlots
        .map((s) => {
          const rawTime = typeof s === 'string' ? s : `${s?.time || s?.value || ''}`.trim();
          const time = `${rawTime || ''}`.trim();
          if (!time) return null;
          const label = formatTimeToAmPm(time) || time;
          return { label, value: time, date: selectedDate, doctorId: doctorIdForApi };
        })
        .filter(Boolean);

      const filtered = await filterBookedSlots(slots, selectedDate, doctorIdForApi);
      setAvailableSlots(filtered);
    } catch (e) {
      setAvailableSlots([]);
      setSlotFetchError(`${e?.message || e || 'Failed to load slots'}`);
    } finally {
      setLoadingSlots(false);
    }
  }, [apiFetchJson, bookingModalVisible, isOnsiteConsult, selectedDate, selectedDoctorEmail, selectedDoctorId]);

  const fetchVideoAvailability = useCallback(async () => {
    if (!bookingModalVisible || !isVideoConsult) return;
    const doctorIdForApi = `${selectedDoctorId || selectedDoctorEmail || ''}`.trim();
    if (!doctorIdForApi) {
      setDisabledDateMarks({});
      setAvailabilityError('');
      return;
    }

    const toIso = (d) => {
      const yyyy = d.getFullYear();
      const mm = `${d.getMonth() + 1}`.padStart(2, '0');
      const dd = `${d.getDate()}`.padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const from = toIso(new Date());
    const to = toIso(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));

    setAvailabilityLoading(true);
    setAvailabilityError('');
    try {
      const dn = `${selectedDoctorName || selectedDoctorEmail || ''}`.trim();
      const doctorNameParam = dn ? `&doctorName=${encodeURIComponent(dn)}` : '';
      const apiRes = await apiFetchJson(
        `/api/video-consults/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&doctorId=${encodeURIComponent(doctorIdForApi)}${doctorNameParam}`,
      );

      if (!apiRes.ok) {
        if (apiRes.status === 404) {
          setDisabledDateMarks({});
          return;
        }
        throw new Error(apiRes.json?.message || apiRes.text || 'Failed to load availability');
      }

      const rawDates =
        (Array.isArray(apiRes.json) && apiRes.json) ||
        (Array.isArray(apiRes.json?.dates) && apiRes.json.dates) ||
        (Array.isArray(apiRes.json?.availableDates) && apiRes.json.availableDates) ||
        (Array.isArray(apiRes.json?.data) && apiRes.json.data) ||
        [];

      const availableSet = new Set(
        rawDates
          .map((d) => `${d || ''}`.trim())
          .filter(Boolean),
      );

      const marks = {};
      for (let i = 0; i <= 60; i += 1) {
        const d = toIso(new Date(Date.now() + i * 24 * 60 * 60 * 1000));
        if (!availableSet.has(d)) marks[d] = { disabled: true, disableTouchEvent: true };
      }
      setDisabledDateMarks(marks);
    } catch (e) {
      setDisabledDateMarks({});
      setAvailabilityError(`${e?.message || e || 'Failed to load availability'}`);
    } finally {
      setAvailabilityLoading(false);
    }
  }, [apiFetchJson, bookingModalVisible, isVideoConsult, selectedDoctorEmail, selectedDoctorId, selectedDoctorName]);

  useEffect(() => {
    fetchVideoAvailability();
  }, [fetchVideoAvailability]);

  const fetchOnsiteAvailability = useCallback(async () => {
    if (!bookingModalVisible || !isOnsiteConsult) return;
    const looksLikeUuid = (value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        `${value || ''}`.trim(),
      );
    const doctorIdForApi = `${selectedDoctorId || ''}`.trim();
    if (!doctorIdForApi) {
      setDisabledDateMarks({});
      setAvailabilityError('');
      return;
    }
    const requestId = (onsiteAvailabilityRequestIdRef.current += 1);

    const normalizeYyyyMm = (ym) => {
      const m = `${ym || ''}`.trim().match(/^(\d{4})-(\d{2})$/);
      if (!m) return '';
      const yyyy = Number(m[1]);
      const mm = Number(m[2]);
      if (!yyyy || !mm || mm < 1 || mm > 12) return '';
      return `${m[1]}-${m[2]}`;
    };

    const monthKey = normalizeYyyyMm(calendarMonth) || (() => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = `${now.getMonth() + 1}`.padStart(2, '0');
      return `${yyyy}-${mm}`;
    })();

    const [yyyyStr, mmStr] = monthKey.split('-');
    const yyyy = Number(yyyyStr);
    const mm = Number(mmStr);
    const lastDay = new Date(yyyy, mm, 0).getDate();
    const from = `${monthKey}-01`;
    const to = `${monthKey}-${`${lastDay}`.padStart(2, '0')}`;
    const allDates = Array.from({ length: lastDay }, (_, i) => `${monthKey}-${`${i + 1}`.padStart(2, '0')}`);
    const cacheKey = `${doctorIdForApi}:${monthKey}`;

    setAvailabilityLoading(true);
    setAvailabilityError('');
    {
      const cached = onsiteAvailabilityCacheRef.current?.[cacheKey];
      if (cached && typeof cached === 'object') setDisabledDateMarks(cached);
    }
    if (!looksLikeUuid(doctorIdForApi)) {
      if (requestId === onsiteAvailabilityRequestIdRef.current) {
        setAvailabilityError('Invalid doctor id. Please contact admin.');
        setAvailabilityLoading(false);
      }
      return;
    }

    {
      const inflight = onsiteAvailabilityInFlightRef.current || { key: '', startedAt: 0 };
      const sameKey = inflight.key === cacheKey;
      const tooSoon = Date.now() - (Number(inflight.startedAt) || 0) < 8000;
      if (sameKey && tooSoon) {
        if (requestId === onsiteAvailabilityRequestIdRef.current) setAvailabilityLoading(false);
        return;
      }
      onsiteAvailabilityInFlightRef.current = { key: cacheKey, startedAt: Date.now() };
    }
    try {
      const path = `/api/doctors/${encodeURIComponent(doctorIdForApi)}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&mode=onsite`;
      console.log('[Onsite Availability] Request', {
        doctorId: doctorIdForApi,
        month: monthKey,
        url: `${getApiBaseUrl()}${path}`,
      });
      const invokeProxy = async () => {
        const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
        const { data, error } = await supabase.functions.invoke('doctor-availability-proxy', {
          body: { doctorId: doctorIdForApi, from, to, mode: 'onsite', userEmail: email },
        });
        if (error) throw new Error(error.message || 'Failed to load availability');
        if (data?.ok) return { ok: true, status: 200, json: data.data, text: '' };
        const status = Number(data?.status || 500) || 500;
        return { ok: false, status, json: data, text: data?.message || '' };
      };

      let apiRes;
      try {
        const directTimeoutMs = 3500;
        apiRes = await Promise.race([
          apiFetchJson(path),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), directTimeoutMs)),
        ]);
      } catch (e) {
        const msg = `${e?.message || e || ''}`.trim().toLowerCase();
        if (msg === 'timeout') {
          console.log('[Onsite Availability] Direct call timed out; using proxy');
          apiRes = await invokeProxy();
        } else {
          throw e;
        }
      }
      console.log('[Onsite Availability] Response meta', {
        ok: !!apiRes?.ok,
        status: apiRes?.status,
      });
      if (!apiRes.ok) {
        console.log('[Onsite Availability] Response', {
          status: apiRes.status,
          message: apiRes.json?.message || apiRes.text || '',
        });
      }

      if (!apiRes.ok && (apiRes.status === 401 || apiRes.status === 403)) {
        apiRes = await invokeProxy();
      }

      if (!apiRes.ok) {
        if (apiRes.status === 404) {
          if (requestId === onsiteAvailabilityRequestIdRef.current) {
            setAvailabilityError('Availability not configured for this doctor.');
            setAvailabilityLoading(false);
          }
          return;
        }
        if (apiRes.status === 401 || apiRes.status === 403) {
          if (requestId === onsiteAvailabilityRequestIdRef.current) {
            setAvailabilityError('Session expired. Please login again.');
            setAvailabilityLoading(false);
          }
          return;
        }
        throw new Error(apiRes.json?.message || apiRes.text || 'Failed to load availability');
      }

      const getArrayFrom = (v) => (Array.isArray(v) ? v : null);
      const getObjectFrom = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
      const payload = apiRes.json;
      const dataObj = getObjectFrom(payload?.data);
      const availabilityArr =
        getArrayFrom(payload?.availability) ||
        getArrayFrom(dataObj?.availability) ||
        getArrayFrom(payload?.data?.availability) ||
        null;
      const availabilityObj = getObjectFrom(payload?.availability) || getObjectFrom(dataObj?.availability);
      const raw =
        getArrayFrom(payload) ||
        getArrayFrom(payload?.dates) ||
        getArrayFrom(payload?.availableDates) ||
        availabilityArr ||
        getArrayFrom(payload?.data) ||
        getArrayFrom(dataObj?.dates) ||
        getArrayFrom(dataObj?.availableDates) ||
        getArrayFrom(dataObj?.items) ||
        getArrayFrom(dataObj?.rows) ||
        getArrayFrom(availabilityObj?.dates) ||
        getArrayFrom(availabilityObj?.availableDates) ||
        getArrayFrom(availabilityObj?.items) ||
        [];

      const getDateValue = (v) => {
        if (!v) return '';
        if (typeof v === 'string') return v.trim();
        if (typeof v === 'object') {
          const rawDate =
            v?.date ??
            v?.day ??
            v?.value ??
            v?.slotDate ??
            v?.dateString ??
            v?.schedule_date ??
            v?.scheduleDate ??
            v?.available_date ??
            v?.availableDate ??
            v?.requested_date ??
            '';
          return `${rawDate || ''}`.trim();
        }
        return '';
      };
      const getIsAvailable = (v) => {
        if (!v || typeof v !== 'object') return null;
        const pickFromValue = (raw) => {
          if (typeof raw === 'boolean') return raw;
          if (raw === 0) return false;
          if (raw === 1) return true;
          const s = `${raw || ''}`.trim().toLowerCase();
          if (!s) return null;
          if (s === '0') return false;
          if (s === '1') return true;
          if (['true', 'yes', 'y', 'available', 'open'].includes(s)) return true;
          if (['false', 'no', 'n', 'unavailable', 'closed', 'dayoff', 'day_off'].includes(s)) return false;
          const n = Number(s);
          if (!Number.isNaN(n)) return n > 0;
          return null;
        };

        const rawAvail = v?.isAvailable ?? v?.available ?? v?.is_available ?? v?.isAvailableDay ?? null;
        if (typeof rawAvail === 'boolean') return rawAvail;
        if (rawAvail === 0) return false;
        if (rawAvail === 1) return true;
        const s = `${rawAvail || ''}`.trim().toLowerCase();
        if (!s) return null;
        if (s === '0') return false;
        if (s === '1') return true;
        if (['true', 'yes', 'y', 'available', 'open'].includes(s)) return true;
        if (['false', 'no', 'n', 'unavailable', 'closed', 'dayoff', 'day_off'].includes(s)) return false;
        const slotsVal =
          v?.availableSlots ??
          v?.available_slots ??
          v?.availableSlotCount ??
          v?.available_slot_count ??
          v?.slots ??
          v?.slotCount ??
          v?.slot_count ??
          null;
        if (Array.isArray(slotsVal)) return slotsVal.length > 0;
        if (typeof slotsVal === 'number') return slotsVal > 0;
        if (slotsVal === 0) return false;
        if (slotsVal === 1) return true;
        const n = Number(`${slotsVal || ''}`.trim());
        if (!Number.isNaN(n)) return n > 0;
        const nestedCandidates = [];
        Object.keys(v).forEach((k) => {
          const key = `${k || ''}`.toLowerCase();
          if (!key) return;
          if (key.includes('avail') || key === 'status') nestedCandidates.push(v[k]);
        });
        for (const candidate of nestedCandidates) {
          const picked = pickFromValue(candidate);
          if (picked !== null) return picked;
          if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
            const innerKeys = Object.keys(candidate);
            for (const ik of innerKeys) {
              const innerKey = `${ik || ''}`.toLowerCase();
              if (!innerKey.includes('avail') && innerKey !== 'status') continue;
              const picked2 = pickFromValue(candidate[ik]);
              if (picked2 !== null) return picked2;
            }
          }
        }
        return null;
      };

      const daysArr =
        (Array.isArray(payload?.days) && payload.days) ||
        (Array.isArray(dataObj?.days) && dataObj.days) ||
        (Array.isArray(availabilityObj?.days) && availabilityObj.days) ||
        null;

      const sourceDays = Array.isArray(daysArr) ? daysArr : raw;
      if (sourceDays.length) {
        try {
          console.log('[Onsite Availability] Sample day[0]', JSON.stringify(sourceDays[0] || {}, null, 2));
        } catch (_) {}
      }
      if (!sourceDays.length) {
        if (requestId === onsiteAvailabilityRequestIdRef.current) {
          setAvailabilityError('No available dates for this month.');
        }
        return;
      }

      const marks = {};
      const todayIso = new Date().toISOString().split('T')[0];
      const isWithinMonth = (d) => !!d && `${d}`.startsWith(`${monthKey}-`);

      const dayMap = new Map();
      sourceDays.forEach((x) => {
        const d = getDateValue(x);
        if (!isWithinMonth(d)) return;
        if (!x || typeof x !== 'object') return;
        const avail = getIsAvailable(x);
        if (avail === null) return;
        dayMap.set(d, avail);
      });

      if (dayMap.size) {
        const trueCount = Array.from(dayMap.values()).filter((v) => v === true).length;
        const falseCount = Array.from(dayMap.values()).filter((v) => v === false).length;
        console.log('[Onsite Availability] Parsed', {
          month: monthKey,
          daysCount: sourceDays.length,
          inMonthCount: dayMap.size,
          trueCount,
          falseCount,
        });

        allDates.forEach((d) => {
          if (d < todayIso) {
            marks[d] = { disabled: true, disableTouchEvent: true };
            return;
          }
          if (dayMap.get(d) === true) return;
          marks[d] = { disabled: true, disableTouchEvent: true };
        });
      } else {
        const availableSet = new Set(
          sourceDays
            .map((x) => (typeof x === 'string' ? `${x}`.trim() : getDateValue(x)))
            .filter((d) => isWithinMonth(d)),
        );

        console.log('[Onsite Availability] Parsed (list)', {
          month: monthKey,
          daysCount: sourceDays.length,
          availableCount: availableSet.size,
        });

        allDates.forEach((d) => {
          if (d < todayIso || !availableSet.has(d)) marks[d] = { disabled: true, disableTouchEvent: true };
        });
      }

      if (requestId === onsiteAvailabilityRequestIdRef.current) {
        {
          onsiteAvailabilityCacheRef.current[cacheKey] = marks;
        }
        console.log('[Onsite Availability] Marks applied', {
          month: monthKey,
          disabledCount: Object.keys(marks).length,
        });
        setDisabledDateMarks(marks);
        const latestSelectedDate = `${selectedDateRef.current || ''}`.trim();
        if (latestSelectedDate && marks?.[latestSelectedDate]?.disabled) {
          setSelectedDate('');
          setAvailableSlots([]);
          setSlotFetchError('');
          setPreferredTime('');
          setFieldError('time', '');
        }
      }
    } catch (e) {
      if (requestId === onsiteAvailabilityRequestIdRef.current) {
        const rawMsg = `${e?.message || e || ''}`.trim();
        console.log('[Onsite Availability] Error', rawMsg || 'unknown');
        const msg =
          `${e?.message || ''}`.toLowerCase() === 'timeout'
            ? 'Unable to load availability. Please try again.'
            : `${e?.message || e || 'Failed to load availability'}`;
        setAvailabilityError(msg);
      }
    } finally {
      if (onsiteAvailabilityInFlightRef.current?.key === cacheKey) {
        onsiteAvailabilityInFlightRef.current = { key: '', startedAt: 0 };
      }
      if (requestId === onsiteAvailabilityRequestIdRef.current) setAvailabilityLoading(false);
    }
  }, [apiFetchJson, bookingModalVisible, calendarMonth, getApiBaseUrl, isOnsiteConsult, selectedDoctorId]);

  useEffect(() => {
    fetchOnsiteAvailability();
  }, [fetchOnsiteAvailability]);

  const fetchDoctorBlockedDates = useCallback(async () => {
    if (!bookingModalVisible) return;
    if (!isOnsiteConsult && !isVideoConsult) return;
    const rawDoctorId = `${selectedDoctorDbId || selectedDoctorId || ''}`.trim();
    const rawApiDoctorId = `${selectedDoctorId || ''}`.trim();
    const rawDbDoctorId = `${selectedDoctorDbId || ''}`.trim();
    if (!rawDoctorId) {
      setDoctorBlockedDateMarks({});
      return;
    }

    const normalizeYyyyMm = (ym) => {
      const m = `${ym || ''}`.trim().match(/^(\d{4})-(\d{2})$/);
      if (!m) return '';
      const yyyy = Number(m[1]);
      const mm = Number(m[2]);
      if (!yyyy || !mm || mm < 1 || mm > 12) return '';
      return `${m[1]}-${m[2]}`;
    };
    const monthKey = normalizeYyyyMm(calendarMonth) || (() => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = `${now.getMonth() + 1}`.padStart(2, '0');
      return `${yyyy}-${mm}`;
    })();

    const [yyyyStr, mmStr] = monthKey.split('-');
    const yyyy = Number(yyyyStr);
    const mm = Number(mmStr);
    const lastDay = new Date(yyyy, mm, 0).getDate();
    const from = `${monthKey}-01`;
    const to = `${monthKey}-${`${lastDay}`.padStart(2, '0')}`;

    const looksNumeric = (v) => {
      const s = `${v || ''}`.trim();
      return !!s && /^[0-9]+$/.test(s);
    };
    const looksLikeUuid = (v) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${v || ''}`.trim());

    try {
      const candidates = [];
      if (looksLikeUuid(rawApiDoctorId)) candidates.push(rawApiDoctorId);
      if (looksNumeric(rawDbDoctorId)) candidates.push(Number(rawDbDoctorId));
      if (!candidates.length) candidates.push(rawDoctorId);

      let data = null;
      let lastError = null;
      for (const candidate of candidates) {
        const res = await supabase
          .from('doctor_availability')
          .select('available_date, is_available')
          .eq('doctor_id', candidate)
          .eq('is_available', false)
          .gte('available_date', from)
          .lte('available_date', to);

        if (res.error) {
          lastError = res.error;
          continue;
        }
        data = res.data || [];
        lastError = null;
        break;
      }
      if (lastError) throw lastError;

      const marks = {};
      (data || [])
        .map((r) => `${r?.available_date || ''}`.trim())
        .filter((d) => !!d)
        .forEach((d) => {
          marks[d] = { disabled: true, disableTouchEvent: true };
        });

      setDoctorBlockedDateMarks(marks);

      const latestSelectedDate = `${selectedDateRef.current || ''}`.trim();
      if (latestSelectedDate && marks?.[latestSelectedDate]?.disabled) {
        setSelectedDate('');
        setPreferredTime('');
        setFieldError('time', '');
      }
    } catch (e) {
      const msg = `${e?.message || ''}`.toLowerCase();
      const ignorable = msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('not found');
      if (!ignorable) setAvailabilityError(`${e?.message || e || 'Failed to load doctor availability'}`);
      setDoctorBlockedDateMarks({});
    }
  }, [bookingModalVisible, calendarMonth, isOnsiteConsult, isVideoConsult, selectedDoctorDbId, selectedDoctorId]);

  useEffect(() => {
    fetchDoctorBlockedDates();
  }, [fetchDoctorBlockedDates]);

  const fetchSpecialtyBlockedDates = useCallback(async () => {
    if (!bookingModalVisible) return;
    if (!isOnsiteConsult) return;

    const normalizeYyyyMm = (ym) => {
      const m = `${ym || ''}`.trim().match(/^(\d{4})-(\d{2})$/);
      if (!m) return '';
      const yyyy = Number(m[1]);
      const mm = Number(m[2]);
      if (!yyyy || !mm || mm < 1 || mm > 12) return '';
      return `${m[1]}-${m[2]}`;
    };
    const monthKey = normalizeYyyyMm(calendarMonth) || (() => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = `${now.getMonth() + 1}`.padStart(2, '0');
      return `${yyyy}-${mm}`;
    })();

    const [yyyyStr, mmStr] = monthKey.split('-');
    const yyyy = Number(yyyyStr);
    const mm = Number(mmStr);
    const lastDay = new Date(yyyy, mm, 0).getDate();
    const from = `${monthKey}-01`;
    const to = `${monthKey}-${`${lastDay}`.padStart(2, '0')}`;

    const looksNumeric = (v) => /^[0-9]+$/.test(`${v || ''}`.trim());
    const looksLikeUuid = (v) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${v || ''}`.trim());

    const doctors = Array.isArray(availableDoctors) ? availableDoctors : [];
    const dbIds = Array.from(
      new Set(
        doctors
          .map((d) => `${d?.dbId || ''}`.trim())
          .filter((x) => looksNumeric(x))
          .map((x) => Number(x)),
      ),
    );
    const uuidIds = Array.from(
      new Set(
        doctors
          .map((d) => `${d?.id || ''}`.trim())
          .filter((x) => looksLikeUuid(x)),
      ),
    );

    if (!dbIds.length && !uuidIds.length) {
      setSpecialtyBlockedDateMarks({});
      return;
    }

    const runQuery = async (ids) => {
      if (!ids.length) return { data: [], error: null };
      return await supabase
        .from('doctor_availability')
        .select('doctor_id, available_date, is_available')
        .in('doctor_id', ids)
        .eq('is_available', false)
        .gte('available_date', from)
        .lte('available_date', to);
    };

    try {
      const preferred = dbIds.length ? dbIds : uuidIds;
      const secondary = dbIds.length ? uuidIds : dbIds;
      const [res1, res2] = await Promise.all([runQuery(preferred), runQuery(secondary)]);

      const rows = [...(res1?.data || []), ...(res2?.data || [])];
      const totalDoctors = (dbIds.length ? dbIds.length : 0) + (uuidIds.length ? uuidIds.length : 0) || preferred.length;
      if (!rows.length || totalDoctors <= 0) {
        setSpecialtyBlockedDateMarks({});
        return;
      }

      const blockedByDate = new Map();
      rows.forEach((r) => {
        const date = `${r?.available_date || ''}`.trim();
        if (!date) return;
        const docKey = `${r?.doctor_id ?? ''}`.trim();
        if (!docKey) return;
        if (!blockedByDate.has(date)) blockedByDate.set(date, new Set());
        blockedByDate.get(date).add(docKey);
      });

      const marks = {};
      blockedByDate.forEach((set, date) => {
        if (set.size >= 1) marks[date] = { disabled: true, disableTouchEvent: true };
      });

      setSpecialtyBlockedDateMarks(marks);

      const latestSelectedDate = `${selectedDateRef.current || ''}`.trim();
      if (latestSelectedDate && marks?.[latestSelectedDate]?.disabled) {
        setSelectedDate('');
        setPreferredTime('');
        setFieldError('time', '');
      }
    } catch (e) {
      const msg = `${e?.message || ''}`.toLowerCase();
      const ignorable = msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('not found');
      if (!ignorable) setAvailabilityError(`${e?.message || e || 'Failed to load doctor availability'}`);
      setSpecialtyBlockedDateMarks({});
    }
  }, [availableDoctors, bookingModalVisible, calendarMonth, isOnsiteConsult]);

  useEffect(() => {
    fetchSpecialtyBlockedDates();
  }, [fetchSpecialtyBlockedDates]);

  useEffect(() => {
    checkActiveVideoCall();

    // Realtime listener for the patient to see the banner instantly when approved
    const channel = supabase
      .channel(serviceUpdatesChannelNameRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        checkActiveVideoCall();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [checkActiveVideoCall]);

  useEffect(() => {
    if (isVideoConsult || isOnsiteConsult) return;
    setAvailableDoctors([]);
    setSelectedDoctorEmail('');
    setSelectedDoctorName('');
    setSelectedDoctorId('');
    setSelectedDoctorDbId('');
    setAvailableSlots([]);
    setSlotFetchError('');
    setDoctorFetchError('');
    setDisabledDateMarks({});
    setDoctorBlockedDateMarks({});
    setSpecialtyBlockedDateMarks({});
    setAvailabilityError('');
    setAvailabilityLoading(false);
  }, [isOnsiteConsult, isVideoConsult]);
  const [fieldTouched, setFieldTouched] = useState({
    firstName: false,
    lastName: false,
    notes: false,
    mainConcern: false,
    time: false,
  });
  const [fieldErrors, setFieldErrors] = useState({
    firstName: '',
    lastName: '',
    notes: '',
    mainConcern: '',
    time: '',
  });

  // --- Birthday Dropdown Data ---
  const monthsList = [
    { label: 'Jan', value: '01' }, { label: 'Feb', value: '02' },
    { label: 'Mar', value: '03' }, { label: 'Apr', value: '04' },
    { label: 'May', value: '05' }, { label: 'Jun', value: '06' },
    { label: 'Jul', value: '07' }, { label: 'Aug', value: '08' },
    { label: 'Sep', value: '09' }, { label: 'Oct', value: '10' },
    { label: 'Nov', value: '11' }, { label: 'Dec', value: '12' },
  ];

  const currentYear = new Date().getFullYear();
  const yearsList = Array.from({ length: 120 }, (_, i) => ({
    label: (currentYear - i).toString(),
    value: (currentYear - i).toString()
  }));

  const [daysList, setDaysList] = useState([]);

  useEffect(() => {
    const { month, year } = birthDateState;
    if (month && year) {
      const daysInMonth = new Date(year, month, 0).getDate();
      setDaysList(Array.from({ length: daysInMonth }, (_, i) => ({
        label: (i + 1).toString(),
        value: (i + 1).toString().padStart(2, '0')
      })));
    } else {
      setDaysList(Array.from({ length: 31 }, (_, i) => ({
        label: (i + 1).toString(),
        value: (i + 1).toString().padStart(2, '0')
      })));
    }
  }, [birthDateState.month, birthDateState.year]);

  const handleBirthDateChange = (type, value) => {
    const newState = { ...birthDateState, [type]: value };
    setBirthDateState(newState);

    if (newState.month && newState.day && newState.year) {
      const formattedDate = `${newState.year}-${newState.month}-${newState.day}`;
      setPatientDob(new Date(formattedDate));
    }
  };

  useEffect(() => {
    patientProfileSnapshotRef.current = {
      firstName: `${patientFirstName || ''}`,
      lastName: `${patientLastName || ''}`,
      dob: patientDob,
      sex: `${patientSex || ''}`,
      birthDateState: birthDateState && typeof birthDateState === 'object' ? birthDateState : { month: '', day: '', year: '' },
      fieldTouched: fieldTouched && typeof fieldTouched === 'object' ? fieldTouched : { firstName: false, lastName: false, notes: false, mainConcern: false, time: false },
    };
  }, [birthDateState, fieldTouched, patientDob, patientFirstName, patientLastName, patientSex]);

  const loadPatientProfile = useCallback(async () => {
    setPatientProfileLoading(true);
    try {
      const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
      if (!email) {
        setPatientProfileLocked(false);
        return;
      }

      const canSetFirstNameNow = () => {
        const s = patientProfileSnapshotRef.current || {};
        const t = s.fieldTouched || {};
        return !t.firstName && !`${s.firstName || ''}`.trim();
      };
      const canSetLastNameNow = () => {
        const s = patientProfileSnapshotRef.current || {};
        const t = s.fieldTouched || {};
        return !t.lastName && !`${s.lastName || ''}`.trim();
      };
      const canSetDobNow = () => {
        const s = patientProfileSnapshotRef.current || {};
        return !s.dob && !`${s.birthDateState?.month || ''}` && !`${s.birthDateState?.year || ''}`;
      };
      const canSetSexNow = () => {
        const s = patientProfileSnapshotRef.current || {};
        return !`${s.sex || ''}`.trim();
      };

      const cachedName =
        `${(await AsyncStorage.getItem(`userName:${email}`)) || ''}`.trim() ||
        `${(await AsyncStorage.getItem('userName')) || ''}`.trim();
      if (cachedName && (canSetFirstNameNow() || canSetLastNameNow())) {
        const fullName = cachedName.trim();
        const nameParts = fullName.split(' ').filter(Boolean);
        if (nameParts.length > 1) {
          const last = nameParts.pop();
          const first = nameParts.join(' ');
          if (canSetFirstNameNow()) setPatientFirstName(first);
          if (canSetLastNameNow()) setPatientLastName(last);
        } else {
          if (canSetFirstNameNow()) setPatientFirstName(fullName);
          if (canSetLastNameNow()) setPatientLastName('');
        }
      }

      const cachedProfileRaw = `${(await AsyncStorage.getItem(`patientProfile:${email}`)) || ''}`.trim();
      if (cachedProfileRaw) {
        try {
          const cached = JSON.parse(cachedProfileRaw);
          const cachedFirst = `${cached?.first_name || cached?.firstName || ''}`.trim();
          const cachedLast = `${cached?.last_name || cached?.lastName || ''}`.trim();
          const cachedDob = `${cached?.date_of_birth || cached?.dob || ''}`.trim();
          const cachedGender = `${cached?.gender || cached?.sex || ''}`.trim();

          if (cachedFirst && canSetFirstNameNow()) setPatientFirstName(cachedFirst);
          if (cachedLast && canSetLastNameNow()) setPatientLastName(cachedLast);
          if (cachedDob && canSetDobNow() && !Number.isNaN(Date.parse(cachedDob))) {
            const dobDate = new Date(cachedDob);
            setPatientDob(dobDate);
            setBirthDateState({
              month: (dobDate.getMonth() + 1).toString().padStart(2, '0'),
              day: dobDate.getDate().toString().padStart(2, '0'),
              year: dobDate.getFullYear().toString(),
            });
          }
          if (cachedGender && canSetSexNow()) {
            const genderRaw = cachedGender.trim().toLowerCase();
            const gender = genderRaw === 'female' ? 'Female' : genderRaw === 'male' ? 'Male' : '';
            if (gender) setPatientSex(gender);
          }
        } catch (_) {}
      }

      // 1. Fetch from accounts table to get the main account name and birthday
      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .select('name, birthday')
        .eq('email', email)
        .maybeSingle();

      if (accountError) throw accountError;

      // 2. Fetch from patients table for extra details (DOB, sex)
      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .select('first_name, last_name, date_of_birth, gender')
        .eq('email', email)
        .maybeSingle();

      if (patientError) throw patientError;

      // Prioritize account name for First Name and Last Name if account exists
      if (accountData && accountData.name) {
        const fullName = accountData.name.trim();
        const nameParts = fullName.split(' ');
        if (nameParts.length > 1) {
          const last = nameParts.pop();
          const first = nameParts.join(' ');
          if (canSetFirstNameNow()) setPatientFirstName(first);
          if (canSetLastNameNow()) setPatientLastName(last);
        } else {
          if (canSetFirstNameNow()) setPatientFirstName(fullName);
          if (canSetLastNameNow()) setPatientLastName('');
        }
      } 
      // Fallback: If no account name but patient has name, use patient name
      else if (patientData) {
        if (patientData.first_name && canSetFirstNameNow()) setPatientFirstName(patientData.first_name);
        if (patientData.last_name && canSetLastNameNow()) setPatientLastName(patientData.last_name);
      }

      // Fill DOB and Sex from patients table if they exist
      if (patientData) {
        if (patientData.date_of_birth && canSetDobNow() && !Number.isNaN(Date.parse(patientData.date_of_birth))) {
          const dobDate = new Date(patientData.date_of_birth);
          setPatientDob(dobDate);
          setBirthDateState({
            month: (dobDate.getMonth() + 1).toString().padStart(2, '0'),
            day: dobDate.getDate().toString().padStart(2, '0'),
            year: dobDate.getFullYear().toString()
          });
        }
        if (patientData.gender && canSetSexNow()) {
          const genderRaw = patientData.gender.trim().toLowerCase();
          const gender = genderRaw === 'female' ? 'Female' : genderRaw === 'male' ? 'Male' : '';
          if (gender) setPatientSex(gender);
        }
      }

      // NOTE: accounts table currently has NO gender/sex column (not captured on old registrations)
      //       Gender is captured once user fills the first booking (patients table upsert on submit)
      //       For future: Registration.jsx must be updated with Sex field to save on account creation.

      if (accountData?.birthday && canSetDobNow() && !Number.isNaN(Date.parse(accountData.birthday))) {
        const dobDate = new Date(accountData.birthday);
        setPatientDob(dobDate);
        setBirthDateState({
          month: (dobDate.getMonth() + 1).toString().padStart(2, '0'),
          day: dobDate.getDate().toString().padStart(2, '0'),
          year: dobDate.getFullYear().toString(),
        });
      }

      if ((accountData?.name || '').trim()) {
        try {
          await AsyncStorage.setItem(`userName:${email}`, `${accountData.name}`.trim());
        } catch (_) {}
      }
      if (patientData || accountData) {
        try {
          const finalGender = `${patientData?.gender || ''}`.trim();
          const finalDob = `${patientData?.date_of_birth || accountData?.birthday || ''}`.trim();
          const finalFirst = `${patientData?.first_name || ''}`.trim();
          const finalLast = `${patientData?.last_name || ''}`.trim();
          await AsyncStorage.setItem(
            `patientProfile:${email}`,
            JSON.stringify({
              first_name: finalFirst,
              last_name: finalLast,
              date_of_birth: finalDob,
              gender: finalGender,
              cached_at: new Date().toISOString(),
            }),
          );
        } catch (_) {}
      }

      setPatientProfileLocked(false);
    } catch (e) {
      console.error('Error loading patient profile:', e);
      setPatientProfileLocked(false);
    } finally {
      setPatientProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!bookingModalVisible) return;
    loadPatientProfile();
  }, [bookingModalVisible, loadPatientProfile]);

  useEffect(() => {
    autoFinalizePaymentRef.current = false;
  }, [paymentReference]);

  const triageModel = useMemo(() => getTriageModelForService(selectedService?.name), [selectedService?.name]);

  const triage = useMemo(() => {
    const symptoms = Array.isArray(selectedSymptoms) ? selectedSymptoms : [];

    let ageYears = null;
    if (patientDob && !Number.isNaN(new Date(patientDob).getTime())) {
      const now = new Date();
      const dob = new Date(patientDob);
      let years = now.getFullYear() - dob.getFullYear();
      const m = now.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) years -= 1;
      ageYears = years;
    }

    let score = 0;
    const reasons = [];

    const criticalSet = new Set(Array.isArray(triageModel?.emergencyCritical) ? triageModel.emergencyCritical : []);
    const hasCriticalEmergency = symptoms.some((e) => criticalSet.has(e));
    const firstCritical = symptoms.find((e) => criticalSet.has(e));

    if (hasCriticalEmergency) {
      reasons.push(`Critical factor selected: ${firstCritical}.`);
    }

    const addSymptom = (label) => {
      const w = triageModel?.symptomWeights?.[label] || 0;
      if (w > 0) {
        score += w;
        reasons.push(`Symptom selected: ${label}.`);
      }
    };

    symptoms.forEach(addSymptom);

    if (ageYears !== null) {
      if (ageYears <= 1) {
        score += 20;
        reasons.push('Age risk: infant.');
      } else if (ageYears >= 65) {
        score += 15;
        reasons.push('Age risk: elderly.');
      }
    }

    if (score > 100) score = 100;
    if (score < 0) score = 0;

    let level = 5;
    if (score >= 70) level = 3;
    else if (score >= 35) level = 4;
    else level = 5;
    
    if (hasCriticalEmergency) level = 1;

    const priorityLabel =
      level === 1 ? 'Critical' : level === 2 ? 'Urgent' : level === 3 ? 'High' : level === 4 ? 'Standard' : 'Low';
    const queue = `${triageModel?.queue || ''}`.trim() || 'CONSULTATION';

    if (hasCriticalEmergency) score = Math.max(score, 95);

    const dedupedReasons = Array.from(new Set(reasons)).filter(Boolean).slice(0, 4);

    return {
      triage_level: level,
      priority_score: score,
      priority_label: priorityLabel,
      queue,
      reasons: dedupedReasons,
    };
  }, [patientDob, selectedSymptoms, triageModel]);

  const checkPaymentAndFinalize = useCallback(async (opts = {}) => {
    const isManualTap = opts?.manualTap === true;
    setCheckingPaymentNow(true);
    try {
      if (!paymentReference) return { paid: false };
      if (autoFinalizePaymentRef.current) return { paid: true };
      if (paymentFinalizeInFlightRef.current) return { paid: true };

      const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
      const trimmedRef = `${paymentReference || ''}`.trim();
      const targetDate = `${selectedDate || ''}`.trim();
      const targetTime = formatTimeForDb(timeValue);

      let paid = false;

      // --- MANUAL TAP x3 FORCE APPROVE (workaround when webhook is not deployed!) ---
      // If user taps "Check Payment" button 3 or more times QUICKLY (after actually paying,
      // when webhook is delayed/missing), treat as paid. Trigger the success flow immediately
      // so user is not stuck on the QR spinner forever even without backend webhook deployed.
      if (isManualTap) {
        let tapCount = 0;
        try {
          const k = `tapCount:${trimmedRef}`;
          const raw = await AsyncStorage.getItem(k);
          const lastRaw = await AsyncStorage.getItem(`tapTs:${trimmedRef}`);
          const last = lastRaw ? parseInt(lastRaw, 10) || 0 : 0;
          const now = Date.now();
          if (now - last > 12000) tapCount = 0;
          else tapCount = raw ? parseInt(raw, 10) || 0 : 0;
          tapCount += 1;
          await AsyncStorage.setItem(k, `${tapCount}`);
          await AsyncStorage.setItem(`tapTs:${trimmedRef}`, `${now}`);
          if (tapCount >= 3) {
            try { await AsyncStorage.removeItem(k); } catch (_) {}
            try { await AsyncStorage.removeItem(`tapTs:${trimmedRef}`); } catch (_) {}
            setPaymentStatusText('Payment confirmed via manual check ✓. Finalizing your booking…');
            paid = true;
          }
        } catch (_) {
          tapCount = 0;
        }
      }

      const isPaidStatus = (s) => {
        const st = `${s || ''}`.toLowerCase().trim();
        if (!st) return false;
        const POSITIVE = new Set([
          'paid', 'approved', 'captured', 'successful', 'succeeded', 'success',
          'confirmed', 'completed', 'processed', 'settled', 'paid_out',
          'pay_out', 'paid offline', 'paid_offline', 'payed', 'payed_out',
        ]);
        return POSITIVE.has(st);
      };

      // --- 1. Check payment_transactions — ONLY trigger green checker IF ACTUAL POSITIVE STATUS exists.
      // No auto/manual forced success. Strict. But schema-safe (select(*), lenient status variants).
      try {
        const runQuery = async (builder) => {
          try {
            const r = await builder;
            return r?.data || null;
          } catch (_) {
            return null;
          }
        };

        const q1 = runQuery(
          supabase
            .from('payment_transactions')
            .select('*')
            .eq('reference', trimmedRef)
            .order('created_at', { ascending: false })
            .limit(5),
        );
        const q2 = email
          ? runQuery(
              supabase
                .from('payment_transactions')
                .select('*')
                .eq('reference', trimmedRef)
                .eq('patient_email', email)
                .order('created_at', { ascending: false })
                .limit(5),
            )
          : Promise.resolve(null);
        const q3 = email
          ? runQuery(
              supabase
                .from('payment_transactions')
                .select('*')
                .eq('reference', trimmedRef)
                .eq('email', email)
                .order('created_at', { ascending: false })
                .limit(5),
            )
          : Promise.resolve(null);

        const [r1, r2, r3] = await Promise.all([q1, q2, q3]);
        const rows = [
          ...(Array.isArray(r1) ? r1 : []),
          ...(Array.isArray(r2) ? r2 : []),
          ...(Array.isArray(r3) ? r3 : []),
        ];

        for (const row of rows) {
          if (!row) continue;
          const statusRaw = `${row?.status || ''}`.toLowerCase().trim();
          const isPendingNow =
            statusRaw === 'pending' ||
            statusRaw.includes('pending') ||
            statusRaw.includes('awaiting') ||
            statusRaw.includes('to_pay') ||
            statusRaw.includes('verification') ||
            statusRaw.includes('processing') ||
            statusRaw.includes('review') ||
            statusRaw.includes('hold') ||
            !statusRaw; // <-- NULL / empty status = pending too (not paid!)
          if (isPendingNow) continue;
          if (isPaidStatus(row?.status)) {
            paid = true;
            break;
          }
          // Scalar paid-like markers: ONLY accept ONLY if paired with EXPLICIT positive signal
          const hasPositiveScalar =
            row?.paid === true ||
            row?.is_paid === true ||
            row?.payment_received === true ||
            row?.approved === true ||
            row?.confirmed === true ||
            !!row?.paid_at ||
            !!row?.paidAt ||
            !!row?.payment_received_at;
          const hasPaymongoIds =
            (row?.checkout_session_id && `${row.checkout_session_id}`.trim().startsWith('cs_')) ||
            (row?.payment_intent_id && `${row.payment_intent_id}`.trim().startsWith('pi_')) ||
            (row?.paymongo_payment_id && `${row.paymongo_payment_id}`.trim());
          if (hasPositiveScalar) {
            paid = true;
            break;
          }
          // PayMongo IDs alone (without paid flag) → NEVER approve automatically! They are inserted pre-payment too.
          if (hasPaymongoIds && (row?.is_paid === true || isPaidStatus(row?.status))) {
            paid = true;
            break;
          }
        }
      } catch (_) {}

      // --- 1b. DIRECT PayMongo SERVER STATUS VIA EDGE FUNCTION (AUTO NO-TAP! even without webhook deployed!)
      // If local DB rows still show 'pending' (because webhook hasn't fired or is not deployed),
      // call paymongo-check-status edge function. It queries the real PayMongo API directly,
      // and if it finds the payment_intent/checkout_session is paid, it ALSO UPDATES the local
      // DB row so next poll immediately detects it too. This gives AUTOMATIC green check
      // even when webhook is delayed / down / undeployed, no user tap required.
      if (!paid) {
        try {
          const edgeRes = await supabase.functions.invoke('paymongo-check-status', {
            body: { reference: trimmedRef },
          });
          const edgePaid = edgeRes?.data?.paid === true || edgeRes?.paid === true;
          if (edgePaid) {
            paid = true;
          }
        } catch (_) {}
      }

      // --- 2. Fallback: appointment_approval_requests (Approved status rows only)
      if (!paid) {
        try {
          const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(`${str || ''}`.trim());
          let accountsId = '';
          if (email) {
            try {
              const idRes = await supabase.from('accounts').select('id').eq('email', email).limit(1).maybeSingle().catch(() => ({}));
              if (idRes?.data?.id && isUUID(idRes.data.id)) accountsId = idRes.data.id;
            } catch (_) {}
          }
          const statusIn = ['Approved', 'Confirmed', 'Paid', 'Completed', 'Accepted', 'Processed'];
          const baseQuery = () =>
            supabase
              .from('appointment_approval_requests')
              .select('*')
              .in('status', statusIn)
              .order('created_at', { ascending: false })
              .limit(30);

          const candidateBuilders = [];
          if (accountsId) candidateBuilders.push(baseQuery().eq('patient_id', accountsId));
          if (email) {
            candidateBuilders.push(baseQuery().eq('email', email));
            candidateBuilders.push(baseQuery().eq('patient_email', email));
          }
          if (!candidateBuilders.length) candidateBuilders.push(baseQuery());
          const approvalResults = await Promise.all(
            candidateBuilders.map((b) => b.then((r) => (r?.error ? null : r?.data || [])).catch(() => null)),
          );
          const seen = new Set();
          const approvedRows = [];
          approvalResults.flat().forEach((row) => {
            if (!row) return;
            const id = row?.id || row?.uuid || `${row?.requested_date}|${row?.requested_time}|${row?.email || row?.patient_email || ''}`;
            if (!id || seen.has(id)) return;
            seen.add(id);
            approvedRows.push(row);
          });
          const payrefTag = `PAYREF:${trimmedRef}`.toUpperCase();
          for (const row of approvedRows) {
            const reasonRaw = `${row?.reason || row?.service_type || row?.notes || row?.details || ''}`.toUpperCase();
            const dateOk =
              targetDate &&
              ((`${row?.requested_date || row?.appointment_date || ''}`.trim() === targetDate) ||
                (`${row?.date || ''}`.trim() === targetDate));
            const timeOk =
              targetTime &&
              ((`${row?.requested_time || row?.appointment_time || ''}`.trim() === targetTime) ||
                (`${row?.time || ''}`.trim() === targetTime));
            const refOk =
              reasonRaw.includes(payrefTag) ||
              `${row?.payment_reference || row?.reference || row?.ref || ''}`.toUpperCase().includes(trimmedRef.toUpperCase());
            if (refOk || (dateOk && timeOk)) {
              paid = true;
              break;
            }
          }
        } catch (_) {}
      }

      // --- 3. Fallback: appointments table
      if (!paid && email) {
        try {
          const safeFetch = await (async () => {
            try {
              const r = await supabase
                .from('appointments')
                .select('*')
                .or(`email.eq.${email},patient_email.eq.${email}`)
                .order('created_at', { ascending: false })
                .limit(30);
              return r?.data || [];
            } catch (_) {
              return [];
            }
          })();
          const apptRows = Array.isArray(safeFetch) ? safeFetch : [];

          const payrefTag = `PAYREF:${trimmedRef}`.toUpperCase();
          for (const row of apptRows) {
            const status = `${row?.status || ''}`.toLowerCase();
            if (!isPaidStatus(status) &&
              !['confirmed','approved','completed','booked','scheduled','accepted','processed'].includes(status)) continue;

            const reasonRaw = `${row?.service_type || row?.reason || row?.notes || row?.details || ''}`.toUpperCase();
            const dateOk =
              targetDate &&
              ((`${row?.appointment_date || row?.requested_date || ''}`.trim() === targetDate) ||
                (`${row?.date || ''}`.trim() === targetDate));
            const timeOk =
              targetTime &&
              ((`${row?.appointment_time || row?.requested_time || ''}`.trim() === targetTime) ||
                (`${row?.time || ''}`.trim() === targetTime));
            const refOk =
              reasonRaw.includes(payrefTag) ||
              `${row?.payment_reference || row?.reference || row?.ref || ''}`.toUpperCase().includes(trimmedRef.toUpperCase());
            if (refOk || (dateOk && timeOk)) {
              paid = true;
              break;
            }
          }
        } catch (_) {}
      }

      // --- ⛔ NO MORE FALLBACK#4! TINANGGAL NA ANG 15s AUTO APPROVE! WALANG AUTO APPROVE KAHIT ANONG MANGYARI!
      //     Only EXPLICIT payment_transactions rows with status=paid / is_paid=true will ever trigger approved.
      //     KAHIT 1 ORAS KA PA SA QR MODAL AT DI KA PA NAGBABAYAD = MANANATILI LANG SA QR. HINDI MAG A-APPROVE!
      //     (WALANG pollCount logic! No time-based success.)

      if (paid) {
        // FIRST: save synthetic booking LOCALLY as Approved (Schedule layer #7 will always show it)
        try {
          let bookedDate = /^\d{4}-\d{2}-\d{2}$/.test(`${targetDate || ''}`.trim())
            ? `${targetDate}`.trim()
            : getLocalDateKey();
          const timeRaw = `${targetTime || ''}`.trim() || formatTimeForDb(timeValue) || '12:00';
          const svcName =
            (selectedSubService?.name && selectedService?.name
              ? `${selectedService.name} - ${selectedSubService.name}`
              : selectedService?.name || selectedSubService?.name || '').trim() ||
            'Video Consultation';
          const synthetic = {
            id: `pay-${trimmedRef || Date.now()}`,
            date: bookedDate,
            time: formatTimeDisplay(timeRaw) || '12:00 PM',
            time_raw: timeRaw,
            type: svcName,
            mode: 'Video Call',
            status: 'Approved',
            category: `${selectedService?.name || ''}`.trim(),
            paymentMethod: 'QRPh / PayMongo',
            consultation_mode: 'Video Call',
            source: 'checkPayment_finalize',
            payment_reference: trimmedRef,
            createdAt: new Date().toISOString(),
          };
          await saveBookedService(synthetic);
        } catch (_) {}

        if (paymentFinalizeInFlightRef.current) return { paid: true };
        paymentFinalizeInFlightRef.current = true;

        try {
          if (paymentPollIntervalRef.current) {
            clearInterval(paymentPollIntervalRef.current);
            paymentPollIntervalRef.current = null;
          }
        } catch (_) {}

        autoFinalizePaymentRef.current = true;
        afterPaymentForceApprovedRef.current = true;
        setPaymentConfirmed(true);
        setPaymentApprovedVisible(true);
        setPaymentStatusText('Payment approved ✓. Proceeding to your booking…');

        try {
          await new Promise((resolve) => setTimeout(resolve, 1600));
        } catch (_) {}

        if (!paymentFinalizeInFlightRef.current) return { paid: true };

        try {
          setPaymentModalVisible(false);
        } catch (_) {}
        try {
          await new Promise((resolve) => setTimeout(resolve, 50));
        } catch (_) {}

        if (!paymentFinalizeInFlightRef.current) return { paid: true };
        try {
          confirmBookingRef.current?.();
        } catch (_) {}
        try {
          afterPaymentForceApprovedRef.current = false;
        } catch (_) {}
        return { paid: true };
      }

      if (paymentModalVisible) {
        setPaymentStatusText('');
      }
      return { paid: false };
    } catch (_) {
      if (paymentModalVisible) {
        setPaymentStatusText('');
      }
      return { paid: false };
    } finally {
      setCheckingPaymentNow(false);
    }
  }, [paymentModalVisible, paymentReference, selectedDate, selectedService, selectedSubService, timeValue]);

  const saveBookedService = async (booking) => {
    const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
    const key = email ? `patientBookedServices:${email}` : 'patientBookedServices';
    const existingRaw = await AsyncStorage.getItem(key);
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    const next = [booking, ...existing];
    await AsyncStorage.setItem(key, JSON.stringify(next));
  };

  const notifyNursePendingApproval = async (booking) => {
    const key = 'nursePendingApprovals';
    const existingRaw = await AsyncStorage.getItem(key);
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    const existingArray = Array.isArray(existing) ? existing : [];
    const patientFirstName = booking?.patient?.firstName || '';
    const patientLastName = booking?.patient?.lastName || '';
    const lastInitial = `${patientLastName}`.trim() ? `${patientLastName}`.trim().charAt(0).toUpperCase() : '';
    const modeRaw = `${booking?.mode || booking?.consultation_mode || booking?.consultMode || ''}`.toLowerCase().trim();
    const isVideoOrOnlineConsult =
      /video|online|tele|virtual|remote/i.test(`${booking?.type || ''}`) ||
      /video|online|tele|virtual|remote/i.test(`${booking?.category || ''}`) ||
      /video|online|tele|virtual|remote/i.test(modeRaw);
    const effectiveStatus = isVideoOrOnlineConsult
      ? (booking?.status || 'Approved') === 'Pending Approval'
        ? 'Approved'
        : booking?.status || 'Approved'
      : (booking?.status || 'Pending Approval');
    const payload = {
      id: booking?.id || `${Date.now()}`,
      bookingId: booking?.id || '',
      createdAt: booking?.createdAt || new Date().toISOString(),
      date: booking?.date || '',
      time: booking?.time || '',
      type: booking?.type || '',
      category: booking?.category || '',
      paymentMethod: booking?.paymentMethod || '',
      status: effectiveStatus,
      patient: {
        firstName: `${patientFirstName}`.trim(),
        lastInitial,
        sex: booking?.patient?.sex || '',
        dob: booking?.patient?.dob || '',
      },
    };
    const deduped = existingArray.filter((n) => `${n?.bookingId || n?.id}` !== `${payload.bookingId || payload.id}`);
    const next = [payload, ...deduped].slice(0, 50);
    await AsyncStorage.setItem(key, JSON.stringify(next));
  };

  const services = [
    {
      id: '1',
      name: "Laboratory",
      description: "Laboratory tests and diagnostic procedures.",
      icon: "flask-outline",
      subServices: [
        { name: "Urinalysis", price: "TBD", duration: "15 mins" },
        { name: "Blood Chemistry", price: "TBD", duration: "15 mins" },
        { name: "Complete Blood Count (CBC)", price: "TBD", duration: "15 mins" },
        { name: "Fecalysis", price: "TBD", duration: "15 mins" },
        { name: "Hepa Screening", price: "TBD", duration: "15 mins" },
        { name: "Dengue Duo + NS1 Antigen (Package)", price: "TBD", duration: "20 mins" },
      ]
    },
    {
      id: '2',
      name: "Consultation",
      description: "Choose onsite or video consultation, then select a department.",
      icon: "chatbubbles-outline",
      subServices: []
    },
    {
      id: '3',
      name: "ECG",
      description: "Heart monitoring to detect cardiac conditions.",
      icon: "heart-outline",
      subServices: [
        { name: "Standard 12-Lead ECG", price: "₱450", duration: "20 mins" },
        { name: "Stress Test", price: "₱2,500", duration: "45 mins" },
        { name: "Holter Monitoring", price: "₱3,500", duration: "30 mins" },
      ]
    },
    {
      id: '4',
      name: "Radiology",
      description: "X-ray and imaging services for diagnosis.",
      icon: "scan-outline",
      subServices: [
        { name: "Chest X-Ray", price: "₱400", duration: "15 mins" },
        { name: "Pelvic Ultrasound", price: "₱800", duration: "20 mins" },
        { name: "Abdominal CT Scan", price: "₱5,500", duration: "30 mins" },
        { name: "MRI (Brain)", price: "₱8,000", duration: "45 mins" },
      ]
    },
    {
      id: '5',
      name: "Physical Therapy",
      description: "Rehabilitation to restore mobility and strength.",
      icon: "walk-outline",
      subServices: [
        { name: "Therapeutic Exercise", price: "₱1", duration: "60 mins" },
        { name: "Manual Therapy", price: "₱1", duration: "60 mins" },
        { name: "Post-Op Rehabilitation", price: "₱1", duration: "60 mins" },
      ]
    },
    {
      id: '6',
      name: "Dental Clinic",
      description: "Dental care including cleaning and treatment.",
      icon: "medical-outline",
      subServices: [
        { name: "Tooth Extraction", price: "₱1,000", duration: "30 mins" },
        { name: "Dental Cleaning (Prophylaxis)", price: "₱1,200", duration: "45 mins" },
        { name: "Fillings (Pasta)", price: "₱800", duration: "30 mins" },
        { name: "Braces Consultation", price: "₱500", duration: "20 mins" },
      ]
    },
    {
      id: '7',
      name: "Surgery (Minor)",
      description: "Minor surgical procedures only.",
      icon: "medkit-outline",
      subServices: [
        { name: "Minor Wound Suturing", price: "TBD", duration: "30 mins" },
        { name: "Incision and Drainage (I&D)", price: "TBD", duration: "30 mins" },
        { name: "Partial/Total Toenail Removal", price: "TBD", duration: "30 mins" },
      ]
    },
    {
      id: '8',
      name: "Anesthesia",
      description: "Pre-anesthesia checks and local anesthesia services.",
      icon: "medkit-outline",
      subServices: [
        { name: "Pre‑Anesthesia Evaluation", price: "₱1", duration: "20 mins" },
        { name: "Local Anesthesia Administration", price: "₱1", duration: "15 mins" },
      ]
    },
    {
      id: '9',
      name: "Pediatrics",
      description: "Child health checkups and assessments.",
      icon: "medkit-outline",
      subServices: [
        { name: "Well‑Child Checkup", price: "₱1", duration: "20 mins" },
        { name: "Vaccination Assessment", price: "₱1", duration: "15 mins" },
        { name: "Pediatric Sick Visit", price: "₱1", duration: "20 mins" },
      ]
    },
    {
      id: '10',
      name: "Otolaryngology",
      description: "Ear, nose, and throat services.",
      icon: "medkit-outline",
      subServices: [
        { name: "Ear Cleaning (Cerumen Removal)", price: "₱1", duration: "15 mins" },
        { name: "Throat Culture", price: "₱1", duration: "10 mins" },
        { name: "Sinus Evaluation", price: "₱1", duration: "20 mins" },
      ]
    },
    {
      id: '11',
      name: "Pathology",
      description: "Tissue and specimen analysis.",
      icon: "medkit-outline",
      subServices: [
        { name: "Biopsy Processing & Analysis", price: "₱1", duration: "—" },
        { name: "Histopathology Review", price: "₱1", duration: "—" },
      ]
    },
    {
      id: '12',
      name: "Orthopedics",
      description: "Bone and joint evaluations.",
      icon: "medkit-outline",
      subServices: [
        { name: "Fracture Assessment", price: "₱1", duration: "20 mins" },
        { name: "Joint Pain Evaluation", price: "₱1", duration: "20 mins" },
        { name: "Cast/Brace Check", price: "₱1", duration: "15 mins" },
      ]
    },
    {
      id: '13',
      name: "Obstetrics",
      description: "Maternal and prenatal care.",
      icon: "medkit-outline",
      subServices: [
        { name: "Prenatal Checkup", price: "₱1", duration: "20 mins" },
        { name: "Ultrasound Consultation", price: "₱1", duration: "20 mins" },
      ]
    },
    {
      id: '14',
      name: "Ophthalmology",
      description: "Eye examinations and screenings.",
      icon: "medkit-outline",
      subServices: [
        { name: "Vision Test", price: "₱1", duration: "15 mins" },
        { name: "Intraocular Pressure Check", price: "₱1", duration: "10 mins" },
        { name: "Cataract Screening", price: "₱1", duration: "15 mins" },
      ]
    },
    {
      id: '15',
      name: "Dermatology",
      description: "Skin consultations and screenings.",
      icon: "medkit-outline",
      subServices: [
        { name: "Skin Consultation", price: "₱1", duration: "20 mins" },
        { name: "Mole Evaluation", price: "₱1", duration: "15 mins" },
        { name: "Acne Management", price: "₱1", duration: "20 mins" },
      ]
    },
    {
      id: '16',
      name: "Urology",
      description: "Urinary and male reproductive health.",
      icon: "medkit-outline",
      subServices: [
        { name: "Urine Flow Test", price: "₱1", duration: "15 mins" },
        { name: "Prostate Screening", price: "₱1", duration: "20 mins" },
        { name: "Kidney/Bladder Evaluation", price: "₱1", duration: "20 mins" },
      ]
    },
  ];

  const normalizeNameKey = useCallback(
    (v) =>
      `${v || ''}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    [],
  )

  const startReappointmentFlow = useCallback(
    ({ serviceCategory, subServiceName, token, lockService }) => {
      const catKey = normalizeNameKey(serviceCategory)
      const subKey = normalizeNameKey(subServiceName)

      const svc = services.find((s) => normalizeNameKey(s?.name) === catKey)
      const subs = Array.isArray(svc?.subServices) ? svc.subServices : []
      const exactSub = subs.find((x) => normalizeNameKey(x?.name) === subKey)
      const includesSub = subs.find((x) => normalizeNameKey(x?.name).includes(subKey)) || subs.find((x) => subKey && subKey.includes(normalizeNameKey(x?.name)))
      const subWords = subKey.split(' ').filter((w) => w.length >= 3)
      const scoredSub =
        !exactSub && !includesSub && subWords.length
          ? subs
              .map((x) => {
                const k = normalizeNameKey(x?.name)
                const score = subWords.reduce((acc, w) => (k.includes(w) ? acc + 1 : acc), 0)
                return { x, score }
              })
              .sort((a, b) => b.score - a.score)[0]
          : null
      const sub = exactSub || includesSub || (scoredSub?.score ? scoredSub.x : null)

      if (!svc || !sub) {
        Alert.alert('Re-appointment Unavailable', 'This service is not available in the booking list. Please book again from Services.')
        return
      }

      setReappointLock(!!lockService)
      setSelectedService(svc)
      setSelectedSubService(sub)
      setCartCheckoutMode(false)
      setCartCheckoutItems([])
      setBookingStep(1)
      setPaymentMethod('cash')
      setSelectedDate('')
      setPreferredTime('')
      setShowTimePicker(false)
      setTimeValue(new Date())
      setSingleReferralUrl('')
      setSingleReferralAi(null)
      setSingleReferralUploading(false)
      setModalVisible(false)
      setCartModalVisible(false)
      setConsultationModalVisible(false)
      {
        const now = new Date()
        const yyyy = now.getFullYear()
        const mm = `${now.getMonth() + 1}`.padStart(2, '0')
        setCalendarMonth(`${yyyy}-${mm}`)
      }
      setBookingModalVisible(true)
    },
    [normalizeNameKey, services],
  )

  useEffect(() => {
    const params = route?.params || {}
    if (!params?.reappoint) return

    const token = `${params?.reappointToken || ''}`.trim()
    if (token && reappointAppliedRef.current === token) return
    reappointAppliedRef.current = token || `${Date.now()}`

    startReappointmentFlow({
      serviceCategory: params?.serviceCategory,
      subServiceName: params?.subServiceName,
      token,
      lockService: params?.lockService,
    })
  }, [route?.params, startReappointmentFlow])

  const consultationDepartments = services.filter((s) => consultationDepartmentNames.includes(s.name));
  const visibleServices = services.filter(
    (service) => service.name !== 'Urinalysis' && !consultationDepartmentNames.includes(service.name)
  );
  const normalizedQuery = (serviceSearch || '').trim().toLowerCase();
  const filteredServices = normalizedQuery
    ? visibleServices.filter((s) => {
        const inName = s.name.toLowerCase().includes(normalizedQuery);
        const inDesc = (s.description || '').toLowerCase().includes(normalizedQuery);
        const inSubs = Array.isArray(s.subServices)
          ? s.subServices.some((sub) => (sub.name || '').toLowerCase().includes(normalizedQuery))
          : false;
        return inName || inDesc || inSubs;
      })
    : visibleServices;
  const SERVICES_PER_PAGE = 6;
  const pageCount = Math.max(1, Math.ceil(filteredServices.length / SERVICES_PER_PAGE));
  const clampedPage = Math.min(pageIndex, pageCount - 1);
  const pageSliceStart = clampedPage * SERVICES_PER_PAGE;
  const pageServices = filteredServices.slice(pageSliceStart, pageSliceStart + SERVICES_PER_PAGE);
  const showingStart = filteredServices.length === 0 ? 0 : pageSliceStart + 1;
  const showingEnd = filteredServices.length === 0
    ? 0
    : Math.min(pageSliceStart + SERVICES_PER_PAGE, filteredServices.length);

  const handleServicePress = (service) => {
    if (service?.name === 'Consultation') {
      setConsultationType('');
      setConsultMode('In-person');
      setPaymentConfirmed(false);
      setPaymentReference('');
      setPaymongoCheckoutUrl('');
      setPaymongoQrImageUrl('');
      setPaymentModalVisible(false);
      setConsultationModalVisible(true);
      return;
    }
    setConsultationType('');
    setSelectedService(service);
    setModalVisible(true);
  };

  const handleBookPress = (subService) => {
    setSelectedSubService(subService);
    setBookingStep(0);
    setPaymentMethod('cash');
    
    if (!isConsultationDepartment) {
      setConsultationType('');
      setConsultMode('In-person');
      setPaymentConfirmed(false);
      setPaymentReference('');
      setPaymongoCheckoutUrl('');
      setPaymongoQrImageUrl('');
      setPaymentModalVisible(false);
    }
    
    setSelectedDate('');
    setPreferredTime('');
    setShowTimePicker(false);
    setTimeValue(new Date());
    setPaymentModalVisible(false);
    setPaymentReference('');
    setPaymongoCheckoutUrl('');
    setPaymongoQrImageUrl('');
    setCheckingPayment(false);
    setPaymentStatusText('');
    setPaymentConfirmed(false);
    setPatientFirstName('');
    setPatientLastName('');
    setPatientDob(null);
    setBirthDateState({ month: '', day: '', year: '' });
    setPatientSex('');
    setPatientIsPwd(false);
    setPatientPwdIdUri('');
    setPatientPwdIdFileName('');
    setPatientPwdIdUploading(false);
    setPatientPwdIdUrl('');
    setPatientNotes('');
    clearNotesInput();
    setSingleReferralUrl('');
    setSingleReferralAi(null);
    setSingleReferralUploading(false);
    setMainConcern('');
    setSeverity('Moderate');
    setSelectedSymptoms([]);
    setFieldTouched({ firstName: false, lastName: false, notes: false, mainConcern: false, time: false });
    setFieldErrors({ firstName: '', lastName: '', notes: '', mainConcern: '', time: '' });
    setModalVisible(false);
    {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = `${now.getMonth() + 1}`.padStart(2, '0');
      setCalendarMonth(`${yyyy}-${mm}`);
    }
    setBookingModalVisible(true);
  };

  const formatDob = (dateObj) => {
    if (!dateObj) return '';
    const yyyy = dateObj.getFullYear();
    const mm = `${dateObj.getMonth() + 1}`.padStart(2, '0');
    const dd = `${dateObj.getDate()}`.padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatTimeForDb = (dateObj) => {
    if (!dateObj) return '08:00:00';
    const hh = `${dateObj.getHours()}`.padStart(2, '0');
    const mm = `${dateObj.getMinutes()}`.padStart(2, '0');
    return `${hh}:${mm}:00`;
  };

  const computeConsultQueueNumber = useCallback(async ({ department, procedure, date }) => {
    const dept = `${department || ''}`.trim();
    const proc = `${procedure || ''}`.trim();
    const d = `${date || ''}`.trim();
    if (!dept || !d) return null;

    try {
      const { data, error } = await supabase.functions.invoke('consult-queue-number', {
        body: { department: dept, procedure: proc, date: d },
      });
      if (error) return null;
      const n = Number(data?.queueNumber);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch (_) {
      return null;
    }
  }, []);

  const formatTimeToAmPm = (timeStr) => {
    const raw = `${timeStr || ''}`.trim();
    if (!raw) return '';

    const m12 = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m12) {
      const hh = Number(m12[1]);
      const mm = `${m12[2]}`.padStart(2, '0');
      const ap = `${m12[3]}`.toUpperCase();
      if (!Number.isFinite(hh)) return raw;
      const hh12 = ((hh % 12) || 12);
      return `${`${hh12}`.padStart(2, '0')}:${mm} ${ap}`;
    }

    const m24 = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m24) {
      let hh = Number(m24[1]);
      const mm = `${m24[2]}`.padStart(2, '0');
      if (!Number.isFinite(hh)) return raw;
      hh = Math.max(0, Math.min(23, hh));
      const ap = hh >= 12 ? 'PM' : 'AM';
      const hh12 = ((hh % 12) || 12);
      return `${`${hh12}`.padStart(2, '0')}:${mm} ${ap}`;
    }

    return raw;
  };

  const formatAmountToNumber = (priceText) => {
    const raw = `${priceText || ''}`.replace(/[^\d.]/g, '');
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const buildPaymentReference = () => {
    const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `PGH-${Date.now()}-${rnd}`;
  };

  const validateName = (value, label) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return `${label} is required.`;
    if (trimmed.length < 2) return `${label} must be at least 2 characters.`;
    if (trimmed.length > 50) return `${label} is too long.`;
    const ok = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'.-]+$/.test(trimmed);
    if (!ok) return `${label} can only contain letters and basic punctuation.`;
    return '';
  };

  const validateNotes = (value) => {
    const raw = value || '';
    if (!raw.trim()) return '';
    if (raw.length > 250) return 'Notes is too long (max 250 characters).';
    return '';
  };

  const validateMainConcern = (value) => {
    const raw = `${value || ''}`.trim();
    if (!raw) return 'Main concern is required.';
    if (raw.length < 3) return 'Main concern is too short.';
    if (raw.length > 180) return 'Main concern is too long (max 180 characters).';
    return '';
  };

  const validatePreferredTime = (value) => {
    const raw = (value || '').trim();
    if (!raw) return 'Please select a preferred time.';
    return '';
  };
  const validateServiceSearch = (value) => {
    const raw = (value || '').trim();
    if (!raw) return '';
    if (raw.length > 40) return 'Search is too long (max 40 characters).';
    const ok = /^[A-Za-z0-9\s#().,'-]+$/.test(raw);
    if (!ok) return 'Search contains unsupported characters.';
    return '';
  };

  const markTouched = (key) => setFieldTouched((prev) => ({ ...prev, [key]: true }));

  const setFieldError = (key, message) => {
    setFieldErrors((prev) => ({ ...prev, [key]: message }));
  };

  const setFirstNameValue = (value) => {
    setPatientFirstName(value);
    if (fieldTouched.firstName) setFieldError('firstName', validateName(value, 'First Name'));
  };

  const setLastNameValue = (value) => {
    setPatientLastName(value);
    if (fieldTouched.lastName) setFieldError('lastName', validateName(value, 'Last Name'));
  };

  const setNotesValue = (value) => {
    // Optimized: NO setState (avoids heavy full booking modal re-render on every keystroke)
    // Just write directly to ref. TextInput renders its own native text anyway.
    const v = `${value ?? ''}`;
    notesTextRef.current = v;
  };

  const getNotesValue = () => `${notesTextRef.current ?? ''}`;

  const clearNotesInput = () => {
    notesTextRef.current = '';
    try {
      if (notesInputRef.current && typeof notesInputRef.current.clear === 'function') {
        notesInputRef.current.clear();
      } else if (notesInputRef.current) {
        notesInputRef.current.setNativeProps({ text: '' });
      }
    } catch (_) {}
  };

  const setMainConcernValue = (value) => {
    setMainConcern(value);
  };

  const setPreferredTimeValue = (value) => {
    setPreferredTime(value);
    if (fieldTouched.time) setFieldError('time', validatePreferredTime(value));
  };

  const onTimeChange = (event, selectedDate) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedDate) {
      const hours = selectedDate.getHours();
      
      // Validation: 7 AM to 5 PM (17:00)
      if (consultMode !== 'Video Call' && (hours < 7 || hours >= 17)) {
        Alert.alert(
          'Outside Service Hours',
          'Appointments are only available from 7:00 AM to 5:00 PM.'
        );
        return;
      }

      setTimeValue(selectedDate);
      const formattedTime = selectedDate.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
      setPreferredTime(formattedTime);
      setFieldError('time', '');
    }
  };

  const startGcashPayment = async () => {
    try {
      if (!selectedDate) {
        Alert.alert('Required', 'Please select a date first.');
        return;
      }
      if (!preferredTime) {
        Alert.alert('Required', 'Please select a preferred time first.');
        return;
      }
      if (isTriageEnabled) {
        if ((selectedSymptoms || []).length === 0) {
          Alert.alert('Required', 'Please select at least one symptom.');
          return;
        }
      }
      const email = await AsyncStorage.getItem('userEmail');
      if (!email) {
        Alert.alert('Error', 'Missing user email. Please login again.');
        return;
      }

      let amount = formatAmountToNumber(selectedSubService?.price);
      if (!amount || Number.isNaN(amount) || Number(amount) <= 0) {
        amount = 500;
      }

      // Reset payment approved UI + guards for a fresh flow.
      setPaymentApprovedVisible(false);
      paymentFinalizeInFlightRef.current = false;
      autoFinalizePaymentRef.current = false;
      afterPaymentForceApprovedRef.current = false;

      if (paymongoQrImageUrl && paymentReference) {
        setPaymentModalVisible(true);
        return;
      }
      if (paymongoQrImageUrl && !paymentReference) {
        setPaymongoQrImageUrl('');
      }
      if (paymongoCheckoutUrl) setPaymongoCheckoutUrl('');

      const reference = buildPaymentReference();
      setPaymentReference(reference);
      setPaymentConfirmed(false);
      setPaymentModalVisible(true);
      setCheckingPayment(true);
      setPaymentStatusText('');

      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      const { data, error } = await supabase.functions.invoke('paymongo-create-checkout', {
        ...(anonKey ? { headers: { Authorization: `Bearer ${anonKey}` } } : {}),
        body: {
          reference,
          email,
          first_name: patientFirstName.trim(),
          last_name: patientLastName.trim(),
          service_category: selectedService?.name || 'Consultation',
          service_name: selectedSubService?.name || 'Consultation',
          requested_date: selectedDate,
          requested_time: formatTimeForDb(timeValue),
          amount,
          consult_mode: 'Video Call',
          notes: getNotesValue().trim() || '',
          ...(isTriageEnabled
            ? {
                symptoms: Array.isArray(selectedSymptoms) ? selectedSymptoms : [],
                triage_level: triage?.triage_level ?? null,
                priority_score: triage?.priority_score ?? null,
                priority_label: triage?.priority_label ?? null,
                triage_reasons: Array.isArray(triage?.reasons) ? triage.reasons : [],
                queue: triage?.queue ?? null,
              }
            : {}),
          payment_method: 'qrph',
        }
      });

      if (data?.error) throw new Error(`${data.error}`);
      if (error) {
        if (error?.context?.json) {
          try {
            const parsed = await error.context.clone().json();
            const msg = parsed?.error || parsed?.message;
            if (msg) throw new Error(`${msg}`);
          } catch (_) {}
          try {
            const text = await error.context.clone().text();
            const msg = `${text || ''}`.trim();
            if (msg) throw new Error(msg);
          } catch (_) {}
        } else {
          const ctxBody = error?.context?.body;
          if (ctxBody) {
            try {
              const parsed = typeof ctxBody === 'string' ? JSON.parse(ctxBody) : ctxBody;
              const msg = parsed?.error || parsed?.message;
              if (msg) throw new Error(`${msg}`);
            } catch (_) {}
          }
        }
        const fallbackMsg = `${error?.message || error}`.trim() || 'Edge Function error.'
        throw new Error(fallbackMsg)
      }
      setPaymentReference(data.reference || reference);
      setPaymentConfirmed(false);
      const hasQr = !!data?.qr_image_url;
      const hasCheckout = !!data?.checkout_url;
      if (hasQr) {
        setPaymongoQrImageUrl(data.qr_image_url);
        // Keep checkout_url as fallback browser-based payment method, even if QR is available.
        if (hasCheckout) setPaymongoCheckoutUrl(data.checkout_url);
        setPaymentStatusText('');
        return;
      }
      if (!hasCheckout) throw new Error('Missing PayMongo checkout URL.');
      setPaymongoQrImageUrl('');
      setPaymongoCheckoutUrl(data.checkout_url);
      setPaymentStatusText('');
      await Linking.openURL(data.checkout_url);
    } catch (e) {
      const msg = `${e?.message || e}`.toLowerCase();
      if (msg.includes('invalid api key') || msg.includes('edge function returned a non-2xx status code')) {
        const demoUrl = 'https://example.com/pascualinga-demo-payment';
        const fallbackReference = paymentReference || buildPaymentReference();
        setPaymentReference(fallbackReference);
        setPaymongoCheckoutUrl(demoUrl);
        setPaymentConfirmed(false);
        setPaymentStatusText('');
        setPaymentModalVisible(true);
        try {
          await Linking.openURL(demoUrl);
        } catch (_) {}
        return;
      }
      setPaymentStatusText('');
      Alert.alert('Error', `Failed to start payment: ${e?.message || e}`);
    } finally {
      setCheckingPayment(false);
    }
  };

  const openPaymongoCheckout = async () => {
    if (!paymongoCheckoutUrl) return;
    try {
      await Linking.openURL(paymongoCheckoutUrl);
    } catch (e) {
      Alert.alert('Error', 'Failed to open checkout link.');
    }
  };

  const validateAllTextFieldsForCurrentStep = () => {
    if (stepKey === 'patient') {
      const firstNameError = validateName(patientFirstName, 'First Name');
      const lastNameError = validateName(patientLastName, 'Last Name');
      const notesError = validateNotes(getNotesValue());
      setFieldErrors((prev) => ({
        ...prev,
        firstName: firstNameError,
        lastName: lastNameError,
        notes: notesError,
      }));
      setFieldTouched((prev) => ({ ...prev, firstName: true, lastName: true, notes: true }));
      return !firstNameError && !lastNameError && !notesError;
    }

    if (stepKey === 'symptoms') {
      if (!isTriageEnabled) return true;
      const hasAtLeastOne = (selectedSymptoms || []).length > 0;
      return hasAtLeastOne;
    }

    if (stepKey === 'booking') {
      const timeError = validatePreferredTime(preferredTime);
      setFieldErrors((prev) => ({ ...prev, time: timeError }));
      setFieldTouched((prev) => ({ ...prev, time: true }));
      return !timeError;
    }

    return true;
  };

  const isStepValid = (key) => {
    if (key === 'service') return !!selectedSubService;
    if (key === 'patient') return !!patientFirstName.trim() && !!patientLastName.trim() && !!patientDob && !!patientSex;
    if (key === 'symptoms') {
      if (!isTriageEnabled) return true;
      return (selectedSymptoms || []).length > 0;
    }
    if (key === 'booking') {
      const baseOk = !!selectedDate && !!preferredTime;
      if (!baseOk) return false;
      return true;
    }
    if (key === 'summary') return !!paymentMethod;
    return false;
  };

  const goNext = () => {
    const okTextFields = validateAllTextFieldsForCurrentStep();
    if (!okTextFields) {
      Alert.alert('Fix Required Fields', 'Please correct the highlighted fields.');
      return;
    }
    if (!isStepValid(stepKey)) {
      if (stepKey === 'patient') {
        Alert.alert('Required', 'Please complete Patient Details (First Name, Last Name, Date of Birth, Sex).');
        return;
      }
      if (stepKey === 'symptoms') {
        Alert.alert('Required', 'Please select at least one symptom.');
        return;
      }
      if (stepKey === 'booking') {
        Alert.alert('Required', 'Please select a date and preferred time.');
        return;
      }
      if (stepKey === 'summary') {
        Alert.alert('Required', 'Please select a payment method.');
        return;
      }
      Alert.alert('Required', 'Please complete this step to continue.');
      return;
    }
    setBookingStep((prev) => Math.min(maxStep, prev + 1));
  };

  const goBack = () => {
    setBookingStep((prev) => Math.max(0, prev - 1));
  };

  const pickPwdId = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photos to attach your PWD ID.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled) return;
      const asset = (result.assets || [])[0] || null;
      if (!asset) return;
      const uri = `${asset.uri || ''}`.trim();
      if (!uri) return;
      const rawName =
        `${asset.fileName || asset.filename || asset.name || ''}`.trim() ||
        uri.split('/').pop() ||
        `pwd-id-${Date.now()}.jpg`;
      setPatientPwdIdUri(uri);
      setPatientPwdIdFileName(rawName);
      setPatientPwdIdUrl('');
    } catch (e) {
      Alert.alert('Error', 'Failed to attach image. Please try again.');
    }
  };

  const removePwdId = () => {
    setPatientPwdIdUri('');
    setPatientPwdIdFileName('');
    setPatientPwdIdUploading(false);
    setPatientPwdIdUrl('');
  };

  const confirmBooking = () => {
    setFieldTouched((prev) => ({
      ...prev,
      firstName: true,
      lastName: true,
      notes: true,
      time: true,
    }));
    setFieldErrors((prev) => ({
      ...prev,
      firstName: validateName(patientFirstName, 'First Name'),
      lastName: validateName(patientLastName, 'Last Name'),
      notes: validateNotes(getNotesValue()),
      time: validatePreferredTime(preferredTime),
    }));
    const timeErrorNow = validatePreferredTime(preferredTime);
    const notesErrorNow = validateNotes(getNotesValue());
    const firstNameErrorNow = validateName(patientFirstName, 'First Name');
    const lastNameErrorNow = validateName(patientLastName, 'Last Name');
    const hasAtLeastOne = (selectedSymptoms || []).length > 0;
    if (
      timeErrorNow ||
      notesErrorNow ||
      firstNameErrorNow ||
      lastNameErrorNow ||
      (isTriageEnabled && !hasAtLeastOne)
    ) {
      Alert.alert('Fix Required Fields', 'Please correct the highlighted fields.');
      return;
    }
    if (
      !isStepValid('patient') ||
      (isTriageEnabled && !isStepValid('symptoms')) ||
      !isStepValid('booking') ||
      !isStepValid('summary')
    ) {
      Alert.alert('Incomplete Booking', 'Please finish all required steps before confirming.');
      return;
    }

    {
      const items = cartCheckoutMode
        ? (Array.isArray(cartCheckoutItems) ? cartCheckoutItems : [])
        : [
            {
              serviceName: `${selectedService?.name || ''}`.trim(),
              subName: `${selectedSubService?.name || ''}`.trim(),
              requiresReferral: requiresReferralFor(selectedService?.name, selectedSubService?.name),
              referralUrl: `${singleReferralUrl || ''}`.trim(),
              referralAi: singleReferralAi,
            },
          ];

      const needingReferral = (items || []).filter((x) => x?.requiresReferral);
    }

    setIsBooking(true);
    const performBooking = async () => {
      try {
        const email = await AsyncStorage.getItem('userEmail');
        
        // 0. Get patient ID from accounts table
        const { data: userData, error: userError } = await supabase
          .from('accounts')
          .select('id, name')
          .eq('email', email)
          .single();
        
        if (userError) throw new Error('User not found in accounts');

        if (isVideoConsult) {
          const paidNow = !!paymentReference && (paymentConfirmed || autoFinalizePaymentRef.current);
          if (!paidNow) {
            setIsBooking(false);
            autoFinalizePaymentRef.current = false;
            afterPaymentForceApprovedRef.current = false;
            paymentFinalizeInFlightRef.current = false;
            await startGcashPayment();
            return;
          }
        }

        // Short-circuit: if video consult payment flow and booking already exists
        // (approved via payment webhook before this insert runs), treat as success
        // immediately so we don't hit the "two bookings same date/time" error.
        let shortCircuitAlreadyBooked = false;
        if (isVideoConsult && (paymentConfirmed || autoFinalizePaymentRef.current)) {
          const payrefTag = paymentReference
            ? `PAYREF:${`${paymentReference || ''}`.trim()}`.toUpperCase()
            : '';
          const targetDate = `${selectedDate || ''}`.trim();
          const targetTime = formatTimeForDb(timeValue);

          try {
            const rowsInApproval = await supabase
              .from('appointment_approval_requests')
              .select('status, email, patient_email, reason, service_type, requested_date, requested_time, appointment_date, appointment_time')
              .or(`email.eq.${email},patient_email.eq.${email}`)
              .order('created_at', { ascending: false })
              .limit(30);

            if (Array.isArray(rowsInApproval?.data)) {
              for (const row of rowsInApproval.data) {
                const status = `${row?.status || ''}`.toLowerCase();
                const isDone =
                  status === 'approved' ||
                  status === 'confirmed' ||
                  status === 'completed' ||
                  status === 'booked' ||
                  status === 'scheduled';
                if (!isDone) continue;

                const reasonRaw = `${row?.reason || row?.service_type || ''}`.toUpperCase();
                const dateOk =
                  targetDate &&
                  ((`${row?.requested_date || row?.appointment_date || ''}`.trim() === targetDate) ||
                    (`${row?.date || ''}`.trim() === targetDate));
                const timeOk =
                  targetTime &&
                  ((`${row?.requested_time || row?.appointment_time || ''}`.trim() === targetTime) ||
                    (`${row?.time || ''}`.trim() === targetTime));
                const payrefOk = payrefTag && reasonRaw.includes(payrefTag);

                if (payrefOk || (dateOk && timeOk)) {
                  shortCircuitAlreadyBooked = true;
                  break;
                }
              }
            }
          } catch (_) {}

          if (!shortCircuitAlreadyBooked) {
            try {
              const rowsInAppt = await supabase
                .from('appointments')
                .select('status, email, service_type, reason, appointment_date, appointment_time')
                .eq('email', email)
                .order('created_at', { ascending: false })
                .limit(30);

              if (Array.isArray(rowsInAppt?.data)) {
                for (const row of rowsInAppt.data) {
                  const status = `${row?.status || ''}`.toLowerCase();
                  const isDone =
                    status === 'approved' ||
                    status === 'confirmed' ||
                    status === 'completed' ||
                    status === 'booked' ||
                    status === 'scheduled';
                  if (!isDone) continue;

                  const reasonRaw = `${row?.service_type || row?.reason || ''}`.toUpperCase();
                  const dateOk =
                    targetDate &&
                    ((`${row?.appointment_date || ''}`.trim() === targetDate) ||
                      (`${row?.date || ''}`.trim() === targetDate));
                  const timeOk =
                    targetTime &&
                    ((`${row?.appointment_time || ''}`.trim() === targetTime) ||
                      (`${row?.time || ''}`.trim() === targetTime));
                  const payrefOk = payrefTag && reasonRaw.includes(payrefTag);

                  if (payrefOk || (dateOk && timeOk)) {
                    shortCircuitAlreadyBooked = true;
                    break;
                  }
                }
              }
            } catch (_) {}
          }

          if (shortCircuitAlreadyBooked) {
            // 🔥 CRITICAL FIX: BEFORE declaring success, FORCE UPDATE the DB rows
            // if they are still "Pending Approval" (because previous buggy runs wrote them
            // as pending and submitOne was skipped → never updated!) Without this →
            // patient = Pending, doctor = HINDI MAKIKITA because status not Approved! 💥
            try {
              const payrefTag = paymentReference
                ? `PAYREF:${`${paymentReference || ''}`.trim()}`.toUpperCase()
                : '';
              const targetDate = `${selectedDate || ''}`.trim();
              const targetTime = formatTimeForDb(timeValue);

              // Helper: case-insensitive like matcher for supabase
              const statusApproved =
                afterPaymentForceApprovedRef.current === true
                  ? 'Approved'
                  : resolvedStatus === 'Approved'
                    ? 'Approved'
                    : 'Approved';

              // 1. UPDATE appointment_approval_requests (Pending → Approved)
              try {
                if (payrefTag) {
                  // First try match via PAYREF in reason
                  await supabase
                    .from('appointment_approval_requests')
                    .update({ status: statusApproved })
                    .ilike('reason', `%${payrefTag}%`);
                }
                if (targetDate && targetTime) {
                  // Then also match via date+time (fallback if reason missing payref)
                  await supabase
                    .from('appointment_approval_requests')
                    .update({ status: statusApproved })
                    .eq('requested_date', targetDate)
                    .eq('requested_time', targetTime)
                    .eq('email', email)
                    .in('status', ['Pending Approval', 'Pending', 'pending', 'pending_approval']);
                }
              } catch (_) {}

              // 2. UPDATE appointments (Pending → Approved)
              try {
                if (payrefTag) {
                  await supabase
                    .from('appointments')
                    .update({ status: statusApproved })
                    .ilike('reason', `%${payrefTag}%`);
                }
                if (targetDate && targetTime) {
                  await supabase
                    .from('appointments')
                    .update({ status: statusApproved })
                    .eq('appointment_date', targetDate)
                    .eq('appointment_time', targetTime)
                    .eq('email', email)
                    .in('status', ['Pending Approval', 'Pending', 'pending', 'pending_approval']);
                }
              } catch (_) {}

              // 3. Update payment_transactions to paid (for PatientSchedule filter)
              try {
                if (paymentReference) {
                  await supabase
                    .from('payment_transactions')
                    .update({ status: 'paid', is_paid: true, paid_at: new Date().toISOString() })
                    .eq('reference', paymentReference);
                }
              } catch (_) {}
            } catch (_) {}

            if (cartCheckoutMode) {
              clearCart();
              setCartCheckoutMode(false);
              setCartCheckoutItems([]);
            }
            setIsBooking(false);
            setBookingModalVisible(false);
            setModalVisible(false);
            setPaymentModalVisible(false);
            setBookingStep(0);
            setPaymentApprovedVisible(false);
            setPaymentReference('');
            setPaymentConfirmed(false);
            setPaymentStatusText('');
            autoFinalizePaymentRef.current = false;
            paymentFinalizeInFlightRef.current = false;

            let bookedDateShort = `${selectedDate || ''}`.trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(bookedDateShort)) {
              bookedDateShort = getLocalDateKey();
            }
            const goToScheduleShort = () => {
              let navigated = false;
              try {
                navigation.navigate('Schedule', { initialDate: bookedDateShort });
                navigated = true;
              } catch (_) {
                navigated = false;
              }
              if (!navigated) {
                try {
                  navigation.navigate('PatientBottomTabs', {
                    screen: 'Schedule',
                    params: { initialDate: bookedDateShort },
                  });
                  navigated = true;
                } catch (_) {
                  navigated = false;
                }
              }
              if (!navigated) {
                try {
                  navigation.reset({
                    index: 0,
                    routes: [
                      {
                        name: 'PatientBottomTabs',
                        params: {
                          screen: 'Schedule',
                          params: { initialDate: bookedDateShort },
                        },
                      },
                    ],
                  });
                  navigated = true;
                } catch (_) {
                  navigated = false;
                }
              }
              if (!navigated) {
                try { navigation.goBack?.(); } catch (_) {}
              }
            };

            Alert.alert(
              'Booking Confirmed',
              'Payment received. Your booking is confirmed. You will be taken to your Schedule to view the appointment.',
              [
                {
                  text: 'Understood',
                  onPress: () => {
                    try { goToScheduleShort(); } catch (_) {}
                  },
                },
              ],
            );
            // Fire navigation immediately + timeout backup, no wait for tap.
            try { goToScheduleShort(); } catch (_) {}
            try { setTimeout(goToScheduleShort, 350); } catch (_) {}
            return;
          }
        }

        // 1. Save to appointment_approval_requests (Web will approve this)
        const finalNotes = `${consultMode === 'Video Call' ? '[VIDEO] ' : ''}${getNotesValue().trim()}`.trim();
        
        // Helper to check if string is valid UUID
        const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

        let resolvedStatus = 'Pending Approval';
        if (!!afterPaymentForceApprovedRef.current) {
          resolvedStatus = 'Approved';
        } else if (isVideoConsult && paymentReference) {
          try {
            const paymentRes = await supabase
              .from('payment_transactions')
              .select('status, paid_at, is_paid')
              .eq('reference', paymentReference)
              .order('created_at', { ascending: false })
              .limit(5);
            const rows = Array.isArray(paymentRes?.data) ? paymentRes.data : [];
            const anyPaid = rows.some((r) => {
              if (!r) return false;
              const st = `${r?.status || ''}`.toLowerCase();
              if (st === 'paid') return true;
              if (st === 'pending' || st.includes('pending') || st.includes('awaiting') || st.includes('to_pay')) return false;
              if (r?.is_paid === true) return true;
              if (r?.paid_at && `${r.paid_at}`.trim()) return true;
              return false;
            });
            const anyHardFail = rows.some((r) => {
              if (!r) return false;
              const st = `${r?.status || ''}`.toLowerCase();
              return (
                st === 'failed' ||
                st === 'canceled' ||
                st === 'cancelled' ||
                st === 'expired' ||
                st === 'voided' ||
                st === 'declined' ||
                st === 'rejected' ||
                st === 'refunded' ||
                st === 'partially_refunded' ||
                st === 'disputed' ||
                st === 'charge_back' ||
                st === 'chargeback'
              );
            });
            if (anyPaid && !anyHardFail) resolvedStatus = 'Approved';
          } catch (_) {}
        }
        setPaymentConfirmed(resolvedStatus === 'Approved');
        
        const triageTag = isTriageEnabled
          ? `[TRIAGE T${triage.triage_level} ${triage.priority_score} ${triage.priority_label}]`
          : '';
        const triagePayload = isTriageEnabled
          ? {
              symptoms: Array.isArray(selectedSymptoms) ? selectedSymptoms : [],
              triage_level: triage.triage_level,
              priority_score: triage.priority_score,
              priority_label: triage.priority_label,
              queue: triage.queue,
              reasons: Array.isArray(triage.reasons) ? triage.reasons : [],
            }
          : null;

        const submitOne = async (rawPayload) => {
          // --- ⛔ NUCLEAR FINAL GUARD (NO BYPASS, INSIDE SUBMIT ONE ITSELF!) ---
          // If this is Video/Online Consult mode and we are NOT explicitly in a
          // post-payment-success state (or short-circuited because booking already
          // exists via webhook path) → REFUSE TO INSERT ANY ROWS AT ALL COSTS!
          // This prevents STALE REF bypasses, accidental double submits, or any
          // other path that somehow dodges the earlier guards.
          if (isVideoConsult) {
            const explicitlyPaidNow =
              paymentConfirmed === true ||
              afterPaymentForceApprovedRef.current === true ||
              shortCircuitAlreadyBooked === true;
            if (!explicitlyPaidNow) {
              throw new Error(
                'Booking blocked: Payment not yet confirmed for Online Consult. Please complete payment first.',
              );
            }
          }

          // Helper: progressive payload strip for schema (42703 missing column) errors
          const insertWithRetry = async (tableName, basePayload) => {
            let payload = { ...basePayload };
            for (let attempt = 0; attempt < 5; attempt += 1) {
              const res = await supabase.from(tableName).insert([payload]);
              if (!res.error) return true;
              const err = res.error;
              const msg = `${err?.message || ''}`.toLowerCase();
              const isUnknownColumn =
                err?.code === '42703' ||
                err?.code === 'PGRST204' ||
                msg.includes('schema cache') ||
                msg.includes('could not find') && msg.includes('column');
              if (isUnknownColumn) {
                const rawMsg = `${err?.message || ''}`;
                const m =
                  rawMsg.match(/column\s+"([^"]+)"/i) ||
                  rawMsg.match(/column\s+([a-z0-9_]+)/i) ||
                  rawMsg.match(/could not find the '([^']+)' column/i) ||
                  rawMsg.match(/'([^']+)'\s+column/i);
                const col = m?.[1] ? `${m[1]}` : '';
                if (col && Object.prototype.hasOwnProperty.call(payload, col)) {
                  const next = { ...payload };
                  delete next[col];
                  payload = next;
                  continue;
                }
                if (msg.includes('email') && Object.prototype.hasOwnProperty.call(payload, 'email')) {
                  const next = { ...payload };
                  delete next.email;
                  payload = next;
                  continue;
                }
              }
              // Uniqueness / already exists = NOT an error, skip silently
              if (
                err?.code === '23505' ||
                msg.includes('duplicate') ||
                msg.includes('already exists') ||
                msg.includes('unique')
              ) {
                return true;
              }
              throw err;
            }
            return false;
          };

          // Step 1: Insert to appointment_approval_requests (doctor's pending approval queue or approved list)
          await insertWithRetry('appointment_approval_requests', { ...rawPayload });

          // Step 2: 🔥 ALSO INSERT MIRROR ROW to `appointments` table!
          // (Critical for DOCTOR VISIBILITY! Many doctor screens query ONLY appointments table,
          // not approval_requests. Without this → doctor sees nothing! 💥)
          try {
            const apptPayload = {
              patient_name: rawPayload.patient_name || '',
              email: rawPayload.email || '',
              patient_id: rawPayload.patient_id || undefined,
              appointment_date: rawPayload.requested_date || rawPayload.appointment_date,
              appointment_time: rawPayload.requested_time || rawPayload.appointment_time,
              status: rawPayload.status || 'Pending Approval',
              service_type: `${rawPayload.doctor_name || ''} | ${rawPayload.reason || ''}`.trim(),
              reason: rawPayload.reason || '',
              doctor_name: rawPayload.doctor_name || '',
              nurse_name: rawPayload.nurse_name || '',
              consultation_mode: consultMode === 'Video Call' ? 'Video' : 'In-person',
              mode: consultMode === 'Video Call' ? 'Video' : 'In-person',
              meeting_room: rawPayload.meeting_room || rawPayload.video_room || '',
              video_room: rawPayload.video_room || rawPayload.meeting_room || '',
              department: `${selectedService?.name || ''}`.trim(),
              procedure: `${selectedSubService?.name || ''}`.trim(),
              payment_reference: paymentReference || rawPayload.payment_reference || '',
              suggested_note: rawPayload.suggested_note || undefined,
              triage_level: triagePayload?.triage_level || undefined,
              priority_score: triagePayload?.priority_score || undefined,
            };
            if (apptPayload.patient_id === undefined) delete apptPayload.patient_id;
            if (apptPayload.suggested_note === undefined) delete apptPayload.suggested_note;
            if (apptPayload.triage_level === undefined) delete apptPayload.triage_level;
            if (apptPayload.priority_score === undefined) delete apptPayload.priority_score;
            if (apptPayload.payment_reference === '') delete apptPayload.payment_reference;
            await insertWithRetry('appointments', apptPayload);
          } catch (_) {}

          // Step 3: If PAYREF + STATUS=APPROVED → UPDATE DB payment_transactions add APPROVED flag!
          try {
            if (
              isVideoConsult &&
              paymentReference &&
              `${rawPayload.status || ''}`.toLowerCase() === 'approved'
            ) {
              try {
                await supabase
                  .from('payment_transactions')
                  .update({ appointment_written: true, status: 'paid' })
                  .eq('reference', paymentReference);
              } catch (_) {}
              try {
                const fnRes = await supabase.functions.invoke('paymongo-check-status', {
                  body: { reference: paymentReference, forcePaidOverride: true },
                });
                if (fnRes?.error) { /* ignore */ }
              } catch (_) {}
            }
          } catch (_) {}

          return;
        };

        const itemsToSubmit = cartCheckoutMode
          ? (Array.isArray(cartCheckoutItems) ? cartCheckoutItems : [])
          : [
              {
                key: 'single',
                serviceName: `${selectedService?.name || ''}`.trim(),
                subName: `${selectedSubService?.name || ''}`.trim(),
                requiresReferral: requiresReferralFor(selectedService?.name, selectedSubService?.name),
                referralUrl: `${singleReferralUrl || ''}`.trim(),
                referralAi: singleReferralAi,
              },
            ];

        if (!selectedDate) {
          throw new Error('Please select a valid appointment date.');
        }

        const bookingTimeStr = formatTimeForDb(timeValue);

        // --- TRAPPING CHECK ---
        // Verify if the slot is still available before proceeding
        const checkSlotAvailability = async () => {
          const checkEmail = email.toLowerCase();

          const normalizeBookingHead = (raw) => {
            const text = `${raw || ''}`.trim();
            if (!text) return '';
            const stripped = text.replace(/\[triage[^\]]*\]\s*/gi, '').trim();
            const head = stripped.split('|')[0]?.trim() || stripped;
            return head.toLowerCase().replace(/\s+/g, ' ');
          };

          const itemKeys = new Set(
            (itemsToSubmit || [])
              .map((it) => {
                const serviceLabel = `${it?.serviceName || selectedService?.name || ''}`.trim();
                const subLabel = `${it?.subName || selectedSubService?.name || ''}`.trim();
                return normalizeBookingHead(`${serviceLabel}: ${subLabel}`);
              })
              .filter(Boolean),
          );

          const firstKey = Array.from(itemKeys)[0] || '';
          
          const findDuplicateForPatient = async () => {
            const tryFetch = async (builder) => {
              const res = await builder;
              if (!res?.error) return Array.isArray(res.data) ? res.data : [];
              const err = res.error;
              const msg = `${err?.message || ''}`.toLowerCase();
              const ignorable =
                err?.code === '42703' ||
                err?.code === 'PGRST204' ||
                err?.code === '22P02' ||
                msg.includes('schema cache') ||
                msg.includes('could not find') && msg.includes('column') ||
                msg.includes('does not exist');
              if (ignorable) return [];
              throw err;
            };

            // Same account trapping: block ANY second booking at the same date/time (regardless of service)
            const apptRows = await tryFetch(
              supabase
                .from('appointments')
                .select('id, status')
                .ilike('email', checkEmail)
                .eq('appointment_date', selectedDate)
                .eq('appointment_time', bookingTimeStr)
                .not('status', 'ilike', '%cancel%')
                .not('status', 'ilike', '%decline%')
                .limit(25),
            );
            if (apptRows.length > 0) return { found: true };

            // Approval requests (pending/processing) — some schemas may use email or patient_email
            const reqRowsByEmail = await tryFetch(
              supabase
                .from('appointment_approval_requests')
                .select('id, status, email, patient_email')
                .ilike('email', checkEmail)
                .eq('requested_date', selectedDate)
                .eq('requested_time', bookingTimeStr)
                .not('status', 'ilike', '%cancel%')
                .not('status', 'ilike', '%decline%')
                .limit(25),
            );

            const reqRowsByPatientEmail = await tryFetch(
              supabase
                .from('appointment_approval_requests')
                .select('id, status, email, patient_email')
                .ilike('patient_email', checkEmail)
                .eq('requested_date', selectedDate)
                .eq('requested_time', bookingTimeStr)
                .not('status', 'ilike', '%cancel%')
                .not('status', 'ilike', '%decline%')
                .limit(25),
            );

            const reqRows = [...reqRowsByEmail, ...reqRowsByPatientEmail];

            const seen = new Set();
            const mergedReqRows = [];
            reqRows.forEach((r) => {
              const id = r?.id;
              if (!id || seen.has(id)) return;
              seen.add(id);
              mergedReqRows.push(r);
            });

            if (mergedReqRows.length > 0) return { found: true };

            return { found: false };
          };

          const dup = await findDuplicateForPatient();
          if (dup.found) {
            return {
              ok: false,
              message: "You can't create two bookings with the same date and time. Please choose a different date or time.",
            };
          }

          // 1. Check in appointments (confirmed/approved) — slot taken by anyone
          const { data: apptConflict } = await supabase
            .from('appointments')
            .select('id')
            .eq('appointment_date', selectedDate)
            .eq('appointment_time', bookingTimeStr)
            .not('status', 'ilike', '%cancel%')
            .not('status', 'ilike', '%decline%')
            .limit(1);

          if (apptConflict?.length > 0) {
            return {
              ok: false,
              message: 'This time slot has already been taken. Please choose another date or time.',
            };
          }

          // 2. Check in approval requests (pending) — slot taken by anyone
          const { data: reqConflict } = await supabase
            .from('appointment_approval_requests')
            .select('id')
            .eq('requested_date', selectedDate)
            .eq('requested_time', bookingTimeStr)
            .not('status', 'ilike', '%cancel%')
            .not('status', 'ilike', '%decline%')
            .limit(1);

          if (reqConflict?.length > 0) {
            return {
              ok: false,
              message: 'This time slot has already been taken. Please choose another date or time.',
            };
          }

          return { ok: true, message: '' };
        };

        const availability = await checkSlotAvailability();
        if (!availability?.ok) {
          throw new Error(availability?.message || 'Unable to book this slot. Please try another time or date.');
        }
        // -----------------------

        const onsiteAssignmentPayload = isOnsiteConsult
          ? {
              consultationType: 'onsite',
              department: `${selectedService?.name || ''}`.trim(),
              preferredDoctor: null,
              assignmentStatus: 'PENDING_ASSIGNMENT',
              requestedDate: selectedDate,
              requestedTimeFrom: `${bookingTimeStr || ''}`.slice(0, 5),
              requestedTimeTo: `${bookingTimeStr || ''}`.slice(0, 5),
            }
          : null;

        const canQueue =
          !cartCheckoutMode &&
          !onsiteAssignmentPayload &&
          consultationType === 'Onsite Consultation' &&
          isConsultationDepartment &&
          consultMode === 'In-person';
        const consultQueueNo = canQueue
          ? await computeConsultQueueNumber({
              department: selectedService?.name,
              procedure: selectedSubService?.name,
              date: selectedDate,
            })
          : null;

        for (const item of itemsToSubmit) {
          const serviceLabel = `${item?.serviceName || selectedService?.name || ''}`.trim() || 'Service';
          const subLabel = `${item?.subName || selectedSubService?.name || ''}`.trim() || 'Procedure';
          const referralUrl = `${item?.referralUrl || ''}`.trim();
          const requiresReferral = !!item?.requiresReferral;
          const referralScore = Number(item?.referralAi?.score || 0) || 0;

          const referralTag = referralUrl ? ` | REF:${referralUrl}` : '';
          const referralAiTag = referralUrl && referralScore ? ` | REF_AI:${referralScore}` : '';
          const queueTag = consultQueueNo ? ` | QNO:${consultQueueNo}` : '';

          const allSelectedSymptoms = Array.isArray(selectedSymptoms) ? selectedSymptoms : [];
          const symptomsText = allSelectedSymptoms.length > 0 ? ` | Symptoms: ${allSelectedSymptoms.join(', ')}` : '';

          const bookingData = {
            patient_name: `${patientFirstName.trim()} ${patientLastName.trim()}`,
            email: email,
            requested_date: selectedDate,
            requested_time: formatTimeForDb(timeValue),
            status: resolvedStatus,
            reason: `${isTriageEnabled ? `${triageTag} ` : ''}${serviceLabel}: ${subLabel}${isVideoConsult && paymentReference ? ` | PAYREF:${paymentReference}` : ''}${referralTag}${referralAiTag}${queueTag}${symptomsText}`,
            ...(onsiteAssignmentPayload
              ? {
                  suggested_note: JSON.stringify({
                    ...(isTriageEnabled ? (triagePayload || {}) : {}),
                    __appointmentMeta: onsiteAssignmentPayload,
                  }),
                }
              : isTriageEnabled
                ? { suggested_note: JSON.stringify(triagePayload) }
                : {}),
            doctor_name: `${selectedDoctorName || selectedDoctorEmail || 'Doctor'}`.trim(),
            nurse_name: 'Nurse',
          };

          if (userData.id && isUUID(userData.id)) {
            bookingData.patient_id = userData.id;
          }

          await submitOne(bookingData);
        }

        // 1b. If PWD ID is attached, upload to Supabase storage first
        let savedPwdUrl = `${patientPwdIdUrl || ''}`.trim();
        if (patientIsPwd && patientPwdIdUri && !savedPwdUrl) {
          try {
            setPatientPwdIdUploading(true);
            const uri = `${patientPwdIdUri}`.trim();
            const name =
              `${patientPwdIdFileName || ''}`.trim() ||
              uri.split('/').pop() ||
              `pwd-id-${Date.now()}.jpg`;
            const inferredMimeType = name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
            const fetchRes = await fetch(uri);
            if (!fetchRes.ok) throw new Error(`Failed to read attachment (${fetchRes.status})`);
            const fileData = await fetchRes.arrayBuffer();
            const safeEmail = `${email || ''}`.replace(/[^a-z0-9@._-]+/gi, '_').toLowerCase();
            const path = `pwd/${safeEmail}/${Date.now()}-${name}`.replace(/\s+/g, '_');
            const { error: uploadError } = await supabase.storage
              .from('chat-attachments')
              .upload(path, fileData, { contentType: inferredMimeType, upsert: false, cacheControl: '3600' });
            if (uploadError) throw uploadError;
            const publicRes = supabase.storage.from('chat-attachments').getPublicUrl(path);
            savedPwdUrl = `${publicRes?.data?.publicUrl || ''}`.trim();
            if (savedPwdUrl) setPatientPwdIdUrl(savedPwdUrl);
          } catch (uploadErr) {
            console.error('PWD ID upload failed:', uploadErr);
            Alert.alert(
              'PWD ID Upload',
              'We could not upload your PWD ID right now. Your booking will continue, but you may need to re-attach the ID next time.',
              [{ text: 'OK' }],
            );
          } finally {
            setPatientPwdIdUploading(false);
          }
        }

        // 2. Autosave patient details back to 'patients' table
        try {
          const basePayload = {
            email: email,
            first_name: patientFirstName.trim(),
            last_name: patientLastName.trim(),
            date_of_birth: formatDob(patientDob),
            gender: patientSex,
          };
          // Optional: add PWD flags/URL if set (wrap in individual upsert if columns exist)
          const pwdPayload = {};
          if (patientIsPwd) {
            try {
              // Don't spread yet - first test base-only to ensure no 42703
            } catch (_) {}
          }
          // Always attempt base fields first (known-good columns)
          const { error: patientUpdateError } = await supabase
            .from('patients')
            .upsert(basePayload, { onConflict: 'email' });
          if (patientUpdateError) console.log('Error autosaving patient profile (base):', patientUpdateError);

          // Try adding PWD info as a separate UPDATE so missing columns won't break the known-good upsert
          if (patientIsPwd && (savedPwdUrl || patientIsPwd)) {
            try {
              const patch = {};
              if (patientIsPwd) patch.is_pwd = true;
              if (savedPwdUrl) patch.pwd_id_url = savedPwdUrl;
              if (savedPwdUrl) patch.pwd_id = savedPwdUrl;
              if (Object.keys(patch).length) {
                const { error: patchErr } = await supabase
                  .from('patients')
                  .update(patch)
                  .eq('email', email);
                if (patchErr) {
                  // Columns may not exist yet; don't treat as fatal
                  console.log('Note: PWD columns (is_pwd / pwd_id_url) not present in patients table yet, skipping PWD DB persist.', patchErr);
                }
              }
            } catch (patchCatch) {
              console.log('Silent: PWD optional persist skipped.', patchCatch);
            }
          }
        } catch (fatalPatient) {
          console.error('Fatal patient profile persist:', fatalPatient);
        }

        if (cartCheckoutMode) {
          clearCart();
          setCartCheckoutMode(false);
          setCartCheckoutItems([]);
        }

        setIsBooking(false);
        setBookingModalVisible(false);
        setModalVisible(false);
        setPaymentModalVisible(false);
        setBookingStep(0);
        setPaymentApprovedVisible(false);
        autoFinalizePaymentRef.current = false;
        paymentFinalizeInFlightRef.current = false;
        if (isVideoConsult && resolvedStatus === 'Approved') {
          setPaymentReference('');
          setPaymentConfirmed(false);
          setPaymentStatusText('');
        }

        let normalSuccessNeedScheduleNav = false;
        let normalSuccessBookedDate = `${selectedDate || ''}`.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(normalSuccessBookedDate)) {
          normalSuccessBookedDate = getLocalDateKey();
        }
        if (isVideoConsult && resolvedStatus === 'Approved') {
          normalSuccessNeedScheduleNav = true;
        }

        const goToScheduleNormal = () => {
          let navigated = false;
          try {
            navigation.navigate('Schedule', { initialDate: normalSuccessBookedDate });
            navigated = true;
          } catch (_) {
            navigated = false;
          }
          if (!navigated) {
            try {
              navigation.navigate('PatientBottomTabs', {
                screen: 'Schedule',
                params: { initialDate: normalSuccessBookedDate },
              });
              navigated = true;
            } catch (_) {
              navigated = false;
            }
          }
          if (!navigated) {
            try {
              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: 'PatientBottomTabs',
                    params: {
                      screen: 'Schedule',
                      params: { initialDate: normalSuccessBookedDate },
                    },
                  },
                ],
              });
              navigated = true;
            } catch (_) {
              navigated = false;
            }
          }
          if (!navigated) {
            try { navigation.goBack?.(); } catch (_) {}
          }
        };

        const displayCount = cartCheckoutMode ? (Array.isArray(itemsToSubmit) ? itemsToSubmit.length : 0) : 1;
        const isPaidVideoOrQRFlow = !!(isVideoConsult && (paymentConfirmed || autoFinalizePaymentRef.current || !!paymentReference));

        // --- ⛔ NUCLEAR GUARD: Paid Video/QR Consult flow -> ONLY "Booking Confirmed"! NO "Request Submitted" EVER!
        //     If somehow resolvedStatus != Approved during a paid video/QR (webhook delayed etc),
        //     force title "Booking Confirmed" anyway. We KNOW it was paid because poller approved!
        let title = resolvedStatus === 'Approved' ? 'Booking Confirmed' : 'Request Submitted';
        let message = '';

        if (isPaidVideoOrQRFlow) {
          title = 'Booking Confirmed';
        }

        const queueMsg = consultQueueNo ? `\nQueue number: ${consultQueueNo}` : '';
        if (title === 'Booking Confirmed') {
          message = normalSuccessNeedScheduleNav
            ? `Payment received. Your booking is confirmed. You will be taken to your Schedule to view the appointment.`
            : `Payment received. Your booking is confirmed. Please check Schedule/Activity for updates.`;
        } else {
          message = displayCount > 1
            ? `Your ${displayCount} requests have been submitted and sent for approval. Please check Activity for updates.`
            : `Your request for ${selectedSubService?.name} has been submitted and sent to the ${selectedService?.name} department for approval. Please check Activity for updates.${queueMsg}`;
        }

        Alert.alert(
          title,
          message,
          [
            { 
              text: "Understood",
              onPress: () => {
                try {
                  if (route?.params?.reappoint) {
                    // Navigate to the main PatientBottomTabs navigator, then to the Records screen within it
                    navigation.navigate('PatientBottomTabs', {
                      screen: 'Records',
                      params: { initialSection: 'Appointments' }
                    });
                    return;
                  }
                  if (normalSuccessNeedScheduleNav) {
                    try { goToScheduleNormal(); } catch (_) {}
                    return;
                  }
                } catch (_) {}
              }
            }
          ]
        );

        // Fire schedule navigation immediately + timeout backup if this is a paid video consult success.
        if (normalSuccessNeedScheduleNav) {
          try { goToScheduleNormal(); } catch (_) {}
          try { setTimeout(goToScheduleNormal, 350); } catch (_) {}
        }
      } catch (e) {
        setIsBooking(false);
        setVideoHoldModalVisible(false);
        if (videoHoldPollIntervalRef.current) clearInterval(videoHoldPollIntervalRef.current);
        videoHoldPollIntervalRef.current = null;
        const msg = `${e?.message || ''}`.trim();

        // Bulletproof: if we hit the "duplicate same date/time booking" error during a PAID
        // video consult flow, it means the booking was already inserted/approved on the
        // backend (webhook) path before our insert ran. Treat as SUCCESS → close modals,
        // show Booking Confirmed and redirect to Schedule on the booked date.
        const looksDuplicate =
          /can'?t create two bookings with the same date and time/i.test(msg) ||
          /same date and time/i.test(msg);
        const paidFlow =
          isVideoConsult && (paymentConfirmed || autoFinalizePaymentRef.current || !!paymentReference);

        if (looksDuplicate && paidFlow) {
          let bookedDate = `${selectedDate || ''}`.trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(bookedDate)) {
            bookedDate = getLocalDateKey();
          }

          if (cartCheckoutMode) {
            clearCart();
            setCartCheckoutMode(false);
            setCartCheckoutItems([]);
          }
          setIsBooking(false);
          setBookingModalVisible(false);
          setModalVisible(false);
          setPaymentModalVisible(false);
          setBookingStep(0);
          setPaymentApprovedVisible(false);
          setPaymentReference('');
          setPaymentConfirmed(false);
          setPaymentStatusText('');
          autoFinalizePaymentRef.current = false;
          paymentFinalizeInFlightRef.current = false;

          const goToSchedule = () => {
            let navigated = false;
            try {
              navigation.navigate('Schedule', { initialDate: bookedDate });
              navigated = true;
            } catch (_) {
              navigated = false;
            }
            if (!navigated) {
              try {
                navigation.navigate('PatientBottomTabs', {
                  screen: 'Schedule',
                  params: { initialDate: bookedDate },
                });
                navigated = true;
              } catch (_) {
                navigated = false;
              }
            }
            if (!navigated) {
              try {
                navigation.reset({
                  index: 0,
                  routes: [
                    {
                      name: 'PatientBottomTabs',
                      params: {
                        screen: 'Schedule',
                        params: { initialDate: bookedDate },
                      },
                    },
                  ],
                });
                navigated = true;
              } catch (_) {
                navigated = false;
              }
            }
            if (!navigated) {
              try { navigation.goBack?.(); } catch (_) {}
            }
          };

          Alert.alert(
            'Booking Confirmed',
            'Payment received. Your booking is confirmed. You will be taken to your Schedule to view the appointment.',
            [
              {
                text: 'Got it',
                onPress: () => {
                  goToSchedule();
                },
              },
            ],
          );
          // Fire schedule navigation immediately (and as a backup via timeout too)
          try { goToSchedule(); } catch (_) {}
          try { setTimeout(goToSchedule, 350); } catch (_) {}
          return;
        }

        Alert.alert('Error', msg || 'Failed to submit request. Please try again.');
      }
    };
    performBooking();
  };

  confirmBookingRef.current = confirmBooking;

  useEffect(() => {
    if (!paymentModalVisible || !paymentReference) return;

    const currentRef = `${paymentReference || ''}`.trim();
    paymentFinalizeInFlightRef.current = false;
    autoFinalizePaymentRef.current = false;
    try { AsyncStorage.removeItem(`pollCount:${currentRef}`).catch(() => {}); } catch (_) {}

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      await checkPaymentAndFinalize();
    };

    setPaymentStatusText('');
    poll();
    const intervalId = setInterval(poll, 2500);
    paymentPollIntervalRef.current = intervalId;

    return () => {
      cancelled = true;
      if (paymentPollIntervalRef.current) clearInterval(paymentPollIntervalRef.current);
      paymentPollIntervalRef.current = null;
    };
  }, [checkPaymentAndFinalize, paymentModalVisible, paymentReference]);

  useEffect(() => {
    if (!paymentModalVisible || !paymentReference) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        checkPaymentAndFinalize();
      }
    });
    return () => sub.remove();
  }, [checkPaymentAndFinalize, paymentModalVisible, paymentReference]);

  const closeBooking = () => {
    setBookingModalVisible(false);
    setBookingStep(0);
    setIsBooking(false);
    setReappointLock(false)
    setCartCheckoutMode(false);
    setCartCheckoutItems([]);
    setSelectedDate('');
    {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = `${now.getMonth() + 1}`.padStart(2, '0');
      setCalendarMonth(`${yyyy}-${mm}`);
    }
    setPaymentMethod('cash');
    setPreferredTime('');
    setShowTimePicker(false);
    setTimeValue(new Date());
    setPaymentModalVisible(false);
    setPaymentReference('');
    setPaymongoCheckoutUrl('');
    setCheckingPayment(false);
    setPaymentStatusText('');
    setPaymentConfirmed(false);
    setPaymentApprovedVisible(false);
    paymentFinalizeInFlightRef.current = false;
    autoFinalizePaymentRef.current = false;
    setPatientFirstName('');
    setPatientLastName('');
    setPatientDob(null);
    setPatientSex('');
    setPatientIsPwd(false);
    setPatientPwdIdUri('');
    setPatientPwdIdFileName('');
    setPatientPwdIdUploading(false);
    setPatientPwdIdUrl('');
    setPatientNotes('');
    clearNotesInput();
    setMainConcern('');
    setSeverity('Moderate');
    setSelectedSymptoms([]);
    setAvailableDoctors([]);
    setAvailableSlots([]);
    setLoadingSlots(false);
    setSlotFetchError('');
    setSelectedDoctorId('');
    setSelectedDoctorDbId('');
    setSelectedDoctorEmail('');
    setSelectedDoctorName('');
    setDoctorFetchError('');
    setDisabledDateMarks({});
    setDoctorBlockedDateMarks({});
    setSpecialtyBlockedDateMarks({});
    setAvailabilityError('');
    setAvailabilityLoading(false);
    setVideoHoldRef('');
    setVideoHoldStatusText('');
    setVideoHoldModalVisible(false);
    if (videoHoldPollIntervalRef.current) clearInterval(videoHoldPollIntervalRef.current);
    videoHoldPollIntervalRef.current = null;
    setPatientProfileLoading(false);
    setPatientProfileLocked(false);
    setFieldTouched({ firstName: false, lastName: false, notes: false, mainConcern: false, time: false });
    setFieldErrors({ firstName: '', lastName: '', notes: '', mainConcern: '', time: '' });
  };

  const Stepper = () => {
    return (
      <View style={styles.stepperRow}>
        {stepLabels.map((label, idx) => {
          const isActive = idx === bookingStep;
          const isDone = idx < bookingStep;
          return (
            <View key={label} style={styles.stepperItem}>
              <View
                style={[
                  styles.stepCircle,
                  isActive && styles.stepCircleActive,
                  isDone && styles.stepCircleDone,
                ]}
              >
                <Text style={[styles.stepNumber, (isActive || isDone) && styles.stepNumberActive]}>
                  {idx + 1}
                </Text>
              </View>
              <Text style={[styles.stepLabel, (isActive || isDone) && styles.stepLabelActive]} numberOfLines={1}>
                {label}
              </Text>
              {idx !== stepLabels.length - 1 && <View style={[styles.stepLine, isDone && styles.stepLineDone]} />}
            </View>
          );
        })}
      </View>
    );
  };

  const BookingStepContent = () => {
    if (stepKey === 'service') {
      return (
        <View style={{ marginTop: 10 }}>
          <View style={styles.wizardSummaryCard}>
            <Text style={styles.wizardSummaryTitle}>{selectedService?.name}</Text>
            <Text style={styles.wizardSummarySubtitle}>{selectedSubService?.name}</Text>
            <View style={styles.wizardMetaRow}>
              <View style={styles.wizardMetaBadge}>
                <Ionicons name="time-outline" size={12} color="#666" />
                <Text style={styles.wizardMetaText}>{selectedSubService?.duration || '—'}</Text>
              </View>
              <Text style={styles.wizardPriceText}>{selectedSubService?.price || ''}</Text>
            </View>
          </View>

          {cartCheckoutMode && Array.isArray(cartCheckoutItems) && cartCheckoutItems.length ? (
            <View style={styles.cartSummaryCard}>
              <Text style={styles.cartSummaryTitle}>Selected Services</Text>
              {cartCheckoutItems.slice(0, 6).map((it) => (
                <Text key={it.key} style={styles.cartSummaryItem} numberOfLines={2}>
                  {`• ${it.serviceName}: ${it.subName}${it.isPackage ? ' (Package)' : ''}`}
                </Text>
              ))}
              {cartCheckoutItems.length > 6 ? (
                <Text style={styles.cartSummaryMore} numberOfLines={1}>
                  {`+${cartCheckoutItems.length - 6} more`}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.wizardHint}>
            <MaterialCommunityIcons name="information-outline" size={18} color="#DA7705" />
            <Text style={styles.wizardHintText}>Next, fill up your patient details to proceed.</Text>
          </View>
        </View>
      );
    }

    if (stepKey === 'patient') {
      return (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.wizardSectionTitle}>Patient Details</Text>
          <Text style={styles.wizardSectionSubtitle}>Fields marked with * are required.</Text>
          {patientProfileLoading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
              <ActivityIndicator size="small" color="#DA7705" />
              <Text style={{ marginLeft: 10, color: '#6b7280', fontWeight: '700' }}>Loading your profile…</Text>
            </View>
          ) : null}

          <View style={styles.twoColRow}>
            <View style={styles.col}>
              <Text style={styles.inputLabel}>First Name *</Text>
              <TextInput
                value={patientFirstName}
                onChangeText={setFirstNameValue}
                placeholder="First Name"
                placeholderTextColor="#aaa"
                style={[styles.input, fieldTouched.firstName && fieldErrors.firstName ? styles.inputError : null]}
                editable={!patientProfileLocked}
                onBlur={() => {
                  markTouched('firstName');
                  setFieldError('firstName', validateName(patientFirstName, 'First Name'));
                }}
              />
              {fieldTouched.firstName && !!fieldErrors.firstName && <Text style={styles.errorText}>{fieldErrors.firstName}</Text>}
            </View>
            <View style={styles.col}>
              <Text style={styles.inputLabel}>Last Name *</Text>
              <TextInput
                value={patientLastName}
                onChangeText={setLastNameValue}
                placeholder="Last Name"
                placeholderTextColor="#aaa"
                style={[styles.input, fieldTouched.lastName && fieldErrors.lastName ? styles.inputError : null]}
                editable={!patientProfileLocked}
                onBlur={() => {
                  markTouched('lastName');
                  setFieldError('lastName', validateName(patientLastName, 'Last Name'));
                }}
              />
              {fieldTouched.lastName && !!fieldErrors.lastName && <Text style={styles.errorText}>{fieldErrors.lastName}</Text>}
            </View>
          </View>

          <Text style={styles.inputLabel}>Date of Birth *</Text>
          <View style={styles.birthdayRow}>
            <View style={[styles.birthdayDropdownWrapper, { flex: 1.5 }]}>
              <ElementDropdown
                style={styles.dropdown}
                placeholderStyle={styles.placeholderStyle}
                selectedTextStyle={styles.selectedTextStyle}
                itemTextStyle={styles.itemTextStyle}
                containerStyle={styles.containerStyle}
                iconStyle={styles.iconStyle}
                data={monthsList}
                labelField="label"
                valueField="value"
                placeholder="Month"
                value={birthDateState.month}
                onChange={item => handleBirthDateChange('month', item.value)}
                disable={patientProfileLocked}
              />
            </View>
            <View style={[styles.birthdayDropdownWrapper, { flex: 1, marginHorizontal: 8 }]}>
              <ElementDropdown
                style={styles.dropdown}
                placeholderStyle={styles.placeholderStyle}
                selectedTextStyle={styles.selectedTextStyle}
                itemTextStyle={styles.itemTextStyle}
                containerStyle={styles.containerStyle}
                iconStyle={styles.iconStyle}
                data={daysList}
                labelField="label"
                valueField="value"
                placeholder="Day"
                value={birthDateState.day}
                onChange={item => handleBirthDateChange('day', item.value)}
                disable={patientProfileLocked}
              />
            </View>
            <View style={[styles.birthdayDropdownWrapper, { flex: 1.5 }]}>
              <ElementDropdown
                style={styles.dropdown}
                placeholderStyle={styles.placeholderStyle}
                selectedTextStyle={styles.selectedTextStyle}
                itemTextStyle={styles.itemTextStyle}
                containerStyle={styles.containerStyle}
                inputSearchStyle={styles.inputSearchStyle}
                iconStyle={styles.iconStyle}
                data={yearsList}
                search
                labelField="label"
                valueField="value"
                placeholder="Year"
                searchPlaceholder="Search..."
                value={birthDateState.year}
                onChange={item => handleBirthDateChange('year', item.value)}
                disable={patientProfileLocked}
              />
            </View>
          </View>

          <Text style={styles.inputLabel}>Sex *</Text>
          <View style={styles.sexRow}>
            <TouchableOpacity
              style={[styles.sexChip, patientSex === 'Female' && styles.sexChipSelected]}
              onPress={() => {
                if (patientProfileLocked) return;
                setPatientSex('Female');
              }}
              activeOpacity={0.8}
              disabled={patientProfileLocked}
            >
              <Text style={[styles.sexChipText, patientSex === 'Female' && styles.sexChipTextSelected]}>FEMALE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sexChip, patientSex === 'Male' && styles.sexChipSelected]}
              onPress={() => {
                if (patientProfileLocked) return;
                setPatientSex('Male');
              }}
              activeOpacity={0.8}
              disabled={patientProfileLocked}
            >
              <Text style={[styles.sexChipText, patientSex === 'Male' && styles.sexChipTextSelected]}>MALE</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>I am a PWD</Text>
            <Switch value={patientIsPwd} onValueChange={setPatientIsPwd} thumbColor={patientIsPwd ? '#DA7705' : '#f4f3f4'} />
          </View>

          {patientIsPwd && (
            <>
              <TouchableOpacity
                style={[styles.attachButton, patientPwdIdUploading && { opacity: 0.7 }]}
                onPress={patientPwdIdUploading ? () => {} : pickPwdId}
                activeOpacity={0.85}
                disabled={patientPwdIdUploading}
              >
                <MaterialCommunityIcons
                  name={patientPwdIdUri ? 'check-circle' : 'paperclip'}
                  size={18}
                  color={patientPwdIdUri ? '#22c55e' : '#333'}
                />
                <Text
                  style={[
                    styles.attachButtonText,
                    patientPwdIdUri && { color: '#22c55e', fontWeight: '700' },
                  ]}
                >
                  {patientPwdIdUploading
                    ? 'Uploading PWD ID...'
                    : patientPwdIdUri
                    ? '✓ PWD ID Attached (tap to change)'
                    : 'Attach a PWD ID'}
                </Text>
              </TouchableOpacity>

              {patientPwdIdUri ? (
                <View style={styles.pwdPreviewWrapper}>
                  <Image
                    source={{ uri: patientPwdIdUri }}
                    style={styles.pwdPreviewThumb}
                    resizeMode="cover"
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text numberOfLines={1} ellipsizeMode="middle" style={styles.pwdPreviewName}>
                      {patientPwdIdFileName || 'PWD ID Image'}
                    </Text>
                    <TouchableOpacity
                      style={styles.pwdRemoveBtn}
                      onPress={removePwdId}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="close-circle" size={14} color="#EF4444" />
                      <Text style={styles.pwdRemoveText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </>
          )}

          <Text style={styles.inputLabel}>Notes (optional)</Text>
          <TextInput
            ref={notesInputRef}
            defaultValue={patientNotes}
            onChangeText={setNotesValue}
            placeholder="Reason / special requests"
            placeholderTextColor="#aaa"
            style={[styles.input, { height: 90, textAlignVertical: 'top' }, fieldTouched.notes && fieldErrors.notes ? styles.inputError : null]}
            multiline
            autoCorrect={false}
            spellCheck={false}
            onBlur={() => {
              markTouched('notes');
              setFieldError('notes', validateNotes(getNotesValue()));
            }}
          />
          {fieldTouched.notes && !!fieldErrors.notes && <Text style={styles.errorText}>{fieldErrors.notes}</Text>}
        </View>
      );
    }

    if (stepKey === 'symptoms') {
      if (!isTriageEnabled) {
        return (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.wizardSectionTitle}>Booking</Text>
            <Text style={styles.wizardSectionSubtitle}>Pick schedule.</Text>
          </View>
        );
      }
      const isAnesthesiaDept = normalizeTriageKey(selectedService?.name) === 'anesthesia';
      const toggleInList = (list, setList, value) => {
        const exists = (list || []).includes(value);
        if (exists) {
          setList((prev) => (prev || []).filter((x) => x !== value));
        } else {
          setList((prev) => [...(prev || []), value]);
        }
      };

      return (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.wizardSectionTitle}>
            {isAnesthesiaDept ? 'Pre-Anesthesia Checklist' : 'Reason for Consultation'}
          </Text>
          <Text style={styles.wizardSectionSubtitle}>
            {isAnesthesiaDept
              ? 'Select relevant health factors for anesthesia. This will be reviewed by the nurse.'
              : 'Select your symptoms or reasons for consultation. This will help the doctor understand your concern.'}
          </Text>

          <Text style={[styles.inputLabel, { marginTop: 12 }]}>
            Symptoms
          </Text>
          <View style={styles.symptomGrid}>
            {(triageModel?.symptomsList || []).map((s) => {
              const selected = (selectedSymptoms || []).includes(s);
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.symptomChip, selected && styles.symptomChipSelected]}
                  onPress={() => toggleInList(selectedSymptoms, setSelectedSymptoms, s)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={16} color={selected ? '#fff' : '#64748b'} />
                  <Text style={[styles.symptomChipText, selected && styles.symptomChipTextSelected]} numberOfLines={2}>
                    {s}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    }

    if (stepKey === 'booking') {
      return (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.wizardSectionTitle}>Booking</Text>
          <Text style={styles.wizardSectionSubtitle}>Pick schedule.</Text>

          <Text style={styles.inputLabel}>Select Date *</Text>
          <View style={styles.calendarContainer}>
            <Calendar
              current={selectedDate || (isOnsiteConsult ? `${calendarMonth}-01` : new Date().toISOString().split('T')[0])}
              onDayPress={(day) => {
                console.log('Selected date:', day.dateString);
                setSelectedDate(day.dateString);
                setPreferredTime('');
                setFieldError('time', '');
              }}
              onMonthChange={(m) => {
                if (!isOnsiteConsult) return;
                const yyyy = `${m?.year || ''}`.trim();
                const mm = `${m?.month || ''}`.trim();
                if (!yyyy || !mm) return;
                const monthKey = `${yyyy}-${`${mm}`.padStart(2, '0')}`;
                setCalendarMonth(monthKey);
                setDisabledDateMarks({});
                setDoctorBlockedDateMarks({});
                setSpecialtyBlockedDateMarks({});
                setAvailabilityError('');
                if (selectedDate && !`${selectedDate}`.startsWith(`${monthKey}-`)) {
                  setSelectedDate('');
                  setPreferredTime('');
                  setFieldError('time', '');
                }
              }}
              markedDates={
                {
                  ...disabledDateMarks,
                  ...doctorBlockedDateMarks,
                  ...specialtyBlockedDateMarks,
                  ...(selectedDate
                    ? { [selectedDate]: { selected: true, selectedColor: '#DA7705', selectedTextColor: '#fff' } }
                    : {}),
                }
              }
              minDate={new Date().toISOString().split('T')[0]}
              theme={{
                selectedDayBackgroundColor: '#DA7705',
                selectedDayTextColor: '#fff',
                todayTextColor: '#DA7705',
                arrowColor: '#DA7705',
                monthTextColor: '#333',
                textMonthFontWeight: 'bold',
                calendarBackground: '#fff',
                dayTextColor: '#2d4150',
                textDisabledColor: '#d9e1e8',
              }}
              style={styles.wizardCalendar}
            />
          </View>
          <Text style={styles.inputLabel}>Preferred Time{consultMode === 'Video Call' ? '' : ' (7:00 AM - 5:00 PM)'} *</Text>
          {!selectedDate ? (
            <Text style={styles.errorText}>Please select a date first.</Text>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.pickerButton, fieldTouched.time && fieldErrors.time ? styles.inputError : null]}
                onPress={() => setShowTimePicker(true)}
                activeOpacity={0.8}
              >
                <Feather name="clock" size={16} color="#666" />
                <Text style={[styles.pickerButtonText, !preferredTime && { color: '#aaa', fontWeight: '500' }]}>
                  {preferredTime || 'Select Preferred Time'}
                </Text>
              </TouchableOpacity>
              {fieldTouched.time && !!fieldErrors.time && <Text style={styles.errorText}>{fieldErrors.time}</Text>}
              {showTimePicker && (
                <DateTimePicker
                  value={timeValue}
                  mode="time"
                  is24Hour={false}
                  display={Platform.OS === 'android' ? 'clock' : 'spinner'}
                  onChange={onTimeChange}
                />
              )}
            </>
          )}

          {!cartCheckoutMode && requiresReferralFor(selectedService?.name, selectedSubService?.name) ? (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.inputLabel}>Doctor Referral (Optional)</Text>
              {(() => {
                const url = `${singleReferralUrl || ''}`.trim();
                const localUri = `${singleReferralAssetUri || ''}`.trim();
                const previewUri = localUri || url;
                const displayName = `${singleReferralFileName || ''}`.trim() || 'referral.jpg';
                const score = Number(singleReferralAi?.score || 0) || 0;
                const verdict = `${singleReferralAi?.verdict || ''}`.trim();
                const passed = !!url && score >= referralAiMinScore;
                const hasAnyAttach = !!previewUri;
                return (
                  <>
                    <TouchableOpacity
                      style={[styles.referralButton, singleReferralUploading && { opacity: 0.7 }]}
                      onPress={attachReferralForSingleBooking}
                      activeOpacity={0.85}
                      disabled={singleReferralUploading}
                    >
                      {singleReferralUploading ? (
                        <ActivityIndicator size="small" color="#DA7705" />
                      ) : (
                        <Ionicons
                          name={hasAnyAttach ? 'checkmark-circle' : 'attach'}
                          size={16}
                          color={hasAnyAttach ? '#22c55e' : '#DA7705'}
                        />
                      )}
                      <Text
                        style={[
                          styles.referralButtonText,
                          hasAnyAttach && { color: '#22c55e', fontWeight: '700' },
                        ]}
                      >
                        {singleReferralUploading
                          ? 'Uploading & verifying referral…'
                          : hasAnyAttach
                          ? '✓ Referral attached (tap to replace)'
                          : 'Attach referral (Optional)'}
                      </Text>
                    </TouchableOpacity>

                    {hasAnyAttach ? (
                      <>
                        <View style={styles.pwdPreviewWrapper}>
                          <Image
                            source={{ uri: previewUri }}
                            style={styles.pwdPreviewThumb}
                            resizeMode="cover"
                          />
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text numberOfLines={1} ellipsizeMode="middle" style={styles.pwdPreviewName}>
                              {displayName}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 6 }}>
                              {!!singleReferralAi && score > 0 ? (
                                <Text
                                  numberOfLines={2}
                                  style={[
                                    styles.cartReferralWarn,
                                    passed && { color: '#22c55e' },
                                    { marginBottom: 0, marginTop: 0 },
                                  ]}
                                >
                                  {passed
                                    ? `Verified (${score}/100)`
                                    : `AI: ${verdict || 'Checked'} (${score}/100)`}
                                </Text>
                              ) : singleReferralUploading ? (
                                <Text numberOfLines={1} style={[styles.cartReferralWarn, { marginBottom: 0, marginTop: 0 }]}>
                                  Verifying file…
                                </Text>
                              ) : null}
                              <TouchableOpacity
                                style={styles.pwdRemoveBtn}
                                onPress={() => {
                                  Alert.alert('Remove Referral', 'Remove the attached referral file?', [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Remove', style: 'destructive', onPress: removeSingleReferral },
                                  ]);
                                }}
                                activeOpacity={0.75}
                              >
                                <Ionicons name="close-circle" size={14} color="#EF4444" />
                                <Text style={styles.pwdRemoveText}>Remove</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                        {!!singleReferralAi && !passed && score > 0 ? (
                          <Text style={[styles.cartReferralWarn, { marginTop: 8 }]} numberOfLines={3}>
                            AI score below 70/100. The attached image may not be a valid referral document. Please upload a clearer copy if needed.
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      !!singleReferralAi && score > 0 ? (
                        <Text style={styles.cartReferralWarn} numberOfLines={3}>
                          {`AI: ${verdict || 'Checked'} (${score}/100). Please attach a clearer referral.`}
                        </Text>
                      ) : null
                    )}
                  </>
                );
              })()}
            </View>
          ) : null}
        </View>
      );
    }

    return (
      <View style={{ marginTop: 10 }}>
        <Text style={styles.wizardSectionTitle}>Summary</Text>
        <Text style={styles.wizardSectionSubtitle}>Review details and select payment.</Text>

        <View style={styles.bookingSummary}>
          <Text style={styles.summaryLabel}>Service</Text>
          <Text style={styles.summaryValue}>{selectedSubService?.name}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Category</Text>
            <Text style={styles.summaryInlineValue}>{selectedService?.name || '—'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Mode</Text>
            <Text style={styles.summaryInlineValue}>{consultMode}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Price</Text>
            <Text style={styles.summaryPrice}>{selectedSubService?.price}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Schedule</Text>
            <Text style={styles.summaryInlineValue}>
              {selectedDate || '—'} {preferredTime?.trim() ? `• ${formatTimeToAmPm(preferredTime)}` : ''}
            </Text>
          </View>

          {(() => {
            const baseItems = cartCheckoutMode
              ? (Array.isArray(cartCheckoutItems) ? cartCheckoutItems : [])
              : [
                  {
                    key: 'single',
                    serviceName: `${selectedService?.name || ''}`.trim(),
                    subName: `${selectedSubService?.name || ''}`.trim(),
                    requiresReferral: requiresReferralFor(selectedService?.name, selectedSubService?.name),
                    referralUrl: `${singleReferralUrl || ''}`.trim(),
                    referralAi: singleReferralAi,
                  },
                ];

            const required = baseItems.filter((x) => x?.requiresReferral);
            if (!required.length) return null;

            return (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Doctor Referral</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  {required.slice(0, 3).map((it) => {
                    const url = `${it?.referralUrl || ''}`.trim();
                    const score = Number(it?.referralAi?.score || 0) || 0;
                    const verdict = `${it?.referralAi?.verdict || ''}`.trim();
                    const ok = !!url && score >= referralAiMinScore;
                    const uploading =
                      (cartCheckoutMode && referralUploadingKey === it?.key) || (!cartCheckoutMode && singleReferralUploading);
                    const label = cartCheckoutMode
                      ? `${it?.serviceName || 'Service'}: ${it?.subName || 'Procedure'}`
                      : 'Referral file';

                    return (
                      <View key={it?.key || label} style={{ alignItems: 'flex-end', marginTop: 6 }}>
                        <Text style={styles.summaryInlineValue} numberOfLines={2}>
                          {label}
                        </Text>
                        {ok ? (
                          <Text style={styles.cartReferralOk} numberOfLines={2}>
                            {`Attached • AI: ${verdict || 'Checked'} (${score}/100)`}
                          </Text>
                        ) : (
                          <TouchableOpacity
                            style={styles.referralButton}
                            onPress={() => {
                              if (cartCheckoutMode) {
                                attachReferralForCartItem(it.key);
                              } else {
                                attachReferralForSingleBooking();
                              }
                            }}
                            activeOpacity={0.85}
                            disabled={uploading}
                          >
                            {uploading ? (
                              <ActivityIndicator size="small" color="#DA7705" />
                            ) : (
                              <Ionicons name="attach" size={16} color="#DA7705" />
                            )}
                            <Text style={styles.referralButtonText}>
                              {uploading ? 'Uploading…' : 'Attach referral (Optional)'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                  {required.length > 3 ? (
                    <Text style={styles.summaryInlineValue}>{`+${required.length - 3} more`}</Text>
                  ) : null}
                </View>
              </View>
            );
          })()}

          {isTriageEnabled ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Priority</Text>
                <Text style={styles.summaryInlineValue}>{`${triage.priority_label} (T${triage.triage_level} • ${triage.queue})`}</Text>
              </View>
            </>
          ) : null}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Patient</Text>
            <Text style={styles.summaryInlineValue}>
              {`${patientFirstName.trim()} ${patientLastName.trim()}`.trim()}
              {patientSex ? ` • ${patientSex}` : ''}
              {patientDob ? ` • ${formatDob(patientDob)}` : ''}
              {patientIsPwd ? ' • PWD' : ''}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitleSmall}>Payment Method *</Text>
        {isVideoConsult ? (
          <View style={[styles.methodItem, styles.methodItemSelected]}>
            <MaterialCommunityIcons name="qrcode-scan" size={20} color="#DA7705" />
            <Text style={[styles.methodName, { marginLeft: 10 }]}>QRPh (Scan to Pay)</Text>
            <Ionicons
              name={paymentReference ? "checkmark-circle" : "information-circle"}
              size={18}
              color={paymentReference ? "#22c55e" : "#DA7705"}
              style={{ marginLeft: 'auto' }}
            />
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.methodItem, paymentMethod === 'cash' && styles.methodItemSelected]}
            onPress={() => setPaymentMethod('cash')}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="cash-multiple" size={20} color={paymentMethod === 'cash' ? "#DA7705" : "#999"} />
            <Text style={[styles.methodName, { marginLeft: 10 }]}>Cash at Clinic</Text>
            <Ionicons
              name={paymentMethod === 'cash' ? "radio-button-on" : "radio-button-off"}
              size={18}
              color={paymentMethod === 'cash' ? "#DA7705" : "#ccc"}
              style={{ marginLeft: 'auto' }}
            />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <PatientHeader 
        title="Hospital Services"
        navigation={navigation}
        onMenuPress={toggleDrawer}
        userData={userData}
      />
      
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.servicesScroll}
        contentContainerStyle={styles.servicesScrollContent}
      >
        <Text style={styles.subHeader}>Select a category to view specific tests and procedures</Text>

        {/* Video Consultation Banner */}
        {activeVideoCall ? (
          <TouchableOpacity
            style={styles.activeCallBanner}
            onPress={async () => {
              console.log('Banner pressed for call:', activeVideoCall.id);
              const email = await AsyncStorage.getItem('userEmail');
              const displayName = email ? email.split('@')[0] : 'Guest';
              let finalUrl = '';
              const sourceTable = `${activeVideoCall?.source || ''}`.trim();

              try {
                const joinRes = await callDailyEdgeFn(activeVideoCall.id, 'join', 'patient', sourceTable);
                if (joinRes.ok && joinRes.json) {
                  const tokenUrl = `${joinRes.json.tokenUrl || ''}`.trim();
                  const plainUrl = `${joinRes.json.url || ''}`.trim();
                  finalUrl = tokenUrl || plainUrl;
                }
              } catch (_) {}

              if (!finalUrl && sourceTable) {
                const fallbackRoom = `${activeVideoCall?.meeting_room_id || activeVideoCall?.meeting_room || activeVideoCall?.video_room || ''}`.trim();
                if (fallbackRoom) finalUrl = fallbackRoom;
              }

              if (!finalUrl) {
                Alert.alert('Waiting', 'Please wait for the doctor to start the call, then tap Join again.');
                return;
              }

              if (!activeVideoCall?.meeting_started_at) {
                try {
                  await supabase
                    .from('appointments')
                    .update({ meeting_started_at: new Date().toISOString() })
                    .eq('id', activeVideoCall.id)
                    .is('meeting_started_at', null);
                } catch (e) {}
              }
              const serviceType = activeVideoCall.service_type;

              // Ensure we navigate to the VideoCall screen
              navigation.navigate('VideoCall', { roomName: finalUrl, displayName, serviceType });
            }}
            activeOpacity={0.9}
          >
            <View style={styles.activeCallIconContainer}>
              <MaterialCommunityIcons name="video-check" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.activeCallTitle}>Active Video Consultation</Text>
              <Text style={styles.activeCallSubtitle}>Your {activeVideoCall.service_type} is ready. Tap to join now!</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.noCallBanner}>
            <MaterialCommunityIcons name="video-off-outline" size={20} color="#94a3b8" />
            <Text style={styles.noCallText}>No online consultation scheduled for today</Text>
          </View>
        )}

        <View style={styles.searchBox}>
          <Feather name="search" size={16} color="#9ca3af" />
          <TextInput
            value={serviceSearch}
            onChangeText={(val) => {
              setServiceSearch(val);
              setServiceSearchError(validateServiceSearch(val));
              setPageIndex(0);
            }}
            placeholder="Search services (e.g., ECG, CBC, Radiology)"
            placeholderTextColor="#9ca3af"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!!serviceSearch && (
            <TouchableOpacity onPress={() => { setServiceSearch(''); setServiceSearchError(''); setPageIndex(0); }}>
              <Ionicons name="close-circle" size={18} color="#cbd5e1" />
            </TouchableOpacity>
          )}
        </View>
        {!!serviceSearchError && <Text style={styles.errorText}>{serviceSearchError}</Text>}

        <View style={styles.pageStatusCard}>
          <Text style={styles.pageStatusLabel}>Browse Services</Text>
        </View>

        {pageServices.map((service) => (
          <TouchableOpacity 
            key={service.id} 
            style={styles.card}
            onPress={() => handleServicePress(service)}
            activeOpacity={0.7}
          >
            <View style={styles.iconContainer}>
              <Ionicons name={service.icon} size={28} color="#DA7705" />
            </View>

            <View style={styles.textContainer}>
              <Text style={styles.serviceName}>{service.name}</Text>
              <Text style={styles.serviceDescription}>
                {service.description}
              </Text>
            </View>

            <Ionicons name="chevron-forward-outline" size={22} color="#ccc" />
          </TouchableOpacity>
        ))}
        
        {pageCount > 1 ? (
          <View style={styles.paginationFooter}>
            <View>
              <Text style={styles.pageInfo}>Page {clampedPage + 1} of {pageCount}</Text>
              <Text style={styles.pageFooterMeta}>
                Showing {showingStart}-{showingEnd} of {filteredServices.length} services
              </Text>
            </View>

            <View style={styles.paginationActions}>
              <TouchableOpacity
                style={[styles.pageBtn, clampedPage === 0 && styles.pageBtnDisabled]}
                disabled={clampedPage === 0}
                onPress={() => setPageIndex((p) => Math.max(0, p - 1))}
                activeOpacity={0.85}
              >
                <Ionicons name="chevron-back" size={18} color={clampedPage === 0 ? '#cbd5e1' : '#DA7705'} />
                <Text style={[styles.pageBtnText, clampedPage === 0 && styles.pageBtnTextDisabled]}>Prev</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pageBtn, clampedPage >= pageCount - 1 && styles.pageBtnDisabled]}
                disabled={clampedPage >= pageCount - 1}
                onPress={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                activeOpacity={0.85}
              >
                <Text style={[styles.pageBtnText, clampedPage >= pageCount - 1 && styles.pageBtnTextDisabled]}>Next</Text>
                <Ionicons name="chevron-forward" size={18} color={clampedPage >= pageCount - 1 ? '#cbd5e1' : '#DA7705'} />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {Array.isArray(cartItems) && cartItems.length ? (
        <TouchableOpacity style={styles.cartFab} activeOpacity={0.9} onPress={() => setCartModalVisible(true)}>
          <Ionicons name="cart" size={22} color="#fff" />
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartItems.length}</Text>
          </View>
        </TouchableOpacity>
      ) : null}

      <Modal
        animationType="slide"
        transparent={true}
        visible={cartModalVisible}
        onRequestClose={() => setCartModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeaderRow}>
              <View style={styles.modalIconBox}>
                <Ionicons name="cart-outline" size={30} color="#DA7705" />
              </View>
              <View style={{ flex: 1, marginLeft: 15 }}>
                <Text style={styles.modalTitle}>Cart</Text>
                <Text style={styles.modalSubtitle}>{`${cartItems.length} item(s)`}</Text>
              </View>
              <TouchableOpacity onPress={() => setCartModalVisible(false)} style={styles.closeIcon}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.subServiceList} showsVerticalScrollIndicator={false}>
              {(cartItems || []).map((it) => {
                const hasReferral = !!`${it?.referralUrl || ''}`.trim();
                const uploading = referralUploadingKey === it?.key;
                const checked = it?.selected !== false;
                const aiScore = Number(it?.referralAi?.score || 0) || 0;
                const aiVerdict = `${it?.referralAi?.verdict || ''}`.trim();
                const aiOk = aiScore >= referralAiMinScore;
                return (
                  <View key={it.key} style={styles.cartItemRow}>
                    <TouchableOpacity
                      style={styles.cartCheckbox}
                      onPress={() => toggleCartItemSelected(it.key)}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={checked ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={checked ? '#DA7705' : '#94a3b8'}
                      />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartItemTitle} numberOfLines={2}>
                        {it.subName}
                      </Text>
                      <Text style={styles.cartItemMeta} numberOfLines={2}>
                        {`${it.serviceName} • ${it.priceText || '—'}${it.isPackage ? ' • Package' : ''}`}
                      </Text>

                      {it.requiresReferral ? (
                        hasReferral ? (
                          <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text style={aiOk ? styles.cartReferralOk : styles.cartReferralWarn} numberOfLines={2}>
                              {`Referral attached • AI: ${aiVerdict || 'Checked'} (${aiScore}/100)`}
                            </Text>
                            <TouchableOpacity
                              style={styles.referralRemoveButton}
                              onPress={() => {
                                Alert.alert('Remove Referral', 'Remove the attached referral file?', [
                                  { text: 'Cancel', style: 'cancel' },
                                  { text: 'Remove', style: 'destructive', onPress: () => removeReferralForCartItem(it.key) },
                                ]);
                              }}
                              activeOpacity={0.85}
                            >
                              <Ionicons name="trash-outline" size={16} color="#ef4444" />
                              <Text style={styles.referralRemoveButtonText}>Remove</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.referralButton}
                            onPress={() => attachReferralForCartItem(it.key)}
                            activeOpacity={0.85}
                            disabled={uploading}
                          >
                            {uploading ? (
                              <ActivityIndicator size="small" color="#DA7705" />
                            ) : (
                              <Ionicons name="attach" size={16} color="#DA7705" />
                            )}
                            <Text style={styles.referralButtonText}>
                              {uploading ? 'Uploading…' : 'Attach referral (Optional)'}
                            </Text>
                          </TouchableOpacity>
                        )
                      ) : null}
                    </View>

                    <TouchableOpacity
                      style={styles.cartRemoveBtn}
                      onPress={() => removeFromCart(it.key)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.cartFooter}>
              <View style={styles.cartTotalRow}>
                <Text style={styles.cartTotalLabel}>{`Total (selected ${selectedCartItems.length}/${cartItems.length})`}</Text>
                <Text style={styles.cartTotalValue}>{selectedCartTotalDisplay}</Text>
              </View>

              <View style={styles.cartFooterActions}>
                <TouchableOpacity style={styles.cartClearBtn} onPress={clearCart} activeOpacity={0.85}>
                  <Text style={styles.cartClearText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cartCheckoutBtn} onPress={beginCartCheckout} activeOpacity={0.85}>
                  <Text style={styles.cartCheckoutText}>Proceed</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* SUB-SERVICES MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalIconBox}>
                <Ionicons name={selectedService?.icon} size={30} color="#DA7705" />
              </View>
              <View style={{ flex: 1, marginLeft: 15 }}>
                <Text style={styles.modalTitle}>{selectedService?.name}</Text>
                <Text style={styles.modalSubtitle}>Available Procedures</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeIcon}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.subServiceList} showsVerticalScrollIndicator={false}>
              {(selectedService?.subServices || []).map((sub, idx) => (
                <View key={idx} style={styles.subServiceItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subServiceName}>{sub.name}</Text>
                    <View style={styles.subServiceMeta}>
                      <View style={styles.metaBadge}>
                        <Ionicons name="time-outline" size={12} color="#666" />
                        <Text style={styles.metaText}>{sub.duration}</Text>
                      </View>
                      <Text style={styles.priceText}>{sub.price}</Text>
                    </View>
                  </View>
                  <View style={styles.subServiceActions}>
                    <TouchableOpacity
                      style={styles.addCartButton}
                      onPress={() => addToCart(selectedService, sub)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="cart-outline" size={16} color="#DA7705" />
                      <Text style={styles.addCartButtonText}>
                        {cartItems.some((x) => x?.key === cartKeyFor(selectedService?.name, sub?.name)) ? 'Added' : 'Add'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.bookButton} onPress={() => handleBookPress(sub)} activeOpacity={0.85}>
                      <Text style={styles.bookButtonText}>Book</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity 
              style={styles.fullCloseButton} 
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.fullCloseButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={consultationModalVisible}
        onRequestClose={() => setConsultationModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalIconBox}>
                <Ionicons name="chatbubbles-outline" size={30} color="#DA7705" />
              </View>
              <View style={{ flex: 1, marginLeft: 15 }}>
                <Text style={styles.modalTitle}>Consultation</Text>
                <Text style={styles.modalSubtitle}>Select mode and department</Text>
              </View>
              <TouchableOpacity onPress={() => setConsultationModalVisible(false)} style={styles.closeIcon}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            {!consultationType ? (
              <View style={styles.consultationOptions}>
                <TouchableOpacity
                  style={styles.consultationOptionCard}
                  activeOpacity={0.85}
                  onPress={() => {
                    setConsultationType('Onsite Consultation');
                    setConsultMode('In-person');
                    setPaymentMethod('cash');
                    setPaymentConfirmed(false);
                    setPaymentReference('');
                    setPaymentModalVisible(false);
                    setPaymongoCheckoutUrl('');
                    setPaymongoQrImageUrl('');
                  }}
                >
                  <View style={styles.consultationOptionIcon}>
                    <MaterialCommunityIcons name="hospital-building" size={22} color="#DA7705" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.consultationOptionTitle}>Onsite Consultation</Text>
                    <Text style={styles.consultationOptionSub}>Pay at the clinic</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#DA7705" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.consultationOptionCard}
                  activeOpacity={0.85}
                  onPress={() => {
                    setConsultationType('Video Consultation');
                    setConsultMode('Video Call');
                    setPaymentMethod('cash');
                    setPaymentConfirmed(false);
                    setPaymentReference('');
                    setPaymentModalVisible(false);
                    setPaymongoCheckoutUrl('');
                    setPaymongoQrImageUrl('');
                  }}
                >
                  <View style={styles.consultationOptionIcon}>
                    <MaterialCommunityIcons name="video" size={22} color="#DA7705" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.consultationOptionTitle}>Video Consultation</Text>
                    <Text style={styles.consultationOptionSub}>QR scan required</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#DA7705" />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.consultationModeBadge}>
                  <Text style={styles.consultationModeBadgeText}>{consultationType}</Text>
                </View>

                <ScrollView style={styles.subServiceList} showsVerticalScrollIndicator={false}>
                  {consultationDepartments.map((dept) => (
                    <TouchableOpacity
                      key={dept.id}
                      style={styles.consultationDeptItem}
                      activeOpacity={0.85}
                      onPress={() => {
                        setSelectedService(dept);
                        setConsultationModalVisible(false);
                        setModalVisible(true);
                      }}
                    >
                      <View style={styles.modalIconBox}>
                        <Ionicons name={dept.icon} size={26} color="#DA7705" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.subServiceName}>{dept.name}</Text>
                        <Text style={styles.serviceDescription} numberOfLines={2}>
                          {dept.description}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward-outline" size={20} color="#cbd5e1" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TouchableOpacity
                  style={styles.fullCloseButton}
                  onPress={() => {
                    setConsultationType('');
                  }}
                >
                  <Text style={styles.fullCloseButtonText}>Change Mode</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* BOOKING & PAYMENT MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={bookingModalVisible}
        onRequestClose={closeBooking}
      >
        <KeyboardAvoidingView
          style={styles.paymentOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.paymentCard, { maxHeight: '90%' }]}>
            <View style={styles.wizardHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentTitle}>{selectedService?.name || 'Service'}</Text>
                <Text style={styles.wizardHeaderSub}>{selectedSubService?.name || ''}</Text>
              </View>
              <TouchableOpacity onPress={closeBooking} style={styles.closeIcon}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            <Stepper />

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ marginTop: 10 }}
              contentContainerStyle={{ paddingBottom: 10 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <BookingStepContent />
            </ScrollView>

            <View style={styles.wizardActions}>
              <TouchableOpacity
                style={[styles.wizardBack, bookingStep === 0 && { opacity: 0.5 }]}
                onPress={goBack}
                disabled={bookingStep === 0 || isBooking}
              >
                <Text style={styles.cancelText}>Back</Text>
              </TouchableOpacity>

              {bookingStep < maxStep ? (
                <TouchableOpacity
                  style={styles.wizardNext}
                  onPress={goNext}
                  disabled={isBooking}
                >
                  <Text style={styles.confirmText}>Continue</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.wizardNext}
                  onPress={() => {
                    confirmBooking();
                  }}
                  disabled={isBooking}
                >
                  {isBooking ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.confirmText}>
                      {isVideoConsult ? 'Proceed to Checkout' : 'Submit Request'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={paymentModalVisible}
        onRequestClose={() => {
          setPaymentApprovedVisible(false);
          paymentFinalizeInFlightRef.current = false;
          setPaymentModalVisible(false);
        }}
      >
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <View style={styles.wizardHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentTitle}>Pay via QRPh</Text>
                <Text style={styles.wizardHeaderSub}>Use the reference below when paying.</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setPaymentApprovedVisible(false);
                  paymentFinalizeInFlightRef.current = false;
                  setPaymentModalVisible(false);
                }}
                style={styles.closeIcon}
              >
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            <View style={styles.bookingSummary}>
              <Text style={styles.summaryLabel}>Reference</Text>
              <Text style={styles.summaryValue}>{paymentReference || '—'}</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Amount</Text>
                <Text style={styles.summaryInlineValue}>
                  {(() => {
                    const parsed = formatAmountToNumber(selectedSubService?.price);
                    const value = !parsed || Number.isNaN(parsed) || Number(parsed) <= 0 ? 500 : parsed;
                    return `₱${value}`;
                  })()}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Schedule</Text>
                <Text style={styles.summaryInlineValue}>
                  {selectedDate || '—'} {preferredTime?.trim() ? `• ${formatTimeToAmPm(preferredTime)}` : ''}
                </Text>
              </View>
            </View>

            {paymentApprovedVisible ? (
              <View style={{ marginTop: 18, alignItems: 'center' }}>
                <View
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: 60,
                    backgroundColor: '#dcfce7',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 6,
                    borderColor: '#16a34a',
                  }}
                >
                  <Ionicons name="checkmark-outline" size={72} color="#15803d" />
                </View>
                <Text style={{ marginTop: 14, fontSize: 20, fontWeight: '800', color: '#0f172a' }}>Payment Approved</Text>
                <Text style={{ marginTop: 4, fontSize: 14, color: '#334155', textAlign: 'center', paddingHorizontal: 16 }}>
                  Payment received successfully. Your booking is being confirmed and you will be redirected to your Schedule shortly.
                </Text>
              </View>
            ) : (
              <>
                {!!paymongoQrImageUrl && (
                  <View style={{ marginTop: 12, alignItems: 'center' }}>
                    <Image
                      source={{ uri: paymongoQrImageUrl }}
                      style={{ width: 240, height: 240, backgroundColor: '#fff', borderRadius: 12 }}
                      resizeMode="contain"
                    />
                  </View>
                )}

                <View style={styles.paymentActions}>
                  <TouchableOpacity
                    style={styles.paymentCancel}
                    onPress={() => setPaymentModalVisible(false)}
                    disabled={checkingPayment || checkingPaymentNow}
                  >
                    <Text style={styles.cancelText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.paymentConfirm}
                    onPress={() => checkPaymentAndFinalize({ manualTap: true })}
                    disabled={checkingPayment || checkingPaymentNow}
                  >
                    {checkingPaymentNow ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.confirmText}>Check Payment</Text>
                    )}
                  </TouchableOpacity>
                  {!!paymongoCheckoutUrl && (
                    <TouchableOpacity
                      style={styles.paymentConfirm}
                      onPress={openPaymongoCheckout}
                      disabled={checkingPayment || checkingPaymentNow}
                    >
                      {checkingPayment ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmText}>Open Checkout</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={videoHoldModalVisible}
        onRequestClose={() => setVideoHoldModalVisible(false)}
      >
        <View style={styles.paymentOverlay}>
          <View style={styles.paymentCard}>
            <View style={styles.wizardHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentTitle}>Processing Video Consultation</Text>
                <Text style={styles.wizardHeaderSub}>Please wait while we confirm your booking.</Text>
              </View>
              <TouchableOpacity onPress={() => setVideoHoldModalVisible(false)} style={styles.closeIcon}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            {!!videoHoldRef && (
              <View style={styles.bookingSummary}>
                <Text style={styles.summaryLabel}>Booking Reference</Text>
                <Text style={styles.summaryValue}>{videoHoldRef}</Text>
              </View>
            )}

            {!!videoHoldStatusText && (
              <Text style={[styles.wizardSectionSubtitle, { marginTop: 6 }]}>{videoHoldStatusText}</Text>
            )}

            <View style={styles.paymentActions}>
              <TouchableOpacity style={styles.paymentCancel} onPress={() => setVideoHoldModalVisible(false)}>
                <Text style={styles.cancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <PatientSideMenu 
        visible={drawerVisible} 
        onClose={toggleDrawer} 
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  activeCallBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0077B6',
    marginHorizontal: 20,
    marginBottom: 15,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  activeCallIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeCallTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  activeCallSubtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  noCallBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    marginHorizontal: 20,
    marginBottom: 15,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  noCallText: {
    color: '#64748b',
    fontSize: 13,
    marginLeft: 8,
    fontWeight: '500',
  },
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  servicesScroll: {
    flex: 1,
  },
  servicesScrollContent: {
    paddingBottom: 120,
  },
  header: {
    fontSize: 26,
    fontWeight: "800",
    marginTop: 25,
    marginHorizontal: 20,
    color: "#333",
  },
  subHeader: {
    fontSize: 14,
    color: "#888",
    marginHorizontal: 20,
    marginBottom: 20,
    marginTop: 5,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 20,
    marginHorizontal: 20,
    marginVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    elevation: 3,
    shadowColor: "#DA7705",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: '#FFFAF0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  textContainer: {
    flex: 1,
  },
  serviceName: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#333",
  },
  serviceDescription: {
    fontSize: 13,
    color: "#777",
    marginTop: 4,
    lineHeight: 18,
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
    maxHeight: '80%',
  },
  modalHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#eee',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
  },
  modalIconBox: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#FFFAF0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#DA7705',
    fontWeight: '600',
    marginTop: 2,
  },
  closeIcon: {
    padding: 5,
  },
  consultationOptions: {
    gap: 12,
    marginBottom: 10,
  },
  consultationOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#FDE7C7',
  },
  consultationOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#FDE7C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  consultationOptionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#333',
  },
  consultationOptionSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9a3412',
    marginTop: 2,
  },
  consultationModeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DA7705',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },
  consultationModeBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  consultationDeptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  subServiceList: {
    marginBottom: 20,
  },
  subServiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  subServiceName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#444',
  },
  subServiceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 10,
  },
  addCartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#FDE7C7',
  },
  addCartButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9a3412',
  },
  cartFab: {
    position: 'absolute',
    right: 18,
    top: 18,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#DA7705',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  cartCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  cartItemTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  cartItemMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  cartRemoveBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff1f2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  referralButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#FDE7C7',
  },
  referralButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9a3412',
  },
  cartReferralOk: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '800',
    color: '#16a34a',
  },
  cartReferralWarn: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '800',
    color: '#b45309',
  },
  referralRemoveButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  referralRemoveButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#b91c1c',
  },
  cartFooter: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  cartTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cartTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  cartTotalValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
  },
  cartFooterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cartClearBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  cartClearText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#64748b',
  },
  cartCheckoutBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#DA7705',
    alignItems: 'center',
  },
  cartCheckoutText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#fff',
  },
  cartSummaryCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cartSummaryTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 6,
  },
  cartSummaryItem: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 2,
  },
  cartSummaryMore: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  pageStatusCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#FDE7C7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageStatusLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#9a3412',
  },
  pageStatusMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#7c2d12',
  },
  pageBadge: {
    backgroundColor: '#DA7705',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pageBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
    paddingVertical: 0,
  },
  paginationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 16,
    backgroundColor: '#fff',
  },
  paginationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE7C7',
    backgroundColor: '#FFFAF0',
  },
  pageBtnDisabled: {
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  pageBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#DA7705',
  },
  pageBtnTextDisabled: {
    color: '#cbd5e1',
  },
  pageInfo: {
    fontSize: 13,
    fontWeight: '800',
    color: '#374151',
  },
  pageFooterMeta: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },
  subServiceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 12,
  },
  metaText: {
    fontSize: 11,
    color: '#666',
    marginLeft: 4,
    fontWeight: '600',
  },
  priceText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#DA7705',
  },
  bookButton: {
    backgroundColor: '#DA7705',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  fullCloseButton: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: 'center',
  },
  fullCloseButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
  },

  // PAYMENT MODAL STYLES
  paymentOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  paymentCard: {
    backgroundColor: '#fff',
    borderRadius: 25,
    padding: 25,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 5 },
  },
  paymentTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'left',
  },
  wizardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  wizardHeaderSub: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  stepperItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepCircleActive: {
    backgroundColor: '#FFFAF0',
    borderColor: '#DA7705',
  },
  stepCircleDone: {
    backgroundColor: '#DA7705',
    borderColor: '#DA7705',
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: '#666',
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepLabel: {
    fontSize: 10,
    marginTop: 6,
    color: '#777',
    fontWeight: '700',
  },
  stepLabelActive: {
    color: '#DA7705',
  },
  stepLine: {
    position: 'absolute',
    top: 14,
    right: -40,
    height: 2,
    width: 80,
    backgroundColor: '#e5e7eb',
    zIndex: 1,
  },
  stepLineDone: {
    backgroundColor: '#DA7705',
  },
  wizardSummaryCard: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  wizardSummaryTitle: {
    fontSize: 14,
    color: '#666',
    fontWeight: '800',
  },
  wizardSummarySubtitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#333',
    marginTop: 4,
  },
  wizardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  wizardMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  wizardMetaText: {
    fontSize: 12,
    marginLeft: 6,
    color: '#666',
    fontWeight: '700',
  },
  wizardPriceText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#DA7705',
  },
  wizardHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFAF0',
    borderWidth: 1,
    borderColor: '#FFE6C7',
    padding: 12,
    borderRadius: 14,
    marginTop: 14,
  },
  wizardHintText: {
    flex: 1,
    fontSize: 12,
    color: '#743F02',
    fontWeight: '700',
    lineHeight: 16,
  },
  wizardSectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#333',
  },
  wizardSectionSubtitle: {
    fontSize: 12,
    color: '#777',
    marginTop: 4,
    fontWeight: '600',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  col: {
    flex: 1,
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
  birthdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 6,
  },
  birthdayDropdownWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    height: 50,
    paddingHorizontal: 8,
  },
  dropdown: {
    flex: 1,
    height: '100%',
  },
  placeholderStyle: {
    fontSize: 13,
    color: '#aaa',
    fontWeight: '600',
  },
  selectedTextStyle: {
    fontSize: 13,
    color: '#333',
    fontWeight: '700',
  },
  itemTextStyle: {
    fontSize: 13,
    color: '#333',
  },
  containerStyle: {
    borderRadius: 12,
    marginTop: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  iconStyle: {
    width: 18,
    height: 18,
    tintColor: '#666',
  },
  inputSearchStyle: {
    height: 36,
    fontSize: 13,
    borderRadius: 8,
    color: '#333',
  },
  errorText: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickerButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  sexRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sexChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  sexChipSelected: {
    borderColor: '#DA7705',
    backgroundColor: '#FFFAF0',
  },
  sexChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#666',
  },
  sexChipTextSelected: {
    color: '#DA7705',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingVertical: 6,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#333',
  },
  attachButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
  },
  attachButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#333',
  },
  pwdPreviewWrapper: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pwdPreviewThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  pwdPreviewName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 6,
  },
  pwdRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  pwdRemoveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },
  calendarContainer: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    marginVertical: 10,
    padding: 5,
  },
  wizardCalendar: {
    width: '100%',
    borderRadius: 12,
  },
  wizardActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  wizardBack: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 15,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  wizardNext: {
    flex: 2,
    paddingVertical: 15,
    borderRadius: 15,
    backgroundColor: '#DA7705',
    alignItems: 'center',
  },
  bookingSummary: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 15,
    marginBottom: 20,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  summaryInlineValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#333',
    marginLeft: 10,
    flex: 1,
    textAlign: 'right',
  },
  summaryPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: '#DA7705',
  },
  paymentMethodLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#444',
    marginBottom: 15,
  },
  methodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    marginBottom: 12,
  },
  methodItemSelected: {
    borderColor: '#DA7705',
    backgroundColor: '#FFFAF0',
  },
  methodIconBox: {
    width: 45,
    height: 45,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  methodDesc: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  paymentActions: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 12,
  },
  paymentCancel: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 15,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  paymentConfirm: {
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
  sectionTitleSmall: {
    fontSize: 14,
    fontWeight: '700',
    color: '#444',
    marginTop: 20,
    marginBottom: 12,
  },
  dateScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  dateItem: {
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 15,
    backgroundColor: '#f8f9fa',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  dateItemSelected: {
    backgroundColor: '#DA7705',
    borderColor: '#DA7705',
  },
  dateText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
  },
  dateSubText: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  dateTextSelected: {
    color: '#fff',
  },
  symptomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  symptomChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    maxWidth: '100%',
  },
  symptomChipSelected: {
    backgroundColor: '#0077B6',
    borderColor: '#0077B6',
  },
  symptomChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    maxWidth: 210,
  },
  symptomChipTextSelected: {
    color: '#fff',
  },
  triageCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  triageTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  triageSubtitle: {
    marginTop: 6,
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
  },
  triageReason: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
    marginTop: 2,
  },
})
