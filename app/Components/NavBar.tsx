import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const BOTTOM_NAV_HEIGHT = 70;

const BottomNavBar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isActive = (route) => pathname.startsWith(route);

  const handleNavigation = (route) => {
    if (pathname === route) return;
    router.replace(route);
  };

  return (
    <View style={[styles.bottomNavContainer, {
      paddingBottom: insets.bottom,
      height: BOTTOM_NAV_HEIGHT
    }]}>
      <View style={styles.bottomNav}>
        {/* Home Button */}
        <Pressable
          onPress={() => handleNavigation('/home')}
          style={styles.navButton}
        >
          <Ionicons
            name={isActive('/home') ? 'home' : 'home-outline'}
            size={20} // Reduced size
            color={isActive('/home') ? '#4EA8DE' : '#A0AEC0'}
          />
          <Text style={[styles.navLabel, isActive('/home') && styles.activeLabel]}>
            Home
          </Text>
        </Pressable>

        {/* Shop Button */}
        <Pressable
          onPress={() => handleNavigation('/shop')}
          style={styles.navButton}
        >
          <Ionicons
            name={isActive('/shop') ? 'cart' : 'cart-outline'}
            size={20} // Reduced size
            color={isActive('/shop') ? '#4EA8DE' : '#A0AEC0'}
          />
          <Text style={[styles.navLabel, isActive('/shop') && styles.activeLabel]}>
            Shop
          </Text>
        </Pressable>

        {/* Scan Button */}
        <Pressable
          onPress={() => handleNavigation('/DetectText')}
          style={styles.scanButton}
        >
          <View style={styles.scanButtonInner}>
            <MaterialCommunityIcons
              name="barcode-scan"
              size={24} // Reduced size (slightly larger than others)
              color="white"
            />
          </View>
        </Pressable>

        {/* Settings Button */}
        <Pressable
          onPress={() => handleNavigation('/settings')}
          style={styles.navButton}
        >
          <Ionicons
            name={isActive('/settings') ? 'settings' : 'settings-outline'}
            size={20} // Reduced size
            color={isActive('/settings') ? '#4EA8DE' : '#A0AEC0'}
          />
          <Text style={[styles.navLabel, isActive('/settings') && styles.activeLabel]}>
            Settings
          </Text>
        </Pressable>

        {/* Profile Button */}
        <Pressable
          onPress={() => handleNavigation('/users/profile')}
          style={styles.navButton}
        >
          <Ionicons
            name={isActive('/users/profile') ? 'person' : 'person-outline'}
            size={20} // Reduced size
            color={isActive('/users/profile') ? '#4EA8DE' : '#A0AEC0'}
          />
          <Text style={[styles.navLabel, isActive('/users/profile') && styles.activeLabel]}>
            Profile
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bottomNavContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    zIndex: 50,
    height: BOTTOM_NAV_HEIGHT,
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 8,
    flex: 1,
  },
  navButton: {
    alignItems: 'center',
    paddingHorizontal: 8,
    minWidth: 60,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  navLabel: { // Renamed from navButtonText for clarity
    fontSize: 10,
    color: '#A0AEC0',
    marginTop: 4,
    fontWeight: '500',
  },
  activeLabel: { // Added style for active label text
      color: '#4EA8DE',
      fontWeight: 'bold',
  },
  scanButton: {
    alignItems: 'center',
    marginTop: -44,
    paddingHorizontal: 8,
    paddingVertical: 0,
    justifyContent: 'center',
  },
  scanButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 94,
    backgroundColor: '#4EA8DE',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4EA8DE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
});

export default BottomNavBar;
