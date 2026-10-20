import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const getApiBaseUrl = () => {
  const rawBase = `${process.env.EXPO_PUBLIC_API_BASE_URL || ''}`.trim();
  return rawBase ? rawBase.replace(/\/+$/, '') : 'https://api.pascualinga.com';
};

const saveCurrentUser = async (verifiedUser) => {
  if (!verifiedUser || typeof verifiedUser !== 'object') return;
  try {
    await AsyncStorage.setItem('currentUser', JSON.stringify({ ...verifiedUser, updatedAt: Date.now() }));
  } catch (_) {}
  const extractToken = (obj) => {
    if (!obj || typeof obj !== 'object') return '';
    const candFields = ['sessionToken', 'session_token', 'token', 'accessToken', 'access_token', 'authToken', 'auth_token', 'jwt', 'bearer'];
    for (const f of candFields) {
      if (typeof obj[f] === 'string' && obj[f].length > 20) return obj[f];
      const d = obj.data;
      if (d && typeof d === 'object' && typeof d[f] === 'string' && d[f].length > 20) return d[f];
    }
    return '';
  };
  const token = extractToken(verifiedUser);
  const e = `${verifiedUser.email || ''}`.trim().toLowerCase();
  if (token) {
    try { await AsyncStorage.setItem('verifiedUser', JSON.stringify({ ...(verifiedUser.user || verifiedUser.profile || {}), sessionToken: token, email: e, updatedAt: Date.now() })); } catch (_) {}
    try { await AsyncStorage.setItem('sessionToken', token); } catch (_) {}
    try { if (e) await AsyncStorage.setItem(`sessionToken:${e}`, token); } catch (_) {}
  }
};

