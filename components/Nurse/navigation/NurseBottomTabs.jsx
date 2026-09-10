import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'

// Screens
import NurseHomepage from '../NurseHomepage'
import NurseMessages from '../NurseMessages'
import NurseVideo from '../NurseVideo'
import NurseProfile from '../NurseProfile'
import OverallWardsScreen from '../OverallWardsScreen'
import NursePatients from '../NursePatients'
import CriticalList from '../ExtraNurses/CriticalList'
import NursePatientsOptions from '../NursePatientsOptions'
import NurseInpatientWard from '../NurseInpatientWard'
import NurseIncidentReporting from '../NurseIncidentReporting'
import NurseSchedules from '../NurseSchedules'
import MessageDetail from '../MessageDetail' // Import MessageDetail
import { createNativeStackNavigator } from '@react-navigation/native-stack'

const Stack = createNativeStackNavigator()

function NurseStackScreen() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="NurseMessages" component={NurseMessages} options={{ headerShown: false }} />
      <Stack.Screen name="MessageDetail" component={MessageDetail} options={{ headerShown: true }} />
    </Stack.Navigator>
  )
}

const Tab = createBottomTabNavigator()

function getTabIconName(routeName, focused) {
  if (routeName === 'Home') return focused ? 'home' : 'home-outline'
  if (routeName === 'Messages') return focused ? 'chatbubble' : 'chatbubble-outline'
  if (routeName === 'Options') return focused ? 'people' : 'people-outline'
  if (routeName === 'Video') return focused ? 'videocam' : 'videocam-outline'
  if (routeName === 'IncidentReporting') return focused ? 'document-text' : 'document-text-outline'
  if (routeName === 'Schedules') return focused ? 'calendar' : 'calendar-outline'
  if (routeName === 'Profile') return focused ? 'person' : 'person-outline'
  return focused ? 'ellipse' : 'ellipse-outline'
}

