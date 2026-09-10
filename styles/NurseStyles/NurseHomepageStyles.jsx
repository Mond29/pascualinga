import { StyleSheet } from 'react-native';

const NurseHomepageStyles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#d9802b', // same as screenshot
  },
  logoText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
    marginLeft: 10,
  },
  profileIcon: {
    marginLeft: 'auto',
  },
  welcomeSection: {
    width: '90%',
    height: 120,
    backgroundColor: '#d9802b',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    justifyContent: 'flex-start',
    borderRadius: 10,
    marginHorizontal: 20,
    marginVertical: 10,
    elevation: 5,
  },
  profileCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeTextWrapper: {
    marginLeft: 15,
  },
  welcomeText: {
    fontSize: 20,
    color: '#fff',
  },
  doctorName: {
    fontSize: 40,
    fontWeight: '700',
    color: '#fff',
    top: -10,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 20,
    marginVertical: 10,
  },
  statCard: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    elevation: 5,
    width: 120,
  },
  statIconOrange:{
    color: '#dda15e', 
    width: 40, 
    height: 40, 
    borderRadius: 10, 
    backgroundColor: '#ffdeb8', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 5,
  },
  statNumber: {
    fontWeight: '700',
    fontSize: 16,
    color: '#0f172a',
  },
  statLabel: {
    fontSize: 12,
    textAlign: 'center',
    color: '#475569',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#d9802b',
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 5,
  },
  consultationTabs: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 10,
  },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  tabButtonActive: {
    backgroundColor: '#d9802b',
    borderColor: '#d9802b',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#fff',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
  },
  tableHeaderText: {
    flex: 1,
    fontWeight: '700',
    fontSize: 12,
    color: '#333',
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tableCell: {
    flex: 1,
    fontSize: 12,
    color: '#333',
  },
  priorityCritical: {
    color: 'red',
    fontWeight: '700',
  },
  bottomTabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  /* ICON REUSABLES */
statIcon: {
  width: 30,
  height: 30,
},

statIconOrange: {
  width: 40,
  height: 40,
  borderRadius: 10,
  backgroundColor: '#ffdeb8',
  justifyContent: 'center',
  alignItems: 'center',
  marginBottom: 5,
},

statIconBlue: {
  width: 40,
  height: 40,
  borderRadius: 10,
  backgroundColor: '#c6ceff',
  justifyContent: 'center',
  alignItems: 'center',
  marginBottom: 5,
},

statIconPlain: {
  width: 40,
  height: 40,
  borderRadius: 10,
  justifyContent: 'center',
  alignItems: 'center',
  marginBottom: 5,
},

/* WARD SECTION */
wardSection: {
  marginTop: 25,
  paddingHorizontal: 20,
},

sectionTitle: {
  fontSize: 18,
  fontWeight: '700',
  marginBottom: 15,
  color: '#333',
},

wardCardsRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  paddingLeft: 10,
  paddingRight: 10,
},

wardCardOccupied: {
  width: '48%',
  backgroundColor: '#ffe5e5',
  borderRadius: 15,
  paddingVertical: 20,
  alignItems: 'center',
},

wardCardAvailable: {
  width: '48%',
  backgroundColor: '#e6f7f4',
  borderRadius: 15,
  paddingVertical: 20,
  alignItems: 'center',
},

wardNumber: {
  fontSize: 28,
  fontWeight: 'bold',
  marginTop: 5,
  color: '#333',
},

wardLabel: {
  fontSize: 13,
  color: '#555',
  marginTop: 4,
},
/* SECTION HEADER WITH BUTTON */
sectionHeaderRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingHorizontal: 20,
  marginTop: 25,
  marginBottom: 15,
},

viewAllButton: {
  fontSize: 14,
  fontWeight: '600',
  color: '#d9802b', // matches your theme
},

/* CONSULTATIONS */
consultationTitle: {
  fontSize: 20,
    fontWeight: '700',
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 5,
    padding: 10,
    right: 10
},

consultationTabs: {
  flexDirection: 'row',
  marginHorizontal: 20,
  marginBottom: 10,
  backgroundColor: '#eee',
  borderRadius: 20,
  padding: 5,
},

