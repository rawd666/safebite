import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const netInfo = useNetInfo();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (netInfo.isConnected === false) {
      console.log('No internet connection');
    }
  }, [netInfo.isConnected]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#E3E430',
        tabBarInactiveTintColor: '#FFFFFF',
        tabBarStyle: {
          backgroundColor: '#4EA8DE',
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginTop: 4,
        },
        tabBarIconStyle: {
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={20}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="shop"
        options={{
          title: 'Shop',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'cart' : 'cart-outline'}
              size={20}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="Scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.scanButtonInner}>
              <MaterialCommunityIcons
                name="barcode-scan"
                size={28}
                color="black"
              />
            </View>
          ),
           tabBarLabel: () => null,
           tabBarIconStyle: {
               marginTop: 5,
           }
        }}
      />

       <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'settings' : 'settings-outline'}
              size={20}
              color={color}
            />
          ),
        }}
      />

       <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={20}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  offlineContainer: {
    backgroundColor: '#FF3B30',
    padding: 8,
    alignItems: 'center',
  },
  offlineText: {
    color: 'white',
    fontSize: 12,
  },
  scanButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E3E430',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
