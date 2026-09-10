import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal, TextInput, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native'
import { Ionicons, Feather } from '@expo/vector-icons'
import { Calendar } from 'react-native-calendars'
import { supabase } from '../../lib/supabase'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NurseSideMenu from './NurseSideMenu'

export default function NurseSchedules() {
  const navigation = useNavigation()
  const [loading, setLoading] = useState(false)
  const [userRole, setUserRole] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [agendaItems, setAgendaItems] = useState([])
  const [addEventModalVisible, setAddEventModalVisible] = useState(false)
  const [newEventTitle, setNewEventTitle] = useState('')
  const [newEventTime, setNewEventTime] = useState('')
  const [newEventLocation, setNewEventLocation] = useState('')

  // Shift Handover Notes State
  const [activeShift, setActiveShift] = useState('Morning')
  const handoverTemplate = useMemo(
    () => ({
      Morning: { situation: '', background: '', assessment: '', recommendation: '' },
      Afternoon: { situation: '', background: '', assessment: '', recommendation: '' },
      Night: { situation: '', background: '', assessment: '', recommendation: '' },
    }),
    []
  )
  const [handoverNotes, setHandoverNotes] = useState(handoverTemplate)
  const [handoverLocked, setHandoverLocked] = useState({
    Morning: false,
    Afternoon: false,
    Night: false,
  })

  // Nurse shifts
  const [schedules, setSchedules] = useState([])

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [drawerVisible, setDrawerVisible] = useState(false)

  const toggleDrawer = () => setDrawerVisible(!drawerVisible)

  const loadRealtimeData = useCallback(async () => {
    setLoading(true)
    try {
      const role = await AsyncStorage.getItem('userRole');
      const email = await AsyncStorage.getItem('userEmail');
      setUserRole(role || 'nurse');
      setUserEmail(email || '');

      if (!email) return;

      // 1. Load Nurse Agenda
      const { data: agendaData, error: agendaError } = await supabase
        .from('nurse_agenda')
        .select('*')
        .eq('nurse_email', email)
        .order('time', { ascending: true });
      if (agendaError) throw agendaError;
      
      if (agendaData) setAgendaItems(agendaData);

      // 2. Load Handover Notes
      const { data: handoverData, error: handoverError } = await supabase
        .from('nurse_handover')
        .select('*')
        .eq('nurse_email', email);
      if (handoverError) throw handoverError;
      
      if (handoverData) {
        const formattedHandover = {
          Morning: { ...handoverTemplate.Morning },
          Afternoon: { ...handoverTemplate.Afternoon },
          Night: { ...handoverTemplate.Night },
        };
        const locked = { Morning: false, Afternoon: false, Night: false };
        handoverData.forEach(item => {
          formattedHandover[item.shift_type] = {
            situation: item.situation,
            background: item.background,
            assessment: item.assessment,
            recommendation: item.recommendation
          };
          if (item.shift_type === 'Morning' || item.shift_type === 'Afternoon' || item.shift_type === 'Night') {
            locked[item.shift_type] = true;
          }
        });
        setHandoverNotes(formattedHandover);
        setHandoverLocked(locked);
      } else {
        setHandoverNotes({
          Morning: { ...handoverTemplate.Morning },
          Afternoon: { ...handoverTemplate.Afternoon },
          Night: { ...handoverTemplate.Night },
        });
        setHandoverLocked({ Morning: false, Afternoon: false, Night: false });
      }

      // 3. Load Nurse Shifts
      const { data: shiftData, error: shiftError } = await supabase
        .from('nurse_shifts')
        .select('*')
        .eq('nurse_email', email);
      if (shiftError) throw shiftError;
      
      if (shiftData) {
        setSchedules(shiftData.map(s => ({
          id: s.id,
          date: s.date,
          shift: s.shift_name,
          time: s.shift_time,
          ward: s.ward_assignment
        })));
      }

    } catch (e) {
      console.error('Error fetching realtime data:', e)
      Alert.alert('Error', `Failed to load schedule data: ${e?.message || 'Unknown error'}`);
    } finally {
      setLoading(false)
    }
  }, [handoverTemplate])

  useEffect(() => {
    let agendaChannel;
    let handoverChannel;
    let shiftsChannel;
    let mounted = true;

    const setup = async () => {
      await loadRealtimeData();
      const email = await AsyncStorage.getItem('userEmail');
      if (!mounted || !email) return;

      agendaChannel = supabase
        .channel(`nurse-agenda:${email}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'nurse_agenda', filter: `nurse_email=eq.${email}` },
          () => loadRealtimeData()
        )
        .subscribe();

      handoverChannel = supabase
        .channel(`nurse-handover:${email}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'nurse_handover', filter: `nurse_email=eq.${email}` },
          () => loadRealtimeData()
        )
        .subscribe();

      shiftsChannel = supabase
        .channel(`nurse-shifts:${email}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'nurse_shifts', filter: `nurse_email=eq.${email}` },
          () => loadRealtimeData()
        )
        .subscribe();
    };

    setup();

    return () => {
      mounted = false;
      if (agendaChannel) supabase.removeChannel(agendaChannel);
      if (handoverChannel) supabase.removeChannel(handoverChannel);
      if (shiftsChannel) supabase.removeChannel(shiftsChannel);
    };
  }, [loadRealtimeData]);

  useFocusEffect(
    useCallback(() => {
      loadRealtimeData()
    }, [loadRealtimeData])
  )

  const handleAddEvent = async () => {
    if (!newEventTitle.trim()) {
      Alert.alert('Error', 'Event title cannot be empty.')
      return
    }

    try {
      const { error } = await supabase
        .from('nurse_agenda')
        .insert([{
          nurse_email: userEmail,
          title: newEventTitle.trim(),
          time: newEventTime.trim(),
          location: newEventLocation.trim(),
          date: selectedDate,
          status: 'Pending',
          type: 'task'
        }]);

      if (error) throw error;
      
      setAddEventModalVisible(false)
      setNewEventTitle('')
      setNewEventTime('')
      setNewEventLocation('')
      loadRealtimeData();
    } catch (e) {
      Alert.alert('Error', 'Failed to add event: ' + e.message);
    }
  }

  const handleMarkDone = async (id) => {
    try {
      const { error } = await supabase
        .from('nurse_agenda')
        .update({ status: 'Done' })
        .eq('id', id);
      
      if (error) throw error;
      loadRealtimeData();
    } catch (e) {
      Alert.alert('Error', 'Failed to update status');
    }
  }

  const handleCancelEvent = async (id) => {
    try {
      const { error } = await supabase
        .from('nurse_agenda')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      loadRealtimeData();
    } catch (e) {
      Alert.alert('Error', 'Failed to delete event');
    }
  }

  const handleRemoveAgendaItem = (id) => {
    Alert.alert('Remove Agenda Item', 'Remove this agenda item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('nurse_agenda')
              .delete()
              .eq('id', id)
              .eq('nurse_email', userEmail);
            if (error) throw error;
            loadRealtimeData();
          } catch (e) {
            Alert.alert('Error', `Failed to remove agenda item: ${e?.message || 'Unknown error'}`);
          }
        },
      },
    ]);
  };

  const handleSaveHandover = async () => {
    try {
      if (handoverLocked?.[activeShift]) {
        Alert.alert('Locked', 'This note is already saved. Tap Remove to unlock and edit.');
        return;
      }
      const notes = handoverNotes[activeShift];
      const { error } = await supabase
        .from('nurse_handover')
        .upsert({
          nurse_email: userEmail,
          shift_type: activeShift,
          situation: notes.situation,
          background: notes.background,
          assessment: notes.assessment,
          recommendation: notes.recommendation
        }, { onConflict: 'nurse_email,shift_type' });

      if (error) throw error;
      setHandoverLocked((prev) => ({ ...prev, [activeShift]: true }));
      Alert.alert('Saved', `Shift Handover Notes for ${activeShift} Shift saved to database.`);
      loadRealtimeData();
    } catch (e) {
      Alert.alert('Error', 'Failed to save handover: ' + e.message);
    }
  }

  const handleRemoveHandover = async () => {
    try {
      const { error } = await supabase
        .from('nurse_handover')
        .delete()
        .eq('nurse_email', userEmail)
        .eq('shift_type', activeShift);

      if (error) throw error;
      
      setHandoverNotes(prev => ({
        ...prev,
        [activeShift]: { situation: '', background: '', assessment: '', recommendation: '' }
      }))
      setHandoverLocked((prev) => ({ ...prev, [activeShift]: false }));
      Alert.alert('Removed', `Shift Handover Notes for ${activeShift} Shift cleared.`);
      loadRealtimeData();
    } catch (e) {
      Alert.alert('Error', `Failed to clear handover: ${e?.message || 'Unknown error'}`);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          style={{ flex: 1, padding: 15, backgroundColor: 'white' }}
          contentContainerStyle={{ paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >

      {/* ================= Header with Burger ================= */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, position: 'relative', height: 40 }}>
        <TouchableOpacity 
          onPress={toggleDrawer} 
          style={{ padding: 5, position: 'absolute', left: 0, zIndex: 10 }}
        >
          <Feather name="menu" size={24} color="#d9802b" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#1e293b' }}>Schedules</Text>
        </View>
      </View>

      {/* ================= Calendar Section ================= */}
      <View style={{
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 15,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 3
      }}>
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "#f97316", marginBottom: 10 }}>
          <Ionicons name="calendar" size={18} color="#f97316" /> {" "}Calendar
        </Text>

        <Calendar
          current={selectedDate}
          markedDates={{
            ...Object.fromEntries(
              agendaItems.map(item => [item.date, { marked: true, dotColor: "#f97316" }])
            ),
            ...Object.fromEntries(
              schedules.map(item => [item.date, { marked: true, dotColor: "#0077B6" }])
            ),
            [selectedDate]: { selected: true, selectedColor: "#f97316" }
          }}
          onDayPress={(day) => setSelectedDate(day.dateString)}
          theme={{
            todayTextColor: "#f97316",
            arrowColor: "#f97316",
            selectedDayBackgroundColor: "#f97316",
            dotColor: "#f97316"
          }}
        />
      </View>

      {/* ================= My Shifts Section ================= */}
      <View style={{
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 15,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 3
      }}>
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "#f97316", marginBottom: 10 }}>
          <Ionicons name="calendar" size={18} color="#f97316" /> {" "}My Shifts
        </Text>

        {schedules.length > 0 ? schedules.map(item => (
          <View key={item.id} style={{
            backgroundColor: "#fff7ed",
            padding: 12,
            borderRadius: 8,
            marginBottom: 10,
            borderLeftWidth: 4,
            borderLeftColor: "#f97316"
          }}>
            <Text><Ionicons name="calendar-outline" size={16}/> {item.date}</Text>
            <Text><Ionicons name="time-outline" size={16}/> {item.shift}</Text>
            <Text>Time: {item.time}</Text>
            <Text>Ward: {item.ward}</Text>
          </View>
        )) : (
          <Text style={{ fontStyle: "italic", color: "#94a3b8" }}>No shifts assigned yet.</Text>
        )}
      </View>

      {/* ================= ER Quick Checks ================= */}
      <View style={{
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 15,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 3,
        borderWidth: 1,
        borderColor: "#e2e8f0"
      }}>
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "#0f172a", marginBottom: 10 }}>
          <Ionicons name="pulse-outline" size={18} color="#f97316" /> {" "}ER Quick Checks
        </Text>

        <View style={{ gap: 10 }}>
          <View style={{ backgroundColor: "#fff7ed", padding: 12, borderRadius: 10, borderLeftWidth: 4, borderLeftColor: "#f97316" }}>
            <Text style={{ fontWeight: "bold", color: "#9a3412" }}>Triage</Text>
            <Text style={{ color: "#475569", marginTop: 4 }}>Confirm ESI level, chief complaint, and vitals.</Text>
          </View>
          <View style={{ backgroundColor: "#f0f9ff", padding: 12, borderRadius: 10, borderLeftWidth: 4, borderLeftColor: "#0077B6" }}>
            <Text style={{ fontWeight: "bold", color: "#0c4a6e" }}>Initial Vitals</Text>
            <Text style={{ color: "#475569", marginTop: 4 }}>BP, HR, RR, Temp, SpO₂, pain score.</Text>
          </View>
          <View style={{ backgroundColor: "#f0fdf4", padding: 12, borderRadius: 10, borderLeftWidth: 4, borderLeftColor: "#22c55e" }}>
            <Text style={{ fontWeight: "bold", color: "#166534" }}>Safety</Text>
            <Text style={{ color: "#475569", marginTop: 4 }}>Allergies, fall risk, isolation precautions.</Text>
          </View>
        </View>
      </View>

      {/* ================= Day Agenda Section ================= */}
      <View style={{
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 15,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 3
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: "#f97316" }}>
            <Ionicons name="list-outline" size={18} color="#f97316" /> {" "}Day Agenda
          </Text>
          <TouchableOpacity
            onPress={() => setAddEventModalVisible(true)}
            style={{
              backgroundColor: "#f97316",
              paddingVertical: 8,
              paddingHorizontal: 15,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: "white", fontWeight: "bold" }}>Add</Text>
          </TouchableOpacity>
        </View>

        {agendaItems.filter(item => item.date === selectedDate).length > 0 ? (
          agendaItems.filter(item => item.date === selectedDate).map(item => (
            <View key={item.id} style={{
              backgroundColor: "#fff7ed",
              padding: 15,
              borderRadius: 12,
              marginBottom: 10,
              borderLeftWidth: 4,
              borderLeftColor: item.status === 'Done' ? "#22c55e" : "#f97316"
            }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontWeight: "bold", fontSize: 16, color: item.status === 'Done' ? "#166534" : "#9a3412" }}>{item.title}</Text>
                <View style={{
                  backgroundColor: item.status === 'Done' ? "#dcfce7" : "#ffedd5",
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 4
                }}>
                  <Text style={{ color: item.status === 'Done' ? "#166534" : "#f97316", fontSize: 10, fontWeight: "bold" }}>
                    {item.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={{ color: "#334155", marginTop: 4 }}>{item.time} - {item.location}</Text>
              
              {item.status !== 'Done' && (
                <View style={{ flexDirection: "row", marginTop: 12, gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => handleMarkDone(item.id)}
                    style={{
                      backgroundColor: "#22c55e",
                      paddingVertical: 8,
                      paddingHorizontal: 15,
                      borderRadius: 6,
                      flex: 1,
                      alignItems: "center"
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "bold" }}>Done</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleRemoveAgendaItem(item.id)}
                    style={{
                      backgroundColor: "#fee2e2",
                      paddingVertical: 8,
                      paddingHorizontal: 15,
                      borderRadius: 6,
                      flex: 1,
                      alignItems: "center"
                    }}
                  >
                    <Text style={{ color: "#ef4444", fontWeight: "bold" }}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}

              {item.status === 'Done' && (
                <View style={{ flexDirection: "row", marginTop: 12 }}>
                  <TouchableOpacity
                    onPress={() => handleRemoveAgendaItem(item.id)}
                    style={{
                      backgroundColor: "#fee2e2",
                      paddingVertical: 8,
                      paddingHorizontal: 15,
                      borderRadius: 6,
                      flex: 1,
                      alignItems: "center"
                    }}
                  >
                    <Text style={{ color: "#ef4444", fontWeight: "bold" }}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        ) : (
          <Text style={{ fontStyle: "italic", color: "#94a3b8" }}>
            No agenda items for {selectedDate}.
          </Text>
        )}
      </View>

      {/* ================= Shift Handover Notes Section ================= */}
      <View style={{
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 15,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 3
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: "#f97316" }}>
            <Ionicons name="create-outline" size={18} color="#f97316" /> {" "}Shift Handover Notes
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={handleRemoveHandover} style={{ backgroundColor: "#fee2e2", padding: 8, borderRadius: 6 }}>
              <Text style={{ color: "#ef4444", fontWeight: "bold", fontSize: 12 }}>Remove</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSaveHandover}
              disabled={!!handoverLocked?.[activeShift]}
              style={{
                backgroundColor: handoverLocked?.[activeShift] ? "#cbd5e1" : "#f97316",
                padding: 8,
                borderRadius: 6,
              }}
            >
              <Text style={{ color: "white", fontWeight: "bold", fontSize: 12 }}>
                {handoverLocked?.[activeShift] ? 'Saved' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {!!handoverLocked?.[activeShift] && (
          <View style={{ backgroundColor: "#f1f5f9", borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: "#e2e8f0" }}>
            <Text style={{ color: "#334155", fontWeight: "700", fontSize: 12 }}>
              Locked: this note is already saved. Tap Remove to unlock and edit.
            </Text>
          </View>
        )}

        {/* Shift Tabs */}
        <View style={{ flexDirection: "row", backgroundColor: "#f1f5f9", borderRadius: 8, padding: 4, marginBottom: 15 }}>
          {['Morning', 'Afternoon', 'Night'].map(shift => (
            <TouchableOpacity
              key={shift}
              onPress={() => setActiveShift(shift)}
              style={{
                flex: 1,
                paddingVertical: 8,
                alignItems: "center",
                backgroundColor: activeShift === shift ? "white" : "transparent",
                borderRadius: 6,
                shadowColor: activeShift === shift ? "#000" : "transparent",
                shadowOpacity: 0.1,
                elevation: activeShift === shift ? 2 : 0
              }}
            >
              <Text style={{ fontWeight: activeShift === shift ? "bold" : "normal", color: activeShift === shift ? "#f97316" : "#64748b" }}>
                {shift}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* SBAR Fields */}
        <View style={{ gap: 12 }}>
          <View>
            <Text style={{ fontWeight: "bold", color: "#475569", marginBottom: 4 }}>S (Situation)</Text>
            <TextInput
              placeholder="What's happening now?"
              placeholderTextColor="#94a3b8"
              value={handoverNotes[activeShift].situation}
              onChangeText={(text) => setHandoverNotes(prev => ({ ...prev, [activeShift]: { ...prev[activeShift], situation: text } }))}
              editable={!handoverLocked?.[activeShift]}
              style={{ borderWidth: 1, borderColor: "#e2e8f0", padding: 10, borderRadius: 8, backgroundColor: handoverLocked?.[activeShift] ? "#f1f5f9" : "#f8fafc", color: "#0f172a" }}
              multiline
            />
          </View>
          <View>
            <Text style={{ fontWeight: "bold", color: "#475569", marginBottom: 4 }}>B (Background)</Text>
            <TextInput
              placeholder="Relevant history / context"
              placeholderTextColor="#94a3b8"
              value={handoverNotes[activeShift].background}
              onChangeText={(text) => setHandoverNotes(prev => ({ ...prev, [activeShift]: { ...prev[activeShift], background: text } }))}
              editable={!handoverLocked?.[activeShift]}
              style={{ borderWidth: 1, borderColor: "#e2e8f0", padding: 10, borderRadius: 8, backgroundColor: handoverLocked?.[activeShift] ? "#f1f5f9" : "#f8fafc", color: "#0f172a" }}
              multiline
            />
          </View>
          <View>
            <Text style={{ fontWeight: "bold", color: "#475569", marginBottom: 4 }}>A (Assessment)</Text>
            <TextInput
              placeholder="Your assessment"
              placeholderTextColor="#94a3b8"
              value={handoverNotes[activeShift].assessment}
              onChangeText={(text) => setHandoverNotes(prev => ({ ...prev, [activeShift]: { ...prev[activeShift], assessment: text } }))}
              editable={!handoverLocked?.[activeShift]}
              style={{ borderWidth: 1, borderColor: "#e2e8f0", padding: 10, borderRadius: 8, backgroundColor: handoverLocked?.[activeShift] ? "#f1f5f9" : "#f8fafc", color: "#0f172a" }}
              multiline
            />
          </View>
          <View>
            <Text style={{ fontWeight: "bold", color: "#475569", marginBottom: 4 }}>R (Recommendation)</Text>
            <TextInput
              placeholder="What do you recommend?"
              placeholderTextColor="#94a3b8"
              value={handoverNotes[activeShift].recommendation}
              onChangeText={(text) => setHandoverNotes(prev => ({ ...prev, [activeShift]: { ...prev[activeShift], recommendation: text } }))}
              editable={!handoverLocked?.[activeShift]}
              style={{ borderWidth: 1, borderColor: "#e2e8f0", padding: 10, borderRadius: 8, backgroundColor: handoverLocked?.[activeShift] ? "#f1f5f9" : "#f8fafc", color: "#0f172a" }}
              multiline
            />
          </View>
        </View>
      </View>

      {/* Add Event Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={addEventModalVisible}
        onRequestClose={() => setAddEventModalVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: "white", padding: 20, borderRadius: 10, width: "80%" }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8, color: "#0f172a" }}>Add Event</Text>
            <Text style={{ marginBottom: 15, color: "#475569", fontSize: 13 }}>
              {selectedDate}
            </Text>

            <Text style={{ fontSize: 13, fontWeight: "700", color: "#334155", marginBottom: 4 }}>
              Title <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <TextInput
              placeholder="Title (e.g., Ward Rounds Meeting)"
              placeholderTextColor="#94a3b8"
              value={newEventTitle}
              onChangeText={setNewEventTitle}
              style={{ borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 5, marginBottom: 12, color: "#0f172a", backgroundColor: "#fff" }}
            />

            <Text style={{ fontSize: 13, fontWeight: "700", color: "#334155", marginBottom: 4 }}>
              Time <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <TextInput
              placeholder="Time (e.g., 10:00 AM)"
              placeholderTextColor="#94a3b8"
              value={newEventTime}
              onChangeText={setNewEventTime}
              style={{ borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 5, marginBottom: 12, color: "#0f172a", backgroundColor: "#fff" }}
            />

            <Text style={{ fontSize: 13, fontWeight: "700", color: "#334155", marginBottom: 4 }}>
              Location <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <TextInput
              placeholder="Location (e.g., Ward A)"
              placeholderTextColor="#94a3b8"
              value={newEventLocation}
              onChangeText={setNewEventLocation}
              style={{ borderWidth: 1, borderColor: "#ccc", padding: 10, borderRadius: 5, marginBottom: 20, color: "#0f172a", backgroundColor: "#fff" }}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  setAddEventModalVisible(false)
                  setNewEventTitle('')
                  setNewEventTime('')
                  setNewEventLocation('')
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  borderRadius: 6,
                  backgroundColor: "#e0e0e0"
                }}
              >
                <Text style={{ color: "#333", fontWeight: "bold" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddEvent}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  borderRadius: 6,
                  backgroundColor: "#f97316"
                }}
              >
                <Text style={{ color: "white", fontWeight: "bold" }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <NurseSideMenu visible={drawerVisible} onClose={toggleDrawer} />

      {/* ================= Upcoming Events Section ================= */}
      <View style={{
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 15,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 3
      }}>
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "#f97316", marginBottom: 10 }}>
          <Ionicons name="calendar-outline" size={18} color="#f97316" /> {" "}Agenda Summary
        </Text>

        {agendaItems.filter(item => item.date === selectedDate).length > 0 ? (
          <>
            {agendaItems.filter(item => item.date === selectedDate).map(item => (
              <View key={item.id} style={{
                backgroundColor: "#fff7ed",
                padding: 12,
                borderRadius: 8,
                marginBottom: 10,
                borderLeftWidth: 4,
                borderLeftColor: item.status === 'Done' ? "#22c55e" : "#f97316"
              }}>
                <Text style={{ fontWeight: "bold", color: item.status === 'Done' ? "#166534" : "#9a3412" }}>{item.title}</Text>
                <Text style={{ color: "#334155", marginTop: 2 }}>Time: {item.time}</Text>
                <Text style={{ color: "#334155", marginTop: 2 }}>Location: {item.location}</Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={{ fontStyle: "italic", color: "#94a3b8" }}>No events for {selectedDate}.</Text>
        )}
      </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
