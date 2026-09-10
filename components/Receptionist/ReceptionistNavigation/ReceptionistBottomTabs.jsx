import { View, Text } from 'react-native'
import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'

const Tab = createBottomTabNavigator();

export default function ReceptionistBottomTabs() {
  return (
    <Tab.Navigator>
        screenOptions={({ route }) => ({
                headerShown: false,
                tabBarActiveTintColor: '#f97316',
                tabBarInactiveTintColor: '#999',
                tabBarLabelStyle: {
                    fontSize: 12,
                    fontWeight: '600',
                },
                tabBarStyle: {
                    backgroundColor: '#fff',
                    borderTopWidth: 0,
                    elevation: 5,
                },
                tabBarIcon: ({ focused, color, size }) => {
                  let iconName;
                    if (route.name === 'Home')
                        iconName = focused ? 'home' : 'home-outline';
                    else if (route.name === 'Messages')
                        iconName = focused ? 'chatbubble' : 'chatbubble-outline';
                    else if (route.name === 'Patients')
                        iconName = focused ? 'people' : 'people-outline';
                    else if (route.name === 'Schedule')
                        iconName = focused ? 'calendar' : 'calendar-outline';
                    else if (route.name === 'Account')
                        iconName = focused ? 'person' : 'person-outline';
                    return <Ionicons name={iconName} size={25} color={color} />;
                },
              })}
              
      <Tab.Screen name="Home" component={View} />
      <Tab.Screen name="Messages" component={View} />
      <Tab.Screen name="Patients" component={View} />
      <Tab.Screen name="Schedule" component={View} />
      <Tab.Screen name="Account" component={View} />
    </Tab.Navigator>
  )
}