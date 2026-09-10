import { View, Text, Image, TouchableOpacity } from 'react-native';
import React from 'react';
import GetStartedStyles from '../../styles/GetStartedStyles';
import PaginationDots from '../PaginationDots';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function GetStarted({ navigation }) {
  return (
    <View style={GetStartedStyles.container}>
      <View style={GetStartedStyles.headerRow}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={async () => {
            try {
              await AsyncStorage.setItem('pgh:onboardingSeen', '1');
            } catch (_) {}
            navigation?.replace('LoginScreen');
          }}
        >
          <Text style={GetStartedStyles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={GetStartedStyles.card}>
        <View style={GetStartedStyles.logoContainer}>
          <Image style={GetStartedStyles.image} source={require('../../assets/hospital.gif')} />
        </View>

        <Text style={GetStartedStyles.mainTitle}>How to Use (1/3)</Text>
        <Text style={GetStartedStyles.subTitle}>
          Choose a service category, then select a procedure. Fill in the patient details and choose a schedule to submit your request.
        </Text>

        <View style={GetStartedStyles.bulletList}>
          <View style={GetStartedStyles.bulletRow}>
            <View style={GetStartedStyles.bulletDot} />
            <Text style={GetStartedStyles.bulletText}>Services → Book</Text>
          </View>
          <View style={GetStartedStyles.bulletRow}>
            <View style={GetStartedStyles.bulletDot} />
            <Text style={GetStartedStyles.bulletText}>Patient Details → Complete required fields</Text>
          </View>
          <View style={GetStartedStyles.bulletRow}>
            <View style={GetStartedStyles.bulletDot} />
            <Text style={GetStartedStyles.bulletText}>Booking → Date & Time</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={GetStartedStyles.button}
        activeOpacity={0.9}
        onPress={() => navigation?.navigate('GetStartednext')}
      >
        <Text style={GetStartedStyles.buttonText}>Next</Text>
      </TouchableOpacity>

      <PaginationDots index={0} />
    </View>
  );
}
