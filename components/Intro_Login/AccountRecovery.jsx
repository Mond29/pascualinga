import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import React, { useEffect, useState, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AccountRecoveryStyles from '../../styles/AccountRecoveryStyle';
import { supabase } from '../../lib/supabase';
import emailjs from '@emailjs/react-native';

export default function AccountRecovery({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const validateEmail = (text) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!text.trim()) {
      setEmailError('Email is required');
    } else if (!emailRegex.test(text.trim())) {
      setEmailError('Invalid email format');
    } else {
      setEmailError('');
    }
    setEmail(text);
  };

  const handleRecovery = async () => {
    if (!email.trim() || emailError) {
      setEmailError('Please enter a valid email');
      return;
    }

    setLoading(true);

    try {
      // 1. Check if email exists in Supabase
      const { data: user, error: userError } = await supabase
        .from('accounts')
        .select('name, email')
        .eq('email', email.trim().toLowerCase())
        .single();

      if (userError || !user) {
        setLoading(false);
        Alert.alert("Account Not Found", "This email is not registered with Pascualinga.");
        return;
      }

      // 2. Generate OTP
      const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();

      // 3. Send OTP via EmailJS
      const serviceID = 'service_abc123'; // Reuse from Registration
      const templateID = 'template_xyz456';
      const publicKey = 'Ng36Hv0ZvKc59armr';

      const templateParams = {
        to_name: user.name,
        user_email: email.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        passcode: generatedOTP,
      };

      const emailResponse = await emailjs.send(serviceID, templateID, templateParams, { publicKey: publicKey });

      if (emailResponse.status === 200) {
        setLoading(false);
        Alert.alert("Code Sent", "Verification code has been sent to your Gmail.");
        
        navigation.navigate('OTPrequest', {
          userData: { email: email.trim().toLowerCase() },
          correctOTP: generatedOTP,
          recoveryMode: true // Important for branching logic in OTPrequest
        });
      }
    } catch (err) {
      setLoading(false);
      console.error(err);
      Alert.alert("Error", "Failed to send recovery code. Please try again.");
    }
  };

  return (
    <LinearGradient colors={['#FFF7ED', '#FFEDD5']} style={AccountRecoveryStyles.mainContainer}>
      <TouchableOpacity
        style={AccountRecoveryStyles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={24} color="#1E293B" />
      </TouchableOpacity>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={AccountRecoveryStyles.scrollContent}>
          <Animated.View
            style={[
              AccountRecoveryStyles.card,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={AccountRecoveryStyles.iconHeader}>
              <Ionicons name="shield-checkmark-outline" size={80} color="#DA7705" />
            </View>

            <Text style={AccountRecoveryStyles.title}>Account Recovery</Text>
            <Text style={AccountRecoveryStyles.subtitle}>
              Enter your registered email address and we'll send you a verification code to reset your password.
            </Text>

            <View style={{ width: '100%' }}>
              <Text style={AccountRecoveryStyles.label}>Email Address</Text>
              <View style={[AccountRecoveryStyles.inputWrapper, emailError ? AccountRecoveryStyles.inputErrorBorder : null]}>
                <Ionicons name="mail-outline" size={20} color="#64748B" style={AccountRecoveryStyles.inputIcon} />
                <TextInput
                  editable={!loading}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="example@gmail.com"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={validateEmail}
                  style={AccountRecoveryStyles.pillInput}
                />
              </View>
              {emailError ? <Text style={AccountRecoveryStyles.errorText}>{emailError}</Text> : null}

              <TouchableOpacity 
                style={AccountRecoveryStyles.resendContainer}
                onPress={() => Alert.alert("Tip", "Check your Spam folder if you don't see the email.")}
              >
                <Text style={AccountRecoveryStyles.resendText}>Didn't receive the code?</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                disabled={loading}
                onPress={handleRecovery} 
                style={[AccountRecoveryStyles.submitButton, loading && { opacity: 0.7 }]}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={AccountRecoveryStyles.submitText}>Send Recovery Code</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
