import React, { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert
} from 'react-native'

import { Ionicons, Feather } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useFocusEffect } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import NurseIncidentReportsStyles from '../../styles/NurseStyles/NurseIncidentReports'
import NurseSideMenu from './NurseSideMenu'

export default function NurseIncidentReporting() {

  const [dateValue, setDateValue] = useState(null)
  const [timeValue, setTimeValue] = useState(null)
  const [incidentType, setIncidentType] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [actionTaken, setActionTaken] = useState('')
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)

  // Search, Filter & Pagination
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 5
  const [drawerVisible, setDrawerVisible] = useState(false)

  const toggleDrawer = () => setDrawerVisible(!drawerVisible)

  const formatDateISO = useCallback((d) => {
    if (!d) return ''
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }, [])

  const formatTimeISO = useCallback((d) => {
    if (!d) return ''
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = '00'
    return `${hh}:${mm}:${ss}`
  }, [])

  const dateLabel = useMemo(() => {
    if (!dateValue) return ''
    return dateValue.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })
  }, [dateValue])

  const timeLabel = useMemo(() => {
    if (!timeValue) return ''
    return timeValue.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }, [timeValue])

  const getCurrentEmail = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) return user.email
    } catch {}
    try {
      const email = await AsyncStorage.getItem('userEmail')
      return email || null
    } catch {
      return null
    }
  }, [])

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const email = await getCurrentEmail()
      let query = supabase
        .from('incidents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (email) query = query.eq('created_by_email', email)

      const { data, error } = await query
      if (error) throw error
      setHistory(data || [])
    } catch (e) {
      console.error('Error loading incidents:', e)
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }, [getCurrentEmail])

  useFocusEffect(
    useCallback(() => {
      loadHistory()
    }, [loadHistory])
  )

  const filteredHistory = useMemo(() => {
    let list = [...history]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(item => 
        (item.incident_type || '').toLowerCase().includes(q) ||
        (item.location || '').toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q)
      )
    }

    if (statusFilter !== 'ALL') {
      list = list.filter(item => (item.status || 'submitted').toUpperCase() === statusFilter)
    }

    return list
  }, [history, searchQuery, statusFilter])

  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredHistory.slice(start, start + itemsPerPage)
  }, [filteredHistory, currentPage])

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage)
  const showingStart = filteredHistory.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1
  const showingEnd = Math.min(currentPage * itemsPerPage, filteredHistory.length)

  const validate = useCallback(() => {
    const next = {}

    if (!dateValue) {
      next.date = 'Required'
    } else {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (dateValue < today) {
        next.date = 'Past dates not allowed'
      }
    }

    if (!timeValue) next.time = 'Required'

    if (!incidentType.trim()) next.incidentType = 'Required'
    else if (incidentType.trim().length < 3) next.incidentType = 'Minimum 3 characters'

    if (!location.trim()) next.location = 'Required'
    else if (location.trim().length < 2) next.location = 'Minimum 2 characters'

    if (!description.trim()) next.description = 'Required'
    else if (description.trim().length < 10) next.description = 'Minimum 10 characters'

    if (!actionTaken.trim()) next.actionTaken = 'Required'
    else if (actionTaken.trim().length < 5) next.actionTaken = 'Minimum 5 characters'

    setErrors(next)
    return Object.keys(next).length === 0
  }, [actionTaken, dateValue, description, incidentType, location, timeValue])

  const submitReport = useCallback(async () => {
    if (submitting) return
    if (!validate()) {
      Alert.alert('Required', 'Please complete all fields.')
      return
    }

    setSubmitting(true)
    try {
      const email = await getCurrentEmail()
      if (!email) {
        Alert.alert('Error', 'No logged in account found.')
        return
      }

      const payload = {
        created_by_email: email,
        incident_type: incidentType.trim(),
        incident_date: formatDateISO(dateValue),
        incident_time: formatTimeISO(timeValue),
        location: location.trim(),
        description: description.trim(),
        action_taken: actionTaken.trim(),
        status: 'submitted',
      }

      const { error } = await supabase.from('incidents').insert(payload)
      if (error) throw error

      Alert.alert('Success', 'Incident report submitted.')
      clearForm()
      loadHistory()
    } catch (e) {
      console.error('Error submitting incident:', e)
      Alert.alert('Error', 'Could not submit the report. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [actionTaken, dateValue, description, formatDateISO, formatTimeISO, getCurrentEmail, incidentType, loadHistory, location, submitting, timeValue, validate])

  const clearForm = useCallback(() => {
    setDateValue(null)
    setTimeValue(null)
    setIncidentType('')
    setLocation('')
    setDescription('')
    setActionTaken('')
    setErrors({})
  }, [])

  const handlePickDate = useCallback((event, selected) => {
    setShowDatePicker(false)
    if (event?.type === 'dismissed') return
    if (selected) setDateValue(selected)
  }, [])

  const handlePickTime = useCallback((event, selected) => {
    setShowTimePicker(false)
    if (event?.type === 'dismissed') return
    if (selected) setTimeValue(selected)
  }, [])

  return (

    <SafeAreaView style={NurseIncidentReportsStyles.safeArea}>
      <ScrollView style={NurseIncidentReportsStyles.container} contentContainerStyle={NurseIncidentReportsStyles.contentContainer} keyboardShouldPersistTaps="handled">

        <View style={NurseIncidentReportsStyles.pageHeader}>
          <TouchableOpacity onPress={toggleDrawer} style={{ padding: 5 }}>
            <Feather name="menu" size={24} color="#f97316" />
          </TouchableOpacity>
          <View style={NurseIncidentReportsStyles.pageHeaderLeft}>
            <View style={NurseIncidentReportsStyles.pageIcon}>
              <Ionicons name="document-text" size={18} color="#fff" />
            </View>
            <View>
              <Text style={NurseIncidentReportsStyles.pageTitle}>Incident Reports</Text>
              <Text style={NurseIncidentReportsStyles.pageSubtitle}>Submit and track incidents</Text>
            </View>
          </View>
        </View>

        <View style={NurseIncidentReportsStyles.card}>

          <Text style={NurseIncidentReportsStyles.sectionTitle}>
            Submit Incident Report
          </Text>

          <View style={NurseIncidentReportsStyles.row}>
            <View style={NurseIncidentReportsStyles.col}>
              <Text style={NurseIncidentReportsStyles.label}>
                <Ionicons name="calendar" size={16} color="#f97316" />
                {" "}Date
              </Text>

              <TouchableOpacity
                style={[NurseIncidentReportsStyles.pickerInput, errors.date && NurseIncidentReportsStyles.inputErrorBorder]}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.8}
              >
                <Text style={[NurseIncidentReportsStyles.pickerText, !dateLabel && NurseIncidentReportsStyles.placeholderText]}>
                  {dateLabel || 'Select date'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#94a3b8" />
              </TouchableOpacity>
              {!!errors.date && <Text style={NurseIncidentReportsStyles.errorText}>{errors.date}</Text>}
            </View>

            <View style={NurseIncidentReportsStyles.col}>
              <Text style={NurseIncidentReportsStyles.label}>
                <Ionicons name="time" size={16} color="#f97316" />
                {" "}Time
              </Text>

              <TouchableOpacity
                style={[NurseIncidentReportsStyles.pickerInput, errors.time && NurseIncidentReportsStyles.inputErrorBorder]}
                onPress={() => setShowTimePicker(true)}
                activeOpacity={0.8}
              >
                <Text style={[NurseIncidentReportsStyles.pickerText, !timeLabel && NurseIncidentReportsStyles.placeholderText]}>
                  {timeLabel || 'Select time'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#94a3b8" />
              </TouchableOpacity>
              {!!errors.time && <Text style={NurseIncidentReportsStyles.errorText}>{errors.time}</Text>}
            </View>
          </View>

          <Text style={NurseIncidentReportsStyles.label}>
            <Ionicons name="list" size={16} color="#f97316" />
            {" "}Incident Type
          </Text>
          <TextInput
            style={[NurseIncidentReportsStyles.input, errors.incidentType && NurseIncidentReportsStyles.inputErrorBorder]}
            placeholder="e.g. Slip/Fall, Medication Error, Heat Stroke"
            value={incidentType}
            onChangeText={(v) => {
              setIncidentType(v)
              if (errors.incidentType) setErrors((p) => ({ ...p, incidentType: undefined }))
            }}
            placeholderTextColor="#94a3b8"
          />
          {!!errors.incidentType && <Text style={NurseIncidentReportsStyles.errorText}>{errors.incidentType}</Text>}

          <Text style={NurseIncidentReportsStyles.label}>
            <Ionicons name="location" size={16} color="#f97316" />
            {" "}Location
          </Text>
          <TextInput
            style={[NurseIncidentReportsStyles.input, errors.location && NurseIncidentReportsStyles.inputErrorBorder]}
            placeholder="e.g. Ward 1, ER, Room 203"
            value={location}
            onChangeText={(v) => {
              setLocation(v)
              if (errors.location) setErrors((p) => ({ ...p, location: undefined }))
            }}
            placeholderTextColor="#94a3b8"
          />
          {!!errors.location && <Text style={NurseIncidentReportsStyles.errorText}>{errors.location}</Text>}

          <Text style={NurseIncidentReportsStyles.label}>
            <Ionicons name="document-text-outline" size={16} color="#f97316" />
            {" "}Description
          </Text>
          <TextInput
            style={[NurseIncidentReportsStyles.textArea, errors.description && NurseIncidentReportsStyles.inputErrorBorder]}
            placeholder="Describe what happened..."
            value={description}
            onChangeText={(v) => {
              setDescription(v)
              if (errors.description) setErrors((p) => ({ ...p, description: undefined }))
            }}
            placeholderTextColor="#94a3b8"
            multiline
          />
          {!!errors.description && <Text style={NurseIncidentReportsStyles.errorText}>{errors.description}</Text>}

          <Text style={NurseIncidentReportsStyles.label}>
            <Ionicons name="construct" size={16} color="#f97316" />
            {" "}Action Taken
          </Text>
          <TextInput
            style={[NurseIncidentReportsStyles.textArea, errors.actionTaken && NurseIncidentReportsStyles.inputErrorBorder]}
            placeholder="What immediate action was taken?"
            value={actionTaken}
            onChangeText={(v) => {
              setActionTaken(v)
              if (errors.actionTaken) setErrors((p) => ({ ...p, actionTaken: undefined }))
            }}
            placeholderTextColor="#94a3b8"
            multiline
          />
          {!!errors.actionTaken && <Text style={NurseIncidentReportsStyles.errorText}>{errors.actionTaken}</Text>}

          <View style={NurseIncidentReportsStyles.buttonRow}>

            <TouchableOpacity
              style={[NurseIncidentReportsStyles.clearButton, submitting && NurseIncidentReportsStyles.buttonDisabled]}
              onPress={clearForm}
              disabled={submitting}
            >
              <Ionicons name="refresh" size={18} color="white" />
              <Text style={NurseIncidentReportsStyles.buttonText}> Clear</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[NurseIncidentReportsStyles.submitButton, submitting && NurseIncidentReportsStyles.buttonDisabled]}
              onPress={submitReport}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="send" size={18} color="white" />
              )}
              <Text style={NurseIncidentReportsStyles.buttonText}> Submit</Text>
            </TouchableOpacity>

          </View>

        </View>

        {showDatePicker && (
          <DateTimePicker
            value={dateValue || new Date()}
            mode="date"
            display="calendar"
            minimumDate={new Date()}
            onChange={handlePickDate}
          />
        )}

        {showTimePicker && (
          <DateTimePicker
            value={timeValue || new Date()}
            mode="time"
            display="default"
            onChange={handlePickTime}
          />
        )}

        <View style={NurseIncidentReportsStyles.card}>

          <View style={NurseIncidentReportsStyles.sectionHeaderRow}>
            <Text style={NurseIncidentReportsStyles.sectionTitle}>Report History</Text>
            <TouchableOpacity style={NurseIncidentReportsStyles.refreshIcon} onPress={() => { setCurrentPage(1); loadHistory(); }} activeOpacity={0.8}>
              <Ionicons name="refresh" size={18} color="#f97316" />
            </TouchableOpacity>
          </View>

          {/* Search and Filter UI */}
          <View style={{ marginBottom: 15 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
              <Ionicons name="search" size={18} color="#94a3b8" />
              <TextInput
                style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: '#0f172a', fontSize: 14 }}
                placeholder="Search history..."
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={(t) => { setSearchQuery(t); setCurrentPage(1); }}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setCurrentPage(1); }}>
                  <Ionicons name="close-circle" size={18} color="#cbd5e1" />
                </TouchableOpacity>
              )}
            </View>

            <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
              {['ALL', 'SUBMITTED', 'RESOLVED'].map(f => (
                <TouchableOpacity
                  key={f}
                  onPress={() => { setStatusFilter(f); setCurrentPage(1); }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: statusFilter === f ? '#f97316' : '#f1f5f9',
                    borderWidth: 1,
                    borderColor: statusFilter === f ? '#f97316' : '#e2e8f0'
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: statusFilter === f ? '#fff' : '#64748b' }}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {loadingHistory ? (
            <View style={NurseIncidentReportsStyles.historyLoading}>
              <ActivityIndicator size="small" color="#f97316" />
              <Text style={NurseIncidentReportsStyles.loadingHint}>Loading history...</Text>
            </View>
          ) : filteredHistory.length === 0 ? (
            <View style={NurseIncidentReportsStyles.emptyHistory}>
              <Ionicons name="file-tray-outline" size={28} color="#cbd5e1" />
              <Text style={NurseIncidentReportsStyles.emptyHistoryText}>No reports found.</Text>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '600', marginBottom: 5 }}>
                {`Showing ${showingStart}-${showingEnd} of ${filteredHistory.length}`}
              </Text>
              
              {paginatedHistory.map(item => (
                <View key={item.id} style={NurseIncidentReportsStyles.historyCard}>
                  <View style={NurseIncidentReportsStyles.historyTopRow}>
                    <Text style={NurseIncidentReportsStyles.historyTitle} numberOfLines={1}>{item.incident_type}</Text>
                    <View style={[
                      NurseIncidentReportsStyles.statusBadge,
                      (item.status || 'submitted').toLowerCase() === 'resolved' && { backgroundColor: '#dcfce7' }
                    ]}>
                      <Text style={[
                        NurseIncidentReportsStyles.statusText,
                        (item.status || 'submitted').toLowerCase() === 'resolved' && { color: '#166534' }
                      ]}>
                        {(item.status || 'submitted').toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text style={NurseIncidentReportsStyles.historyMeta}>
                    {item.incident_date} • {item.incident_time}
                  </Text>
                  <Text style={NurseIncidentReportsStyles.historyMeta} numberOfLines={1}>
                    {item.location}
                  </Text>
                  <Text style={NurseIncidentReportsStyles.historyBody} numberOfLines={2}>
                    {item.description}
                  </Text>
                </View>
              ))}

              {/* Pagination Controls - Always visible when there's data */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20, gap: 15, paddingBottom: 10 }}>
                <TouchableOpacity
                  disabled={currentPage === 1}
                  onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
                  style={{ padding: 8, opacity: currentPage === 1 ? 0.2 : 1 }}
                >
                  <Ionicons name="chevron-back" size={24} color="#f97316" />
                </TouchableOpacity>
                
                <View style={{ backgroundColor: '#fff7ed', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#ffedd5' }}>
                  <Text style={{ fontWeight: '800', color: '#9a3412', fontSize: 13 }}>
                    Page {currentPage} of {Math.max(1, totalPages)}
                  </Text>
                </View>

                <TouchableOpacity
                  disabled={currentPage === totalPages || totalPages === 0}
                  onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  style={{ padding: 8, opacity: (currentPage === totalPages || totalPages === 0) ? 0.2 : 1 }}
                >
                  <Ionicons name="chevron-forward" size={24} color="#f97316" />
                </TouchableOpacity>
              </View>
            </>
          )}

        </View>
        <NurseSideMenu visible={drawerVisible} onClose={toggleDrawer} />
      </ScrollView>
    </SafeAreaView>

  )
}
