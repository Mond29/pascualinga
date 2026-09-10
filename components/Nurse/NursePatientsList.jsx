// NursePatients.jsx
import React from 'react';
import { View, Text, FlatList } from 'react-native';
import NursePatientsStyles from '../../styles/NurseStyles/NursePatientsStlyes';

export default function NursePatientsList() {

  // Sample patient data
  const patients = [
    { id: '1', name: 'John Doe', age: 34 },
    { id: '2', name: 'Jane Smith', age: 28 },
    { id: '3', name: 'Michael Johnson', age: 42 },
    { id: '4', name: 'Emily Davis', age: 51 },
    { id: '5', name: 'William Brown', age: 37 },
  ];

  // Render each patient
  const renderItem = ({ item, index }) => (
    <View style={NursePatientsStyles.patientCard}>

      {/* Left Avatar */}
      <View style={NursePatientsStyles.avatar}>
        <Text style={NursePatientsStyles.avatarText}>
          {item.name.charAt(0)}
        </Text>
      </View>

      {/* Patient Info */}
      <View style={NursePatientsStyles.patientInfo}>
        <Text style={NursePatientsStyles.patientName}>
          {item.name}
        </Text>

        <Text style={NursePatientsStyles.patientAge}>
          Age: {item.age}
        </Text>
      </View>

      {/* Right ID Badge */}
      <View style={NursePatientsStyles.idBadge}>
        <Text style={NursePatientsStyles.idText}>
          #{item.id}
        </Text>
      </View>

    </View>
  );

  return (
    <View style={NursePatientsStyles.container}>

      {/* Header */}
      <View style={NursePatientsStyles.header}>
        <Text style={NursePatientsStyles.title}>
          Patients List
        </Text>

        <Text style={NursePatientsStyles.subtitle}>
          {patients.length} Active Patients
        </Text>
      </View>

      {/* List */}
      <FlatList
        data={patients}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: 30,
        }}
      />

    </View>
  );
}
