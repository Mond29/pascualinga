import { View, Text, Image, TouchableOpacity } from 'react-native';
import React from 'react';
import GetStartedLastStyles from '../../styles/GetStartedLastStyles';
import PaginationDots from '../PaginationDots';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function GetStartedLast({ navigation }) {
  return (
    <View style={GetStartedLastStyles.container}>
      <View style={GetStartedLastStyles.headerRow}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={async () => {
            try {
              await AsyncStorage.setItem('pgh:onboardingSeen', '1');
            } catch (_) {}
            navigation?.replace('LoginScreen');
          }}
        >
          <Text style={GetStartedLastStyles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={GetStartedLastStyles.card}>
        <View style={GetStartedLastStyles.logoContainer}>
          <Image style={GetStartedLastStyles.image} source={require('../../assets/crossHospital.gif')} />
        </View>

        <Text style={GetStartedLastStyles.mainTitle}>How to Use (3/3)</Text>
        <Text style={GetStartedLastStyles.subTitle}>
          You can ask questions anytime using the chathead. For video consultation: choose a department, pay via QRPh, then join when the banner appears.
        </Text>

        <View style={GetStartedLastStyles.bulletList}>
          <View style={GetStartedLastStyles.bulletRow}>
            <View style={GetStartedLastStyles.bulletDot} />
            <Text style={GetStartedLastStyles.bulletText}>Chathead → FAQ & AI answers</Text>
          </View>
          <View style={GetStartedLastStyles.bulletRow}>
            <View style={GetStartedLastStyles.bulletDot} />
            <Text style={GetStartedLastStyles.bulletText}>Video Consult → QRPh payment</Text>
          </View>
          <View style={GetStartedLastStyles.bulletRow}>
            <View style={GetStartedLastStyles.bulletDot} />
            <Text style={GetStartedLastStyles.bulletText}>Banner → Tap to join call</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={GetStartedLastStyles.button}
        activeOpacity={0.9}
        onPress={async () => {
          try {
            await AsyncStorage.setItem('pgh:onboardingSeen', '1');
          } catch (_) {}
          navigation.replace('LoginScreen');
        }}
      >
        <Text style={GetStartedLastStyles.buttonText}>Continue to Login</Text>
      </TouchableOpacity>

      <PaginationDots index={2} />
    </View>
  );
}
