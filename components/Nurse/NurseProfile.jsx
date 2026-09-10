import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import NurseProfileStyles from '../../styles/NurseStyles/NurseProfileStyles';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';

export default function NurseProfile() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNo, setProfessionalId] = useState('RN-2024-0892');
  const [specialization, setSpecialization] = useState('ER Nurse');
  const [isOnline, setIsOnline] = useState(true);
  
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [errors, setErrors] = useState({});

  const navigation = useNavigation();

  const validateForm = (isPasswordChange = false) => {
    let newErrors = {};

    if (!isPasswordChange) {
      if (!firstName.trim()) newErrors.firstName = 'First name is required';
      if (!lastName.trim()) newErrors.lastName = 'Last name is required';
      if (!specialization.trim()) newErrors.specialization = 'Specialization is required';
      if (!licenseNo.trim()) newErrors.licenseNo = 'License number is required';
      
      const phoneRegex = /^09\d{9}$/;
      if (!phone.trim()) {
        newErrors.phone = 'Phone number is required';
      } else if (!phoneRegex.test(phone)) {
        newErrors.phone = 'Invalid format (09XXXXXXXXX)';
      }
    } else {
      if (!currentPasswordInput.trim()) newErrors.currentPassword = 'Current password is required';
      
      // Strict Password Validation: min 8 chars, numbers, special characters
      // Allowing underscores and other common symbols
      const hasNumber = /\d/.test(newPassword);
      const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
      
      if (!newPassword) {
        newErrors.password = 'New password is required';
      } else if (newPassword.length < 8) {
        newErrors.password = 'Password must be at least 8 characters';
      } else if (!hasNumber) {
        newErrors.password = 'Must include at least one number';
      } else if (!hasSpecial) {
        newErrors.password = 'Must include at least one special character';
      }

      if (newPassword !== confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getCurrentEmail = useCallback(async () => {
    try {
      const storedEmail = await AsyncStorage.getItem('userEmail');
      return storedEmail || '';
    } catch {
      return '';
    }
  }, []);

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const currentEmail = await getCurrentEmail();
      if (!currentEmail) return;

      // Try fetching from 'accounts' table first as it's used in login
      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .select('name, email, roles')
        .eq('email', currentEmail)
        .single();

      if (accountData) {
        const nameParts = accountData.name.split(' ');
        setFirstName(nameParts[0] || '');
        setLastName(nameParts.slice(1).join(' ') || '');
        setEmail(accountData.email || '');
      }

      // Also try fetching additional details from 'nurses' table if it exists
      const { data: nurseData } = await supabase
        .from('nurses')
        .select('*')
        .eq('email', currentEmail)
        .maybeSingle();

      if (nurseData) {
        setPhone(nurseData.phone || '');
        setProfessionalId(nurseData.license_no || 'RN-2024-0892');
        setSpecialization(nurseData.specialization || 'General Nursing');
      }
    } catch (e) {
      console.error('Error loading nurse profile:', e);
    } finally {
      setLoadingProfile(false);
    }
  }, [getCurrentEmail]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleUpdateProfile = async () => {
    if (!validateForm(false)) {
      Alert.alert('Validation Error', 'Please correct the profile details.');
      return;
    }

    setUpdating(true);
    try {
      const currentEmail = await getCurrentEmail();
      const fullName = `${firstName} ${lastName}`.trim();

      // Update accounts table (only name)
      const { error: accError } = await supabase
        .from('accounts')
        .update({ name: fullName })
        .eq('email', currentEmail);

      if (accError) throw accError;

      // Update nurses table
      const { error: nurseError } = await supabase
        .from('nurses')
        .upsert({
          email: currentEmail,
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          license_no: licenseNo,
          specialization: specialization
        }, { onConflict: 'email' });

      if (nurseError) throw nurseError;

      Alert.alert('Success', 'Profile updated successfully!');
    } catch (e) {
      console.error('Update error:', e);
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
      const currentEmail = await AsyncStorage.getItem('userEmail');
      console.log('Attempting password change for:', currentEmail);

      if (!currentEmail) {
        Alert.alert('Error', 'User email not found. Please log in again.');
        return;
      }

      // 1. Verify Current Password
      const { data, error: verifyError } = await supabase
        .from('accounts')
        .select('id, password')
        .eq('email', currentEmail.trim())
        .single();

      if (verifyError || !data) {
        console.error('Verification error:', verifyError);
        Alert.alert('Error', 'Could not verify account.');
        return;
      }

      if (data.password !== currentPasswordInput.trim()) {
        setErrors({ ...errors, currentPassword: 'Wrong current password' });
        Alert.alert('Error', 'Current password is incorrect.');
        return;
      }

      // 2. Update to New Password
      console.log('Updating password in Supabase for email:', currentEmail.trim());
      
      const { data: updatedData, error: updateError } = await supabase
        .from('accounts')
        .update({ password: newPassword.trim() })
        .match({ email: currentEmail.trim() }) // Using match for explicit targeting
        .select();

      if (updateError) {
        console.error('Supabase Update Error:', updateError);
        throw updateError;
      }

      console.log('Update result:', updatedData);

      if (!updatedData || updatedData.length === 0) {
        throw new Error('No rows updated. Check if RLS is enabled or if the email exists.');
      }

      console.log('Password successfully updated in Supabase');

      Alert.alert(
        'Password Updated',
        'Your password has been changed in the database. You will be logged out now.',
        [
          { 
            text: 'OK', 
            onPress: async () => {
              try {
                const role = `${(await AsyncStorage.getItem('userRole')) || ''}`.trim().toLowerCase();
                if (role === 'doctor') {
                  const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
                  const name = `${(await AsyncStorage.getItem(`userName:${email}`)) || ''}`.trim() || email;
                  const base = `${process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.pascualinga.com'}`.trim().replace(/\/+$/, '');
                  if (email) {
                    await fetch(`${base}/api/staff/logout`, {
                      method: 'POST',
                      headers: {
                        'x-user-role': 'doctor',
                        'x-user-email': email,
                        'x-user-name': name,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ email, accountType: 'doctor' }),
                    });
                  }
                }
              } catch (_) {}
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
      console.error('Password update exception:', e);
      Alert.alert('Error', 'Failed to change password: ' + e.message);
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
          try {
            const role = `${(await AsyncStorage.getItem('userRole')) || ''}`.trim().toLowerCase();
            if (role === 'doctor') {
              const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
              const name = `${(await AsyncStorage.getItem(`userName:${email}`)) || ''}`.trim() || email;
              const base = `${process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.pascualinga.com'}`.trim().replace(/\/+$/, '');
              if (email) {
                await fetch(`${base}/api/staff/logout`, {
                  method: 'POST',
                  headers: {
                    'x-user-role': 'doctor',
                    'x-user-email': email,
                    'x-user-name': name,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ email, accountType: 'doctor' }),
                });
              }
            }
          } catch (_) {}
          await AsyncStorage.clear();
          navigation.replace('LoginScreen');
        }
      }
    ]);
  };

  if (loadingProfile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={{ marginTop: 10, color: '#64748B' }}>Loading Professional Profile...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={NurseProfileStyles.safeArea}>
      <View style={NurseProfileStyles.header}>
        <View style={NurseProfileStyles.headerTop}>
          <MaterialCommunityIcons name="hospital-marker" size={28} color="#fff" />
          <Text style={NurseProfileStyles.headerTitle}>ER Nurse Portal</Text>
          <TouchableOpacity onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={NurseProfileStyles.container} showsVerticalScrollIndicator={false}>
        
        {/* Profile Card */}
        <View style={NurseProfileStyles.profileCard}>
          <View style={NurseProfileStyles.avatarContainer}>
            <View style={NurseProfileStyles.avatarCircle}>
              <Feather name="user" size={50} color="#94A3B8" />
            </View>
            <TouchableOpacity style={NurseProfileStyles.editAvatarButton}>
              <Ionicons name="camera" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <Text style={NurseProfileStyles.nurseName}>{firstName} {lastName}</Text>
          <Text style={NurseProfileStyles.nurseRole}>{specialization} • {licenseNo}</Text>
          
          <View style={[NurseProfileStyles.statusBadge, !isOnline && { backgroundColor: '#F1F5F9' }]}>
            <View style={[NurseProfileStyles.statusDot, !isOnline && { backgroundColor: '#94A3B8' }]} />
            <Text style={[NurseProfileStyles.statusText, !isOnline && { color: '#64748B' }]}>
              {isOnline ? 'Active on Duty' : 'Off Duty'}
            </Text>
            <Switch
              value={isOnline}
              onValueChange={setIsOnline}
              trackColor={{ false: '#CBD5E1', true: '#BBF7D0' }}
              thumbColor={isOnline ? '#22C55E' : '#94A3B8'}
              style={{ marginLeft: 10, transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>
        </View>

        {/* Professional Information */}
        <View style={NurseProfileStyles.section}>
          <View style={NurseProfileStyles.sectionHeader}>
            <MaterialCommunityIcons name="badge-account-horizontal" size={24} color="#f97316" />
            <Text style={NurseProfileStyles.sectionTitle}>Professional Details</Text>
          </View>
          
          <View style={NurseProfileStyles.infoCard}>
            <View style={NurseProfileStyles.row}>
              <View style={[NurseProfileStyles.inputGroup, NurseProfileStyles.flex1]}>
                <Text style={[NurseProfileStyles.label, errors.firstName && { color: '#EF4444' }]}>First Name</Text>
                <View style={[NurseProfileStyles.inputWrapper, errors.firstName && { borderColor: '#EF4444', borderWidth: 1 }]}>
                  <TextInput
                    style={NurseProfileStyles.input}
                    value={firstName}
                    onChangeText={(text) => {
                      setFirstName(text);
                      if (errors.firstName) setErrors({...errors, firstName: null});
                    }}
                    placeholder="First Name"
                  />
                </View>
                {errors.firstName && <Text style={{ fontSize: 10, color: '#EF4444', marginTop: 4 }}>{errors.firstName}</Text>}
              </View>
              <View style={[NurseProfileStyles.inputGroup, NurseProfileStyles.flex1]}>
                <Text style={[NurseProfileStyles.label, errors.lastName && { color: '#EF4444' }]}>Last Name</Text>
                <View style={[NurseProfileStyles.inputWrapper, errors.lastName && { borderColor: '#EF4444', borderWidth: 1 }]}>
                  <TextInput
                    style={NurseProfileStyles.input}
                    value={lastName}
                    onChangeText={(text) => {
                      setLastName(text);
                      if (errors.lastName) setErrors({...errors, lastName: null});
                    }}
                    placeholder="Last Name"
                  />
                </View>
                {errors.lastName && <Text style={{ fontSize: 10, color: '#EF4444', marginTop: 4 }}>{errors.lastName}</Text>}
              </View>
            </View>

            <View style={NurseProfileStyles.inputGroup}>
              <Text style={[NurseProfileStyles.label, errors.specialization && { color: '#EF4444' }]}>Specialization</Text>
              <View style={[NurseProfileStyles.inputWrapper, errors.specialization && { borderColor: '#EF4444', borderWidth: 1 }]}>
                <MaterialCommunityIcons name="ambulance" size={20} color={errors.specialization ? '#EF4444' : '#64748B'} style={NurseProfileStyles.inputIcon} />
                <TextInput
                  style={NurseProfileStyles.input}
                  value={specialization}
                  onChangeText={(text) => {
                    setSpecialization(text);
                    if (errors.specialization) setErrors({...errors, specialization: null});
                  }}
                  placeholder="e.g. ER Nurse, Trauma Specialist"
                />
              </View>
              {errors.specialization && <Text style={{ fontSize: 10, color: '#EF4444', marginTop: 4 }}>{errors.specialization}</Text>}
            </View>

            <View style={NurseProfileStyles.inputGroup}>
              <Text style={[NurseProfileStyles.label, errors.licenseNo && { color: '#EF4444' }]}>Professional License No.</Text>
              <View style={[NurseProfileStyles.inputWrapper, errors.licenseNo && { borderColor: '#EF4444', borderWidth: 1 }]}>
                <Ionicons name="card-outline" size={20} color={errors.licenseNo ? '#EF4444' : '#64748B'} style={NurseProfileStyles.inputIcon} />
                <TextInput
                  style={NurseProfileStyles.input}
                  value={licenseNo}
                  onChangeText={(text) => {
                    setProfessionalId(text);
                    if (errors.licenseNo) setErrors({...errors, licenseNo: null});
                  }}
                  placeholder="License Number"
                />
              </View>
              {errors.licenseNo && <Text style={{ fontSize: 10, color: '#EF4444', marginTop: 4 }}>{errors.licenseNo}</Text>}
            </View>
          </View>
        </View>

        {/* Contact Information */}
        <View style={NurseProfileStyles.section}>
          <View style={NurseProfileStyles.sectionHeader}>
            <Ionicons name="call" size={22} color="#f97316" />
            <Text style={NurseProfileStyles.sectionTitle}>Contact Info</Text>
          </View>
          
          <View style={NurseProfileStyles.infoCard}>
            <View style={NurseProfileStyles.inputGroup}>
              <Text style={NurseProfileStyles.label}>Email Address</Text>
              <View style={[NurseProfileStyles.inputWrapper, { backgroundColor: '#F8FAFC' }]}>
                <Ionicons name="mail" size={20} color="#94A3B8" style={NurseProfileStyles.inputIcon} />
                <TextInput
                  style={[NurseProfileStyles.input, NurseProfileStyles.disabledInput]}
                  value={email}
                  editable={false}
                />
              </View>
            </View>

            <View style={NurseProfileStyles.inputGroup}>
              <Text style={[NurseProfileStyles.label, errors.phone && { color: '#EF4444' }]}>Phone Number</Text>
              <View style={[NurseProfileStyles.inputWrapper, errors.phone && { borderColor: '#EF4444', borderWidth: 1 }]}>
                <Ionicons name="phone-portrait" size={20} color={errors.phone ? '#EF4444' : '#64748B'} style={NurseProfileStyles.inputIcon} />
                <TextInput
                  style={NurseProfileStyles.input}
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text);
                    if (errors.phone) setErrors({...errors, phone: null});
                  }}
                  placeholder="09XXXXXXXXX"
                  keyboardType="phone-pad"
                  maxLength={11}
                />
              </View>
              {errors.phone && <Text style={{ fontSize: 10, color: '#EF4444', marginTop: 4 }}>{errors.phone}</Text>}
            </View>
          </View>
        </View>

        {/* Security Section */}
        <View style={NurseProfileStyles.section}>
          <View style={NurseProfileStyles.sectionHeader}>
            <Ionicons name="lock-closed" size={22} color="#f97316" />
            <Text style={NurseProfileStyles.sectionTitle}>Account Security</Text>
          </View>
          
          <View style={NurseProfileStyles.infoCard}>
            <View style={NurseProfileStyles.inputGroup}>
              <Text style={[NurseProfileStyles.label, errors.currentPassword && { color: '#EF4444' }]}>Current Password</Text>
              <View style={[NurseProfileStyles.inputWrapper, errors.currentPassword && { borderColor: '#EF4444', borderWidth: 1 }]}>
                <Ionicons name="key-outline" size={20} color={errors.currentPassword ? '#EF4444' : '#64748B'} style={NurseProfileStyles.inputIcon} />
                <TextInput
                  style={NurseProfileStyles.input}
                  value={currentPasswordInput}
                  onChangeText={(text) => {
                    setCurrentPasswordInput(text);
                    if (errors.currentPassword) setErrors({...errors, currentPassword: null});
                  }}
                  placeholder="Enter current password"
                  secureTextEntry={!showCurrentPassword}
                />
                <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                  <Ionicons 
                    name={showCurrentPassword ? "eye-off-outline" : "eye-outline"} 
                    size={20} 
                    color="#64748B" 
                  />
                </TouchableOpacity>
              </View>
              {errors.currentPassword && <Text style={{ fontSize: 10, color: '#EF4444', marginTop: 4 }}>{errors.currentPassword}</Text>}
            </View>

            <View style={NurseProfileStyles.inputGroup}>
              <Text style={[NurseProfileStyles.label, errors.password && { color: '#EF4444' }]}>New Password</Text>
              <View style={[NurseProfileStyles.inputWrapper, errors.password && { borderColor: '#EF4444', borderWidth: 1 }]}>
                <Ionicons name="lock-closed-outline" size={20} color={errors.password ? '#EF4444' : '#64748B'} style={NurseProfileStyles.inputIcon} />
                <TextInput
                  style={NurseProfileStyles.input}
                  value={newPassword}
                  onChangeText={(text) => {
                    setNewPassword(text);
                    if (errors.password) setErrors({...errors, password: null});
                  }}
                  placeholder="8+ chars, numbers, & symbols"
                  secureTextEntry={!showNewPassword}
                />
                <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
                  <Ionicons 
                    name={showNewPassword ? "eye-off-outline" : "eye-outline"} 
                    size={20} 
                    color="#64748B" 
                  />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={{ fontSize: 10, color: '#EF4444', marginTop: 4 }}>{errors.password}</Text>}
            </View>

            <View style={NurseProfileStyles.inputGroup}>
              <Text style={[NurseProfileStyles.label, errors.confirmPassword && { color: '#EF4444' }]}>Confirm New Password</Text>
              <View style={[NurseProfileStyles.inputWrapper, errors.confirmPassword && { borderColor: '#EF4444', borderWidth: 1 }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color={errors.confirmPassword ? '#EF4444' : '#64748B'} style={NurseProfileStyles.inputIcon} />
                <TextInput
                  style={NurseProfileStyles.input}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (errors.confirmPassword) setErrors({...errors, confirmPassword: null});
                  }}
                  placeholder="Re-enter new password"
                  secureTextEntry={!showConfirmPassword}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Ionicons 
                    name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} 
                    size={20} 
                    color="#64748B" 
                  />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword && <Text style={{ fontSize: 10, color: '#EF4444', marginTop: 4 }}>{errors.confirmPassword}</Text>}
            </View>

            <TouchableOpacity 
              style={[NurseProfileStyles.saveButton, { marginTop: 10, backgroundColor: '#1E293B' }]} 
              onPress={handleChangePassword}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="key" size={20} color="#fff" />
                  <Text style={NurseProfileStyles.saveButtonText}>Update Password</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={NurseProfileStyles.buttonContainer}>
          <TouchableOpacity 
            style={NurseProfileStyles.saveButton} 
            onPress={handleUpdateProfile}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={22} color="#fff" />
                <Text style={NurseProfileStyles.saveButtonText}>Save Professional Profile</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={NurseProfileStyles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out" size={22} color="#EF4444" />
            <Text style={NurseProfileStyles.logoutButtonText}>Sign Out Account</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
