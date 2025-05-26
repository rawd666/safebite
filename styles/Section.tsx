import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, children }) => (
  <BlurView intensity={30} style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </BlurView>
);

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
    borderColor: '#E0E0E0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
  },
  sectionTitle: {
    fontFamily: 'subtitleFont',
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    paddingBottom: 16,
  },
});