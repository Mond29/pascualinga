import {
  View,
  Text,
  Image,
  TextInput,
  Alert,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, useRef } from 'react';
import LoginStyle from '../../styles/LoginStyle';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase'; 
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const navigation = useNavigation();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockSeconds, setLockSeconds] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  
  // Validation states
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const lockTimer = 300; // 5 minutes
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  
  // Hover/Press Animations
  const buttonScale = useRef(new Animated.Value(1)).current;

  // Initial Entrance Animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();
  }, []);

  const animatePress = (scaleValue, toValue) => {
    Animated.spring(scaleValue, {
      toValue,
      useNativeDriver: true,
      friction: 4,
      tension: 40,
    }).start();
  };

  // Countdown Logic for Locked State
  useEffect(() => {
    let timer;
    if (locked && lockSeconds > 0) {
      timer = setInterval(() => setLockSeconds((prev) => prev - 1), 1000);
    } else if (lockSeconds === 0 && locked) {
      setLocked(false);
      setFailedAttempts(0);
      Alert.alert('Unlocked', 'You may try logging in again.');
    }
    return () => clearInterval(timer);
  }, [locked, lockSeconds]);

  const validateEmail = (text) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!text) {
      setEmailError('Email is required');
    } else if (!emailRegex.test(text)) {
      setEmailError('Please enter a valid email address');
    } else {
      setEmailError('');
    }
    setEmail(text);
  };

  const validatePassword = (text) => {
    if (!text) {
      setPasswordError('Password is required');
    } else if (text.length < 6) {
      setPasswordError('Password must be at least 6 characters');
    } else {
      setPasswordError('');
    }
    setPassword(text);
  };

  const getApiBaseUrl = () => {
    const fromEnv = `${process.env.EXPO_PUBLIC_API_BASE_URL || ''}`.trim();
    if (fromEnv) return fromEnv.replace(/\/+$/, '');
    return 'https://api.pascualinga.com';
  };

  const postStaffHeartbeat = async ({ email: userEmail, name: userName }) => {
    const emailNorm = `${userEmail || ''}`.trim().toLowerCase();
    if (!emailNorm) return;
    const nameNorm = `${userName || ''}`.trim() || emailNorm;

    try {
      await fetch(`${getApiBaseUrl()}/api/staff/heartbeat`, {
        method: 'POST',
        headers: {
          'x-user-role': 'doctor',
          'x-user-email': emailNorm,
          'x-user-name': nameNorm,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailNorm, accountType: 'doctor' }),
      });
    } catch (_) {}
  };

  const handleLogin = async () => {
    if (locked || loading) return;

    validateEmail(email);
    validatePassword(password);

    if (!email.trim() || !password.trim() || emailError || passwordError) {
      return;
    }

    setLoading(true);

    try {
      const normalizedEmail = email.toLowerCase().trim();

      // ----------------------------------------------------------------
      // STEP 1: Verify credentials against Supabase accounts table
      // (This preserves current login flow that works.)
      // ----------------------------------------------------------------
      const { data, error } = await supabase
        .from('accounts')
        .select('name, roles')
        .eq('email', normalizedEmail)
        .eq('password', password)
        .single();

      if (error || !data) {
        setLoading(false);
        handleFailedAttempt();
        return;
      }

      const userRole = data.roles ? data.roles.toLowerCase().trim() : '';
      const userName = data.name || 'User';

      // ----------------------------------------------------------------
      // NEW per backend commit da276d29 (Supabase patient sessions):
      // STEP 2: Create actual Supabase Auth session so we get a valid
      // access_token to send as Authorization: Bearer <token> when
      // fetching /api/lab-results/mine, /api/billing/..., etc.
      // Backend will validate this JWT against the same Supabase project
      // (iknkfjzoubkymcwprrux). If signIn fails, AUTO-CREATE the user
      // in Supabase Auth via signUp() using the same email + password
      // (credentials already verified against accounts table above),
      // then re-run signInWithPassword to get the live session.
      // ----------------------------------------------------------------
      let supabaseAuthToken = '';
      let supabaseAuthSession = null;
      let authErrorCode = '';
      let authErrorMessage = '';
      let authFlow = 'signInWithPassword';
      try {
        let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: password,
        });
        if (authError) {
          authErrorCode = authError.code || '';
          authErrorMessage = authError.message || '';
          // signIn failed — user likely doesn't exist in Supabase Auth yet
          // (only exists in plaintext accounts table). Create them now.
          authFlow = 'signUp then signInWithPassword';
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: normalizedEmail,
            password: password,
            options: {
              data: { name: userName, role: userRole, display_name: userName },
              emailRedirectTo: undefined,
            },
          });
          if (signUpError) {
            // signUp also failed — log but don't block login
            authErrorCode = signUpError.code || authErrorCode;
            authErrorMessage = signUpError.message || authErrorMessage;
          } else {
            // signUp OK — now do a real sign-in to guarantee a live session
            const re = await supabase.auth.signInWithPassword({
              email: normalizedEmail,
              password: password,
            });
            if (!re.error && re.data?.session?.access_token) {
              authData = re.data;
              authErrorCode = '';
              authErrorMessage = '';
            } else if (re.error) {
              authErrorCode = re.error.code || authErrorCode;
              authErrorMessage = re.error.message || authErrorMessage;
            } else if (signUpData?.session?.access_token) {
              // signUp itself returned a session (auto-confirm enabled)
              authData = signUpData;
              authErrorCode = '';
              authErrorMessage = '';
            }
          }
        }
        if (!authErrorCode && authData?.session?.access_token) {
          supabaseAuthSession = authData.session;
          supabaseAuthToken = authData.session.access_token.trim();
        } else if (!authErrorCode && authData?.user && signUpData?.session?.access_token) {
          supabaseAuthSession = signUpData.session;
          supabaseAuthToken = signUpData.session.access_token.trim();
        }
        // eslint-disable-next-line no-console
        console.log('[Forensics: login:supabase-auth]', {
          step: 'Supabase auth for backend Bearer JWT',
          authFlow,
          emailSanitized: normalizedEmail ? `${normalizedEmail.substring(0, 3)}***@***` : '',
          role: userRole,
          gotSession: Boolean(supabaseAuthSession),
          gotToken: Boolean(supabaseAuthToken),
          tokenLength: String(supabaseAuthToken || '').length,
          authErrorCode,
          authErrorMessage: authErrorMessage.substring(0, 200),
          note: 'Backend commit da276d29 validates this JWT access_token as Authorization: Bearer header for /api/* endpoints. If gotToken=false, lab-results/mine returns HTTP 401. User creation via signUp was attempted automatically when signInWithPassword failed (credentials already verified against accounts table).',
        });
      } catch (authErr) {
        // eslint-disable-next-line no-console
        console.log('[Forensics: login:supabase-auth] auth flow threw (non-fatal, continue but lab API will 401):', {
          authFlow,
          message: authErr?.message || String(authErr || ''),
        });
      }

      // Persist user identity (same as before)
      await AsyncStorage.setItem('userEmail', normalizedEmail);
      await AsyncStorage.setItem('userRole', userRole);
      await AsyncStorage.removeItem('userName');
      await AsyncStorage.setItem(`userName:${normalizedEmail}`, `${userName}`.trim());
      try { await AsyncStorage.removeItem('currentUser'); } catch (_) {}
      try { await AsyncStorage.removeItem('verifiedUser'); } catch (_) {}
      try { await AsyncStorage.removeItem('sessionToken'); } catch (_) {}
      try { await AsyncStorage.removeItem(`sessionToken:${normalizedEmail}`); } catch (_) {}
      setFailedAttempts(0);
      setLoading(false);

      // --------------------------------------------------------------
      // If Supabase Auth user creation failed because signups are
      // disabled globally, warn the user immediately — otherwise they
      // will only see the issue when they try to download a PDF and
      // get the red banner + 401 error. This applies to EXISTING
      // accounts that were created in the accounts table before
      // backend commit da276d29 switched to Supabase JWT auth.
      // --------------------------------------------------------------
      const proceedWithNavigation = () => {
        if (userRole === 'nurse' || userRole === 'lab') navigation.replace('NurseBottomTabs');
        else if (userRole === 'patient') navigation.replace('PatientBottomTabs');
        else if (userRole === 'doctor') {
          postStaffHeartbeat({ email: normalizedEmail, name: userName }).catch(() => {});
          navigation.replace('NurseBottomTabs');
        } else {
          Alert.alert('Access Denied', `Role "${userRole}" is not configured in this app.`);
        }
      };
      if (authErrorCode === 'signup_disabled' && !supabaseAuthToken) {
        Alert.alert(
          '⚠️ Login OK — PDF Downloads Disabled',
          'Your account was verified against the accounts table and you may continue using the app.\n\n' +
          'HOWEVER: The app tried to create your Supabase Auth user automatically (required for PDF Lab Result downloads via commit da276d29), but Supabase Auth signups are currently DISABLED on this project.\n\n' +
          'For the admin / developer — there are 2 ways to fix this:\n\n' +
          'OPTION A — BULK SEED EXISTING ACCOUNTS (RECOMMENDED, SECURE):\n' +
          'Supabase Dashboard → Authentication → Users → Add user\n' +
          '• Email: ' + normalizedEmail + '\n' +
          '• Password: (same password the user uses to login)\n' +
          '• CHECK "Email confirmed"\n' +
          'Repeat for ALL ~10 existing patient accounts. Signups remain DISABLED after — safest for production.\n\n' +
          'OPTION B — TEMPORARILY ENABLE SIGNUPS (FASTER BUT LESS SECURE):\n' +
          'Supabase Dashboard → Authentication → Configuration → Sign In / Providers → Email Provider → Settings → ENABLE "Allow user signups" → Save.\n' +
          'Then tell all existing users to: Logout → Login ONCE (auto-signUp creates their auth entry).\n' +
          'After everyone has logged in once, DISABLE signups again for security.\n\n' +
          'New users registering via "Create Account" will also see this warning until one of the above options is applied.',
          [
            { text: 'OK, I understand — take me to the app', style: 'default', onPress: proceedWithNavigation },
          ],
        );
      } else {
        proceedWithNavigation();
      }

    } catch (err) {
      setLoading(false);
      Alert.alert('Connection Error', 'Unable to reach the server. Check your internet.');
      console.error(err);
    }
  };

  const handleFailedAttempt = () => {
    const attempts = failedAttempts + 1;
    setFailedAttempts(attempts);
    if (attempts >= 3) {
      setLocked(true);
      setLockSeconds(lockTimer);
      Alert.alert('Account Locked', 'Too many failed attempts. Try again in 5 minutes.');
    } else {
      Alert.alert('Login Failed', `Invalid email or password (${attempts}/3)`);
    }
  };

  return (
    <LinearGradient colors={['#FFF7ED', '#FFEDD5']} style={LoginStyle.mainContainer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <Animated.View style={[LoginStyle.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            
            <View style={LoginStyle.logoContainer}>
              <Image source={require('../../assets/pgh_logo.png')} style={LoginStyle.logo} />
            </View>

            <View style={LoginStyle.textSection}>
              <Text style={LoginStyle.welcomeMessage}>Welcome Back!</Text>
              <Text style={LoginStyle.welcomeSubtitleMessage}>Please enter your details to sign in.</Text>
            </View>

            <View style={LoginStyle.formContainer}>
              <View style={LoginStyle.inputSection}>
                <Text style={LoginStyle.label}>Email Address</Text>
                <View style={[LoginStyle.inputWrapper, emailError ? LoginStyle.inputErrorBorder : null]}>
                  <Ionicons name="mail-outline" size={20} color="#64748B" style={LoginStyle.inputIcon} />
                  <TextInput
                    editable={!locked && !loading}
                    value={email}
                    onChangeText={validateEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="Enter your email"
                    placeholderTextColor="#94A3B8"
                    style={[LoginStyle.pillInput, (locked || loading) && LoginStyle.disabledInput]}
                  />
                </View>
                {emailError ? <Text style={LoginStyle.errorText}>{emailError}</Text> : null}
              </View>

              <View style={LoginStyle.inputSection}>
                <Text style={LoginStyle.label}>Password</Text>
                <View style={[LoginStyle.inputWrapper, passwordError ? LoginStyle.inputErrorBorder : null]}>
                  <Ionicons name="lock-closed-outline" size={20} color="#64748B" style={LoginStyle.inputIcon} />
                  <TextInput
                    editable={!locked && !loading}
                    value={password}
                    onChangeText={validatePassword}
                    secureTextEntry={!showPassword}
                    placeholder="Enter your password"
                    placeholderTextColor="#94A3B8"
                    style={[LoginStyle.pillInput, (locked || loading) && LoginStyle.disabledInput]}
                  />
                  <TouchableOpacity
                    style={LoginStyle.eyeIcon}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons
                      name={showPassword ? "eye-outline" : "eye-off-outline"}
                      size={20}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                </View>
                {passwordError ? <Text style={LoginStyle.errorText}>{passwordError}</Text> : null}
              </View>

              <TouchableOpacity 
                onPress={() => navigation.navigate("AccountRecovery")}
                style={LoginStyle.forgotPasswordContainer}
              >
                <Text style={LoginStyle.forgotPassword}>Forgot Password?</Text>
              </TouchableOpacity>

              <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  disabled={locked || loading}
                  onPressIn={() => animatePress(buttonScale, 0.98)}
                  onPressOut={() => animatePress(buttonScale, 1)}
                  onPress={handleLogin}
                  style={[
                    LoginStyle.loginButton, 
                    (locked || loading) && LoginStyle.loginButtonLocked
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={LoginStyle.loginButtonText}>
                      {locked ? `Locked (${lockSeconds}s)` : 'Sign In'}
                    </Text>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>

            <View style={LoginStyle.footerContainer}>
              <Text style={LoginStyle.footerText}>New to Pascualinga? </Text>
              <TouchableOpacity onPress={() => navigation.navigate("Registration")}>
                <Text style={LoginStyle.footerLink}>Create Account</Text>
              </TouchableOpacity>
            </View>

            <View style={LoginStyle.helpRow}>
              <Text style={LoginStyle.helpText}>First time? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('GetStarted')} activeOpacity={0.85}>
                <Text style={LoginStyle.helpLink}>View Quick Guide</Text>
              </TouchableOpacity>
            </View>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
