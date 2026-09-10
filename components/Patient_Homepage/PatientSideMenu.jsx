import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PatientSideMenu = ({ visible, onClose }) => {
  const navigation = useNavigation();
  const route = useRoute();
  const currentRouteName = route.name;

  const navigateAndClose = (screen, params = {}) => {
    if (currentRouteName === screen) {
      onClose();
      return;
    }
    onClose();
    navigation.navigate(screen, params);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <View style={styles.drawerContainer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>Patient Menu</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {currentRouteName !== 'Home' && (
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={() => navigateAndClose('Home')}
              >
                <View style={[styles.iconBox, { backgroundColor: '#eff6ff' }]}>
                  <Ionicons name="home" size={20} color="#3b82f6" />
                </View>
                <Text style={styles.menuText}>Homepage</Text>
              </TouchableOpacity>
            )}

            {currentRouteName !== 'Activity' && (
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={() => navigateAndClose('Activity')}
              >
                <View style={[styles.iconBox, { backgroundColor: '#fff1f2' }]}>
                  <Ionicons name="notifications" size={20} color="#e11d48" />
                </View>
                <Text style={styles.menuText}>My Activity</Text>
              </TouchableOpacity>
            )}

            {currentRouteName !== 'Records' && (
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={() => navigateAndClose('Records')}
              >
                <View style={[styles.iconBox, { backgroundColor: '#f0fdf4' }]}>
                  <Ionicons name="folder-open" size={20} color="#22c55e" />
                </View>
                <Text style={styles.menuText}>Medical Records</Text>
              </TouchableOpacity>
            )}

            {currentRouteName !== 'Services' && (
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={() => navigateAndClose('Services')}
              >
                <View style={[styles.iconBox, { backgroundColor: '#fff7ed' }]}>
                  <Ionicons name="medical" size={20} color="#f97316" />
                </View>
                <Text style={styles.menuText}>Hospital Services</Text>
              </TouchableOpacity>
            )}

            {currentRouteName !== 'Schedule' && (
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={() => navigateAndClose('Schedule')}
              >
                <View style={[styles.iconBox, { backgroundColor: '#faf5ff' }]}>
                  <Ionicons name="calendar" size={20} color="#a855f7" />
                </View>
                <Text style={styles.menuText}>My Schedule</Text>
              </TouchableOpacity>
            )}

            <View style={styles.divider} />

            {currentRouteName !== 'Account' && (
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={() => navigateAndClose('Account')}
              >
                <View style={[styles.iconBox, { backgroundColor: '#f8fafc' }]}>
                  <Feather name="user" size={20} color="#64748b" />
                </View>
                <Text style={styles.menuText}>My Profile</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  drawerContainer: {
    width: SCREEN_WIDTH * 0.75,
    height: '100%',
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 5,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  menuText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 15,
  },
});

export default PatientSideMenu;
