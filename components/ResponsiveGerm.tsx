import React from "react";
import { Dimensions, StyleProp, ViewStyle } from "react-native";
import GreenGerm from "./GreenGerm";
import { SvgProps } from "react-native-svg";

const { width, height } = Dimensions.get("window");

type Props = SvgProps & {
  scaleWidth?: number;
  scaleHeight?: number;
  style?: StyleProp<ViewStyle>;
};

export default function ResponsiveGerm({
  scaleWidth = 0.3,
  scaleHeight = 0.15,
  style,
  ...props
}: Props) {
  return (
    <GreenGerm
      width={width * scaleWidth}
      height={height * scaleHeight}
      style={style}
      {...props}
    />
  );
}