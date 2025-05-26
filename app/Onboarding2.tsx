import PrimaryButton from "@/styles/roundButton";
import { useRouter } from "expo-router";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import { Fonts } from "../constants/Fonts";
import GlobalStyles, { StaticBackground } from "../styles/globalStyles";

const { height, width } = Dimensions.get("window");

export default function Onboarding2() {
  const router = useRouter();

  return (
    <View style={{flex:1}}>
      <StaticBackground />

      <View style={styles.screenWrapper}>
        <View style={GlobalStyles.containerCenteredWhite}>
          <Text style={[Fonts.title, {fontSize: 42}]}>Scan. Analyze. Eat Confidently.</Text>
          <View style={{
            position: "absolute",
            top: height * 0.85,
            left: 0,
            right: 0,
          }}>
            <PrimaryButton
              title="Get Started"
              onPress={() => router.push("/auth/login")}
              style={{ backgroundColor: "#E3E430" }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 50,
  },
});