tabButton: {
  paddingVertical: 6,
  paddingHorizontal: 14,
  borderRadius: 15,
  marginRight: 5,
},

tabButtonActive: {
  backgroundColor: '#d9802b',
},

tabButtonText: {
  fontSize: 12,
  fontWeight: '600',
  color: '#333',
},

tabButtonTextActive: {
  color: '#fff',
},

priorityCritical: {
  color: 'red',
  fontWeight: '700',
},

watchlistHeaderRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginHorizontal: 20,
  marginTop: 20,
  marginBottom: 10,
},

watchlistTitle: {
  fontSize: 18,
  fontWeight: '700',
},

watchlistActiveText: {
  fontSize: 14,
  color: '#d9802b',
  fontWeight: '600',
},

watchlistContainer: {
  paddingHorizontal: 20,
},

watchlistCard: {
  flexDirection: 'row',
  backgroundColor: '#fdecec',
  padding: 15,
  borderRadius: 12,
  marginBottom: 10,
},

watchlistName: {
  fontSize: 14,
  fontWeight: '700',
  color: '#b42318',
},

watchlistWard: {
  fontSize: 12,
  color: '#b42318',
},

watchlistVitalsRow: {
  flexDirection: 'row',
},

watchlistVitalBox: {
  backgroundColor: '#fff',
  paddingVertical: 5,
  paddingHorizontal: 10,
  borderRadius: 10,
  marginLeft: 8,
  flexDirection: 'row',
},

watchlistVitalLabel: {
  fontSize: 12,
  fontWeight: '600',
  marginRight: 4,
},

watchlistVitalValue: {
  fontSize: 12,
  fontWeight: '700',
  color: '#b42318',
},

/* HORIZONTAL WATCHLIST */

watchlistHorizontalContainer: {
  paddingLeft: 20,
  paddingRight: 10,
},

watchlistCardHorizontal: {
  width: 200,
  backgroundColor: '#fdecec',
  padding: 15,
  borderRadius: 15,
  marginRight: 12,
},

watchlistName: {
  fontSize: 15,
  fontWeight: '700',
  color: '#b42318',
},

watchlistWard: {
  fontSize: 12,
  color: '#b42318',
  marginBottom: 10,
},

watchlistVitalsRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
},

watchlistVitalBox: {
  backgroundColor: '#fff',
  paddingVertical: 6,
  paddingHorizontal: 10,
  borderRadius: 10,
  alignItems: 'center',
},

watchlistVitalLabel: {
  fontSize: 11,
  color: '#777',
},

watchlistVitalValue: {
  fontSize: 13,
  fontWeight: '700',
  color: '#b42318',
},

/* ================= ACTIVITY SECTION ================= */

activityContainer: {
  paddingHorizontal: 20,
  marginTop: 20,
},

activityCard: {
  backgroundColor: '#f8f9fb',
  borderRadius: 15,
  padding: 15,
  marginBottom: 15,
  elevation: 2,
},

activityTitle: {
  fontSize: 16,
  fontWeight: '700',
  marginBottom: 12,
  color: '#333',
},

activityItem: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 10,
},

activityDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
  backgroundColor: '#3b82f6',
  marginRight: 10,
},

activityText: {
  fontSize: 14,
  fontWeight: '500',
},

activityTime: {
  fontSize: 12,
  color: '#888',
},


/* ================= PENDING TASKS ================= */

pendingHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
},

urgentLabel: {
  fontSize: 13,
  color: '#d97706',
  fontWeight: '600',
},

pendingItem: {
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: 12,
},

checkbox: {
  width: 18,
  height: 18,
  borderRadius: 4,
  borderWidth: 1.5,
  borderColor: '#ccc',
  marginRight: 10,
},

pendingText: {
  fontSize: 14,
  flex: 1,
},

pendingTextUrgent: {
  fontSize: 14,
  flex: 1,
  color: '#dc2626',
  fontWeight: '600',
},

urgentBadge: {
  backgroundColor: '#fee2e2',
  paddingHorizontal: 8,
  paddingVertical: 2,
  borderRadius: 6,
},

urgentBadgeText: {
  fontSize: 10,
  color: '#dc2626',
  fontWeight: '700',
},







});

export default NurseHomepageStyles;
