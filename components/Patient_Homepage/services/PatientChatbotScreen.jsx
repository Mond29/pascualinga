import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeText(v) {
  return `${v || ''}`.toLowerCase().trim();
}

const TOPICS = [
  {
    key: 'booking',
    title: 'Booking Services',
    keywords: ['book', 'booking', 'appointment', 'schedule', 'services', 'laboratory', 'radiology', 'pathology', 'package'],
    answer:
      "To book a service:\n\n1) Go to Services\n2) Choose a category and a service\n3) Fill in Patient Details\n4) Select your preferred date/time (if applicable)\n5) Review Summary and confirm\n\nTip: You can add multiple services to your cart and checkout selected items.",
    replies: ['Referral attachment', 'Payments', 'Cancel or reschedule', 'Video consultation'],
  },
  {
    key: 'referral',
    title: 'Referral Attachment',
    keywords: ['referral', 'referal', 'attach', 'upload', 'doctor', 'prescription', 'lab request', 'request form'],
    answer:
      "Some services (e.g., Laboratory, Radiology, Pathology, and Packages) require a doctor referral.\n\nWhen prompted, tap Attach Referral and upload a clear photo or scanned document of the referral.\n\nIf your file is rejected, it usually means the image is unclear or it does not contain referral details (doctor name/signature, date, requested tests).",
    replies: ['Booking services', 'Why was my referral rejected?', 'Payments'],
  },
  {
    key: 'referral_reject',
    title: 'Why Referral Is Rejected',
    keywords: ['rejected', 'reject', 'why', 'selfie', 'photo', 'blurry', 'unclear', 'not accepted', 'ocr'],
    answer:
      "Referral checks look for readable referral text (and common referral indicators like doctor details and a date).\n\nTo pass:\n- Use a clear, well-lit photo\n- Avoid selfies or random images\n- Make sure the document text is readable\n- Include the doctor name/signature and the requested tests/procedure\n\nIf needed, retake the photo closer and avoid glare.",
    replies: ['Attach a referral', 'Booking services', 'Contact support'],
  },
  {
    key: 'payments',
    title: 'Payments',
    keywords: ['pay', 'payment', 'gcash', 'qr', 'qrph', 'checkout', 'paymongo', 'receipt', 'invoice'],
    answer:
      "Payment options depend on the service.\n\nIf you see a checkout screen, follow the instructions to complete payment. After payment, your booking will proceed for approval/confirmation depending on the service workflow.\n\nIf checkout fails, try:\n- Checking your internet connection\n- Retrying after a few seconds\n- Reopening the app",
    replies: ['Booking services', 'Contact support', 'Pending vs confirmed'],
  },
  {
    key: 'video',
    title: 'Video Consultation',
    keywords: ['video', 'call', 'teleconsult', 'telehealth', 'online', 'consultation', 'jitsi', 'room', 'waiting'],
    answer:
      "For online consultations:\n\n1) Book an Online Consultation\n2) Wait for the doctor to start/approve the consultation\n3) Go to Schedule and join the call when available\n\nIf it shows \"Waiting\", the doctor has not started the call yet. Try again in a moment.",
    replies: ['Schedule & appointments', 'Pending vs confirmed', 'Contact support'],
  },
  {
    key: 'status',
    title: 'Pending vs Confirmed',
    keywords: ['pending', 'confirmed', 'approved', 'status', 'waiting', 'declined', 'cancelled', 'canceled'],
    answer:
      "Appointment statuses:\n\n- Pending: Waiting for approval/verification\n- Confirmed/Approved: Scheduled and active\n- Cancelled: The appointment was cancelled\n\nYou can view all appointments in the History tab and filter by status.",
    replies: ['Appointment history', 'Cancel or reschedule', 'Booking services'],
  },
  {
    key: 'cancel',
    title: 'Cancel or Reschedule',
    keywords: ['cancel', 'reschedule', 'move', 'change date', 'undo', 'restore'],
    answer:
      "To manage appointments:\n\n- Cancel: Open Schedule, select the appointment, and tap Cancel (if available)\n- History: Go to the History tab to review past bookings and filter by status\n\nIf cancel/reschedule is not available for a specific appointment, it may already be processed or restricted by the department policy.",
    replies: ['Appointment history', 'Schedule & appointments', 'Contact support'],
  },
  {
    key: 'history',
    title: 'Appointment History',
    keywords: ['history', 'past', 'previous', 'records of appointments'],
    answer:
      "You can view your full appointment history in the History tab.\n\nFeatures:\n- Search appointments by service/status/date\n- Filter by Pending, Confirmed, or Cancelled\n- Use pagination (Prev/Next) to navigate large history lists",
    replies: ['Pending vs confirmed', 'Booking services', 'Cancel or reschedule'],
  },
  {
    key: 'schedule',
    title: 'Schedule & Appointments',
    keywords: ['schedule', 'today', 'calendar', 'upcoming', 'my appointments'],
    answer:
      "Your upcoming appointments are listed in Schedule.\n\nUse it to:\n- View appointment details\n- Join video calls (if applicable)\n- See your scheduled dates",
    replies: ['Appointment history', 'Video consultation', 'Cancel or reschedule'],
  },
  {
    key: 'records',
    title: 'Medical Records',
    keywords: ['record', 'records', 'lab result', 'result', 'document', 'files'],
    answer:
      "Your uploaded or available medical records can be viewed in the Records tab.\n\nYou can search and filter records by category.",
    replies: ['Appointment history', 'Booking services', 'Contact support'],
  },
  {
    key: 'support',
    title: 'Contact Support',
    keywords: ['support', 'help', 'contact', 'report', 'issue', 'bug'],
    answer:
      "If you need help beyond this assistant, please contact your hospital/clinic support desk.\n\nInclude:\n- Your registered email\n- A screenshot of the issue\n- The date/time of the problem\n- The service or appointment involved",
    replies: ['Payments', 'Video consultation', 'Booking services'],
  },
];

