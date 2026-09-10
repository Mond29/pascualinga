import { StyleSheet } from 'react-native';

const LoginStyle = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },

  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 25,
    paddingHorizontal: 25,
    paddingVertical: 40,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },

  logoContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },

  logo: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
  },

  textSection: {
    alignItems: 'center',
    marginBottom: 35,
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
    fontWeight: '500',
    paddingHorizontal: 20,
  },

  formContainer: {
    width: '100%',
  },

  inputSection: {
    marginBottom: 20,
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

  eyeIcon: {
    padding: 8,
  },

  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '600',
  },

  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginBottom: 25,
  },

  forgotPassword: {
    color: '#DA7705',
    fontSize: 14,
    fontWeight: '700',
  },

  loginButton: {
    backgroundColor: '#DA7705',
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DA7705',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },

  loginButtonLocked: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },

  loginButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  disabledInput: {
    color: '#94A3B8',
  },

  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 35,
  },

  footerText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '500',
  },

  footerLink: {
    color: '#DA7705',
    fontWeight: '800',
    fontSize: 14,
  },

  helpRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },

  helpText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },

  helpLink: {
    color: '#DA7705',
    fontSize: 13,
    fontWeight: '800',
  },
});

export default LoginStyle;
