import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export default function OTPRequest({ route, navigation }) {
  const { userData, correctOTP, recoveryMode } = route.params;
  const [userOTP, setUserOTP] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async () => {
    const inputCode = String(userOTP).trim();
    const expectedCode = String(correctOTP).trim();

    if (inputCode !== expectedCode) {
      Alert.alert("Invalid Code", "The OTP you entered is incorrect. Please try again.");
      return;
    }

    if (recoveryMode) {
      // Branch for Account Recovery
      Alert.alert("Verified", "You can now reset your password.");
      navigation.navigate('ChangePassword', { email: userData.email });
      return;
    }

    // Branch for Registration
    setIsVerifying(true);
    try {
      const targetEmail = userData.email.trim().toLowerCase();

      const { data: existing } = await supabase
        .from('accounts')
        .select('email')
        .eq('email', targetEmail)
        .limit(1);

      if (existing && existing.length > 0) {
        Alert.alert(
          'Already Registered',
          'An account with this email already exists. Please log in.',
          [{ text: 'OK', onPress: () => navigation.replace('LoginScreen') }]
        );
        return;
      }

      const { error } = await supabase
        .from('accounts')
        .insert([{
          name: userData.name.trim(),
          email: targetEmail,
          password: userData.password, 
          address: userData.address.trim(),
          age: parseInt(userData.age),
          birthday: userData.birthday,
          contact_number: userData.contact_number,
          roles: 'patient'
        }]);

      if (error) throw error;

      try {
        const firstNameRaw = `${userData.firstName || ''}`.trim();
        const lastNameRaw = `${userData.lastName || ''}`.trim();
        let firstName = firstNameRaw;
        let lastName = lastNameRaw;
        if (!firstName && !lastName) {
          const full = `${userData.name || ''}`.trim();
          const parts = full.split(' ').filter(Boolean);
          if (parts.length > 1) {
            lastName = parts.pop() || '';
            firstName = parts.join(' ');
          } else {
            firstName = full;
            lastName = '';
          }
        }

        const dob = `${userData.birthday || ''}`.trim() || null;
        const phone = `${userData.contact_number || userData.contact || ''}`.trim() || null;
        const genderRaw = `${userData.gender || ''}`.trim();
        const gender = genderRaw === 'Female' || genderRaw === 'Male' ? genderRaw : null;

        await supabase
          .from('patients')
          .upsert(
            [
              {
                email: targetEmail,
                first_name: firstName || null,
                last_name: lastName || null,
                date_of_birth: dob,
                contact_number: phone,
                gender: gender,
              },
            ],
            { onConflict: 'email' },
          );
      } catch (_) {}

      Alert.alert(
        "Verified!", 
        "Account created successfully.", 
        [{ text: "Proceed to Login", onPress: () => navigation.replace('LoginScreen') }]
      );
    } catch (err) {
      Alert.alert("Database Error", err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <LinearGradient colors={['#FFF7ED', '#FFEDD5']} style={{flex:1}}>
      <SafeAreaView style={{flex:1}}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>

          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <Ionicons name="mail-open-outline" size={60} color="#DA7705" />
            </View>
            
            <Text style={styles.title}>Verify Your Email</Text>
            <Text style={styles.subtitle}>Enter the 6-digit code we sent to{'\n'}<Text style={{fontWeight: '700', color: '#1E293B'}}>{userData.email}</Text></Text>
            
            <TextInput
              style={styles.otpInput}
              placeholder="000000"
              placeholderTextColor="#CBD5E1"
              keyboardType="numeric"
              maxLength={6}
              onChangeText={setUserOTP}
              value={userOTP}
              autoFocus
            />

            <TouchableOpacity 
              style={[styles.button, isVerifying && { opacity: 0.7 }]} 
              onPress={handleVerify} 
              disabled={isVerifying}
            >
              {isVerifying ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>{recoveryMode ? 'Verify & Reset' : 'Verify & Register'}</Text>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={() => navigation.goBack()} 
              style={styles.resendButton}
              disabled={isVerifying}
            >
              <Text style={styles.resendText}>Wrong email? Go back</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    width: 45,
    height: 45,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  card: { 
    width: '100%', 
    backgroundColor: '#FFF', 
    paddingHorizontal: 25,
    paddingVertical: 40,
    borderRadius: 30, 
    alignItems: 'center', 
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  iconContainer: {
    marginBottom: 20,
    backgroundColor: '#FFF7ED',
    padding: 20,
    borderRadius: 50,
  },
  title: { fontSize: 26, fontWeight: '800', color: '#1E293B', marginBottom: 10 },
  subtitle: { textAlign: 'center', color: '#64748B', fontSize: 15, lineHeight: 22, marginBottom: 30 },
  otpInput: { 
    width: '100%', 
    height: 60, 
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    fontSize: 28, 
    textAlign: 'center', 
    fontWeight: '800',
    letterSpacing: 8, 
    marginBottom: 30,
    color: '#1E293B'
  },
  button: { 
    backgroundColor: '#DA7705', 
    width: '100%', 
    height: 58,
    borderRadius: 18, 
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DA7705',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: { color: '#FFF', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  resendButton: { marginTop: 25 },
  resendText: { color: '#DA7705', fontSize: 14, fontWeight: '700' }
});
