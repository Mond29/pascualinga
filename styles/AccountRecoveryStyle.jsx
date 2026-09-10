import { StyleSheet, Platform } from 'react-native';

const AccountRecoveryStyles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 25,
  },

  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
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
    zIndex: 10,
  },

  card: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 25,
    paddingVertical: 40,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },

  iconHeader: {
    alignItems: 'center',
    marginBottom: 25,
  },

  title: {
    color: '#1E293B',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 35,
    fontWeight: '500',
    paddingHorizontal: 10,
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
    marginBottom: 20,
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
    fontSize: 16,
    color: '#1E293B',
    fontWeight: '500',
  },

  resendContainer: {
    alignSelf: 'flex-end',
    marginBottom: 30,
  },

  resendText: {
    color: '#DA7705',
    fontSize: 14,
    fontWeight: '700',
  },

  submitButton: {
    backgroundColor: '#DA7705',
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DA7705',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  submitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: -15,
    marginBottom: 15,
    marginLeft: 4,
    fontWeight: '600',
  },
});

export default AccountRecoveryStyles;
