import { StyleSheet } from "react-native";

const OverallWardsScreenStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        padding: 20,
        paddingTop: 30,
    },
    BigContainer: {
        justifyContent: "flex-start",
        padding: 20,
        backgroundColor: '#fff',
        borderRadius: 10,
        elevation: 5,
        width: '100%',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    subtitle: {
        color: '#64748b',
        marginBottom: 12,
        textAlign: 'center',
    },
    tableWrap: {
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        overflow: 'hidden',
    },
    tableHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    tableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        backgroundColor: '#fff',
    },
    headerText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#0f172a',
    },
    cellText: {
        fontSize: 13,
        color: '#0f172a',
        fontWeight: '600',
    },
    mutedText: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: '600',
    },
    colRoom: {
        width: 92,
        paddingRight: 10,
    },
    colStatus: {
        width: 98,
        paddingRight: 10,
    },
    colPatient: {
        flex: 1,
        paddingRight: 10,
    },
    colDx: {
        flex: 1,
    },
    statusBadge: {
        alignSelf: 'flex-start',
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
    },
    emptyState: {
        paddingVertical: 18,
        paddingHorizontal: 12,
        alignItems: 'center',
    },
});

export default OverallWardsScreenStyles;
