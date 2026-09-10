import LoadingScreen from './components/Intro_Login/LoadingScreen'
import LoginScreen from './components/Intro_Login/LoginScreen'
import OTPrequest from './components/Intro_Login/OTPrequest'
import AccountRecovery from './components/Intro_Login/AccountRecovery'
import ChangePassword from './components/Intro_Login/ChangePassword'
import GetStarted from './components/Intro_Login/GetStarted'
import GetStartednext from './components/Intro_Login/GetStartednext'
import GetStartedLast from './components/Intro_Login/GetStartedLast'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import NurseBottomTabs from './components/Nurse/navigation/NurseBottomTabs'
import PatientBottomTabs from './components/Patient_Homepage/navigation/PatientBottomTabs'
import CriticalList from './components/Nurse/ExtraNurses/CriticalList'
import MessageDetailScreen from './components/Nurse/MessageDetailScreen'
import NursePatientsOptions from './components/Nurse/NursePatientsOptions'
import NurseInpatientWard from './components/Nurse/NurseInpatientWard'
import NursePatients from './components/Nurse/NursePatients'
import NurseIncidentReporting from './components/Nurse/NurseIncidentReporting'
import Registration from './components/Intro_Login/Registration';
import Laboratory from './components/Patient_Homepage/services/Laboratory';
import PatientServicesScreen from './components/Patient_Homepage/PatientServicesScreen';
import VideoCallScreen from './components/Video/VideoCallScreen';


const Stack = createNativeStackNavigator()

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="LoadingScreen"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="LoadingScreen" component={LoadingScreen} />
        <Stack.Screen name="LoginScreen" component={LoginScreen} />
        <Stack.Screen name="Registration" component={Registration} />
        <Stack.Screen name="OTPrequest" component={OTPrequest} /> 
        <Stack.Screen name="ChangePassword" component={ChangePassword} />
        <Stack.Screen name="AccountRecovery" component={AccountRecovery} />
        <Stack.Screen name="GetStarted" component={GetStarted} />
        <Stack.Screen name="GetStartednext" component={GetStartednext} />
        <Stack.Screen name="GetStartedLast" component={GetStartedLast} />
        <Stack.Screen name="CriticalList" component={CriticalList} />
        <Stack.Screen name="PatienOptions" component={NursePatientsOptions}/>
        <Stack.Screen name="InpatientWard" component={NurseInpatientWard}/>
        <Stack.Screen name="Patients" component={NursePatients}/>

        {/* Bottom Tabs */}
        <Stack.Screen name="PatientBottomTabs" component={PatientBottomTabs} />
        <Stack.Screen name="NurseBottomTabs" component={NurseBottomTabs} />
        <Stack.Screen name="Reporting" component={NurseIncidentReporting} />
        <Stack.Screen name="Laboratory" component={Laboratory} />
        <Stack.Screen name="PatientServicesScreen" component={PatientServicesScreen} />

        <Stack.Screen 
          name="VideoCall" 
          component={VideoCallScreen} 
          options={{ headerShown: true, title: 'Video Consultation' }} 
        />

        {/* Chat Screen */}
        <Stack.Screen 
          name="MessageDetail" 
          component={MessageDetailScreen}
          options={{ headerShown: true, title: 'Chat' }}
        />

      </Stack.Navigator>
    </NavigationContainer>
  )
}
