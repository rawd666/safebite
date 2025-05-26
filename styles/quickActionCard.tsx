import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface QuickActionCard {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  character?: React.ReactNode;
  backgroundColor?: string;
}

interface QuickActionCardProps {
  actions: QuickActionCard[];
}

export const QuickActionCard: React.FC<QuickActionCardProps> = ({ actions }) => (
  <View style={styles.gridContainer}>
    {actions.map((action, idx) => (
      <TouchableOpacity
        key={action.label}
        style={styles.quickActionCard}
        onPress={action.onPress}
        activeOpacity={0.8}
      >
        {/* Left icon+shape */}
        <View style={styles.iconWithShape}>
          {action.character}
          <View style={styles.iconOverlay}>
            {action.icon}
          </View>
        </View>

        {/* Right content */}
        <View style={styles.textAndArrow}>
          <Text style={styles.quickActionText}>{action.label}</Text>
          <Ionicons name="chevron-forward" size={22} color="#000000" />
        </View>
      </TouchableOpacity>
    ))}
  </View>
);

const styles = StyleSheet.create({
    gridContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between', // or 'center'
      paddingHorizontal: 10,
    },
    quickActionText: {
        color: '#000000',
        fontSize: 15,
        fontWeight: '600',
        fontFamily: 'mediumFont',
        textAlign: 'right',
    },
    quickActionCard: {
      width: '48%',
      flexDirection: 'row',
      alignItems: 'center',
      height: 72,
      backgroundColor: 'rgba(255, 255, 255, 0.76)',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#E0E0E0',
      paddingHorizontal: 12,
      marginBottom: 24,
      overflow: 'hidden',
    },

    iconWithShape: {
      width: 30,
      height: 30,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
      marginRight: 12,
    },

    iconOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
      pointerEvents: 'none',
    },

    textAndArrow: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 6,
    },

});