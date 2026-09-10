import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

const DOT_SIZE = 8;
const DOT_SPACING = 14;
const DOT_COUNT = 3;

// total width of all dots including spacing
const TOTAL_WIDTH =
  DOT_COUNT * DOT_SIZE + (DOT_COUNT - 1) * DOT_SPACING;

export default function PaginationDots({ index }) {
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: index * (DOT_SIZE + DOT_SPACING),
      useNativeDriver: true,
    }).start();
  }, [index]);

  return (
    <View style={styles.container}>
      <View style={styles.dotsRow}>
        
        {[...Array(DOT_COUNT)].map((_, i) => (
          <View key={i} style={styles.dot} />
        ))}

        <Animated.View
          style={[
            styles.activeDot,
            {
              transform: [{ translateX }],
            },
          ]}
        />

      </View>
    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    position: 'absolute',
    bottom: 30,
    width: '100%',
    alignItems: 'center', // ✅ centers dotsRow perfectly
  },

  dotsRow: {
    width: TOTAL_WIDTH, // ✅ THIS IS THE KEY FIX
    flexDirection: 'row',
    alignItems: 'center',
  },

  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#E0C4A8',
    marginRight: DOT_SPACING,
  },

  activeDot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#DA7705',
  },

});
