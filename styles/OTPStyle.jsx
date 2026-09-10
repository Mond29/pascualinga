import { StyleSheet } from 'react-native';

const OTPStyle = StyleSheet.create({
  mainContainer: {
    flex: 1,
    justifyContent: 'center',
  },

  backButton: {
    position: 'absolute',
    top: 55,
    left: 20,
    backgroundColor: '#DA7705',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },

  backText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },

  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    padding: 25,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },

  title: {
    color: '#DA7705',
    fontSize: 38,
    fontWeight: 'bold',
    marginBottom: 5,
  },

  subtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 25,
  },

  InputBoxContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },

  OTPBoxes: {
    width: 58,
    height: 58,
    marginHorizontal: 6,
    borderWidth: 2,
    borderRadius: 12,
    fontSize: 20,
    fontWeight: 'bold',
    borderColor: '#DA7705',
    backgroundColor: '#FFFFFF',
  },

  disabledBox: {
    backgroundColor: '#F2F2F2',
    color: '#999',
  },

  timerText: {
    textAlign: 'center',
    color: '#555',
    marginTop: 10,
  },

  resendText: {
    textAlign: 'center',
    marginTop: 10,
    color: '#DA7705',
    fontWeight: 'bold',
  },
});

export default OTPStyle;