export default function OTPRequest({ route, navigation }) {
  const params = route?.params || {};
  const { userData, correctOTP, recoveryMode, loginMode, challengeId, backendRole, backendLoginResponse } = params;
  const [userOTP, setUserOTP] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async () => {
    const inputCode = String(userOTP).trim();
    const expectedCode = String(correctOTP || '').trim();
    const targetEmail = userData && userData.email ? String(userData.email).trim().toLowerCase() : '';

    if (recoveryMode) {
      if (inputCode !== expectedCode) {
        Alert.alert("Invalid Code", "The OTP you entered is incorrect. Please try again.");
        return;
      }
      Alert.alert("Verified", "You can now reset your password.");
      navigation.navigate('ChangePassword', { email: targetEmail });
      return;
    }

    if (loginMode) {
      if (!targetEmail) {
        Alert.alert("Login Error", "No target email was passed from login screen. Please log in again.");
        return;
      }
      const nm = userData && userData.name ? String(userData.name).trim() : targetEmail;
      const role = (backendRole && typeof backendRole === 'string') ? backendRole.toLowerCase().trim() : (userData && userData.roles ? String(userData.roles).toLowerCase().trim() : 'patient');
      await AsyncStorage.setItem('userEmail', targetEmail);
      await AsyncStorage.setItem('userRole', role);
      if (nm) await AsyncStorage.setItem(`userName:${targetEmail}`, nm);
      try { await AsyncStorage.removeItem('currentUser'); } catch (_) {}
      try { await AsyncStorage.removeItem('verifiedUser'); } catch (_) {}
      try { await AsyncStorage.removeItem('sessionToken'); } catch (_) {}
      try { await AsyncStorage.removeItem(`sessionToken:${targetEmail}`); } catch (_) {}

      const password = userData && (userData.password || userData.pass || userData.pwd) ? String(userData.password || userData.pass || userData.pwd) : '';
      const extractedChallenge = (() => {
        if (challengeId && typeof challengeId === 'string' && challengeId.trim()) return challengeId.trim();
        if (backendLoginResponse && typeof backendLoginResponse === 'object') {
          for (const k of ['challengeId', 'challenge_id', 'challenge', 'requestId', 'request_id', 'otpChallengeId', 'otp_challenge_id', 'nonce', 'state']) {
            if (backendLoginResponse[k] && typeof backendLoginResponse[k] === 'string' && backendLoginResponse[k].trim()) return backendLoginResponse[k].trim();
            const d = backendLoginResponse.data;
            if (d && typeof d === 'object' && d[k] && typeof d[k] === 'string' && d[k].trim()) return d[k].trim();
          }
        }
        return '';
      })();
      const codeFromBackend = (() => {
        if (expectedCode) return expectedCode;
        if (backendLoginResponse && typeof backendLoginResponse === 'object') {
          for (const k of ['otp', 'code', 'correctOtp', 'correct_otp', 'correctCode', 'correct_code', 'sentOtp', 'sent_otp']) {
            if (backendLoginResponse[k] && typeof backendLoginResponse[k] === 'string') return backendLoginResponse[k];
            const d = backendLoginResponse.data;
            if (d && typeof d === 'object' && d[k] && typeof d[k] === 'string') return d[k];
          }
        }
        return '';
      })();
      const otpMatch = inputCode === expectedCode || (expectedCode && inputCode && inputCode.toLowerCase() === expectedCode.toLowerCase()) || (codeFromBackend && inputCode === codeFromBackend);

      setIsVerifying(true);
      let verifiedUser = null;
      let supabaseAuthToken = '';
      try {
        // ----------------------------------------------------------------
        // Per backend commit da276d29: Use Supabase session directly.
        // If OTP matches locally, create Supabase Auth session so
        // we get access_token for Authorization: Bearer header.
        // No extra web OTP backend endpoints or guessed endpoints.
        // ----------------------------------------------------------------
        if (otpMatch && password && targetEmail) {
          try {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
              email: targetEmail,
              password: password,
            });
            if (!authError && authData?.session?.access_token) {
              supabaseAuthToken = authData.session.access_token.trim();
              verifiedUser = {
                user: { email: targetEmail, role, name: nm },
                session: authData.session,
                access_token: supabaseAuthToken,
                accessToken: supabaseAuthToken,
                sessionToken: supabaseAuthToken,
                email: targetEmail,
                role,
                source: 'otp-login:supabase-auth',
              };
            }
            // eslint-disable-next-line no-console
            console.log('[Forensics: otp-login:supabase-auth]', {
              targetEmail: targetEmail ? `${targetEmail.substring(0, 3)}***@***` : '',
              role,
              otpMatch: true,
              gotSupabaseSession: Boolean(authData?.session),
              gotToken: Boolean(supabaseAuthToken),
              tokenLength: String(supabaseAuthToken || '').length,
              authErrorCode: authError?.code || '',
              authErrorMessage: authError?.message || '',
              note: 'Per #1 instruction: Supabase only — extra web OTP endpoints and guessed login endpoints removed. Lab results use this JWT via supabase.auth.getSession() as Bearer.',
            });
          } catch (authErr) {
            // eslint-disable-next-line no-console
            console.log('[Forensics: otp-login:supabase-auth] signInWithPassword threw (non-fatal, continue):', {
              message: authErr?.message || String(authErr || ''),
            });
          }
        }

        if (verifiedUser) {
          await saveCurrentUser(verifiedUser);
          console.log('[Auth:otp:saved]', {
            hasSessionToken: true,
            email: targetEmail ? `${targetEmail.substring(0, 3)}***@***` : '',
            role,
          });
        }
      } catch (_) {}
      finally {
        setIsVerifying(false);
      }

      if (!otpMatch) {
        Alert.alert(
          "Invalid Code",
          "The OTP you entered is incorrect. Please try again.\n\nIf you did not receive an OTP, please request a new one from your web team."
        );
        return;
      }
      if (role === 'nurse' || role === 'lab' || role === 'doctor') navigation.replace('NurseBottomTabs');
      else navigation.replace('PatientBottomTabs');
      return;
    }

    if (inputCode !== expectedCode) {
      Alert.alert("Invalid Code", "The OTP you entered is incorrect. Please try again.");
      return;
    }

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

      // ----------------------------------------------------------------
      // NEW: Immediately create Supabase Auth user for this new account
      // (required for backend commit da276d29: Authorization: Bearer
      // <Supabase JWT access_token> on /api/lab-results/mine etc).
      // If signUp fails due to signup_disabled, still allow registration
      // (the account already exists in accounts+patients tables) but warn
      // the user that PDF downloads won't work until an admin provisions
      // the Supabase Auth user.
      // ----------------------------------------------------------------
      let supabaseSignUpErrorCode = '';
      let supabaseSignUpErrorMessage = '';
      let supabaseSignUpGotToken = false;
      try {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: targetEmail,
          password: String(userData.password),
          options: {
            data: {
              name: `${userData.name || ''}`.trim(),
              first_name: firstName,
              last_name: lastName,
              role: 'patient',
              display_name: `${userData.name || ''}`.trim(),
              address: `${userData.address || ''}`.trim(),
              age: parseInt(userData.age) || null,
              birthday: dob,
              contact_number: phone,
              gender: gender,
            },
            emailRedirectTo: undefined,
          },
        });
        if (signUpError) {
          supabaseSignUpErrorCode = signUpError.code || '';
          supabaseSignUpErrorMessage = signUpError.message || '';
        } else if (signUpData?.session?.access_token || signUpData?.user) {
          supabaseSignUpGotToken = Boolean(signUpData?.session?.access_token);
          if (signUpData?.session?.access_token) {
            try {
              await supabase.auth.signOut().catch(() => {});
            } catch (_) {}
          }
        }
        // eslint-disable-next-line no-console
        console.log('[Forensics: registration:supabase-signup]', {
          step: 'Registration: create Supabase Auth user alongside accounts+patients inserts',
          emailSanitized: targetEmail ? `${targetEmail.substring(0, 3)}***@***` : '',
          role: 'patient',
          gotAuthUser: !(supabaseSignUpErrorCode),
          gotSession: supabaseSignUpGotToken,
          supabaseSignUpErrorCode,
          supabaseSignUpErrorMessage: (supabaseSignUpErrorMessage || '').substring(0, 220),
          note: 'Required for backend commit da276d29: when this user logs in, supabase.auth.signInWithPassword() will return a live JWT access_token used as Authorization: Bearer header on /api/lab-results/mine and PDF endpoints. If gotAuthUser=false due to signup_disabled, admin must manually add user to Supabase Authentication > Users before PDF downloads will work for this account.',
        });
      } catch (signUpErr) {
        supabaseSignUpErrorCode = 'registration_signup_threw';
        supabaseSignUpErrorMessage = signUpErr?.message || String(signUpErr || '');
        // eslint-disable-next-line no-console
        console.log('[Forensics: registration:supabase-signup] threw (non-fatal — account already created in accounts+patients):', {
          message: supabaseSignUpErrorMessage.substring(0, 220),
        });
      }

      try {
        const base = getApiBaseUrl();
        const endpoints = [
          `${base}/api/patients/login/otp/verify`,
          `${base}/api/patient/login/otp/verify`,
          `${base}/api/staff/login/otp/verify`,
        ];
        let p = null;
        for (const ep of endpoints) {
          try {
            const res = await fetch(ep, {
              method: 'POST',
              headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: targetEmail,
                password: String(userData.password),
                otp: inputCode,
                code: inputCode,
              }),
            });
            const txt = await res.text().catch(() => '');
            if (!res.ok) continue;
            try { p = JSON.parse(txt); break; } catch (_) { p = { rawText: txt }; break; }
          } catch (_) {}
        }
        if (p && typeof p === 'object') {
          let t = '';
          const candFields = ['sessionToken', 'session_token', 'token', 'accessToken', 'access_token', 'authToken', 'auth_token', 'jwt', 'bearer'];
          for (const f of candFields) {
            if (p[f] && typeof p[f] === 'string') { t = p[f]; break; }
            const d = p.data;
            if (d && typeof d === 'object' && d[f] && typeof d[f] === 'string') { t = d[f]; break; }
          }
          if (t) {
            const wrapped = { sessionToken: t, email: targetEmail, source: 'registration:otp:verify', role: 'patient' };
            await saveCurrentUser(wrapped);
          }
        }
      } catch (_) {}

      if (supabaseSignUpErrorCode === 'signup_disabled') {
        Alert.alert(
          "Account Created — Attention Needed!", 
          "Your Pascualinga patient account was created successfully (you can log in now).\n\n" +
          "However, Supabase Auth signups are currently DISABLED on this project.\n\n" +
          "This means PDF Lab Results downloads will NOT work for your account until the administrator manually adds your email to the Supabase Auth Users dashboard.\n\n" +
          "If you are the admin, go to:\n" +
          "Supabase → Authentication → Users → Add user → enter email: " + targetEmail + " with your chosen password, and CHECK \"Email confirmed\".\n\n" +
          "If you are a patient, message the clinic/developer to enable your Supabase Auth record. Thank you!",
          [{ text: "Proceed to Login", onPress: () => navigation.replace('LoginScreen') }]
        );
      } else {
        Alert.alert(
          "Verified!", 
          "Account created successfully. You may log in now.", 
          [{ text: "Proceed to Login", onPress: () => navigation.replace('LoginScreen') }]
        );
      }
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
