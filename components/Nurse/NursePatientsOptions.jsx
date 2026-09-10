import React from "react";
import { View, Text, TouchableOpacity, SafeAreaView, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function NursePatientsOptions() {

  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>

      {/* Header */}
      <Text style={styles.headerTitle}>
        Patients Management
      </Text>

      {/* Options Container */}
      <View style={styles.optionsContainer}>

        {/* Patients List Card */}
        <TouchableOpacity
          onPress={() => navigation.navigate("Patients")}
          style={[styles.card, styles.patientsListCard]}
        >
          <MaterialCommunityIcons
            name="account-group"
            size={48}
            color="#2563eb"
          />
          <Text style={styles.cardTitle}>
            Patients List
          </Text>
        </TouchableOpacity>

        {/* Inpatient Ward Card */}
        <TouchableOpacity
          onPress={() => navigation.navigate("InpatientWard")}
          style={[styles.card, styles.inpatientWardCard]}
        >
          <MaterialCommunityIcons
            name="hospital-building"
            size={48}
            color="#dc2626"
          />
          <Text style={styles.cardTitle}>
            Inpatient Ward
          </Text>
        </TouchableOpacity>

      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc", // Light background for a clean look
    alignItems: "center", // Center content horizontally
    paddingTop: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 40, // More space below header
    color: "#1a202c", // Darker text for contrast
  },
  optionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap", // Allow cards to wrap if needed
    justifyContent: "center", // Center cards horizontally
    gap: 20, // Space between cards
    width: "90%", // Limit width for better centering on larger screens
    maxWidth: 400, // Max width for cards container
  },
  card: {
    width: "45%", // Slightly less than 50% to allow for gap
    aspectRatio: 1, // Make cards square
    borderRadius: 18, // Slightly more rounded corners
    justifyContent: "center",
    alignItems: "center",
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6, // Android shadow
  },
  patientsListCard: {
    backgroundColor: "#e0f2fe", // Light blue
  },
  inpatientWardCard: {
    backgroundColor: "#ffe0e0", // Light red/pink
  },
  cardTitle: {
    marginTop: 15,
    fontSize: 17,
    fontWeight: "700",
    color: "#334155", // Dark gray text
    textAlign: "center",
  },
});
