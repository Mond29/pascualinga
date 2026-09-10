import { View, Text, Image, TouchableOpacity } from 'react-native';
import React from 'react';
import GetStartednextStyles from '../../styles/GetStartednextStyles';
import PaginationDots from '../PaginationDots';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function GetStartednext({ navigation }) {
  return (
    <View style={GetStartednextStyles.container}>
      <View style={GetStartednextStyles.headerRow}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={async () => {
            try {
              await AsyncStorage.setItem('pgh:onboardingSeen', '1');
            } catch (_) {}
            navigation.replace('LoginScreen');
          }}
        >
          <Text style={GetStartednextStyles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={GetStartednextStyles.card}>
        <View style={GetStartednextStyles.logoContainer}>
          <Image style={GetStartednextStyles.image} source={require('../../assets/heart.gif')} />
        </View>

        <Text style={GetStartednextStyles.mainTitle}>How to Use (2/3)</Text>
        <Text style={GetStartednextStyles.subTitle}>
          In Records, you can view your medical records, appointment records, and billing records. If an appointment is cancelled, use Re-appointment to book again.
        </Text>

        <View style={GetStartednextStyles.bulletList}>
          <View style={GetStartednextStyles.bulletRow}>
            <View style={GetStartednextStyles.bulletDot} />
            <Text style={GetStartednextStyles.bulletText}>Records → Medical / Appointment / Billing</Text>
          </View>
          <View style={GetStartednextStyles.bulletRow}>
            <View style={GetStartednextStyles.bulletDot} />
            <Text style={GetStartednextStyles.bulletText}>Appointment Records → Re-appointment</Text>
          </View>
          <View style={GetStartednextStyles.bulletRow}>
            <View style={GetStartednextStyles.bulletDot} />
            <Text style={GetStartednextStyles.bulletText}>Track status: Pending / Confirmed / Cancelled</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={GetStartednextStyles.button}
        activeOpacity={0.9}
        onPress={() => navigation?.navigate('GetStartedLast')}
      >
        <Text style={GetStartednextStyles.buttonText}>Next</Text>
      </TouchableOpacity>

      <PaginationDots index={1} />
    </View>
  );
}
