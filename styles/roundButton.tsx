import React from "react";
import { Dimensions, StyleSheet, Text, TextStyle, TouchableOpacity, ViewStyle } from "react-native";

const { width } = Dimensions.get("window");

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  backgroundColor?: string;
}

export default function PrimaryButton({
  title,
  onPress,
  style,
  textStyle,
  backgroundColor,
}: PrimaryButtonProps) {
  return (
    <TouchableOpacity
      style={[
        { backgroundColor: backgroundColor ?? "#4A90E2" }, 
        styles.button,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.buttonText, textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
}


const styles = StyleSheet.create({
  button: {
    zIndex: 2,
    width: "100%",
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontFamily: "mediumFont",
    fontSize: 16,
  },
});
