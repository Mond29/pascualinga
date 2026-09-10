import React, { useEffect, useRef, useState } from 'react';
import { 
  View, Text, Animated, TextInput, TouchableOpacity, 
  Alert, ActivityIndicator, ScrollView, Platform, SafeAreaView, Modal,
  KeyboardAvoidingView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'; 
import { supabase } from '../../lib/supabase';
import emailjs from '@emailjs/react-native';
import RegisterStyle from '../../styles/RegisterStyles';
import { Dropdown } from 'react-native-element-dropdown';
import { phLocations } from '../../lib/ph_locations';

export default function Registration({ navigation }) {
  // --- States ---
  const [formData, setFormData] = useState({ 
    firstName: '', lastName: '', middleInitial: '',
    email: '', password: '', confirmPassword: '',
    province: '', city: '', barangay: '', zipCode: '', streetNumber: '',
    age: '', birthday: '', contact: '',
    gender: '' 
  });
  const [birthDateState, setBirthDateState] = useState({
    month: '',
    day: '',
    year: ''
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState({ email: false, contact: false });
  const [showPrivacyModal, setShowPrivacyModal] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // --- Birthday Dropdown Data ---
  const months = [
    { label: 'January', value: '01' }, { label: 'February', value: '02' },
    { label: 'March', value: '03' }, { label: 'April', value: '04' },
    { label: 'May', value: '05' }, { label: 'June', value: '06' },
    { label: 'July', value: '07' }, { label: 'August', value: '08' },
    { label: 'September', value: '09' }, { label: 'October', value: '10' },
    { label: 'November', value: '11' }, { label: 'December', value: '12' },
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 120 }, (_, i) => ({
    label: (currentYear - i).toString(),
    value: (currentYear - i).toString()
  }));

  const [days, setDays] = useState([]);

  useEffect(() => {
    const { month, year } = birthDateState;
    if (month && year) {
      const daysInMonth = new Date(year, month, 0).getDate();
      setDays(Array.from({ length: daysInMonth }, (_, i) => ({
        label: (i + 1).toString(),
        value: (i + 1).toString().padStart(2, '0')
      })));
    } else {
      setDays(Array.from({ length: 31 }, (_, i) => ({
        label: (i + 1).toString(),
        value: (i + 1).toString().padStart(2, '0')
      })));
    }
  }, [birthDateState.month, birthDateState.year]);

  const handleBirthdayChange = (type, value) => {
    const newState = { ...birthDateState, [type]: value };
    setBirthDateState(newState);

    if (newState.month && newState.day && newState.year) {
      const formattedDate = `${newState.year}-${newState.month}-${newState.day}`;
      const birthDate = new Date(formattedDate);
      const today = new Date();
      
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      setFormData(prev => ({ ...prev, birthday: formattedDate, age: age.toString() }));
      validateField('birthday', formattedDate);
    }
  };

  const PH_PROVINCE_REGION_LIST = [
    'NCR',
    'Abra',
    'Agusan del Norte',
    'Agusan del Sur',
    'Aklan',
    'Albay',
    'Antique',
    'Apayao',
    'Aurora',
    'Basilan',
    'Bataan',
    'Batanes',
    'Batangas',
    'Benguet',
    'Biliran',
    'Bohol',
    'Bukidnon',
    'Bulacan',
    'Cagayan',
    'Camarines Norte',
    'Camarines Sur',
    'Camiguin',
    'Capiz',
    'Catanduanes',
    'Cavite',
    'Cebu',
    'Compostela Valley',
    'Cotabato',
    'Davao de Oro',
    'Davao del Norte',
    'Davao del Sur',
    'Davao Occidental',
    'Davao Oriental',
    'Dinagat Islands',
    'Eastern Samar',
    'Guimaras',
    'Ifugao',
    'Ilocos Norte',
    'Ilocos Sur',
    'Iloilo',
    'Isabela',
    'Kalinga',
    'La Union',
    'Laguna',
    'Lanao del Norte',
    'Lanao del Sur',
    'Leyte',
    'Maguindanao',
    'Marinduque',
    'Masbate',
    'Misamis Occidental',
    'Misamis Oriental',
    'Mountain Province',
    'Negros Occidental',
    'Negros Oriental',
    'Northern Samar',
    'Nueva Ecija',
    'Nueva Vizcaya',
    'Occidental Mindoro',
    'Oriental Mindoro',
    'Palawan',
    'Pampanga',
    'Pangasinan',
    'Quezon',
    'Quirino',
    'Rizal',
    'Romblon',
    'Samar',
    'Sarangani',
    'Siquijor',
    'Sorsogon',
    'South Cotabato',
    'Southern Leyte',
    'Sultan Kudarat',
    'Sulu',
    'Surigao del Norte',
    'Surigao del Sur',
    'Tarlac',
    'Tawi-Tawi',
    'Zambales',
    'Zamboanga del Norte',
    'Zamboanga del Sur',
    'Zamboanga Sibugay',
  ];

  const provinceData = PH_PROVINCE_REGION_LIST.map((p) => ({ label: p, value: p }));

  const [cityData, setCityData] = useState([]);
  const [barangayData, setBarangayData] = useState([]);
  const provinceHasDataset = !!(formData.province && phLocations?.[formData.province]);

  useEffect(() => {
    if (!provinceHasDataset) {
      setCityData([]);
      setBarangayData([]);
      return;
    }
    const level1 = phLocations[formData.province] || {};
    setCityData(Object.keys(level1).map((c) => ({ label: c, value: c })));
    setBarangayData([]);
  }, [formData.province, provinceHasDataset]);

  useEffect(() => {
    if (!provinceHasDataset || !formData.city) {
      setBarangayData([]);
      return;
    }
    const cityInfo = phLocations?.[formData.province]?.[formData.city] || null;
    if (!cityInfo) {
      setBarangayData([]);
      return;
    }
    setBarangayData((cityInfo.barangays || []).map((b) => ({ label: b, value: b })));
    const nextZip = `${cityInfo.zipCode || ''}`.trim();
    if (nextZip && nextZip !== `${formData.zipCode || ''}`.trim()) {
      setFormData((prev) => ({ ...prev, zipCode: nextZip }));
      validateField('zipCode', nextZip);
    }
  }, [formData.city, formData.province, formData.zipCode, provinceHasDataset]);

  // --- Animations ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();
  }, []);

  const animatePress = (toValue) => {
    Animated.spring(buttonScale, {
      toValue,
      useNativeDriver: true,
      friction: 4,
      tension: 40,
    }).start();
  };

  // --- Validation Logic ---
  const sanitizeName = (v) => `${v || ''}`.replace(/[^a-zA-ZñÑ\s'-]/g, '').replace(/\s{2,}/g, ' ');
  const sanitizeDigits = (v) => `${v || ''}`.replace(/[^\d]/g, '');
  const sanitizeEmail = (v) => `${v || ''}`.replace(/\s+/g, '');

  const validateField = async (name, value) => {
    let errorMsg = '';

    switch (name) {
      case 'firstName':
      case 'lastName':
        if (!`${value || ''}`.trim()) errorMsg = `${name === 'firstName' ? 'First' : 'Last'} name is required.`;
        else if (`${value || ''}`.trim().length < 2) errorMsg = 'Name is too short.';
        else if (sanitizeName(value) !== `${value || ''}`) errorMsg = 'Letters only. Numbers and special characters are not allowed.';
        else if (!/^[a-zA-ZñÑ]+(?:[ \t'-][a-zA-ZñÑ]+)*$/.test(`${value || ''}`.trim())) errorMsg = 'Please enter a valid name.';
        break;
      
      case 'email':
        {
          const v = `${value || ''}`.trim().toLowerCase();
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          const allowedDomainRegex = /^[^\s@]+@(gmail\.com|yahoo\.com)$/i;
          if (!v) errorMsg = 'Email is required.';
          else if (!emailRegex.test(v)) errorMsg = 'Please enter a valid email address.';
          else if (!allowedDomainRegex.test(v)) errorMsg = 'Only @gmail.com or @yahoo.com emails are allowed.';
        }
        break;

      case 'password':
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!value) errorMsg = 'Password is required.';
        else if (value.length < 8) errorMsg = 'Must be at least 8 characters.';
        else if (!/[A-Z]/.test(value)) errorMsg = 'Need at least one uppercase letter.';
        else if (!/[a-z]/.test(value)) errorMsg = 'Need at least one lowercase letter.';
        else if (!/\d/.test(value)) errorMsg = 'Need at least one number.';
        else if (!/[@$!%*?&]/.test(value)) errorMsg = 'Need at least one special character.';
        break;

      case 'confirmPassword':
        if (!value) errorMsg = 'Please confirm your password.';
        else if (value !== formData.password) errorMsg = 'Passwords do not match.';
        break;

      case 'contact':
        if (!`${value || ''}`.trim()) errorMsg = 'Contact number is required.';
        else if (!/^09\d{9}$/.test(`${value || ''}`.trim())) errorMsg = 'Must be a valid 11-digit number (09XXXXXXXXX).';
        break;

      case 'province':
        if (!value) errorMsg = 'Please select your Province/Region.';
        else if (!PH_PROVINCE_REGION_LIST.includes(value)) errorMsg = 'Please select a valid Province/Region.';
        break;

      case 'city':
        if (!`${value || ''}`.trim()) errorMsg = 'Please select your City/Municipality.';
        else if (formData.province && phLocations?.[formData.province] && !phLocations?.[formData.province]?.[value]) {
          errorMsg = 'Please select a valid City/Municipality.';
        }
        break;

      case 'barangay':
        if (!`${value || ''}`.trim()) errorMsg = 'Please select your Barangay.';
        else if (formData.province && formData.city && phLocations?.[formData.province]?.[formData.city]) {
          const list = phLocations?.[formData.province]?.[formData.city]?.barangays || [];
          if (Array.isArray(list) && list.length > 0 && !list.includes(value)) {
            errorMsg = 'Please select a valid Barangay.';
          }
        }
        break;
      
      case 'zipCode':
        if (!`${value || ''}`.trim()) errorMsg = 'Zip code is required.';
        else if (!/^\d{4}$/.test(`${value || ''}`.trim())) errorMsg = 'Zip code must be 4 digits.';
        break;
      
      case 'streetNumber':
        if (!`${value || ''}`.trim()) errorMsg = 'Street address is required.';
        else if (`${value || ''}`.trim().length < 3) errorMsg = 'Street address is too short.';
        break;

      case 'birthday':
        if (!value) errorMsg = 'Birthday is required.';
        else {
          const birthDate = new Date(value);
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const m = today.getMonth() - birthDate.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          if (birthDate > today) errorMsg = 'Birthday cannot be in the future.';
          else if (age < 1) errorMsg = 'Patient must be at least 1 year old.';
        }
        break;

      case 'gender':
        if (!`${value || ''}`.trim()) errorMsg = 'Please select your sex.';
        break;
    }

    setErrors(prev => ({ ...prev, [name]: errorMsg }));
    return errorMsg;
  };

  const handleChange = (name, value) => {
    let nextValue = value;
    if (name === 'firstName' || name === 'lastName') nextValue = sanitizeName(value);
    if (name === 'middleInitial') nextValue = sanitizeName(value).replace(/\s+/g, '').slice(0, 1);
    if (name === 'email') nextValue = sanitizeEmail(value);
    if (name === 'contact') nextValue = sanitizeDigits(value).slice(0, 11);
    if (name === 'zipCode') nextValue = sanitizeDigits(value).slice(0, 4);

    if (name === 'province') {
      setFormData((prev) => ({ ...prev, province: nextValue, city: '', barangay: '', zipCode: '' }));
      validateField('province', nextValue);
      validateField('city', '');
      validateField('barangay', '');
      validateField('zipCode', '');
      return;
    }

    if (name === 'city') {
      setFormData((prev) => ({ ...prev, city: nextValue, barangay: '', zipCode: '' }));
      validateField('city', nextValue);
      validateField('barangay', '');
      validateField('zipCode', '');
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: nextValue }));
    validateField(name, nextValue);
  };

  const handleRegister = async () => {
    // Validate all fields before proceeding
    const newErrors = {};
    for (const key of Object.keys(formData)) {
      if (key === 'middleInitial') continue;
      const error = await validateField(key, formData[key]);
      if (error) newErrors[key] = error;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      Alert.alert("Form Incomplete", "Please fix the errors in the form before proceeding.");
      return;
    }

    setLoading(true);

    // Email & Contact Availability Check
    try {
      const { data: emailData } = await supabase.from('accounts').select('email').eq('email', formData.email.trim().toLowerCase()).limit(1);
      if (emailData && emailData.length > 0) {
        setErrors(prev => ({ ...prev, email: 'Email already registered.' }));
        setLoading(false);
        return;
      }

      const { data: contactData } = await supabase.from('accounts').select('contact_number').eq('contact_number', formData.contact.trim()).limit(1);
      if (contactData && contactData.length > 0) {
        setErrors(prev => ({ ...prev, contact: 'Mobile number already in use.' }));
        setLoading(false);
        return;
      }

      // Proceed with OTP
      const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
      const fullName = `${formData.firstName} ${formData.middleInitial ? formData.middleInitial + '. ' : ''}${formData.lastName}`.trim();
      const fullAddress = `${formData.streetNumber}, ${formData.barangay}, ${formData.city}, ${formData.province} ${formData.zipCode}`.trim();

      const serviceID = 'service_abc123';
      const templateID = 'template_xyz456';
      const publicKey = 'Ng36Hv0ZvKc59armr';

      const templateParams = {
        to_name: fullName,
        user_email: formData.email.trim().toLowerCase(), 
        email: formData.email.trim().toLowerCase(),
        passcode: generatedOTP,
      };

      const emailResponse = await emailjs.send(serviceID, templateID, templateParams, { publicKey: publicKey });

      if (emailResponse.status === 200) {
        Alert.alert("Verification Sent", "Please check your email for the verification code.");
        navigation.navigate('OTPrequest', {
          userData: {
            ...formData,
            name: fullName,
            address: fullAddress,
            email: formData.email.trim().toLowerCase(),
            contact_number: formData.contact.trim(),
            age: parseInt(formData.age),
            roles: 'patient'
          },
          correctOTP: generatedOTP
        });
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Registration Error", "Something went wrong. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#FFF7ED', '#FFEDD5']} style={RegisterStyle.mainContainer}>
      <Modal animationType="fade" transparent={true} visible={showPrivacyModal}>
        <View style={RegisterStyle.modalContainer}>
          <View style={RegisterStyle.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={RegisterStyle.modalTitle}>Data Privacy Notice</Text>
              <Text style={RegisterStyle.privacyText}>
                In compliance with the Data Privacy Act of 2012, Pascualinga is committed to protecting your personal information.
              </Text>
              <Text style={RegisterStyle.privacyText}>
                By creating an account, you consent to the collection and processing of your personal data to provide medical management services. We implement strict security measures to keep your data safe.
              </Text>
              <TouchableOpacity style={RegisterStyle.agreeButton} onPress={() => setShowPrivacyModal(false)}>
                <Text style={RegisterStyle.buttonText}>Agree & Proceed</Text>
              </TouchableOpacity>
              <TouchableOpacity style={RegisterStyle.declineButton} onPress={() => navigation.goBack()}>
                <Text style={RegisterStyle.declineText}>Decline</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 20 }}>
            <TouchableOpacity style={RegisterStyle.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color="#1E293B" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={RegisterStyle.scrollContent} showsVerticalScrollIndicator={false}>
            <Animated.View style={[RegisterStyle.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              
              <Text style={RegisterStyle.welcomeMessage}>Create Account</Text>
              <Text style={RegisterStyle.welcomeSubtitleMessage}>Join Pascualinga for better health management.</Text>

              {/* PERSONAL INFO */}
              <Text style={RegisterStyle.sectionTitle}>Personal Information</Text>
              
              <View style={RegisterStyle.rowContainer}>
                <View style={{ width: '48%' }}>
                  <Text style={RegisterStyle.label}>First Name</Text>
                  <View style={[RegisterStyle.inputWrapper, errors.firstName && RegisterStyle.inputErrorBorder]}>
                    <TextInput 
                      placeholder="Juan" 
                      placeholderTextColor="#94A3B8"
                      value={formData.firstName}
                      style={RegisterStyle.pillInput} 
                      onChangeText={(v) => handleChange('firstName', v)} 
                    />
                  </View>
                </View>
                <View style={{ width: '48%' }}>
                  <Text style={RegisterStyle.label}>Last Name</Text>
                  <View style={[RegisterStyle.inputWrapper, errors.lastName && RegisterStyle.inputErrorBorder]}>
                    <TextInput 
                      placeholder="Dela Cruz" 
                      placeholderTextColor="#94A3B8"
                      value={formData.lastName}
                      style={RegisterStyle.pillInput} 
                      onChangeText={(v) => handleChange('lastName', v)} 
                    />
                  </View>
                </View>
              </View>
              {(errors.firstName || errors.lastName) ? <Text style={RegisterStyle.errorText}>{errors.firstName || errors.lastName}</Text> : null}

              <Text style={RegisterStyle.label}>Middle Initial (Optional)</Text>
              <View style={RegisterStyle.inputWrapper}>
                <TextInput 
                  placeholder="M." 
                  placeholderTextColor="#94A3B8"
                  maxLength={2}
                  value={formData.middleInitial ? `${formData.middleInitial}` : ''}
                  style={RegisterStyle.pillInput} 
                  onChangeText={(v) => handleChange('middleInitial', v)} 
                />
              </View>

              <View style={RegisterStyle.rowContainer}>
                <View style={{ width: '100%' }}>
                  <Text style={RegisterStyle.label}>Birthday *</Text>
                  <View style={RegisterStyle.birthdayRow}>
                    <View style={[RegisterStyle.birthdayDropdownWrapper, { flex: 2 }]}>
                      <Dropdown
                        style={RegisterStyle.dropdown}
                        placeholderStyle={RegisterStyle.placeholderStyle}
                        selectedTextStyle={RegisterStyle.selectedTextStyle}
                        itemTextStyle={RegisterStyle.itemTextStyle}
                        containerStyle={RegisterStyle.containerStyle}
                        iconStyle={RegisterStyle.iconStyle}
                        data={months}
                        labelField="label"
                        valueField="value"
                        placeholder="Month"
                        value={birthDateState.month}
                        onChange={item => handleBirthdayChange('month', item.value)}
                      />
                    </View>
                    <View style={[RegisterStyle.birthdayDropdownWrapper, { flex: 1.2, marginHorizontal: 8 }]}>
                      <Dropdown
                        style={RegisterStyle.dropdown}
                        placeholderStyle={RegisterStyle.placeholderStyle}
                        selectedTextStyle={RegisterStyle.selectedTextStyle}
                        itemTextStyle={RegisterStyle.itemTextStyle}
                        containerStyle={RegisterStyle.containerStyle}
                        iconStyle={RegisterStyle.iconStyle}
                        data={days}
                        labelField="label"
                        valueField="value"
                        placeholder="Day"
                        value={birthDateState.day}
                        onChange={item => handleBirthdayChange('day', item.value)}
                      />
                    </View>
                    <View style={[RegisterStyle.birthdayDropdownWrapper, { flex: 1.5 }]}>
                      <Dropdown
                        style={RegisterStyle.dropdown}
                        placeholderStyle={RegisterStyle.placeholderStyle}
                        selectedTextStyle={RegisterStyle.selectedTextStyle}
                        itemTextStyle={RegisterStyle.itemTextStyle}
                        containerStyle={RegisterStyle.containerStyle}
                        inputSearchStyle={RegisterStyle.inputSearchStyle}
                        iconStyle={RegisterStyle.iconStyle}
                        data={years}
                        search
                        labelField="label"
                        valueField="value"
                        placeholder="Year"
                        searchPlaceholder="Search year..."
                        value={birthDateState.year}
                        onChange={item => handleBirthdayChange('year', item.value)}
                      />
                    </View>
                  </View>
                </View>
              </View>

              <View style={RegisterStyle.rowContainer}>
                <View style={{ width: '100%' }}>
                  <Text style={RegisterStyle.label}>Age (Auto-calculated)</Text>
                  <View style={[RegisterStyle.inputWrapper, { backgroundColor: '#F1F5F9' }]}>
                    <MaterialCommunityIcons name="account-clock-outline" size={20} color="#64748B" style={RegisterStyle.inputIcon} />
                    <TextInput 
                      value={formData.age ? `${formData.age} years old` : "Select birthday above"} 
                      editable={false} 
                      style={RegisterStyle.pillInput} 
                    />
                  </View>
                </View>
              </View>
              {errors.birthday ? <Text style={RegisterStyle.errorText}>{errors.birthday}</Text> : null}

              {/* SEX / GENDER */}
              <Text style={[RegisterStyle.label, { marginTop: 4 }]}>Sex *</Text>
              <View style={RegisterStyle.sexRow}>
                <View style={{ width: '48%' }}>
                  <TouchableOpacity
                    style={[RegisterStyle.sexChip, formData.gender === 'Female' && RegisterStyle.sexChipSelected]}
                    onPress={() => handleChange('gender', 'Female')}
                    activeOpacity={0.8}
                  >
                    <Text style={[RegisterStyle.sexChipText, formData.gender === 'Female' && RegisterStyle.sexChipTextSelected]}>FEMALE</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ width: '48%' }}>
                  <TouchableOpacity
                    style={[RegisterStyle.sexChip, formData.gender === 'Male' && RegisterStyle.sexChipSelected]}
                    onPress={() => handleChange('gender', 'Male')}
                    activeOpacity={0.8}
                  >
                    <Text style={[RegisterStyle.sexChipText, formData.gender === 'Male' && RegisterStyle.sexChipTextSelected]}>MALE</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {errors.gender ? <Text style={RegisterStyle.errorText}>{errors.gender}</Text> : null}

              {/* CONTACT INFO */}
              <Text style={RegisterStyle.sectionTitle}>Contact Details</Text>

              <Text style={RegisterStyle.label}>Email Address</Text>
              <View style={[RegisterStyle.inputWrapper, errors.email && RegisterStyle.inputErrorBorder]}>
                <Ionicons name="mail-outline" size={20} color="#64748B" style={RegisterStyle.inputIcon} />
                <TextInput 
                  placeholder="example@email.com" 
                  placeholderTextColor="#94A3B8"
                  keyboardType="email-address" 
                  autoCapitalize="none"
                  value={formData.email}
                  style={RegisterStyle.pillInput} 
                  onChangeText={(v) => handleChange('email', v)} 
                />
              </View>
              {errors.email ? <Text style={RegisterStyle.errorText}>{errors.email}</Text> : null}

              <Text style={RegisterStyle.label}>Contact Number</Text>
              <View style={[RegisterStyle.inputWrapper, errors.contact && RegisterStyle.inputErrorBorder]}>
                <Ionicons name="phone-portrait-outline" size={20} color="#64748B" style={RegisterStyle.inputIcon} />
                <TextInput 
                  placeholder="09123456789" 
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric" 
                  maxLength={11} 
                  value={formData.contact}
                  style={RegisterStyle.pillInput} 
                  onChangeText={(v) => handleChange('contact', v)} 
                />
              </View>
              {errors.contact ? <Text style={RegisterStyle.errorText}>{errors.contact}</Text> : null}

              {/* ADDRESS INFO */}
              <Text style={RegisterStyle.sectionTitle}>Permanent Address</Text>

              <Text style={RegisterStyle.label}>Province / Region</Text>
              <View style={[RegisterStyle.inputWrapper, errors.province && RegisterStyle.inputErrorBorder]}>
                <Dropdown
                  style={RegisterStyle.dropdown}
                  placeholderStyle={RegisterStyle.placeholderStyle}
                  selectedTextStyle={RegisterStyle.selectedTextStyle}
                  itemTextStyle={RegisterStyle.itemTextStyle}
                  containerStyle={RegisterStyle.containerStyle}
                  inputSearchStyle={RegisterStyle.inputSearchStyle}
                  iconStyle={RegisterStyle.iconStyle}
                  data={provinceData}
                  search
                  labelField="label"
                  valueField="value"
                  placeholder="Select Province"
                  searchPlaceholder="Search..."
                  value={formData.province}
                  onChange={item => handleChange('province', item.value)}
                />
              </View>
              {errors.province ? <Text style={RegisterStyle.errorText}>{errors.province}</Text> : null}

              <Text style={RegisterStyle.label}>City / Municipality</Text>
              <View style={[RegisterStyle.inputWrapper, errors.city && RegisterStyle.inputErrorBorder, !formData.province && { opacity: 0.6 }]}>
                {provinceHasDataset ? (
                  <Dropdown
                    style={RegisterStyle.dropdown}
                    placeholderStyle={RegisterStyle.placeholderStyle}
                    selectedTextStyle={RegisterStyle.selectedTextStyle}
                    itemTextStyle={RegisterStyle.itemTextStyle}
                    containerStyle={RegisterStyle.containerStyle}
                    inputSearchStyle={RegisterStyle.inputSearchStyle}
                    iconStyle={RegisterStyle.iconStyle}
                    data={cityData}
                    search
                    disable={!formData.province}
                    labelField="label"
                    valueField="value"
                    placeholder="Select City"
                    searchPlaceholder="Search..."
                    value={formData.city}
                    onChange={(item) => handleChange('city', item.value)}
                  />
                ) : (
                  <TextInput
                    placeholder="Enter City/Municipality"
                    placeholderTextColor="#94A3B8"
                    value={formData.city}
                    editable={!!formData.province}
                    style={RegisterStyle.pillInput}
                    onChangeText={(v) => handleChange('city', v)}
                  />
                )}
              </View>
              {errors.city ? <Text style={RegisterStyle.errorText}>{errors.city}</Text> : null}

              <View style={RegisterStyle.rowContainer}>
                <View style={{ width: '65%' }}>
                  <Text style={RegisterStyle.label}>Barangay</Text>
                  <View style={[RegisterStyle.inputWrapper, errors.barangay && RegisterStyle.inputErrorBorder, !formData.city && { opacity: 0.6 }]}>
                    {provinceHasDataset ? (
                      <Dropdown
                        style={RegisterStyle.dropdown}
                        placeholderStyle={RegisterStyle.placeholderStyle}
                        selectedTextStyle={RegisterStyle.selectedTextStyle}
                        itemTextStyle={RegisterStyle.itemTextStyle}
                        containerStyle={RegisterStyle.containerStyle}
                        inputSearchStyle={RegisterStyle.inputSearchStyle}
                        iconStyle={RegisterStyle.iconStyle}
                        data={barangayData}
                        search
                        disable={!formData.city}
                        labelField="label"
                        valueField="value"
                        placeholder="Select Barangay"
                        searchPlaceholder="Search..."
                        value={formData.barangay}
                        onChange={(item) => handleChange('barangay', item.value)}
                      />
                    ) : (
                      <TextInput
                        placeholder="Enter Barangay"
                        placeholderTextColor="#94A3B8"
                        value={formData.barangay}
                        editable={!!formData.city}
                        style={RegisterStyle.pillInput}
                        onChangeText={(v) => handleChange('barangay', v)}
                      />
                    )}
                  </View>
                  {errors.barangay ? <Text style={RegisterStyle.errorText}>{errors.barangay}</Text> : null}
                </View>
                <View style={{ width: '32%' }}>
                  <Text style={RegisterStyle.label}>Zip Code</Text>
                  <View style={[RegisterStyle.inputWrapper, errors.zipCode && RegisterStyle.inputErrorBorder]}>
                    <TextInput 
                      value={formData.zipCode} 
                      editable={!!formData.city && !provinceHasDataset}
                      placeholder="Zip"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      style={[RegisterStyle.pillInput, { textAlign: 'center' }]} 
                      onChangeText={(v) => handleChange('zipCode', v)}
                    />
                  </View>
                  {errors.zipCode ? <Text style={RegisterStyle.errorText}>{errors.zipCode}</Text> : null}
                </View>
              </View>

              <Text style={RegisterStyle.label}>Street / House No.</Text>
              <View style={[RegisterStyle.inputWrapper, errors.streetNumber && RegisterStyle.inputErrorBorder]}>
                <TextInput 
                  placeholder="Unit 123, Street Name" 
                  placeholderTextColor="#94A3B8"
                  value={formData.streetNumber}
                  style={RegisterStyle.pillInput} 
                  onChangeText={(v) => handleChange('streetNumber', v)} 
                />
              </View>
              {errors.streetNumber ? <Text style={RegisterStyle.errorText}>{errors.streetNumber}</Text> : null}

              {/* SECURITY */}
              <Text style={RegisterStyle.sectionTitle}>Security</Text>

              <Text style={RegisterStyle.label}>Password</Text>
              <View style={[RegisterStyle.inputWrapper, errors.password && RegisterStyle.inputErrorBorder]}>
                <Ionicons name="lock-closed-outline" size={20} color="#64748B" style={RegisterStyle.inputIcon} />
                <TextInput 
                  placeholder="At least 8 characters" 
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPassword} 
                  value={formData.password}
                  style={RegisterStyle.pillInput} 
                  onChangeText={(v) => handleChange('password', v)} 
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#64748B" />
                </TouchableOpacity>
              </View>
              {errors.password ? <Text style={RegisterStyle.errorText}>{errors.password}</Text> : null}

              <Text style={RegisterStyle.label}>Confirm Password</Text>
              <View style={[RegisterStyle.inputWrapper, errors.confirmPassword && RegisterStyle.inputErrorBorder]}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#64748B" style={RegisterStyle.inputIcon} />
                <TextInput 
                  placeholder="Re-type your password" 
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showConfirmPassword} 
                  value={formData.confirmPassword}
                  style={RegisterStyle.pillInput} 
                  onChangeText={(v) => handleChange('confirmPassword', v)} 
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Ionicons name={showConfirmPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#64748B" />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword ? <Text style={RegisterStyle.errorText}>{errors.confirmPassword}</Text> : null}

              <TouchableOpacity 
                activeOpacity={0.9}
                onPress={handleRegister} 
                style={[RegisterStyle.registerButton, loading && { opacity: 0.7 }]} 
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={RegisterStyle.buttonText}>Create My Account</Text>}
              </TouchableOpacity>
              
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
