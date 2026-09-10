import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';

export default function MessageDetail() {
  const route = useRoute();
  const navigation = useNavigation();
  const { thread, mode, specialty: routeSpecialty, title: routeTitle } = route.params || {};
  const isConsultation = mode === 'consultation' || (!!routeSpecialty && !thread);
  const requestId = thread?.id;
  const specialty = `${routeSpecialty || ''}`.trim();
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

  const [resolvedDoctorName, setResolvedDoctorName] = useState(() => normalizeDoctorName(thread?.doctor_name));
  const doctorInitial = (resolvedDoctorName || 'D').charAt(0);
  const headerTitle = isConsultation ? (routeTitle || 'Consultation') : (resolvedDoctorName ? resolvedDoctorName : `Request #${requestId}`);
  const headerSubtitle = isConsultation ? 'Doctor Chat' : (thread?.patient_name ? thread.patient_name : 'Patient');

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [nurseName, setNurseName] = useState('Nurse');
  const [nurseEmail, setNurseEmail] = useState('');
  const [selfSenderRole, setSelfSenderRole] = useState('nurse');
  const flatListRef = useRef(null);
  const requestDoctorValue = useMemo(() => thread?.doctor_name, [thread?.doctor_name]);
  const activeKey = isConsultation ? `consultation:${specialty}` : `request:${requestId}`;

  const normalizeSenderRole = (rawRole) => {
    const r = `${rawRole || ''}`.trim().toLowerCase();
    if (!r) return 'nurse';
    if (r.includes('doctor')) return 'doctor';
    if (r.includes('nurse')) return 'nurse';
    return r;
  };

  useEffect(() => {
    let cancelled = false;
    const loadRole = async () => {
      const raw = `${(await AsyncStorage.getItem('userRole')) || ''}`.trim();
      const normalized = normalizeSenderRole(raw);
      if (!cancelled) setSelfSenderRole(normalized);
    };
    loadRole();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isConsultation && !specialty) return;
    if (!isConsultation && !requestId) return;

    let cancelled = false;
    let channel = null;

    // Set header
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerContainer}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{(headerTitle || 'D').charAt(0)}</Text>
          </View>
          <View>
            <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>{headerSubtitle}</Text>
          </View>
        </View>
      ),
      headerRight: () => (        <TouchableOpacity style={styles.headerIcon} onPress={() => Alert.alert('Info', `Request #${requestId}`)}>
          <Ionicons name="information-circle-outline" size={24} color="#1e293b" />
        </TouchableOpacity>
      ),
    });

    const fetchNurseProfile = async () => {
      try {
        const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
        setNurseEmail(email);
        if (!email) return;
        const { data } = await supabase.from('accounts').select('name, email').eq('email', email).maybeSingle();
        const display = `${data?.name || ''}`.trim();
        if (display) {
          setNurseName(display);
          return;
        }
        const prefix = email.includes('@') ? email.split('@')[0] : email;
        if (prefix) setNurseName(prefix.charAt(0).toUpperCase() + prefix.slice(1));
      } catch (error) {
        console.error('Error fetching user:', error);
      }
    };

    const resolveDoctor = async () => {
      if (isConsultation) return;
      const raw = requestDoctorValue;
      const normalized = normalizeDoctorName(raw);
      if (!looksLikePhoneOrId(raw)) {
        setResolvedDoctorName(normalized);
        return;
      }

      const key = extractDigits(raw);
      if (!key) {
        setResolvedDoctorName('Doctor');
        return;
      }

      const { data: accountRows, error } = await supabase
        .from('accounts')
        .select('name, contact_number')
        .eq('contact_number', key)
        .limit(1);

      if (!error && Array.isArray(accountRows) && accountRows[0]?.name) {
        setResolvedDoctorName(accountRows[0].name);
      } else {
        setResolvedDoctorName(`Doctor (${maskDigits(key)})`);
      }
    };

    const fetchMessages = async () => {
      setLoading(true);
      try {
        const rawRole = `${(await AsyncStorage.getItem('userRole')) || ''}`.trim();
        const selfRole = normalizeSenderRole(rawRole);
        const allowedSenderRoles = [selfRole, 'patient'];
        const table = isConsultation ? 'consultation_messages' : 'appointment_messages';
        const column = isConsultation ? 'specialty' : 'request_id';
        const value = isConsultation ? specialty : requestId;

        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq(column, value)
          .in('sender_role', allowedSenderRoles)
          .order('created_at', { ascending: true });

        if (error) throw error;
        if (!cancelled) setMessages(data || []);
      } catch (error) {
        console.error('Error fetching messages:', error);
        Alert.alert('Error', 'Could not load messages.');
      } finally {
        if (!cancelled) setLoading(false);
        // Scroll to bottom after loading
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      }
    };

    const boot = async () => {
      await fetchNurseProfile();
      await resolveDoctor();
      await fetchMessages();
      if (cancelled) return;

      const rawRole = `${(await AsyncStorage.getItem('userRole')) || ''}`.trim();
      const selfRole = normalizeSenderRole(rawRole);
      const allowedSenderRoles = [selfRole, 'patient'];

      channel = supabase
        .channel(`chat_${activeKey}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: isConsultation ? 'consultation_messages' : 'appointment_messages',
            filter: isConsultation ? `specialty=eq.${specialty}` : `request_id=eq.${requestId}`,
          },
          (payload) => {
            if (!allowedSenderRoles.includes(normalizeSenderRole(payload?.new?.sender_role))) return;
            setMessages((current) => {
              if (current.find((m) => m.id === payload.new.id)) return current;
              return [...current, payload.new];
            });
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          }
        )
        .subscribe();
    };

    boot();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [activeKey, doctorInitial, headerSubtitle, headerTitle, isConsultation, navigation, requestDoctorValue, requestId, specialty]);

  const handleSendMessage = async () => {
    if (newMessage.trim() === '' || sending) return;

    setSending(true);
    const messageBody = newMessage.trim();
    setNewMessage(''); // Clear input early for better UX

    try {
      const role = normalizeSenderRole(`${(await AsyncStorage.getItem('userRole')) || 'nurse'}`);
      const table = isConsultation ? 'consultation_messages' : 'appointment_messages';
      const payload = isConsultation
        ? {
            specialty,
            sender_role: role,
            sender_name: nurseName,
            sender_email: nurseEmail || null,
            body: messageBody,
          }
        : {
            request_id: requestId,
            sender_role: role,
            sender_name: nurseName,
            body: messageBody,
          };

      const { error } = await supabase.from(table).insert(payload);

      if (error) throw error;
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Could not send the message. Please try again.');
      setNewMessage(messageBody); // Restore message on error
    } finally {
      setSending(false);
    }
  };

  const uploadAttachment = async (asset) => {
    const uri = `${asset?.uri || ''}`.trim();
    if (!uri) throw new Error('Invalid file');
    const rawName =
      `${asset?.fileName || ''}`.trim() ||
      `${uri.split('/').pop() || ''}`.trim() ||
      `attachment-${Date.now()}.jpg`;

    const name = rawName.replace(/[^a-z0-9._-]+/gi, '_');

    const uriLower = uri.toLowerCase();
    const inferredMimeType =
      uriLower.endsWith('.png') ? 'image/png' :
      uriLower.endsWith('.webp') ? 'image/webp' :
      uriLower.endsWith('.heic') ? 'image/heic' :
      uriLower.endsWith('.gif') ? 'image/gif' :
      'image/jpeg';

    const mimeType = `${asset?.mimeType || inferredMimeType || 'image/jpeg'}`.trim();

    const res = await fetch(uri);
    if (!res.ok) throw new Error(`Failed to read attachment (${res.status})`);
    const fileData = await res.arrayBuffer();

    const safeSpecialty = (specialty || 'general').replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();
    const path = `${isConsultation ? `consultations/${safeSpecialty}` : `requests/${requestId}`}/${Date.now()}-${name}`.replace(/\s+/g, '_');

    const { error: uploadError } = await supabase
      .storage
      .from('chat-attachments')
      .upload(path, fileData, { contentType: mimeType, upsert: false, cacheControl: '3600' });

    if (uploadError) throw uploadError;

    const publicRes = supabase.storage.from('chat-attachments').getPublicUrl(path);
    const url = publicRes?.data?.publicUrl || '';
    if (!url) throw new Error('Unable to get attachment URL');

    return { url, name, mimeType, size: asset?.fileSize || null };
  };

  const handleAttach = async () => {
    if (sending) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Please allow photo access to attach a file.');
        return;
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
      });

      if (picked.canceled) return;
      const asset = (picked.assets || [])[0];
      if (!asset?.uri) return;

      setSending(true);
      const uploaded = await uploadAttachment(asset);
      const role = `${(await AsyncStorage.getItem('userRole')) || 'nurse'}`.trim().toLowerCase() || 'nurse';
      const caption = newMessage.trim();
      setNewMessage('');

      const table = isConsultation ? 'consultation_messages' : 'appointment_messages';
      const payload = isConsultation
        ? {
            specialty,
            sender_role: role,
            sender_name: nurseName,
            sender_email: nurseEmail || null,
            body: caption || '',
            attachment_url: uploaded.url,
            attachment_name: uploaded.name,
            attachment_type: uploaded.mimeType,
            attachment_size: uploaded.size,
          }
        : {
            request_id: requestId,
            sender_role: role,
            sender_name: nurseName,
            body: caption ? `${caption}\n${uploaded.url}` : uploaded.url,
          };

      const { error } = await supabase.from(table).insert(payload);
      if (error) throw error;
    } catch (e) {
      const msg = `${e?.message || e?.error_description || ''}`.trim();
      Alert.alert(
        'Attachment Failed',
        msg
          ? `Upload failed: ${msg}`
          : 'Upload failed. Check if the chat-attachments bucket exists and has correct Storage policies.'
      );
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }) => {
    const senderRole = normalizeSenderRole(item.sender_role);
    const isMine = senderRole === selfSenderRole;
    const rawOther = item.sender_name || requestDoctorValue || 'Doctor';
    const otherName = isConsultation ? (item.sender_name || 'Doctor') : (looksLikePhoneOrId(rawOther) ? resolvedDoctorName : (rawOther || resolvedDoctorName || 'Doctor'));
    const attachmentUrl = `${item.attachment_url || ''}`.trim();
    const attachmentName = `${item.attachment_name || ''}`.trim();
    
    return (
      <View style={[styles.messageRow, isMine ? styles.nurseRow : styles.doctorRow]}>
        {!isMine && (
          <View style={styles.avatarSmall}>
            <Text style={styles.avatarSmallText}>{(otherName || 'D').charAt(0)}</Text>
          </View>
        )}
        <View style={[styles.bubble, isMine ? styles.nurseBubble : styles.doctorBubble]}>
          {!isMine && <Text style={styles.senderLabel}>{otherName}</Text>}
          {!!attachmentUrl && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (!attachmentUrl) return;
                Linking.openURL(attachmentUrl).catch(() => {});
              }}
              style={styles.attachmentWrap}
            >
              <Image source={{ uri: attachmentUrl }} style={styles.attachmentImage} />
              {!!attachmentName && <Text style={styles.attachmentName} numberOfLines={1}>{attachmentName}</Text>}
            </TouchableOpacity>
          )}
          {!!`${item.body || ''}`.trim() && (
            <Text style={[
              styles.messageContent,
              isMine ? styles.nurseText : styles.doctorText
            ]}>
              {item.body}
            </Text>
          )}
          <Text style={[
            styles.timestamp,
            isMine ? styles.nurseTimestamp : styles.doctorTimestamp
          ]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Loading chat...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item, index) => item.id?.toString() || index.toString()}
          renderItem={renderMessage}
          style={styles.list}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySubtitle}>Send a message to start the conversation.</Text>
            </View>
          }
        />

        <View style={styles.inputWrapper}>
          <View style={styles.inputContainer}>
            <TouchableOpacity style={styles.attachButton} onPress={handleAttach}>
              <Ionicons name="add-circle-outline" size={24} color="#64748b" />
            </TouchableOpacity>
            
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              value={newMessage}
              onChangeText={setNewMessage}
              multiline
              maxLength={1000}
            />
            
            <TouchableOpacity 
              style={[
                styles.sendButton,
                (!newMessage.trim() || sending) && styles.sendButtonDisabled
              ]}
              onPress={handleSendMessage}
              disabled={!newMessage.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  list: {
    flex: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 260,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f97316',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerAvatarText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  headerIcon: {
    marginRight: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#64748b',
  },
  messagesList: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 110,
  },
  emptyState: {
    paddingTop: 28,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#64748b',
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  nurseRow: {
    justifyContent: 'flex-end',
  },
  doctorRow: {
    justifyContent: 'flex-start',
  },
  avatarSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarSmallText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  nurseBubble: {
    backgroundColor: '#f97316',
    borderBottomRightRadius: 4,
  },
  doctorBubble: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  senderLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 4,
  },
  messageContent: {
    fontSize: 15,
    lineHeight: 20,
  },
  attachmentWrap: {
    width: 220,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  attachmentImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#e2e8f0',
  },
  attachmentName: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  nurseText: {
    color: '#ffffff',
  },
  doctorText: {
    color: '#0f172a',
  },
  timestamp: {
    marginTop: 5,
    fontSize: 10,
    alignSelf: 'flex-end',
  },
  nurseTimestamp: {
    color: '#ffedd5',
  },
  doctorTimestamp: {
    color: '#94a3b8',
  },
  inputWrapper: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 90,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  attachButton: {
    padding: 6,
    marginRight: 4,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    fontSize: 15,
    color: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f97316',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  sendButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
});
