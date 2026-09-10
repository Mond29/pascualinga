import { StyleSheet } from 'react-native';


const PatientHomepageStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    margin: 1, 
    padding: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#fff',
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  votd: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f97316',
  },
  subVotd: {
    fontSize: 22,
    fontStyle: 'italic',
    color: '#f97316',
  },
  votdWrapper: {
    backgroundColor: '#fff',
    borderRadius: 20,
    margin: 3,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 22,
    alignSelf: 'center',
    color: '#f97316',
  },
  subGreeting: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  profileCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3EFEA',
    justifyContent: 'center',
    alignItems: 'center',
    left: 210,
  },
  calendarWrapper: {
    backgroundColor: '#fff',
    borderRadius: 20,
    margin: 10,
    paddingBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  calendar: {
    borderRadius: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginHorizontal: 20,
    marginBottom: 15,
    color: '#1A1A1A',
  },
  listPadding: {
    paddingBottom: 100,
  },
  appointmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  timeIndicator: {
    width: 4,
    backgroundColor: '#f97316',
    borderRadius: 2,
    marginRight: 15,
    alignSelf: 'stretch',
  },
  timeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f97316',
  },
  patientName: {
    fontSize: 15,
    color: '#444',
    marginTop: 2,
  },
  noAppointments: {
    textAlign: 'center',
    marginTop: 30,
    color: '#999',
    fontSize: 14,
  },
  navBar: {
    position: 'absolute',
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingTop: 10,
    paddingBottom: 25,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    justifyContent: 'space-around',
    width: '100%',
  },
  navItem: {
    alignItems: 'center',
  },
  navText: {
    fontSize: 10,
    marginTop: 4,
    color: '#999',
  },
});


export default PatientHomepageStyles;