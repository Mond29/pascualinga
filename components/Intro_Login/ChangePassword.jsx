import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import React, { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import ChangePasswordStyles from '../../styles/ChangePasswordStyles';
import { supabase } from '../../lib/supabase';

export default function ChangePassword({ route, navigation }) {
  const { email } = route.params;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    let newErrors = {};
    const trimmedPassword = `${password || ''}`.trim();
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])\S{8,}$/;

    if (!trimmedPassword) {
      newErrors.password = 'Password is required';
    } else if (!passwordRegex.test(trimmedPassword)) {
      newErrors.password = 'Password does not meet requirements';
    }

    if (`${confirmPassword || ''}`.trim() !== trimmedPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleReset = async () => {
    if (!validate()) return;

    setLoading(true);

    try {
      const { error } = await supabase
        .from('accounts')
        .update({ password: `${password || ''}`.trim() })
        .eq('email', email.trim().toLowerCase());

      if (error) throw error;

      Alert.alert(
        'Success', 
        'Your password has been reset successfully.',
        [{ text: 'Login Now', onPress: () => navigation.replace('LoginScreen') }]
      );
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#FFF7ED', '#FFEDD5']} style={ChangePasswordStyles.mainContainer}>
      <TouchableOpacity
        style={ChangePasswordStyles.backButton}
        onPress={() => navigation.replace('LoginScreen')}
      >
        <Ionicons name="arrow-back" size={24} color="#1E293B" />
      </TouchableOpacity>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={ChangePasswordStyles.scrollContent}>
          <View style={ChangePasswordStyles.card}>
            <View style={ChangePasswordStyles.iconHeader}>
              <Ionicons name="lock-open-outline" size={40} color="#DA7705" />
            </View>

            <Text style={ChangePasswordStyles.title}>New Password</Text>
            <Text style={ChangePasswordStyles.subtitle}>
              Please enter your new password below. Make sure it's secure.
            </Text>

            <Text style={ChangePasswordStyles.label}>New Password</Text>
            <View style={[ChangePasswordStyles.inputWrapper, errors.password && ChangePasswordStyles.inputErrorBorder]}>
              <Ionicons name="lock-closed-outline" size={20} color="#64748B" style={ChangePasswordStyles.inputIcon} />
              <TextInput
                secureTextEntry={!showPassword}
                placeholder="Enter new password"
                placeholderTextColor="#94A3B8"
                onChangeText={setPassword}
                style={ChangePasswordStyles.pillInput}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            {errors.password ? <Text style={ChangePasswordStyles.errorText}>{errors.password}</Text> : null}

            <Text style={ChangePasswordStyles.label}>Confirm Password</Text>
            <View style={[ChangePasswordStyles.inputWrapper, errors.confirmPassword && ChangePasswordStyles.inputErrorBorder]}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#64748B" style={ChangePasswordStyles.inputIcon} />
              <TextInput
                secureTextEntry={!showPassword}
                placeholder="Re-enter new password"
                placeholderTextColor="#94A3B8"
                onChangeText={setConfirmPassword}
                style={ChangePasswordStyles.pillInput}
              />
            </View>
            {errors.confirmPassword ? <Text style={ChangePasswordStyles.errorText}>{errors.confirmPassword}</Text> : null}

            <View style={ChangePasswordStyles.hintBox}>
              <Text style={ChangePasswordStyles.hintTitle}>Requirements:</Text>
              <Text style={ChangePasswordStyles.hintText}>• At least 8 characters long</Text>
              <Text style={ChangePasswordStyles.hintText}>• Uppercase, lowercase, number & symbol</Text>
            </View>

            <TouchableOpacity
              disabled={loading}
              style={[ChangePasswordStyles.submitButton, loading && { opacity: 0.7 }]}
              onPress={handleReset}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={ChangePasswordStyles.submitText}>Reset Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
