import { StyleSheet } from "react-native";

const CriticalListStyles = StyleSheet.create({
    container: {
    backgroundColor: '#fff',
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
})

export default CriticalListStyles;