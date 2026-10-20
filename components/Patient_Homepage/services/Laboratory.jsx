import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Linking, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+\-.]*):/;
const HTTPS_RE = /^https?:\/\//i;
const URL_FLAT_KEYS = [
  'pdfUrl', 'fileUrl', 'file_url', 'pdf_url',
  'public_url', 'publicUrl', 'download_url', 'downloadUrl',
  'signed_url', 'signedUrl', 'attachment_url', 'attachmentUrl',
  'storage_url', 'storageUrl', 'result_url', 'resultUrl',
  'document_url', 'documentUrl',
  'link', 'url',
];
const FORBIDDEN_PREFIXES = ['lab-storage:', 'lab-local:', 'storage-local:', 'internal:', 'db:', 'storage:'];

const safeJsonParse = (text) => {
  try { return text ? JSON.parse(text) : null; } catch (_) { return null; }
};

const isHttpLike = (s) => typeof s === 'string' && HTTPS_RE.test(`${s || ''}`.trim());

const isForbidden = (s) => {
  if (!s || typeof s !== 'string') return true;
  const t = `${s}`.trim().toLowerCase();
  for (const bad of FORBIDDEN_PREFIXES) if (t.startsWith(bad)) return true;
  return false;
};

const pickHttpsUrl = (obj) => {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of URL_FLAT_KEYS) {
    const v = obj[k];
    if (isHttpLike(v)) return `${v}`.trim();
  }
  if (obj.url && typeof obj.url === 'object') {
    for (const k of ['signedUrl', 'publicUrl', 'downloadUrl', 'fileUrl', 'pdfUrl', 'url', 'href']) {
      if (isHttpLike(obj.url[k])) return `${obj.url[k]}`.trim();
    }
  }
  return '';
};

const extractHttpsUrl = (root) => {
  if (!root || typeof root !== 'object') return '';
  const p = root && typeof root === 'object' ? root : {};
  const pRaw = p?.raw && typeof p.raw === 'object' ? p.raw : {};
  const pNormRaw = p?.normalizedRaw && typeof p.normalizedRaw === 'object' ? p.normalizedRaw : {};
  const meta = p?.meta && typeof p.meta === 'object' ? p.meta : {};
  const nestedKeys = ['file', 'files', 'pdf', 'document', 'attachment', 'result', 'record', 'storage', 'media', 'asset', 'metadata', 'meta', 'raw', 'normalizedRaw', 'data'];
  const candidates = [p, pRaw, pNormRaw, meta];
  for (const c of candidates) {
    let r = pickHttpsUrl(c);
    if (r) return r;
    for (const n of nestedKeys) {
      const nest = c?.[n];
      if (Array.isArray(nest)) {
        for (const item of nest) {
          const r2 = pickHttpsUrl(item);
          if (r2) return r2;
        }
      } else {
        const r2 = pickHttpsUrl(nest);
        if (r2) return r2;
        if (isHttpLike(nest)) return `${nest}`.trim();
      }
    }
    if (Array.isArray(c?.files) && c.files[0]) {
      const r3 = pickHttpsUrl(c.files[0]);
      if (r3) return r3;
    }
    if (Array.isArray(c?.attachments) && c.attachments[0]) {
      const r4 = pickHttpsUrl(c.attachments[0]);
      if (r4) return r4;
    }
    for (const [, v] of Object.entries(c)) {
      if (isHttpLike(v)) return `${v}`.trim();
      if (v && typeof v === 'object') {
        const r5 = pickHttpsUrl(v);
        if (r5) return r5;
      }
    }
  }
  return '';
};

const sanitizeFilename = (raw) => {
  const s = `${raw || ''}`.trim().replace(/\s+/g, '_');
  return s.replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 60) || 'lab_result';
};

const safeUrlPreview = (url) => {
  if (!url) return '';
  return `${url || ''}`.replace(/(\/mobile\/)[^/]+(\/[^/]+\.pdf)/i, '$1{signed-token}$2');
};

