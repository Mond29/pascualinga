import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  Modal, 
  Alert, 
  FlatList,
  ActivityIndicator 
} from 'react-native';
import OverallWardsScreenStyles from '../../styles/NurseStyles/OverallWardsScreenStyles';
import { supabase } from '../../lib/supabase';

const WARD_TABLE_CANDIDATES = [
  'ward_occupancy',
  'Ward_Occupancy',
  'Ward_occupancy',
  'wardOccupancy',
  'WardOccupancy',
  'wardoccupancy',
];

let cachedWardTableName = null;
let wardTableProbePromise = null;

const formatRoomLabel = (wardNumber) => {
  const num = typeof wardNumber === 'number' ? wardNumber : Number(wardNumber);
  if (Number.isFinite(num) && num === 100) return 'Ward';
  if (Number.isFinite(num)) return `Private Room ${num}`;
  return 'Room';
};

export default function OverallWardsScreen() {
  const [wards, setWards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [wardTableMissing, setWardTableMissing] = useState(false);

  const [wardNumber, setWardNumber] = useState('');
  const [patientName, setPatientName] = useState('');
  const [diagnosed, setDiagnosed] = useState('');
  const [status, setStatus] = useState('Available');

  
  // Load data on start
  useEffect(() => {
    fetchWards();
  }, []);

  
  const ensureWardTableName = async () => {
    if (cachedWardTableName) return cachedWardTableName;
    if (wardTableProbePromise) return await wardTableProbePromise;

    wardTableProbePromise = (async () => {
      for (const candidate of WARD_TABLE_CANDIDATES) {
        const res = await supabase.from(candidate).select('id').limit(1);
        if (!res.error) return candidate;
        if (res.error?.code !== 'PGRST205') return candidate;
      }
      return null;
    })();

    const resolved = await wardTableProbePromise;
    wardTableProbePromise = null;
    cachedWardTableName = resolved;
    setWardTableMissing(!resolved);
    return resolved;
  };

  const fetchWards = async () => {
    setLoading(true);
    const resolvedWardTable = await ensureWardTableName();
    if (!resolvedWardTable) {
      setWards([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from(resolvedWardTable)
      .select('*')
      .order('ward', { ascending: true });

    if (error) {
      Alert.alert('Error', 'Could not fetch ward data');
      console.error(error);
      setWardTableMissing(true);
    } else {
      setWards(data);
      setWardTableMissing(false);
    }
    setLoading(false);
  };
  

  const openWardDetails = (wardItem) => {
    if (!wardItem) return;
    setWardNumber(wardItem.ward?.toString?.() || `${wardItem.ward || ''}`.trim());
    setPatientName(`${wardItem.patient_name || ''}`.trim());
    setDiagnosed(`${wardItem.diagnosed || ''}`.trim());
    setStatus(`${wardItem.status || 'Available'}`.trim());
    setModalVisible(true);
  };

  const getStatusBadgeStyle = (rawStatus) => {
    const s = `${rawStatus || ''}`.trim().toLowerCase();
    if (s.includes('available')) return { backgroundColor: '#dcfce7', borderColor: '#86efac', color: '#166534' };
    if (s.includes('occupied')) return { backgroundColor: '#fee2e2', borderColor: '#fecaca', color: '#991b1b' };
    if (s.includes('clean')) return { backgroundColor: '#fef9c3', borderColor: '#fde68a', color: '#854d0e' };
    return { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0', color: '#0f172a' };
  };

  const renderHeader = () => (
    <View style={OverallWardsScreenStyles.tableHeaderRow}>
      <View style={OverallWardsScreenStyles.colRoom}>
        <Text style={OverallWardsScreenStyles.headerText}>Room</Text>
      </View>
      <View style={OverallWardsScreenStyles.colStatus}>
        <Text style={OverallWardsScreenStyles.headerText}>Status</Text>
      </View>
      <View style={OverallWardsScreenStyles.colPatient}>
        <Text style={OverallWardsScreenStyles.headerText}>Patient</Text>
      </View>
      <View style={OverallWardsScreenStyles.colDx}>
        <Text style={OverallWardsScreenStyles.headerText}>Dx</Text>
      </View>
    </View>
  );

  const renderRow = ({ item }) => {
    const statusStyle = getStatusBadgeStyle(item?.status);
    const patient = `${item?.patient_name || ''}`.trim();
    const dx = `${item?.diagnosed || ''}`.trim();
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => openWardDetails(item)}
        style={OverallWardsScreenStyles.tableRow}
      >
        <View style={OverallWardsScreenStyles.colRoom}>
          <Text style={OverallWardsScreenStyles.cellText} numberOfLines={1}>
            {formatRoomLabel(item?.ward)}
          </Text>
        </View>

        <View style={OverallWardsScreenStyles.colStatus}>
          <View style={[OverallWardsScreenStyles.statusBadge, { backgroundColor: statusStyle.backgroundColor, borderColor: statusStyle.borderColor }]}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: statusStyle.color }} numberOfLines={1}>
              {`${item?.status || 'N/A'}`.trim() || 'N/A'}
            </Text>
          </View>
        </View>

        <View style={OverallWardsScreenStyles.colPatient}>
          <Text style={patient ? OverallWardsScreenStyles.cellText : OverallWardsScreenStyles.mutedText} numberOfLines={1}>
            {patient || '—'}
          </Text>
        </View>

        <View style={OverallWardsScreenStyles.colDx}>
          <Text style={dx ? OverallWardsScreenStyles.cellText : OverallWardsScreenStyles.mutedText} numberOfLines={1}>
            {dx || '—'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={OverallWardsScreenStyles.container}>
      <View style={OverallWardsScreenStyles.BigContainer}>
        <Text style={OverallWardsScreenStyles.title}>Ward Occupancy</Text>
        <Text style={OverallWardsScreenStyles.subtitle}>
          Private Rooms: 1-25 • Ward: 100
        </Text>
        {wardTableMissing && (
          <Text style={{ color: '#b45309', marginBottom: 12, textAlign: 'center' }}>
            Ward table not found in database. Create the ward table in Supabase first.
          </Text>
        )}

        {loading ? (
          <ActivityIndicator size="large" color="#743F02" />
        ) : (
          <View style={OverallWardsScreenStyles.tableWrap}>
            {renderHeader()}
            <FlatList
              data={wards}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderRow}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={OverallWardsScreenStyles.emptyState}>
                  <Text style={OverallWardsScreenStyles.mutedText}>No wards found.</Text>
                </View>
              }
            />
          </View>
        )}
      </View>

      {/* --- POP-UP MODAL --- */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 20 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 20, shadowColor: '#000', elevation: 10 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 20, color: '#743F02', textAlign: 'center' }}>
              Ward Details
            </Text>
            <View style={{ gap: 10 }}>
              <View>
                <Text style={{ fontWeight: 'bold', color: '#555' }}>Ward / Room</Text>
                <Text style={{ color: '#111827', marginTop: 4 }}>{formatRoomLabel(wardNumber)}</Text>
              </View>

              <View>
                <Text style={{ fontWeight: 'bold', color: '#555' }}>Status</Text>
                <Text style={{ color: '#111827', marginTop: 4 }}>{status || 'N/A'}</Text>
              </View>

              {status !== 'Available' ? (
                <>
                  <View>
                    <Text style={{ fontWeight: 'bold', color: '#555' }}>Patient Name</Text>
                    <Text style={{ color: '#111827', marginTop: 4 }}>{patientName || 'N/A'}</Text>
                  </View>
                  <View>
                    <Text style={{ fontWeight: 'bold', color: '#555' }}>Diagnosis</Text>
                    <Text style={{ color: '#111827', marginTop: 4 }}>{diagnosed || 'N/A'}</Text>
                  </View>
                </>
              ) : null}
            </View>

            <View style={{ alignItems: 'center', marginTop: 25 }}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={{ backgroundColor: '#743F02', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 15 }}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
