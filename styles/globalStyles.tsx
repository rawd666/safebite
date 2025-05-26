import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import ResponsiveGerm from "../components/ResponsiveGerm";

const { width, height } = Dimensions.get("window");
const horizontalPadding = width * 0.08;

export const BottomFade = () => (
  <LinearGradient
    colors={["#4EA8DE", "#4EA8DE", "#4EA8DE99",  "transparent"]}
    locations={[0, 0.4, 0.75, 1]}
    start={{ x: 0, y: 1 }}
    end={{ x: 0, y: 0 }}
    style={{
      position: "absolute",
      top: height - height / 3,
      height: height / 3,
      width: "100%",
      zIndex: 0,
      pointerEvents: "none",
    }}
  />
);

export const BackgroundShapes = () => (
  <View style={{flex: 1}}>
    <ResponsiveGerm
      fill={'#E3E430'}
      scaleWidth={0.7}
      scaleHeight={0.5}
      style={{
        position: "absolute",
        top: height * 0.01,
        right: -width * 0.35,
        transform: [{ rotate: "15deg" }],
        zIndex: -1,
        opacity: 0.85,
      }}
    />
    <ResponsiveGerm
      fill={'#E3E430'}
      scaleWidth={0.7}
      scaleHeight={0.5}
      style={{
        position: "absolute",
        top: height - height * 0.5,
        left: -width * 0.30,
        transform: [{ rotate: "15deg" }],
        zIndex: -1,
        opacity: 0.85,
      }}
    />
  </View>
);

export const StaticBackground = () => (
  <View style={{
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
    pointerEvents: "none",
  }}>
    <BackgroundShapes />
    <BottomFade />
  </View>
);

const backgroundStyles = StyleSheet.create({
  shapeContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    position: "absolute",
    backgroundColor: "#ffffff",
  }
});

export default StyleSheet.create({
  ombreBackground: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    position: "relative",
    zIndex: 2,
  },
  containerCenteredWhite: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "flex-start",
    alignItems: "center",
    position: "relative",
    width: "100%",
    zIndex: 3,
  },
});