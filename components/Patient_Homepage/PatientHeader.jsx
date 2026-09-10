import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function PatientHeader({ title, navigation, onMenuPress, userData }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onMenuPress} style={styles.burgerIcon}>
        <Feather name="menu" size={24} color="#DA7705" />
      </TouchableOpacity>
      
      <Text style={styles.title}>{title || 'Pascualinga'}</Text>
      
      <TouchableOpacity 
        onPress={() => navigation?.navigate('Account')} 
        style={styles.accountIcon}
      >
        {userData?.name ? (
          <Image 
            source={{ uri: 'https://ui-avatars.com/api/?name=' + userData.name }} 
            style={styles.avatar} 
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Feather name="user" size={20} color="#DA7705" />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#DA7705',
    letterSpacing: 1,
  },
  burgerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFAF0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFAF0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