export default function Laboratory() {
  const navigation = useNavigation();
  const route = useRoute();
  const { doc } = route.params || {};

  const title = `${doc?.name || doc?.title || ''}`.trim() || 'Laboratory Result';
  const dateLabel = `${doc?.date || doc?.resultDate || ''}`.trim() || '—';
  const status = `${doc?.status || doc?.verificationStatus || ''}`.trim() || '—';
  const labResultId = `${doc?.labResultId || ''}`.trim();

  const initialUrl = useMemo(() => {
    const httpsFromDoc = extractHttpsUrl(doc || {});
    if (httpsFromDoc) return httpsFromDoc;
    return '';
  }, [doc]);

  const [resolvedUrl, setResolvedUrl] = useState(initialUrl);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[Lab:init] Laboratory screen opened with doc keys:', {
      labResultId,
      urlPreview: safeUrlPreview(initialUrl),
      hasRaw: Boolean(doc?.raw),
      hasNormalizedRaw: Boolean(doc?.normalizedRaw),
      docFields: doc && typeof doc === 'object' ? Object.keys(doc).filter(k => k !== 'raw' && k !== 'normalizedRaw').join(', ') : '',
      urlFieldValues: {
        url: safeUrlPreview(doc?.url),
        pdfUrl: safeUrlPreview(doc?.pdfUrl),
        fileUrl: safeUrlPreview(doc?.fileUrl),
        signedUrl: safeUrlPreview(doc?.signedUrl || doc?.signed_url),
        publicUrl: safeUrlPreview(doc?.publicUrl || doc?.public_url),
      },
      pdfUrlSource: doc?.pdfUrlSource || '',
    });
    if (doc?.triggerDirectDownload) {
      // If opened from Download as PDF button: start immediately
      const t = setTimeout(() => openPdf().catch(() => {}), 150);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPdf = useCallback(async () => {
    setResolving(true);
    try {
      // ===== RULE 1 (per latest backend spec): NO FRESH GET /api/lab-results/{id} call =====
      // The signed HTTPS PDF URL is already returned in the /mine Records list API response.
      // We ONLY use the URL from doc params (fields: url, pdfUrl, fileUrl, signed_url, raw etc.)
      // NO Authorization header is needed for the signed PDF URL itself.
      const targetUrl = extractHttpsUrl(doc || {});

      // eslint-disable-next-line no-console
      console.log('[Lab:download] Extracting signed PDF URL from Records list passed doc:', {
        labResultId,
        foundHttpUrl: isHttpLike(targetUrl),
        urlPreview: safeUrlPreview(targetUrl),
      });

      if (!targetUrl || !isHttpLike(targetUrl)) {
        // Show exact debug info to user so they can send to backend team
        const allFlatKeys = doc && typeof doc === 'object' ? Object.keys(doc).filter(k => k !== 'raw' && k !== 'normalizedRaw') : [];
        const rawKeys = doc?.raw && typeof doc.raw === 'object' ? Object.keys(doc.raw).slice(0, 30) : [];
        const badPrefixes = [];
        for (const k of URL_FLAT_KEYS) {
          const v = doc?.[k];
          if (typeof v === 'string' && isForbidden(v)) badPrefixes.push(`${k}=${v.slice(0, 60)}`);
        }
        if (doc?.raw && typeof doc.raw === 'object') {
          for (const k of URL_FLAT_KEYS) {
            const v = doc.raw[k];
            if (typeof v === 'string' && isForbidden(v)) badPrefixes.push(`raw.${k}=${v.slice(0, 60)}`);
          }
        }
        const lines = [];
        lines.push(`Lab Result ID: ${labResultId || 'n/a'}`);
        lines.push('');
        lines.push('Backend Records list did not include a signed HTTPS PDF URL for this result.');
        lines.push('Expected: backend /api/lab-results/mine must return fields: url, pdfUrl, fileUrl, signed_url, or pdf_url as HTTPS like https://api.pascualinga.com/api/lab-results/file/mobile/{signed-token}/22.pdf');
        lines.push('');
        lines.push(`Scanned document fields: ${allFlatKeys.join(', ') || '(none)'}`);
        if (rawKeys.length) lines.push(`Raw API JSON keys: ${rawKeys.join(', ')}`);
        if (badPrefixes.length) lines.push(`\n⚠ Non-HTTPS internal refs found (NOT usable — backend must convert these first):\n${badPrefixes.join('\n')}`);
        Alert.alert('PDF Not Available', lines.join('\n'));
        return;
      }

      // ===== RULE 2 (per latest backend spec): Download exact URL via FileSystem → Share local =====
      // eslint-disable-next-line no-console
      console.log('[Lab:download] Starting FileSystem download for signed PDF URL:', {
        urlPreview: safeUrlPreview(targetUrl),
        cacheDir: FileSystem?.cacheDirectory || '(no cacheDir)',
      });

      setResolvedUrl(targetUrl);
      const titleForFile = sanitizeFilename(title);
      const ts = Math.floor(Date.now() / 1000);
      const filename = `${titleForFile || 'lab_result'}_ID${labResultId || ''}_${ts}.pdf`;
      const cacheDir = `${FileSystem?.cacheDirectory || ''}`.trim().replace(/\/+$/, '') + '/';
      const localDest = `${cacheDir}${filename}`;

      let downloadResult = null;
      let downloadError = null;
      try {
        // Signed URL contains embedded token in path — NO extra Authorization headers.
        downloadResult = await FileSystem.downloadAsync(targetUrl, localDest, {
          headers: { Accept: 'application/pdf,*/*' },
        });
      } catch (e) {
        downloadError = e;
        // eslint-disable-next-line no-console
        console.log('[Lab:download] FileSystem download threw (falling back to browser):', {
          message: e?.message || String(e || ''),
        });
      }

      if (downloadResult && downloadResult.status === 200 && downloadResult.uri) {
        const ct = (downloadResult.headers && (downloadResult.headers['Content-Type'] || downloadResult.headers['content-type'])) || '';
        const fileSize = typeof downloadResult.totalBytesWritten === 'number' ? downloadResult.totalBytesWritten : (typeof downloadResult.size === 'number' ? downloadResult.size : 0);
        let fileInfoSize = 0;
        try {
          const fi = await FileSystem.getInfoAsync(downloadResult.uri).catch(() => null);
          if (fi && typeof fi.size === 'number') fileInfoSize = fi.size;
        } catch (_) {}
        const finalSize = fileInfoSize || fileSize;
        // eslint-disable-next-line no-console
        console.log('[Forensics: lab:download:success]', {
          labResultId,
          httpStatus: downloadResult.status,
          contentType: ct,
          isApplicationPdf: ct ? ct.toLowerCase().includes('application/pdf') : 'content-type-missing',
          sizeBytes: finalSize,
          urlPreview: safeUrlPreview(targetUrl),
          note: 'Per backend test criteria: PDF download should return HTTP 200 with Content-Type: application/pdf. Downloaded directly using the signed HTTPS url/pdfUrl from /api/lab-results/mine list response (no reconstruction).',
        });
        if (fileSize > 0 && await Sharing.isAvailableAsync().catch(() => false)) {
          try {
            await Sharing.shareAsync(downloadResult.uri, {
              mimeType: 'application/pdf',
              UTI: 'com.adobe.pdf',
              dialogTitle: 'Open or save laboratory result (PDF)',
            });
            return;
          } catch (shareErr) {
            // eslint-disable-next-line no-console
            console.log('[Lab:download] Sharing.shareAsync failed (falling back to Linking):', { message: shareErr?.message || '' });
          }
        }
        // Sharing not available or failed, try Linking with local file:// as last resort
        try {
          await Linking.openURL(downloadResult.uri);
          return;
        } catch (_) {}
      }

      if (downloadResult && downloadResult.status && downloadResult.status !== 200) {
        const ct = (downloadResult.headers && (downloadResult.headers['Content-Type'] || downloadResult.headers['content-type'])) || '';
        const lines = [];
        lines.push(`Lab Result ID: ${labResultId || 'n/a'}`);
        lines.push(`\nPDF endpoint HTTP status: ${downloadResult.status}`);
        if (ct) lines.push(`Content-Type: ${ct}`);
        lines.push('\nThe signed PDF URL was invalid or has expired.');
        lines.push('Per latest flow: Go back to the Records list and pull/swipe to refresh.');
        lines.push('This will re-fetch /api/lab-results/mine with a valid Supabase session and return fresh signed URLs.');
        lines.push(`\nSigned URL preview: ${safeUrlPreview(targetUrl)}`);
        // eslint-disable-next-line no-console
        console.log('[Forensics: lab:download:expired]', {
          labResultId,
          httpStatus: downloadResult.status,
          contentType: ct,
          urlPreview: safeUrlPreview(targetUrl),
          note: 'Signed URL expired. User must return to Records list to trigger a fresh GET /api/lab-results/mine with valid Supabase session.',
        });
        Alert.alert('Signed URL Expired', lines.join('\n'));
        return;
      }

      // Fallback: if FileSystem download throws (network, Kotlin type error, SDK issue)
      // → revert to browser redirect per user's earlier working preference
      // eslint-disable-next-line no-console
      console.log('[Lab:download] Falling back to browser Linking.openURL() for signed PDF URL');
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try { window.open(targetUrl, '_blank', 'noopener,noreferrer'); return; } catch (_) {}
        }
        await Linking.openURL(targetUrl);
        return;
      } catch (linkErr) {
        Alert.alert(
          'Unable to Open PDF',
          `Could not download or open the PDF.\n\n` +
          `Lab Result ID: ${labResultId || 'n/a'}\n` +
          (downloadError ? `Download error: ${String(downloadError.message || downloadError || '').slice(0, 150)}\n\n` : '') +
          `Signed URL preview: ${safeUrlPreview(targetUrl)}`
        );
      }
    } finally {
      setResolving(false);
    }
  }, [labResultId, doc, title]);

  return (
    <SafeAreaView style={styles.container}>
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
          <Text style={styles.primaryBtnText}>{resolving ? 'Loading PDF…' : 'Download as PDF'}</Text>
        </TouchableOpacity>
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
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#FFFAF0',
    justifyContent: 'center', alignItems: 'center', marginBottom: 15,
  },
  docName: { fontSize: 20, fontWeight: 'bold', color: '#333', textAlign: 'center' },
  docSub: { fontSize: 14, color: '#888', marginTop: 5 },

  statusPill: { marginTop: 14, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
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
