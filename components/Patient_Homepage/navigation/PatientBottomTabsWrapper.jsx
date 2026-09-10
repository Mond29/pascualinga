import React, { useEffect, useState } from 'react'
import { View, StyleSheet, Modal, Text, TouchableOpacity, Animated } from 'react-native'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../../lib/supabase'
import PatientHeader from '../PatientHeader'
import PatientBottomTabs from './PatientBottomTabs' // keep the tab navigator separate

export default function PatientBottomTabsWrapper() {
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [notificationData, setNotificationData] = useState(null);
  const [slideAnim] = useState(new Animated.Value(-100));

  useEffect(() => {
    let channel;
    
    const setupRealtime = async () => {
      const email = await AsyncStorage.getItem('userEmail');
      if (!email) return;

      channel = supabase
        .channel(`patient-notifications:${email}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'appointments',
          },
          (payload) => {
            console.log('Postgres change received:', payload.new);
            const newApp = payload.new;
            
            const emailMatch = newApp.email === email;
            if (emailMatch) {
              console.log('Match found for notification!');
              showNotification(newApp);
            }
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const showNotification = (data) => {
    setNotificationData(data);
    setNotificationVisible(true);
    Animated.spring(slideAnim, {
      toValue: 20,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();

    // Auto-hide after 10 seconds
    setTimeout(() => {
      hideNotification();
    }, 10000);
  };

  const hideNotification = () => {
    Animated.timing(slideAnim, {
      toValue: -150,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setNotificationVisible(false);
      setNotificationData(null);
    });
  };

  return (
    <View style={styles.container}>
      {/* Persistent Header */}
      <PatientHeader />

      {/* Bottom Tabs */}
      <View style={styles.tabs}>
        <PatientBottomTabs />
      </View>

      {/* In-App Notification Pop-up */}
      {notificationVisible && (
        <Animated.View 
          style={[
            styles.notificationContainer,
            { transform: [{ translateY: slideAnim }] }
          ]}
        >
          <View style={styles.notificationContent}>
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons name="calendar-check" size={28} color="#fff" />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.notificationTitle}>Appointment Approved!</Text>
              <Text style={styles.notificationMessage}>
                Your {notificationData?.service_type} appointment on {notificationData?.appointment_date} at {notificationData?.appointment_time} is now approved.
              </Text>
            </View>
            <TouchableOpacity onPress={hideNotification} style={styles.closeButton}>
              <Feather name="x" size={20} color="#666" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  tabs: {
    flex: 1,
  },
  notificationContainer: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    zIndex: 9999,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  notificationContent: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DA7705',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
})
