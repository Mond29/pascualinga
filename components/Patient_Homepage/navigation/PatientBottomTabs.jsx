import React, { useEffect, useState, useRef } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { View, Text, Animated, StyleSheet, TouchableOpacity, Dimensions, Modal, PanResponder } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Screens
import PatientHomepage from '../PatientHomepage';
import PatientActivity from '../PatientActivityScreen';
import PatientServices from '../PatientServicesScreen';
import PatientAccountScreen from '../PatientAccountScreen';
import PatientBottomTabStyles from '../../../styles/PatientStyles/PatientUIstyles/PatientBottomTabsStyles';
import PatientRecordsScreen from '../services/PatientRecordsScreen';
import PatientChatbotScreen from '../services/PatientChatbotScreen';
import PatientSchedule from '../PatientSchedule';

const { width } = Dimensions.get('window');
const Tab = createBottomTabNavigator();

const NotificationBanner = ({ visible, title, message, onHide, navigation }) => {
  const slideAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(slideAnim, {
          toValue: 20,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.delay(5000),
        Animated.timing(slideAnim, {
          toValue: -100,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => onHide());
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.notificationBanner, { transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity 
        style={styles.bannerContent} 
        activeOpacity={0.9}
        onPress={() => {
          onHide();
          navigation.navigate('Activity');
        }}
      >
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="bell-ring" size={24} color="#fff" />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.bannerTitle}>{title}</Text>
          <Text style={styles.bannerMessage} numberOfLines={2}>{message}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function PatientBottomTabs({ navigation }) {
  const insets = useSafeAreaInsets();
  const [notification, setNotification] = useState({ visible: false, title: '', message: '' });
  const [chatOpen, setChatOpen] = useState(false);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const chatPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const chatPosRef = useRef({ x: 0, y: 0 });
  const chatFixedXRef = useRef(0);
  const chatMovedRef = useRef(false);

  useEffect(() => {
    let channel;
    (async () => {
      const email = await AsyncStorage.getItem('userEmail');
      if (!email) return;

      channel = supabase
        .channel(`global_notifications_${email}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'appointments',
          },
          (payload) => {
            const { service_type, first_name, email: dbEmail, reason } = payload.new;
            const emailMatch = dbEmail && dbEmail.toLowerCase() === email.toLowerCase();
            if (!emailMatch) return;
            setNotification({
              visible: true,
              title: 'Appointment Approved! 🎉',
              message: `Hi ${first_name || 'there'}, your ${service_type || reason || 'appointment'} has been approved and scheduled.`,
            });
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const sx = chatPos.x.addListener(({ value }) => {
      chatPosRef.current.x = value;
    });
    const sy = chatPos.y.addListener(({ value }) => {
      chatPosRef.current.y = value;
    });
    return () => {
      chatPos.x.removeListener(sx);
      chatPos.y.removeListener(sy);
    };
  }, [chatPos.x, chatPos.y]);

  useEffect(() => {
    if (!layout.width || !layout.height) return;
    const size = 56;
    const pad = 16;
    const topSafe = (insets?.top || 0) + 10;
    const bottomSafe = (insets?.bottom || 0) + 95;
    const x = Math.max(pad, layout.width - size - pad);
    const y = Math.max(topSafe, layout.height - size - bottomSafe);
    chatFixedXRef.current = x;
    chatPos.setValue({ x, y });
  }, [chatPos, insets?.bottom, insets?.top, layout.height, layout.width]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        chatMovedRef.current = false;
        chatPos.setOffset({ x: chatFixedXRef.current, y: chatPosRef.current.y });
        chatPos.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dy) > 3) chatMovedRef.current = true;
        chatPos.x.setValue(0);
        chatPos.y.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        chatPos.flattenOffset();

        if (!chatMovedRef.current && Math.abs(gesture.dx) < 4 && Math.abs(gesture.dy) < 4) {
          setChatOpen(true);
          return;
        }

        if (!layout.width || !layout.height) return;

        const size = 56;
        const pad = 14;
        const topSafe = (insets?.top || 0) + 10;
        const bottomSafe = (insets?.bottom || 0) + 95;
        const minY = topSafe;
        const maxY = Math.max(topSafe, layout.height - size - bottomSafe);

        const rawY = chatPosRef.current.y;

        const clampedY = Math.min(Math.max(rawY, minY), maxY);
        const snapX = chatFixedXRef.current || Math.max(pad, layout.width - size - pad);

        Animated.spring(chatPos, {
          toValue: { x: snapX, y: clampedY },
          useNativeDriver: false,
          tension: 110,
          friction: 10,
        }).start();
      },
    }),
  ).current;

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      <NotificationBanner 
        visible={notification.visible}
        title={notification.title}
        message={notification.message}
        navigation={navigation}
        onHide={() => setNotification(prev => ({ ...prev, visible: false }))}
      />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: '#f97316',
          tabBarInactiveTintColor: '#999',
          tabBarLabelStyle: PatientBottomTabStyles.tabBarLabelStyle,
          tabBarStyle: PatientBottomTabStyles.tabBarStyle,
          tabBarHideOnKeyboard: true,
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;

            if (route.name === 'Home')
              iconName = focused ? 'home' : 'home-outline';

            else if (route.name === 'Activity') 
              iconName = focused ? 'notifications' : 'notifications-outline';

            else if (route.name === 'Records') 
              iconName = focused ? 'document-text' : 'document-text-outline';

            else if (route.name === 'Services')
              iconName = focused ? 'medkit' : 'medkit-outline';

            else if (route.name === 'Schedule')
              iconName = focused ? 'calendar' : 'calendar-outline';

            else if (route.name === 'Account')
              iconName = focused ? 'person' : 'person-outline';

            return <Ionicons name={iconName} size={25} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Home" component={PatientHomepage} />
        <Tab.Screen name="Activity" component={PatientActivity} />
        <Tab.Screen name="Records" component={PatientRecordsScreen} />
        <Tab.Screen name="Services" component={PatientServices} />
        <Tab.Screen name="Schedule" component={PatientSchedule} />
        <Tab.Screen name="Account" component={PatientAccountScreen} />
      </Tab.Navigator>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.chatHead,
          {
            transform: chatPos.getTranslateTransform(),
            top: 0,
            left: 0,
          },
        ]}
      >
        <View style={styles.chatHeadInner}>
          <Ionicons name="chatbubbles" size={22} color="#fff" />
        </View>
      </Animated.View>

      <Modal visible={chatOpen} animationType="slide" onRequestClose={() => setChatOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={[styles.chatModalTop, { paddingTop: (insets?.top || 0) + 10 }]}>
            <TouchableOpacity style={styles.chatCloseBtn} onPress={() => setChatOpen(false)} activeOpacity={0.85}>
              <Ionicons name="close" size={22} color="#0f172a" />
            </TouchableOpacity>
          </View>
          <PatientChatbotScreen embedded />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  notificationBanner: {
    position: 'absolute',
    top: 30,
    left: 15,
    right: 15,
    zIndex: 9999,
    backgroundColor: '#DA7705', // Theme Orange
    borderRadius: 15,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
  },
  iconContainer: {
    width: 45,
    height: 45,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  bannerMessage: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '500',
  },
  chatHead: {
    position: 'absolute',
    zIndex: 9998,
  },
  chatHeadInner: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#DA7705',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  chatModalTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    pointerEvents: 'box-none',
  },
  chatCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
