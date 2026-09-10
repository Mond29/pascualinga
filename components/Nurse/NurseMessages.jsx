import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';

const CONSULTATION_SPECIALTIES = [
  { key: 'physical_therapy', label: 'Physical Therapy' },
  { key: 'anesthesia', label: 'Anesthesia' },
  { key: 'pediatrics', label: 'Pediatrics' },
  { key: 'otolaryngology', label: 'Otolaryngology (ENT)' },
  { key: 'pathology', label: 'Pathology' },
  { key: 'orthopedics', label: 'Orthopedics' },
  { key: 'obstetrics', label: 'Obstetrics' },
  { key: 'ophthalmology', label: 'Ophthalmology' },
  { key: 'dermatology', label: 'Dermatology' },
  { key: 'urology', label: 'Urology' },
];

export default function NurseMessages() {
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [consultationItems, setConsultationItems] = useState([]);
  const [consultationLastMessages, setConsultationLastMessages] = useState({});
  const [role, setRole] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadRole = async () => {
      const raw = `${(await AsyncStorage.getItem('userRole')) || ''}`.trim().toLowerCase();
      const normalized = raw.includes('doctor') ? 'doctor' : raw.includes('nurse') ? 'nurse' : (raw || 'nurse');
      if (!cancelled) setRole(normalized);
    };
    loadRole();
    return () => {
      cancelled = true;
    };
  }, []);

  const allowedSenderRoles = useCallback(() => {
    const r = `${role || ''}`.trim().toLowerCase();
    const self = r.includes('doctor') ? 'doctor' : r.includes('nurse') ? 'nurse' : (r || 'nurse');
    return [self, 'patient'];
  }, [role]);

  const extractDigits = (value) => `${value || ''}`.replace(/[^\d]/g, '');

  const looksLikePhoneOrId = (value) => {
    const raw = `${value || ''}`.trim();
    if (!raw) return false;
    const noSpaces = raw.replace(/\s+/g, '');
    const digits = extractDigits(raw);
    const ratio = noSpaces.length ? digits.length / noSpaces.length : 0;
    return digits.length >= 6 && ratio > 0.8;
  };

  const maskDigits = (digits) => {
    const d = `${digits || ''}`;
    if (d.length <= 4) return d;
    return `${d.slice(0, 2)}••••${d.slice(-4)}`;
  };

  const normalizeDoctorName = (value) => {
    const raw = `${value || ''}`.trim();
    if (!raw) return 'Doctor';
    const noSpaces = raw.replace(/\s+/g, '');
    const digits = raw.replace(/[^\d]/g, '');
    const ratio = noSpaces.length ? digits.length / noSpaces.length : 0;
    if (digits.length >= 6 && ratio > 0.8) return 'Doctor';
    return raw;
  };

  const formatDateTime = (date, time) => {
    const d = `${date || ''}`.trim();
    const t = `${time || ''}`.trim();
    if (!d && !t) return '';
    if (d && t) return `${d} • ${t}`;
    return d || t;
  };

  const fetchConsultationInbox = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const allowed = allowedSenderRoles();
      const items = CONSULTATION_SPECIALTIES.map((s) => ({
        id: s.key,
        specialtyKey: s.key,
        label: s.label,
      }));

      const lastByKey = {};
      await Promise.all(
        items.map(async (item) => {
          const res = await supabase
            .from('consultation_messages')
            .select('id, body, created_at, sender_role, attachment_url, attachment_name')
            .eq('specialty', item.specialtyKey)
            .in('sender_role', allowed)
            .order('created_at', { ascending: false })
            .limit(1);

          if (res?.error) {
            lastByKey[item.specialtyKey] = null;
            return;
          }

          const msg = (res.data || [])[0] || null;
          if (!msg) {
            lastByKey[item.specialtyKey] = null;
            return;
          }

          const time = msg.created_at
            ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : null;
          const preview = msg.body
            ? msg.body
            : msg.attachment_url
              ? (msg.attachment_name ? `Attachment: ${msg.attachment_name}` : 'Attachment')
              : null;
          lastByKey[item.specialtyKey] = { preview, time, senderRole: msg.sender_role || null };
        })
      );

      setConsultationItems(items);
      setConsultationLastMessages(lastByKey);
    } catch (e) {
      Alert.alert('Error', 'Could not load the consultation inbox.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [allowedSenderRoles]);

  useFocusEffect(
    useCallback(() => {
      if (!role) return;
      fetchConsultationInbox(false);
    }, [fetchConsultationInbox, role])
  );

  const onRefresh = () => {
    setRefreshing(true);
    if (!role) return;
    fetchConsultationInbox(false);
  };

  const openConsultationChat = (item) => {
    navigation.navigate('MessageDetail', {
      mode: 'consultation',
      specialty: item.specialtyKey,
      title: item.label,
    });
  };

  const renderConsultationItem = ({ item }) => {
    const lastMsg = consultationLastMessages?.[item.specialtyKey] || null;
    const isSelfLast = lastMsg?.senderRole === `${role || ''}`.trim().toLowerCase();

    return (
      <TouchableOpacity
        style={styles.doctorCard}
        onPress={() => openConsultationChat(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(item.label || 'D').charAt(0)}</Text>
          </View>
          <View style={styles.onlineBadge} />
        </View>

        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.doctorName} numberOfLines={1}>
              {item.label}
            </Text>
            {lastMsg?.time && <Text style={styles.messageTime}>{lastMsg.time}</Text>}
          </View>

          <Text style={styles.specialization} numberOfLines={1}>
            Consultation Doctor
          </Text>

          <Text style={styles.lastMessage} numberOfLines={1}>
            {isSelfLast ? <Text style={styles.youText}>You: </Text> : ''}
            {lastMsg?.preview || 'Start a conversation...'}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerSection}>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity style={styles.headerAction}>
          <Ionicons name="ellipsis-horizontal-circle" size={28} color="#f97316" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#94a3b8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={'Search department...'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#94a3b8"
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#f97316" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <FlatList
          data={
            searchQuery.trim()
              ? consultationItems.filter((c) => (c.label || '').toLowerCase().includes(searchQuery.toLowerCase()))
              : consultationItems
          }
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderConsultationItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#f97316']} />
          }
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Ionicons name="chatbubbles-outline" size={64} color="#cbd5e1" />
              <Text style={styles.emptyText}>No available doctor inboxes.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1e293b',
  },
  headerAction: {
    padding: 5,
  },
  inboxTabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  inboxTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  inboxTabActive: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  inboxTabText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748b',
  },
  inboxTabTextActive: {
    color: '#ea580c',
  },
  searchSection: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 45,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    color: '#64748b',
    fontSize: 14,
  },
  emptyText: {
    marginTop: 15,
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
  },
  listContainer: {
    padding: 15,
    paddingBottom: 120,
  },
  doctorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f97316',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#fff',
  },
  cardContent: {
    flex: 1,
    marginLeft: 15,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
  },
  messageTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  specialization: {
    fontSize: 13,
    color: '#f97316',
    fontWeight: '600',
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 14,
    color: '#64748b',
  },
  youText: {
    fontWeight: 'bold',
    color: '#1e293b',
  },
});