function topicByTitle(title) {
  const t = normalizeText(title);
  if (t.includes('booking')) return 'booking';
  if (t.includes('referral rejected') || t.includes('rejected')) return 'referral_reject';
  if (t.includes('referral')) return 'referral';
  if (t.includes('payment')) return 'payments';
  if (t.includes('video')) return 'video';
  if (t.includes('pending')) return 'status';
  if (t.includes('cancel')) return 'cancel';
  if (t.includes('history')) return 'history';
  if (t.includes('schedule')) return 'schedule';
  if (t.includes('record')) return 'records';
  if (t.includes('support')) return 'support';
  return '';
}

function matchTopic(text) {
  const q = normalizeText(text);
  if (!q) return '';
  if (q === 'hi' || q === 'hello' || q === 'hey' || q === 'good morning' || q === 'good afternoon' || q === 'good evening') return 'greeting';
  if (/(book|booking|appointment|schedule\s+a|how\s+to\s+book|services|laboratory|radiology|pathology|package)/i.test(q)) return 'booking';
  if (/(referral|referal|upload|attach|doctor\s+referral|request\s+form|prescription)/i.test(q)) return 'referral';
  if (/(reject|rejected|not\s+accepted|selfie|blurry|unclear|ocr|why.*reject)/i.test(q)) return 'referral_reject';
  if (/(pay|payment|checkout|qr|qrph|gcash|paymongo|receipt|invoice)/i.test(q)) return 'payments';
  if (/(video|call|teleconsult|telehealth|online\s+consult|jitsi|room|waiting)/i.test(q)) return 'video';
  if (/(pending|confirmed|approved|status|waiting|declined|cancelled|canceled)/i.test(q)) return 'status';
  if (/(cancel|reschedule|move|change\s+date|undo|restore)/i.test(q)) return 'cancel';
  if (/(history|past|previous|appointment\s+history)/i.test(q)) return 'history';
  if (/(schedule|calendar|upcoming|my\s+appointments)/i.test(q)) return 'schedule';
  if (/(record|records|lab\s+result|results|document)/i.test(q)) return 'records';
  if (/(support|help|contact|report|issue|bug)/i.test(q)) return 'support';
  for (const t of TOPICS) {
    if (t.keywords.some((k) => q.includes(normalizeText(k)))) return t.key;
  }
  return '';
}

