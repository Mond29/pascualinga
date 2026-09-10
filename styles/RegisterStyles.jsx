import { StyleSheet, Platform, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

const RegisterStyle = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },

  scrollContent: {
    paddingVertical: 40,
    paddingHorizontal: 20,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 35,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: 30,
  },

  welcomeMessage: {
    color: '#1E293B',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },

  welcomeSubtitleMessage: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 35,
    fontWeight: '500',
    paddingHorizontal: 10,
  },

  backButton: {
    marginTop: Platform.OS === 'ios' ? 10 : 20,
    marginBottom: 10,
    width: 45,
    height: 45,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  sectionTitle: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '800',
    marginBottom: 15,
    marginTop: 5,
    textTransform: 'uppercase',
    letterSpacing: 1,
    borderLeftWidth: 4,
    borderLeftColor: '#DA7705',
    paddingLeft: 10,
  },

  label: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 8,
    marginLeft: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    height: 56,
    paddingHorizontal: 16,
    marginBottom: 18,
  },

  inputErrorBorder: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },

  inputIcon: {
    marginRight: 12,
  },

  pillInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '500',
  },

  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },

  birthdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 18,
  },

  birthdayDropdownWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    height: 56,
    paddingHorizontal: 12,
  },

  // Address Section Dropdowns
  dropdown: {
    flex: 1,
    height: '100%',
    color: '#1E293B',
    paddingHorizontal: 0,
  },

  placeholderStyle: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
  },

  selectedTextStyle: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '500',
  },

  itemTextStyle: {
    fontSize: 14,
    color: '#1E293B',
  },

  containerStyle: {
    borderRadius: 12,
    marginTop: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },

  iconStyle: {
    width: 18,
    height: 18,
    tintColor: '#64748B',
  },

  inputSearchStyle: {
    height: 40,
    fontSize: 15,
    borderRadius: 10,
    color: '#1E293B',
  },

  errorText: {
    color: '#EF4444',
    fontSize: 11,
    marginTop: -14,
    marginBottom: 12,
    marginLeft: 4,
    fontWeight: '600',
  },

  sexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 18,
  },

  sexChip: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  sexChipSelected: {
    backgroundColor: '#FFF7ED',
    borderColor: '#DA7705',
  },

  sexChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 1,
  },

  sexChipTextSelected: {
    color: '#DA7705',
  },

  registerButton: {
    backgroundColor: '#DA7705',
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#DA7705',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // --- Data Privacy Modal Styles ---
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.8)', // Darker overlay
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    width: '90%',
    maxHeight: '80%',
    borderRadius: 25,
    padding: 25,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.2,
    shadowRadius: 25,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 20,
    textAlign: 'center',
  },
  privacyText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 15,
    textAlign: 'justify',
  },
  agreeButton: {
    backgroundColor: '#DA7705',
    paddingVertical: 16,
    borderRadius: 15,
    marginTop: 20,
    alignItems: 'center',
    shadowColor: '#DA7705',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  declineButton: {
    paddingVertical: 14,
    marginTop: 10,
    alignItems: 'center',
  },
  declineText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default RegisterStyle;
