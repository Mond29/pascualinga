
import React from 'react'
import LoadingStyles from '../../styles/LoadingStyles';
import { Image, Text, TouchableOpacity, View } from 'react-native';

export default function LoadingScreen({ navigation }) {
  return (
    <View style={LoadingStyles.mainContainer}>
      <View style={LoadingStyles.logoCard}>
        <Image style={LoadingStyles.logo} source={require('../../assets/pgh_logo.png')} />
        <Text style={LoadingStyles.appTitle}>Pascualinga</Text>
        <Text style={LoadingStyles.appSubtitle}>Pascual General Hospital</Text>
        <View style={LoadingStyles.statusRow}>
          <Text style={LoadingStyles.statusText}>Welcome</Text>
        </View>

        <View style={LoadingStyles.actionsRow}>
          <TouchableOpacity
            style={LoadingStyles.secondaryButton}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('GetStarted')}
          >
            <Text style={LoadingStyles.secondaryButtonText}>How to Use</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={LoadingStyles.primaryButton}
            activeOpacity={0.9}
            onPress={() => navigation.replace('LoginScreen')}
          >
            <Text style={LoadingStyles.primaryButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={LoadingStyles.footerHint}>Healthcare services • Records • Chat support</Text>
    </View>
  )
}