export default function PatientChatbotScreen({ embedded = false }) {
  const THEME_ORANGE = '#DA7705';
  const insets = useSafeAreaInsets();
  const TAB_BAR_OVERLAY = embedded ? 0 : 110 + (insets?.bottom || 0);
  const flatRef = useRef(null);
  const messagesRef = useRef([]);
  const botTypingRef = useRef(false);
  const inputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [quickReplies, setQuickReplies] = useState([]);
  const [displayName, setDisplayName] = useState('');
  const [botTyping, setBotTyping] = useState(false);

  const storageKey = useMemo(() => {
    const e = `${email || ''}`.trim().toLowerCase();
    return e ? `patientFaqChatHistory:${e}` : 'patientFaqChatHistory';
  }, [email]);

  const setBotRepliesForTopic = useCallback((topicKey) => {
    if (!topicKey || topicKey === 'greeting') {
      setQuickReplies(['Booking services', 'Appointment history', 'Payments', 'Video consultation', 'Referral attachment', 'Contact support']);
      return;
    }
    const topic = TOPICS.find((t) => t.key === topicKey);
    setQuickReplies(Array.isArray(topic?.replies) ? topic.replies : []);
  }, []);

  const persistMessages = useCallback(
    async (list) => {
      try {
        const e = `${email || ''}`.trim().toLowerCase();
        const key = e ? `patientFaqChatHistory:${e}` : 'patientFaqChatHistory';
        await AsyncStorage.setItem(key, JSON.stringify(Array.isArray(list) ? list : []));
      } catch {}
    },
    [email],
  );

  const syncMessages = useCallback(
    (next) => {
      const safeNext = Array.isArray(next) ? next : [];
      messagesRef.current = safeNext;
      setMessages(safeNext);
      setTimeout(() => persistMessages(safeNext), 0);
    },
    [persistMessages],
  );

  const loadSession = useCallback(async () => {
    setLoading(true);
    try {
      const nextEmail = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
      setEmail(nextEmail);

      const nameCached =
        `${(await AsyncStorage.getItem(nextEmail ? `userName:${nextEmail}` : '')) || ''}`.trim() ||
        `${(await AsyncStorage.getItem('userName')) || ''}`.trim();
      const nextName = `${nameCached || ''}`.trim();
      setDisplayName(nextName);

      const key = nextEmail ? `patientFaqChatHistory:${nextEmail}` : 'patientFaqChatHistory';
      const raw = await AsyncStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      const list = Array.isArray(parsed) ? parsed : [];

      if (list.length) {
        messagesRef.current = list;
        setMessages(list);
        const lastBot = [...list].reverse().find((m) => m?.from === 'bot');
        const lastTopic = `${lastBot?.topic || ''}`.trim();
        setBotRepliesForTopic(lastTopic);
      } else {
        const greet = {
          id: uid(),
          from: 'bot',
          topic: 'greeting',
          text: `Hi${nextName ? ` ${nextName}` : ''}! I'm your Pascualinga Virtual Assistant.\n\nI can help with booking, referrals, payments, video consultations, schedules, records, and appointment history.\n\nWhat would you like to know?`,
          createdAt: Date.now(),
        };
        messagesRef.current = [greet];
        setMessages([greet]);
        setBotRepliesForTopic('greeting');
        setTimeout(() => AsyncStorage.setItem(key, JSON.stringify([greet])), 0);
      }
    } catch {
      setEmail('');
      const greet = {
        id: uid(),
        from: 'bot',
        topic: 'greeting',
        text: "Hi! I'm your Pascualinga Virtual Assistant.\n\nI can help with booking, referrals, payments, video consultations, schedules, records, and appointment history.\n\nWhat would you like to know?",
        createdAt: Date.now(),
      };
      messagesRef.current = [greet];
      setMessages([greet]);
      setBotRepliesForTopic('greeting');
    } finally {
      setLoading(false);
    }
  }, [setBotRepliesForTopic]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    botTypingRef.current = !!botTyping;
  }, [botTyping]);



  const askGeminiViaBackend = useCallback(async (userText, history) => {
    try {
      const historySlim = (Array.isArray(history) ? history : [])
        .slice(-12)
        .map((m) => ({ from: m?.from === 'user' ? 'user' : 'bot', text: `${m?.text || ''}`.trim() }))
        .filter((m) => m.text);

      const res = await supabase.functions.invoke('chatbot-gemini', {
        body: { message: `${userText || ''}`.trim(), history: historySlim },
      });

      if (res?.error) {
        const msg = `${res.error?.message || ''}`.trim();
        return { ok: false, reply: msg ? `Sorry—AI reply is unavailable right now. (${msg})` : 'Sorry—AI reply is unavailable right now.' };
      }

      const data = res?.data || {};
      if (!data?.ok || !`${data?.reply || ''}`.trim()) {
        const err = `${data?.error || ''}`.trim();
        return { ok: false, reply: err ? `Sorry—AI reply is unavailable right now. (${err})` : 'Sorry—AI reply is unavailable right now.' };
      }
      return { ok: true, reply: `${data.reply}`.trim() };
    } catch (e) {
      const msg = `${e?.message || ''}`.trim();
      return { ok: false, reply: msg ? `Sorry—AI reply is unavailable right now. (${msg})` : 'Sorry—AI reply is unavailable right now.' };
    }
  }, []);

  const getLocalBotReply = useCallback(
    (userText) => {
      const matched = matchTopic(userText);
      if (matched === 'greeting') {
        setBotRepliesForTopic('greeting');
        return {
          handled: true,
          bot: {
            id: uid(),
            from: 'bot',
            topic: 'greeting',
            text: 'Hello! Choose a topic below or type a question.',
            createdAt: Date.now(),
          },
        };
      }

      const topic = TOPICS.find((t) => t.key === matched);
      if (topic) {
        setBotRepliesForTopic(topic.key);
        return {
          handled: true,
          bot: {
            id: uid(),
            from: 'bot',
            topic: topic.key,
            text: topic.answer,
            createdAt: Date.now(),
          },
        };
      }

      return { handled: false, bot: null };
    },
    [setBotRepliesForTopic],
  );

  const send = useCallback(
    async (text, fromQuickReply = false) => {
      const trimmed = `${text || ''}`.trim();
      if (!trimmed) return;
      if (botTypingRef.current) return;

      setInput('');

      const userMsg = {
        id: uid(),
        from: 'user',
        text: trimmed,
        createdAt: Date.now(),
      };
      const snapshot1 = Array.isArray(messagesRef.current) ? [...messagesRef.current] : [];
      const next1 = [...snapshot1, userMsg];
      syncMessages(next1);

      const local = getLocalBotReply(trimmed);
      if (local.handled && local.bot) {
        const next2 = [...next1, local.bot];
        syncMessages(next2);
        return;
      }

      setBotTyping(true);
      const typingId = uid();
      const typingMsg = { id: typingId, from: 'bot', topic: 'typing', text: 'Typing…', createdAt: Date.now(), typing: true };
      const nextTyping = [...next1, typingMsg];
      syncMessages(nextTyping);

      const ai = await askGeminiViaBackend(trimmed, next1);
      const botMsg = {
        id: typingId,
        from: 'bot',
        topic: ai.ok ? 'ai' : 'greeting',
        text:
          ai.ok
            ? ai.reply
            : `${ai.reply}\n\nTry one of these topics:\n- Booking services\n- Appointment history\n- Referral attachment\n- Payments\n- Video consultation\n- Schedule & appointments`,
        createdAt: Date.now(),
      };
      setBotRepliesForTopic('greeting');

      const replaced = nextTyping.map((m) => (m?.id === typingId ? botMsg : m));
      syncMessages(replaced);
      setBotTyping(false);
    },
    [askGeminiViaBackend, getLocalBotReply, syncMessages, setBotRepliesForTopic],
  );

  const resetChat = useCallback(async () => {
    const greet = {
      id: uid(),
      from: 'bot',
      topic: 'greeting',
      text: `Hi${displayName ? ` ${displayName}` : ''}! I'm your Pascualinga Virtual Assistant.\n\nWhat would you like to know?`,
      createdAt: Date.now(),
    };
    setBotRepliesForTopic('greeting');
    syncMessages([greet]);
  }, [displayName, syncMessages, setBotRepliesForTopic]);

  const renderMessage = useCallback(
    ({ item }) => {
      const isUser = item?.from === 'user';
      return (
        <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowBot]}>
          {!isUser ? (
            <View style={styles.botAvatar}>
              <Ionicons name="sparkles" size={14} color="#fff" />
            </View>
          ) : null}

          <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
            <Text style={[styles.bubbleText, isUser ? styles.userText : styles.botText]}>{`${item?.text || ''}`}</Text>
          </View>
        </View>
      );
    },
    [],
  );

  const replyChips = useMemo(() => {
    const chips = Array.isArray(quickReplies) ? quickReplies : [];
    return chips
      .map((t) => `${t || ''}`.trim())
      .filter(Boolean)
      .map((t) => ({ id: `qr_${t}`, label: t, topicKey: topicByTitle(t) }));
  }, [quickReplies]);

  const messagesReversed = useMemo(() => {
    const list = Array.isArray(messages) ? [...messages] : [];
    list.reverse();
    return list;
  }, [messages]);

  const keyExtractor = useCallback((it) => {
    const idRaw = `${it?.id || ''}`.trim();
    if (idRaw) return idRaw;
    // Fallback only: never generate random ids during render (causes full-list re-renders / typing glitches).
    const text = `${it?.text || ''}`.trim().slice(0, 60);
    return `${it?.from || 'msg'}_${text}_${it?.createdAt || Date.now()}`;
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="chatbubbles" size={18} color={THEME_ORANGE} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Virtual Assistant</Text>
              <Text style={styles.headerSubtitle}>FAQ chat for Pascualinga</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.headerBtn} onPress={resetChat} activeOpacity={0.85}>
            <Feather name="rotate-ccw" size={16} color={THEME_ORANGE} />
            <Text style={styles.headerBtnText}>Reset</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={THEME_ORANGE} />
            <Text style={styles.loadingText}>Loading assistant…</Text>
          </View>
        ) : (
          <FlatList
            ref={flatRef}
            data={messagesReversed}
            keyExtractor={keyExtractor}
            renderItem={renderMessage}
            inverted
            removeClippedSubviews={Platform.OS === 'android'}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        <View style={[styles.bottom, { marginBottom: TAB_BAR_OVERLAY, paddingBottom: 12 + (insets?.bottom || 0) }]}>
          {!!replyChips.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces={false}
              alwaysBounceHorizontal={false}
              overScrollMode="never"
              nestedScrollEnabled
              style={styles.replyScroll}
              contentContainerStyle={styles.replyRow}
            >
              {replyChips.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.replyChip}
                  onPress={() => send(c.label, true)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.replyChipText}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.composer}>
            <View style={styles.inputWrap}>
              <Feather name="message-square" size={16} color="#94a3b8" />
              <TextInput
                ref={inputRef}
                value={input}
                onChangeText={setInput}
                placeholder="Type your question..."
                placeholderTextColor="#9ca3af"
                style={styles.input}
                autoCorrect={false}
                autoCapitalize="sentences"
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                underlineColorAndroid="transparent"
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={(e) => {
                  const text = e?.nativeEvent?.text != null ? e.nativeEvent.text : inputRef.current?.value ?? input;
                  send(`${text || ''}`, false);
                }}
              />
              {!!input.trim() ? (
                <TouchableOpacity onPress={() => { setInput(''); try { inputRef.current?.clear?.(); } catch (_) {} }} activeOpacity={0.85} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name="x" size={16} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() || botTypingRef.current ? styles.sendBtnDisabled : null]}
              disabled={!input.trim() || botTypingRef.current}
              onPress={() => {
                const text = typeof inputRef.current?.value === 'string' ? inputRef.current.value : input;
                send(`${text || ''}`, false);
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  headerSubtitle: { fontSize: 12, fontWeight: '700', color: '#64748b', marginTop: 1 },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFAF0',
    borderWidth: 1,
    borderColor: '#FDE7C3',
  },
  headerBtnText: { color: '#DA7705', fontWeight: '900', fontSize: 12 },
  listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  loadingText: { fontSize: 13, fontWeight: '800', color: '#64748b' },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, gap: 8 },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowBot: { justifyContent: 'flex-start' },
  botAvatar: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: '#DA7705',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16 },
  botBubble: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  userBubble: { backgroundColor: '#DA7705', borderWidth: 1, borderColor: '#c2410c' },
  bubbleText: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  botText: { color: '#0f172a' },
  userText: { color: '#fff' },
  bottom: { paddingHorizontal: 16, paddingBottom: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fff' },
  replyScroll: { maxHeight: 52 },
  replyRow: { paddingVertical: 10, gap: 8, paddingRight: 28, alignItems: 'center' },
  replyChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignSelf: 'flex-start',
  },
  replyChipText: { fontSize: 12, fontWeight: '900', color: '#0f172a' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  input: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0f172a', paddingVertical: 0 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#DA7705',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.45 },
});
