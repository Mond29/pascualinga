import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Linking } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Laboratory() {
  const navigation = useNavigation();
  const route = useRoute();
  const { doc } = route.params || {};

  const title = `${doc?.name || doc?.title || ''}`.trim() || 'Laboratory Result';
  const dateLabel = `${doc?.date || doc?.resultDate || ''}`.trim() || '—';
  const status = `${doc?.status || doc?.verificationStatus || ''}`.trim() || '—';
  const urlFromDoc = `${doc?.url || doc?.pdfUrl || doc?.fileUrl || doc?.link || ''}`.trim();
  const raw = doc?.raw || null;
  const labResultId = `${doc?.labResultId || doc?.id || raw?.id || raw?.lab_result_id || raw?.result_id || ''}`.trim();

  const resolvePdfUrl = useCallback((payload) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    const pRaw = p?.raw && typeof p.raw === 'object' ? p.raw : {};
    const meta = p?.meta && typeof p.meta === 'object' ? p.meta : {};
    const picked =
      p?.url ||
      p?.pdfUrl ||
      p?.fileUrl ||
      p?.file_url ||
      p?.pdf_url ||
      p?.public_url ||
      p?.publicUrl ||
      p?.link ||
      p?.signed_url ||
      p?.signedUrl ||
      pRaw?.url ||
      pRaw?.pdfUrl ||
      pRaw?.fileUrl ||
      pRaw?.file_url ||
      pRaw?.pdf_url ||
      pRaw?.public_url ||
      pRaw?.publicUrl ||
      pRaw?.link ||
      pRaw?.signed_url ||
      pRaw?.signedUrl ||
      pRaw?.attachment_url ||
      pRaw?.attachmentUrl ||
      pRaw?.storage_url ||
      pRaw?.storageUrl ||
      pRaw?.result_url ||
      pRaw?.resultUrl ||
      meta?.url ||
      meta?.pdfUrl ||
      meta?.fileUrl ||
      '';
    return `${picked || ''}`.trim();
  }, []);

  const initialUrl = useMemo(() => resolvePdfUrl({ ...doc, raw }), [doc, raw, resolvePdfUrl]);
  const [resolvedUrl, setResolvedUrl] = useState(initialUrl);
  const [resolving, setResolving] = useState(false);
  const [resolvedOnce, setResolvedOnce] = useState(false);

  const getApiBaseUrl = useCallback(() => {
    const rawBase = `${process.env.EXPO_PUBLIC_API_BASE_URL || ''}`.trim();
    return rawBase ? rawBase.replace(/\/+$/, '') : '';
  }, []);

  const safeJsonParse = useCallback((text) => {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }, []);

  const fetchLatestLabResult = useCallback(async () => {
    const base = getApiBaseUrl();
    if (!base || !labResultId) return null;

    const email = `${(await AsyncStorage.getItem('userEmail')) || ''}`.trim().toLowerCase();
    const patientId = `${(await AsyncStorage.getItem(`patientId:${email}`)) || ''}`.trim();
    const name = `${(await AsyncStorage.getItem(`userName:${email}`)) || ''}`.trim();

    const url = `${base}/api/lab-results/mine?take=200`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-user-role': 'patient',
        ...(email ? { 'x-user-email': email } : {}),
        ...(name ? { 'x-user-name': name } : {}),
        ...(patientId ? { 'x-patient-id': patientId } : {}),
      },
    });

    const text = await res.text().catch(() => '');
    const parsed = safeJsonParse(text);
    if (!res.ok) {
      const msg = parsed?.message || parsed?.error || text || `HTTP ${res.status}`;
      throw new Error(`${msg}`.trim());
    }

    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];
    const match = list.find((r) => {
      if (!r) return false;
      const id1 = `${r?.id || ''}`.trim();
      const id2 = `${r?.lab_result_id || ''}`.trim();
      const id3 = `${r?.result_id || ''}`.trim();
      return id1 === labResultId || id2 === labResultId || id3 === labResultId;
    });
    return match || null;
  }, [getApiBaseUrl, labResultId, safeJsonParse]);

  const ensurePdfUrl = useCallback(async () => {
    const current = `${resolvedUrl || ''}`.trim();
    if (current) return current;
    if (!labResultId) return '';
    if (resolving) return '';

    try {
      setResolving(true);
      const fresh = await fetchLatestLabResult();
      const next = resolvePdfUrl({ raw: fresh || {} });
      setResolvedUrl(next);
      setResolvedOnce(true);
      return next;
    } finally {
      setResolving(false);
    }
  }, [fetchLatestLabResult, labResultId, resolvePdfUrl, resolvedOnce, resolvedUrl, resolving]);

  const openPdf = async () => {
    const url = await ensurePdfUrl();
    if (!url) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        const keys = raw && typeof raw === 'object' ? Object.keys(raw) : [];
        Alert.alert('No PDF URL', `URL is empty.\n\nraw keys:\n${keys.join(', ') || '(none)'}`);
        return;
      }
      Alert.alert('Unavailable', 'No PDF is attached to this result yet.');
      return;
    }

    try {
      await Linking.openURL(url);
    } catch (_) {
      Alert.alert('Error', 'Unable to open the PDF link.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Laboratory Result</Text>
        <TouchableOpacity style={styles.downloadButton} onPress={openPdf} activeOpacity={0.85}>
          <Feather name="download" size={20} color="#DA7705" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* DOCUMENT INFO */}
        <View style={styles.infoCard}>
          <View style={styles.docIconLarge}>
            <MaterialCommunityIcons name="test-tube" size={40} color="#DA7705" />
          </View>
          <Text style={styles.docName}>{title}</Text>
          <Text style={styles.docSub}>Laboratory • {dateLabel}</Text>

          <View style={[styles.statusPill, status === 'Available' ? styles.statusPillOk : status === 'Under review' ? styles.statusPillReview : styles.statusPillNeutral]}>
            <Text style={[styles.statusPillText, status === 'Available' ? styles.statusPillTextOk : status === 'Under review' ? styles.statusPillTextReview : styles.statusPillTextNeutral]}>
              {status}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={openPdf} activeOpacity={0.9} disabled={resolving}>
          {resolving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="file-text" size={20} color="#fff" />
          )}
          <Text style={styles.primaryBtnText}>{resolving ? 'Finding PDF…' : 'Download as PDF'}</Text>
        </TouchableOpacity>

        {/* ACTIONS */}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  backButton: { padding: 5 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  downloadButton: { padding: 8, backgroundColor: '#FFFAF0', borderRadius: 10 },
  scrollContent: { padding: 20 },
  infoCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 25,
    padding: 25,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    elevation: 3,
    shadowColor: '#DA7705',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  docIconLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFAF0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  docName: { fontSize: 20, fontWeight: 'bold', color: '#333', textAlign: 'center' },
  docSub: { fontSize: 14, color: '#888', marginTop: 5 },

  statusPill: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  statusPillNeutral: { backgroundColor: '#f1f5f9' },
  statusPillOk: { backgroundColor: '#F0FDF4' },
  statusPillReview: { backgroundColor: '#FFFAF0' },
  statusPillText: { fontSize: 12, fontWeight: '800' },
  statusPillTextNeutral: { color: '#64748b' },
  statusPillTextOk: { color: '#16a34a' },
  statusPillTextReview: { color: '#b45309' },

  primaryBtn: {
    backgroundColor: '#DA7705',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 15,
    shadowColor: '#DA7705',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
    marginBottom: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginLeft: 10 },

});
