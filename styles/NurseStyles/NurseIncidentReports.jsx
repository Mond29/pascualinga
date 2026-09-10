import { StyleSheet } from 'react-native'

const NurseIncidentReportsStyles = StyleSheet.create({

  safeArea: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },

  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },

  contentContainer: {
    paddingBottom: 110,
  },

  pageHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },

  pageHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  pageIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f97316',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },

  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },

  pageSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748b',
  },

  card: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f97316',
    marginBottom: 10,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  refreshIcon: {
    padding: 6,
  },

  label: {
    marginTop: 10,
    marginBottom: 5,
    fontWeight: '700',
    color: '#0f172a',
  },

  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 12,
    color: '#0f172a',
  },

  textArea: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 12,
    height: 90,
    textAlignVertical: 'top',
    color: '#0f172a',
  },

  row: {
    flexDirection: 'row',
    gap: 10,
  },

  col: {
    flex: 1,
  },

  pickerInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  pickerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },

  placeholderText: {
    color: '#94a3b8',
    fontWeight: '500',
  },

  inputErrorBorder: {
    borderColor: '#ef4444',
  },

  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 15,
    gap: 10,
  },

  submitButton: {
    backgroundColor: "#f97316",
    padding: 12,
    borderRadius: 12,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: 'center',
    gap: 8,
  },

  clearButton: {
    backgroundColor: "#94a3b8",
    padding: 12,
    borderRadius: 12,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: 'center',
    gap: 8,
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  buttonText: {
    color: "white",
    fontWeight: "800",
  },

  historyCard: {
    backgroundColor: '#fff7ed',
    padding: 12,
    marginTop: 10,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#f97316',
  },

  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  historyTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },

  statusBadge: {
    backgroundColor: '#ffedd5',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },

  statusText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#9a3412',
  },

  historyMeta: {
    marginTop: 6,
    fontSize: 12,
    color: '#64748b',
  },

  historyBody: {
    marginTop: 6,
    fontSize: 13,
    color: '#0f172a',
  },

  historyLoading: {
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
  },

  loadingHint: {
    fontSize: 12,
    color: '#64748b',
  },

  emptyHistory: {
    paddingVertical: 18,
    alignItems: 'center',
  },

  emptyHistoryText: {
    marginTop: 8,
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600',
  },

  errorText: {
    marginTop: 6,
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '600',
  },

})

export default NurseIncidentReportsStyles;
