import GlobalStyles from "@/styles/globalStyles";
import React from 'react';
import { Dimensions, Image, StyleSheet, View } from 'react-native';

const { width, height } = Dimensions.get("window");
const PADDING = 50;

const maxLogoSize = Math.min(width, height) - PADDING * 2;


export const OnboardingSplash = () => (
    <View style={{flex:1}}>
      <View style={[GlobalStyles.containerCenteredWhite, styles.logoContainer]}>
        <Image
          source={require("@/assets/images/logo.png")}
          style={styles.logo}
        />
      </View>
    </View>
);

const styles = StyleSheet.create({
  logoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: maxLogoSize,
    height: maxLogoSize,
    resizeMode: "contain",
  },
});