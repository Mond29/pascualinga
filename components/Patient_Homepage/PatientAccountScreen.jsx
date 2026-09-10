import { useNavigation, useFocusEffect } from '@react-navigation/native';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import PatientAccountStyles from '../../styles/PatientStyles/PatientAccountStyles';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import PatientHeader from './PatientHeader';
import PatientSideMenu from './PatientSideMenu';

export default function PatientAccountScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [patientId, setPatientId] = useState('P-2024-0000');
  const [bloodType, setBloodType] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [errors, setErrors] = useState({});
  const [userData, setUserData] = useState({ name: 'Patient', email: '' });
  const [drawerVisible, setDrawerVisible] = useState(false);
  const toggleDrawer = () => setDrawerVisible(!drawerVisible);

  const navigation = useNavigation();

  const validateForm = (isPasswordChange = false) => {
    let newErrors = {};

    if (!isPasswordChange) {
      if (!firstName.trim()) newErrors.firstName = 'First name is required';
      if (!lastName.trim()) newErrors.lastName = 'Last name is required';
      
      const phoneRegex = /^09\d{9}$/;
      if (!phone.trim()) {
        newErrors.phone = 'Phone number is required';
      } else if (!phoneRegex.test(phone)) {
        newErrors.phone = 'Invalid format (09XXXXXXXXX)';
      }

      if (!emergencyName.trim()) newErrors.emergencyName = 'Required';
      if (!emergencyPhone.trim()) {
        newErrors.emergencyPhone = 'Required';
      } else if (!phoneRegex.test(emergencyPhone)) {
        newErrors.emergencyPhone = 'Invalid';
      }
    } else {
      if (!currentPasswordInput.trim()) newErrors.currentPassword = 'Current password is required';
      
      const hasNumber = /\d/.test(newPassword);
      const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
      
      if (!newPassword) {
        newErrors.password = 'New password is required';
      } else if (newPassword.length < 8) {
        newErrors.password = 'Min 8 characters required';
      } else if (!hasNumber) {
        newErrors.password = 'Must include a number';
      } else if (!hasSpecial) {
        newErrors.password = 'Must include a special character';
      }

      if (newPassword !== confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true);
      const userEmail = await AsyncStorage.getItem('userEmail');
      
      if (!userEmail) {
        setLoading(false);
        return;
      }

      // 1. Fetch from accounts
      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .select('*')
        .eq('email', userEmail)
        .single();

      if (accountError) throw accountError;

      if (accountData) {
        setUserData(accountData);
        const nameParts = (accountData.name || '').split(' ');
        setFirstName(nameParts[0] || '');
        setLastName(nameParts.slice(1).join(' ') || '');
        setEmail(accountData.email || '');
        setPhone(accountData.contact_number || '');
      }

      // 2. Fetch from patients
      const { data: patientData } = await supabase
        .from('patients')
        .select('*')
        .eq('email', userEmail)
        .maybeSingle();

      if (patientData) {
        setPatientId(patientData.patient_id || 'P-2024-XXXX');
        setBloodType(patientData.blood_type || '');
        setEmergencyName(patientData.emergency_contact_name || '');
        setEmergencyPhone(patientData.emergency_contact_phone || '');
      }
    } catch (error) {
      console.error('Error fetching user data:', error.message);
      Alert.alert('Error', 'Unable to fetch profile data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchUserData();
    }, [fetchUserData])
  );

  const handleUpdateProfile = async () => {
    if (!validateForm(false)) {
      Alert.alert('Validation Error', 'Please correct the details below.');
      return;
    }

    setUpdating(true);
    try {
      const userEmail = await AsyncStorage.getItem('userEmail');
      const fullName = `${firstName} ${lastName}`.trim();

      // Update accounts table
      const { error: accError } = await supabase
        .from('accounts')
        .update({ name: fullName, contact_number: phone })
        .eq('email', userEmail);

      if (accError) throw accError;

      // Update patients table
      const { error: patError } = await supabase
        .from('patients')
        .upsert({
          email: userEmail,
          first_name: firstName,
          last_name: lastName,
          contact_number: phone,
          blood_type: bloodType,
          emergency_contact_name: emergencyName,
          emergency_contact_phone: emergencyPhone
        }, { onConflict: 'email' });

      if (patError) throw patError;

      await AsyncStorage.setItem('userName', fullName);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      console.error('Update error:', error.message);
      Alert.alert('Error', 'Failed to update profile.');
    } finally {
      setUpdating(false);
    }
  };

  const handleChangePassword = async () => {
    if (!validateForm(true)) {
      Alert.alert('Validation Error', 'Please follow password requirements.');
      return;
    }

    setUpdating(true);
    try {
      const userEmail = await AsyncStorage.getItem('userEmail');

      // 1. Verify Current Password
      const { data, error: verifyError } = await supabase
        .from('accounts')
        .select('password')
        .eq('email', userEmail)
        .eq('password', currentPasswordInput.trim())
        .single();

      if (verifyError || !data) {
        setErrors({ ...errors, currentPassword: 'Wrong current password' });
        Alert.alert('Error', 'Current password is incorrect.');
        return;
      }

      // 2. Update to New Password
      const { error: updateError } = await supabase
        .from('accounts')
        .update({ password: newPassword.trim() })
        .eq('email', userEmail);

      if (updateError) throw updateError;

      Alert.alert(
        'Password Updated',
        'Your password has been changed. You will be logged out now.',
        [
          { 
            text: 'OK', 
            onPress: async () => {
              await AsyncStorage.clear();
              navigation.reset({
                index: 0,
                routes: [{ name: 'LoginScreen' }],
              });
            } 
          }
        ]
      );

    } catch (e) {
      console.error('Password update error:', e);
      Alert.alert('Error', 'Failed to change password.');
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Logout', 
        style: 'destructive', 
        onPress: async () => {
          await AsyncStorage.clear();
          navigation.replace('LoginScreen');
        }
      }
    ]);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={{ marginTop: 10, color: '#64748B' }}>Loading Profile...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={PatientAccountStyles.safeArea}>
      <PatientHeader 
        title="My Profile"
        navigation={navigation}
        onMenuPress={toggleDrawer}
        userData={userData}
      />

      <ScrollView contentContainerStyle={PatientAccountStyles.container} showsVerticalScrollIndicator={false}>
        
        {/* Profile Card */}
        <View style={PatientAccountStyles.profileCard}>
          <View style={PatientAccountStyles.avatarContainer}>
            <View style={PatientAccountStyles.avatarCircle}>
              <Feather name="user" size={40} color="#94A3B8" />
            </View>
            <TouchableOpacity style={PatientAccountStyles.editAvatarButton}>
              <Ionicons name="camera" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <Text style={PatientAccountStyles.patientName}>{firstName} {lastName}</Text>
          <Text style={PatientAccountStyles.patientId}>ID: {patientId}</Text>
        </View>

        {/* Basic Information */}
        <View style={PatientAccountStyles.section}>
          <View style={PatientAccountStyles.sectionHeader}>
            <Ionicons name="person" size={20} color="#f97316" />
            <Text style={PatientAccountStyles.sectionTitle}>Basic Info</Text>
          </View>
          
          <View style={PatientAccountStyles.infoCard}>
            <View style={PatientAccountStyles.row}>
              <View style={[PatientAccountStyles.inputGroup, PatientAccountStyles.flex1]}>
                <Text style={[PatientAccountStyles.label, errors.firstName && { color: '#EF4444' }]}>First Name</Text>
                <View style={[PatientAccountStyles.inputWrapper, errors.firstName && { borderColor: '#EF4444', borderWidth: 1 }]}>
                  <TextInput
                    style={PatientAccountStyles.input}
                    value={firstName}
                    onChangeText={(text) => { setFirstName(text); if (errors.firstName) setErrors({...errors, firstName: null}); }}
                    placeholder="First Name"
                  />
                </View>
              </View>
              <View style={[PatientAccountStyles.inputGroup, PatientAccountStyles.flex1]}>
                <Text style={[PatientAccountStyles.label, errors.lastName && { color: '#EF4444' }]}>Last Name</Text>
                <View style={[PatientAccountStyles.inputWrapper, errors.lastName && { borderColor: '#EF4444', borderWidth: 1 }]}>
                  <TextInput
                    style={PatientAccountStyles.input}
                    value={lastName}
                    onChangeText={(text) => { setLastName(text); if (errors.lastName) setErrors({...errors, lastName: null}); }}
                    placeholder="Last Name"
                  />
                </View>
              </View>
            </View>

            <View style={PatientAccountStyles.row}>
              <View style={[PatientAccountStyles.inputGroup, PatientAccountStyles.flex1]}>
                <Text style={[PatientAccountStyles.label, errors.phone && { color: '#EF4444' }]}>Phone Number</Text>
                <View style={[PatientAccountStyles.inputWrapper, errors.phone && { borderColor: '#EF4444', borderWidth: 1 }]}>
                  <TextInput
                    style={PatientAccountStyles.input}
                    value={phone}
                    onChangeText={(text) => { setPhone(text); if (errors.phone) setErrors({...errors, phone: null}); }}
                    placeholder="09XXXXXXXXX"
                    keyboardType="phone-pad"
                    maxLength={11}
                  />
                </View>
              </View>
              <View style={[PatientAccountStyles.inputGroup, { width: 100 }]}>
                <Text style={PatientAccountStyles.label}>Blood Type</Text>
                <View style={PatientAccountStyles.inputWrapper}>
                  <TextInput
                    style={PatientAccountStyles.input}
                    value={bloodType}
                    onChangeText={setBloodType}
                    placeholder="e.g. O+"
                    autoCapitalize="characters"
                    maxLength={3}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Emergency Contact */}
        <View style={PatientAccountStyles.section}>
          <View style={PatientAccountStyles.sectionHeader}>
            <Ionicons name="warning" size={20} color="#EF4444" />
            <Text style={PatientAccountStyles.sectionTitle}>Emergency Contact</Text>
          </View>
          
          <View style={PatientAccountStyles.infoCard}>
            <View style={PatientAccountStyles.inputGroup}>
              <Text style={[PatientAccountStyles.label, errors.emergencyName && { color: '#EF4444' }]}>Contact Person Name</Text>
              <View style={[PatientAccountStyles.inputWrapper, errors.emergencyName && { borderColor: '#EF4444', borderWidth: 1 }]}>
                <TextInput
                  style={PatientAccountStyles.input}
                  value={emergencyName}
                  onChangeText={(text) => { setEmergencyName(text); if (errors.emergencyName) setErrors({...errors, emergencyName: null}); }}
                  placeholder="Full Name"
                />
              </View>
            </View>

            <View style={PatientAccountStyles.inputGroup}>
              <Text style={[PatientAccountStyles.label, errors.emergencyPhone && { color: '#EF4444' }]}>Contact Person Phone</Text>
              <View style={[PatientAccountStyles.inputWrapper, errors.emergencyPhone && { borderColor: '#EF4444', borderWidth: 1 }]}>
                <TextInput
                  style={PatientAccountStyles.input}
                  value={emergencyPhone}
                  onChangeText={(text) => { setEmergencyPhone(text); if (errors.emergencyPhone) setErrors({...errors, emergencyPhone: null}); }}
                  placeholder="09XXXXXXXXX"
                  keyboardType="phone-pad"
                  maxLength={11}
                />
              </View>
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
          <TouchableOpacity 
            style={PatientAccountStyles.saveButton} 
            onPress={handleUpdateProfile}
            disabled={updating}
          >
            {updating ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="save-outline" size={20} color="#fff" />
                <Text style={PatientAccountStyles.saveButtonText}>Save Basic Info</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Security Section */}
        <View style={PatientAccountStyles.section}>
          <View style={PatientAccountStyles.sectionHeader}>
            <Ionicons name="lock-closed" size={20} color="#f97316" />
            <Text style={PatientAccountStyles.sectionTitle}>Security & Password</Text>
          </View>
          
          <View style={PatientAccountStyles.infoCard}>
            <View style={PatientAccountStyles.inputGroup}>
              <Text style={[PatientAccountStyles.label, errors.currentPassword && { color: '#EF4444' }]}>Current Password</Text>
              <View style={[PatientAccountStyles.inputWrapper, errors.currentPassword && { borderColor: '#EF4444', borderWidth: 1 }]}>
                <TextInput
                  style={PatientAccountStyles.input}
                  value={currentPasswordInput}
                  onChangeText={(text) => { setCurrentPasswordInput(text); if (errors.currentPassword) setErrors({...errors, currentPassword: null}); }}
                  placeholder="Verify your identity"
                  secureTextEntry={!showCurrentPassword}
                />
                <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                  <Ionicons name={showCurrentPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#64748B" />
                </TouchableOpacity>
              </View>
              {errors.currentPassword && <Text style={PatientAccountStyles.errorText}>{errors.currentPassword}</Text>}
            </View>

            <View style={PatientAccountStyles.inputGroup}>
              <Text style={[PatientAccountStyles.label, errors.password && { color: '#EF4444' }]}>New Password</Text>
              <View style={[PatientAccountStyles.inputWrapper, errors.password && { borderColor: '#EF4444', borderWidth: 1 }]}>
                <TextInput
                  style={PatientAccountStyles.input}
                  value={newPassword}
                  onChangeText={(text) => { setNewPassword(text); if (errors.password) setErrors({...errors, password: null}); }}
                  placeholder="8+ chars, numbers & symbols"
                  secureTextEntry={!showNewPassword}
                />
                <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
                  <Ionicons name={showNewPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#64748B" />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={PatientAccountStyles.errorText}>{errors.password}</Text>}
            </View>

            <View style={PatientAccountStyles.inputGroup}>
              <Text style={[PatientAccountStyles.label, errors.confirmPassword && { color: '#EF4444' }]}>Confirm Password</Text>
              <View style={[PatientAccountStyles.inputWrapper, errors.confirmPassword && { borderColor: '#EF4444', borderWidth: 1 }]}>
                <TextInput
                  style={PatientAccountStyles.input}
                  value={confirmPassword}
                  onChangeText={(text) => { setConfirmPassword(text); if (errors.confirmPassword) setErrors({...errors, confirmPassword: null}); }}
                  placeholder="Repeat new password"
                  secureTextEntry={!showConfirmPassword}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#64748B" />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword && <Text style={PatientAccountStyles.errorText}>{errors.confirmPassword}</Text>}
            </View>

            <TouchableOpacity 
              style={[PatientAccountStyles.saveButton, { backgroundColor: '#1E293B' }]} 
              onPress={handleChangePassword}
              disabled={updating}
            >
              {updating ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="key-outline" size={20} color="#fff" />
                  <Text style={PatientAccountStyles.saveButtonText}>Update Password</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={PatientAccountStyles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color="#EF4444" />
          <Text style={PatientAccountStyles.logoutButtonText}>Sign Out Account</Text>
        </TouchableOpacity>

      </ScrollView>

      <PatientSideMenu 
        visible={drawerVisible} 
        onClose={toggleDrawer} 
      />
    </SafeAreaView>
  );
}
