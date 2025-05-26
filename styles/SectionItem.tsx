import React from 'react';
import { StyleSheet, Text, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';

interface SectionItemProps {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  right?: React.ReactNode; // e.g. chevron, version text, etc.
  style?: ViewStyle;
  labelStyle?: TextStyle;
}

export const SectionItem: React.FC<SectionItemProps> = ({
  icon,
  label,
  onPress,
  right,
  style,
  labelStyle,
}) => {
  const Content = (
    <View style={[styles.item, style]}>
      <View style={styles.icon}>{icon}</View>
      <Text style={[styles.label, labelStyle]}>{label}</Text>
      {right}
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {Content}
    </TouchableOpacity>
  ) : (
    Content
  );
};

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  icon: {
    marginRight: 12,
  },
  label: {
    fontFamily: 'bodyFont',
    flex: 1,
    fontSize: 16,
    color: '#000000',
  },
});