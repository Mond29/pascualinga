import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

// Screens
import NurseBottomTabs from './NurseBottomTabs'
import OverallWardsScreen from '../OverallWardsScreen'


const Stack = createNativeStackNavigator()

export default function NurseStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="NurseTabs" component={NurseBottomTabs} />
      <Stack.Screen name="OverallWards" component={OverallWardsScreen} />
    </Stack.Navigator>
  )
}
