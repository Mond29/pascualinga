import { Platform, StyleSheet } from 'react-native';

const PatientBottomTabStyles = StyleSheet.create({
  tabBarStyle: {
    position: 'absolute', // floating
    bottom: 10,
    left: 10,
    right: 10,
    elevation: 5,
    backgroundColor: '#fff',
    borderRadius: 15,
    height: 65,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  tabBarLabelStyle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 5,
  },
});

export default PatientBottomTabStyles;