function NurseTabBar({ state, descriptors, navigation, role }) {
  const visibleRouteNames = role === 'doctor'
    ? new Set(['Home', 'Messages', 'Options', 'Profile'])
    : new Set(['Home', 'Messages', 'Options', 'IncidentReporting', 'Schedules', 'Profile'])
  const visibleRoutes = state.routes.filter((r) => visibleRouteNames.has(r.name))

  return (
    <View style={tabStyles.outer}>
      <View style={tabStyles.inner}>
        {visibleRoutes.map((route) => {
          const isFocused = state.index === state.routes.findIndex((r) => r.key === route.key)
          const { options } = descriptors[route.key]

          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : typeof options.title === 'string'
                ? options.title
                : route.name

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name)
            }
          }

          const color = isFocused ? '#f97316' : '#94a3b8'

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={onPress}
              activeOpacity={0.7}
              style={tabStyles.item}
            >
              <Ionicons name={getTabIconName(route.name, isFocused)} size={22} color={color} />
              <Text style={[tabStyles.label, { color }]} numberOfLines={1}>
                {label === 'IncidentReporting' ? 'Reports' : label === 'Options' ? 'Patients' : label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

export default function NurseBottomTabs() {
  const intervalRef = useRef(null)
  const appStateRef = useRef(AppState.currentState)
  const [role, setRole] = useState('')

  useEffect(() => {
    let cancelled = false
    const loadRole = async () => {
      const nextRole = `${(await AsyncStorage.getItem('userRole')) || ''}`.trim().toLowerCase()
      if (!cancelled) setRole(nextRole)
    }
    loadRole()
    return () => { cancelled = true }
  }, [])

  const isDoctor = useMemo(() => `${role || ''}`.trim().toLowerCase() === 'doctor', [role])

  useEffect(() => {
    let mounted = true

    const getApiBaseUrl = () => {
      const fromEnv = `${process.env.EXPO_PUBLIC_API_BASE_URL || ''}`.trim()
      if (fromEnv) return fromEnv.replace(/\/+$/, '')
      return 'https://api.pascualinga.com'
    }

    const postStaffHeartbeat = async () => {
      const role = `${(await AsyncStorage.getItem('userRole')) || ''}`.trim().toLowerCase()
      if (role !== 'doctor') return

      const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase()
      if (!email) return
      const name = `${(await AsyncStorage.getItem(`userName:${email}`)) || ''}`.trim() || email

      try {
        await fetch(`${getApiBaseUrl()}/api/staff/heartbeat`, {
          method: 'POST',
          headers: {
            'x-user-role': 'doctor',
            'x-user-email': email,
            'x-user-name': name,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, accountType: 'doctor' }),
        })
      } catch (_) {}
    }

    const stop = () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    const start = async () => {
      stop()
      await postStaffHeartbeat()
      if (!mounted) return
      intervalRef.current = setInterval(postStaffHeartbeat, 45000)
    }

    const boot = async () => {
      const role = `${(await AsyncStorage.getItem('userRole')) || ''}`.trim().toLowerCase()
      if (role !== 'doctor') return
      if (AppState.currentState === 'active') await start()
    }

    boot()

    const sub = AppState.addEventListener('change', async (nextState) => {
      const prevState = appStateRef.current
      appStateRef.current = nextState
      const role = `${(await AsyncStorage.getItem('userRole')) || ''}`.trim().toLowerCase()
      if (role !== 'doctor') {
        stop()
        return
      }

      const wasActive = prevState === 'active'
      const nowActive = nextState === 'active'
      if (!wasActive && nowActive) await start()
      if (wasActive && !nowActive) stop()
    })

    return () => {
      mounted = false
      stop()
      sub?.remove?.()
    }
  }, [])

  return (
    <Tab.Navigator
      tabBar={(props) => <NurseTabBar {...props} role={role} />}
      screenOptions={({ route }) => ({
        headerShown: false,

        tabBarStyle: { display: 'none' },
      })}
    >

      {/* Visible Tabs */}

      <Tab.Screen
        name="Home"
        component={NurseHomepage}
        options={{
          tabBarLabel: isDoctor ? 'Monitor' : undefined,
        }}
      />

      <Tab.Screen
        name="Messages"
        component={NurseStackScreen}
        options={{
          tabBarLabel: isDoctor ? 'Inbox' : undefined,
        }}
      />

      <Tab.Screen
        name="Options"
        component={NursePatientsOptions}
        options={{
          tabBarLabel: "Patients"
        }}
      />

      <Tab.Screen
        name="Video"
        component={NurseVideo}
        options={{
          tabBarLabel: isDoctor ? 'Video' : 'Video',
          tabBarButton: isDoctor ? () => null : () => null,
        }}
      />

      <Tab.Screen
        name="IncidentReporting"
        component={NurseIncidentReporting}
        options={{
          tabBarLabel: "Reports",
          tabBarButton: isDoctor ? () => null : undefined,
        }}
      />

      <Tab.Screen
        name="Schedules"
        component={NurseSchedules}
        options={{
          tabBarLabel: "Schedule",
          tabBarButton: isDoctor ? () => null : undefined,
        }}
      />


      <Tab.Screen
        name="Profile"
        component={NurseProfile}
        options={{
          tabBarLabel: isDoctor ? 'Account' : undefined,
        }}
      />


      {/* Hidden Screens */}

      <Tab.Screen
        name="OverallWards"
        component={OverallWardsScreen}
        options={{
          tabBarButton: () => null,
        }}
      />

      <Tab.Screen
        name="CriticalList"
        component={CriticalList}
        options={{
          tabBarButton: () => null,
        }}
      />

      <Tab.Screen
        name="InpatientWard"
        component={NurseInpatientWard}
        options={{
          tabBarButton: () => null,
        }}
      />

      <Tab.Screen
        name="Patients"
        component={NursePatients}
        options={{
          tabBarButton: () => null,
        }}
      />

    </Tab.Navigator>
  )
}

const tabStyles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  inner: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 5,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  label: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '600',
  },
})
