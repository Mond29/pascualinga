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

    // Trigger validations
    validateEmail(email);
    validatePassword(password);

    if (!email.trim() || !password.trim() || emailError || passwordError) {
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('name, roles')
        .eq('email', email.toLowerCase().trim())
        .eq('password', password) 
        .single();

      if (error || !data) {
        setLoading(false);
        handleFailedAttempt();
        return;
      }

      setLoading(false);
      setFailedAttempts(0);
      
      const userRole = data.roles ? data.roles.toLowerCase().trim() : '';
      const userName = data.name || 'User';

      console.log(`✅ Login Success: ${userName} (${userRole})`);

      // Store user email and role in AsyncStorage for role-based logic
      const normalizedEmail = email.toLowerCase().trim();
      await AsyncStorage.setItem('userEmail', normalizedEmail);
      await AsyncStorage.setItem('userRole', userRole);
      await AsyncStorage.removeItem('userName');
      await AsyncStorage.setItem(`userName:${normalizedEmail}`, `${userName}`.trim());

      if (userRole === 'nurse' || userRole === 'lab') {
        navigation.replace('NurseBottomTabs');
      } else if (userRole === 'patient') {
        navigation.replace('PatientBottomTabs');
      } else if (userRole === 'doctor') {
        await postStaffHeartbeat({ email: normalizedEmail, name: userName });
        navigation.replace('NurseBottomTabs');
      } else {
        Alert.alert('Access Denied', `Role "${userRole}" is not configured in this app.`);
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
