import { StyleSheet } from 'react-native';

const GetStartedStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 90,
  },

  headerRow: {
    alignItems: 'flex-end',
    paddingHorizontal: 2,
    paddingTop: 6,
    paddingBottom: 12,
  },

  skipText: {
    color: '#DA7705',
    fontSize: 14,
    fontWeight: '800',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingVertical: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 10,
  },

  logoContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },

  image: {
    width: 220,
    height: 220,
    resizeMode: 'contain',
  },

  mainTitle: {
    color: '#1E293B',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },

  subTitle: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },

  bulletList: {
    marginTop: 16,
    gap: 10,
  },

  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DA7705',
    marginRight: 10,
  },

  bulletText: {
    flex: 1,
    color: '#334155',
    fontSize: 14,
    fontWeight: '600',
  },

  button: {
    backgroundColor: '#DA7705',
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    shadowColor: '#DA7705',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});

export default GetStartedStyles;
