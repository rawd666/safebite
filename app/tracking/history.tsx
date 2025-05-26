
import { supabase } from '@/lib/supabase'; // Ensure this path is correct
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Constants for AsyncStorage (MUST match those in DetectText.tsx and HomeScreen.tsx)
const SHARED_SCANNED_ITEMS_STORAGE_KEY = '@scannedItemsHistory';
const LAST_SEEN_SCAN_COUNT_KEY = '@lastSeenScanCount';

// Interface for items stored in the shared scan history
interface SharedScannedItem {
  id: string;
  name: string; // This is the full scanned text
  scannedAt: string;
}

// Interface for processed history items, including allergen info
interface ProcessedHistoryItem extends SharedScannedItem {
  detectedAllergensInItem: string[];
  allergenCountInItem: number;
  containsConfiguredAllergens: boolean;
}

// User profile structure (ensure this matches your Supabase 'profiles' table structure)
interface UserProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  allergies: string[] | string | null; // Can be an array or a comma-separated string
}

const ScanHistoryScreen = () => {
  // Header UI State (Profile Icon & Notification Bell)
  const [isProfileOptionsVisible, setIsProfileOptionsVisible] = useState(false);
  const menuFadeAnim = useRef(new Animated.Value(0)).current;
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [sharedScannedItemsForBell, setSharedScannedItemsForBell] = useState<SharedScannedItem[]>([]);
  const [isNotificationsModalVisible, setIsNotificationsModalVisible] = useState(false);
  const [hasNewNotificationsForBell, setHasNewNotificationsForBell] = useState(false);
  const notificationsMenuFadeAnim = useRef(new Animated.Value(0)).current;

  // Scan History State
  const [processedHistory, setProcessedHistory] = useState<ProcessedHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [userAllergies, setUserAllergies] = useState<string[]>([]);
  const [allergiesConfigured, setAllergiesConfigured] = useState(false);


  // --- Header UI Animations & Profile Fetch ---
  useEffect(() => {
    Animated.timing(menuFadeAnim, { toValue: isProfileOptionsVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [isProfileOptionsVisible]);

  useEffect(() => {
    Animated.timing(notificationsMenuFadeAnim, { toValue: isNotificationsModalVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [isNotificationsModalVisible]);

  const fetchAppUserProfileAndAllergies = async () => {
    try {
      setLoadingProfile(true);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setCurrentUserProfile(null);
        setUserAllergies([]);
        setAllergiesConfigured(false);
        return;
      }
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, avatar_url, full_name, username, allergies')
        .eq('id', user.id)
        .single<UserProfile>();

      if (profileError) throw profileError;

      if (profileData) {
        setCurrentUserProfile(profileData);
        const allergiesValue = profileData.allergies;
        let currentAllergies: string[] = [];
        if (typeof allergiesValue === 'string' && allergiesValue.trim() !== '') {
          currentAllergies = allergiesValue.split(',').map(a => a.trim().toLowerCase()).filter(a => a);
        } else if (Array.isArray(allergiesValue)) {
          currentAllergies = allergiesValue.map(a => String(a).trim().toLowerCase()).filter(a => a);
        }
        setUserAllergies(currentAllergies);
        setAllergiesConfigured(currentAllergies.length > 0);
      } else {
        setCurrentUserProfile(null);
        setUserAllergies([]);
        setAllergiesConfigured(false);
      }
    } catch (error) {
      console.error("ScanHistoryScreen: Error fetching user profile:", error);
      setCurrentUserProfile(null);
      setUserAllergies([]);
      setAllergiesConfigured(false);
    } finally {
      setLoadingProfile(false);
    }
  };

  // --- Load Scan History and Process Allergens ---
  const loadScanHistoryAndProcess = async () => {
    if (!currentUserProfile && !loadingProfile) { // Wait for profile fetch attempt to complete
        await fetchAppUserProfileAndAllergies(); // Ensure allergies are loaded if not already
    }
    if(!currentUserProfile && loadingProfile) return; // Still loading profile, wait.

    setIsLoadingHistory(true);
    try {
      const storedItemsJson = await AsyncStorage.getItem(SHARED_SCANNED_ITEMS_STORAGE_KEY);
      const rawHistoryItems: SharedScannedItem[] = storedItemsJson ? JSON.parse(storedItemsJson) : [];

      const processed = rawHistoryItems.map(item => {
        let detectedInThisItem: string[] = [];
        if (allergiesConfigured && userAllergies.length > 0) {
          detectedInThisItem = userAllergies.filter(allergen =>
            item.name.toLowerCase().includes(allergen)
          );
        }
        return {
          ...item,
          detectedAllergensInItem: detectedInThisItem,
          allergenCountInItem: detectedInThisItem.length,
          containsConfiguredAllergens: detectedInThisItem.length > 0,
        };
      });
      setProcessedHistory(processed);
    } catch (error) {
      console.error("ScanHistoryScreen: Failed to load or process scan history:", error);
      setProcessedHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };
  
  useEffect(() => {
    fetchAppUserProfileAndAllergies().then(() => {
        // After profile and allergies are fetched, load and process history
        // This ensures userAllergies is set before processing
    });
  }, []);

  // Re-process history if userAllergies change (e.g., profile update)
  useEffect(() => {
    if (currentUserProfile) { // Only run if profile is loaded
        loadScanHistoryAndProcess();
    }
  }, [currentUserProfile, userAllergies, allergiesConfigured]);


  useFocusEffect(
    useCallback(() => {
      loadSharedScannedDataForBellNotifications();
      if (currentUserProfile) { // If profile already loaded, refresh history & allergens
          loadScanHistoryAndProcess();
      } else { // Otherwise, ensure profile is fetched first
          fetchAppUserProfileAndAllergies().then(() => loadScanHistoryAndProcess());
      }
    }, [currentUserProfile]) // Add currentUserProfile as dependency
  );


  // --- Notification Bell Logic (for the header on this page) ---
  const loadSharedScannedDataForBellNotifications = async () => {
    try {
      const storedItems = await AsyncStorage.getItem(SHARED_SCANNED_ITEMS_STORAGE_KEY);
      const items: SharedScannedItem[] = storedItems ? JSON.parse(storedItems) : [];
      setSharedScannedItemsForBell(items);
      const lastSeenCountStr = await AsyncStorage.getItem(LAST_SEEN_SCAN_COUNT_KEY);
      const lastSeenCount = lastSeenCountStr ? parseInt(lastSeenCountStr, 10) : 0;
      setHasNewNotificationsForBell(items.length > lastSeenCount);
    } catch (error) {
      console.error("ScanHistoryScreen: Failed to load SHARED scanned items for bell:", error);
    }
  };

  // --- Header Action Handlers ---
  const handleProfilePress = useCallback(() => setIsProfileOptionsVisible(p => !p), []);
  const clearAllUserDataForHeaderActions = async () => { /* ... (same as in DetectText) ... */
    await AsyncStorage.multiRemove(['@userToken', '@userProfile', SHARED_SCANNED_ITEMS_STORAGE_KEY, LAST_SEEN_SCAN_COUNT_KEY]);
  };
  const handleVisitProfile = useCallback(() => { setIsProfileOptionsVisible(false); router.push('/(tabs)/profile'); }, []);
  const handleLogout = useCallback(async () => { /* ... (same as in DetectText, ensure setCurrentUserProfile(null), setUserAllergies([]), setAllergiesConfigured(false) are called) ... */
    setIsProfileOptionsVisible(false);
    try {
        const { error } = await supabase.auth.signOut();
        if (error) Alert.alert('Logout Error', error.message);
        else {
            await clearAllUserDataForHeaderActions();
            setCurrentUserProfile(null); setUserAllergies([]); setAllergiesConfigured(false);
            router.replace('/auth/login');
        }
    } catch (e) { Alert.alert('Logout Error', (e as Error).message); }
  }, []);
  const handleChangeAccount = useCallback(async () => { /* ... (same as handleLogout) ... */
    setIsProfileOptionsVisible(false);
    try {
        const { error } = await supabase.auth.signOut();
        if (error) Alert.alert('Logout Error', error.message);
        else {
            await clearAllUserDataForHeaderActions();
            setCurrentUserProfile(null); setUserAllergies([]); setAllergiesConfigured(false);
            router.replace('/auth/login');
        }
    } catch (e) { Alert.alert('Logout Error', (e as Error).message); }
  }, []);
  const handleBellPress = async () => { /* ... (same as in DetectText, use sharedScannedItemsForBell) ... */
    setIsNotificationsModalVisible(true);
    if (hasNewNotificationsForBell) {
        setHasNewNotificationsForBell(false);
        try { await AsyncStorage.setItem(LAST_SEEN_SCAN_COUNT_KEY, sharedScannedItemsForBell.length.toString()); }
        catch (e) { console.error("ScanHistory: Bell press error", e); }
    }
  };
  const handleClearSharedScanHistoryForBell = async () => { /* ... (same as in DetectText) ... */
    Alert.alert("Clear Notifications", "Clear all scan notifications?",
        [{ text: "Cancel" }, { text: "Clear", style: "destructive", onPress: async () => {
            setSharedScannedItemsForBell([]); setHasNewNotificationsForBell(false);
            await AsyncStorage.removeItem(SHARED_SCANNED_ITEMS_STORAGE_KEY);
            await AsyncStorage.setItem(LAST_SEEN_SCAN_COUNT_KEY, '0');
            setIsNotificationsModalVisible(false);
            Alert.alert("Cleared");
        }}]
    );
  };

  // --- Helper to Render Text with Highlighted Allergens ---
  const renderTextWithHighlightedAllergens = (text: string, detected: string[]) => {
    if (!text || detected.length === 0) {
      return <Text style={styles.historyItemScanText}>{text}</Text>;
    }
    // Create a regex that matches any of the detected allergens, case-insensitive
    // Escape special characters in allergens for regex
    const escapedAllergens = detected.map(allergen =>
        allergen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    const regex = new RegExp(`(${escapedAllergens.join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      const isAllergen = detected.some(allergen => part.toLowerCase() === allergen.toLowerCase());
      return (
        <Text
          key={index}
          style={isAllergen ? styles.highlightedAllergenText : styles.historyItemScanText}
        >
          {part}
        </Text>
      );
    });
  };


  // --- Render History Item ---
  const renderHistoryItem = ({ item }: { item: ProcessedHistoryItem }) => (
    <View style={[styles.historyItemContainer, !item.containsConfiguredAllergens && allergiesConfigured && styles.historyItemSafe]}>
      <View style={styles.historyItemHeader}>
        <Text style={styles.historyItemTimestamp}>
          {new Date(item.scannedAt).toLocaleDateString()} - {new Date(item.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        {item.containsConfiguredAllergens && (
            <View style={styles.allergenWarningBadge}>
                <Ionicons name="warning" size={14} color="#FFFFFF" />
                <Text style={styles.allergenWarningBadgeText}>Allergen{item.allergenCountInItem > 1 ? 's' : ''} Found</Text>
            </View>
        )}
         {!item.containsConfiguredAllergens && allergiesConfigured && (
            <View style={styles.allergenSafeBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#000000" />
                <Text style={styles.allergenSafeBadgeText}>No Allergens</Text>
            </View>
        )}
      </View>
      <View style={styles.historyItemScanTextContainer}>
        {renderTextWithHighlightedAllergens(item.name, item.detectedAllergensInItem)}
      </View>
      {item.containsConfiguredAllergens && (
        <View style={styles.detectedAllergensSection}>
          <Text style={styles.detectedAllergensTitle}>Detected Allergens ({item.allergenCountInItem}):</Text>
          <Text style={styles.detectedAllergensList}>
            {item.detectedAllergensInItem.join(', ')}
          </Text>
        </View>
      )}
      {!allergiesConfigured && (
        <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.configureAllergiesPrompt}>
            <Ionicons name="settings-outline" size={16} color="#007AFF" style={{marginRight: 5}}/>
            <Text style={styles.configureAllergiesText}>Configure your allergies for analysis.</Text>
        </Pressable>
      )}
    </View>
  );

  if (loadingProfile && isLoadingHistory) { // Show main loading indicator if both are true initially
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4EA8DE" />
          <Text style={styles.loadingText}>Loading Scan History...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="dark" />
      <View style={styles.container}>

        {/* Scan History List */}
        {isLoadingHistory && !processedHistory.length ? ( // Show history-specific loading if profile is loaded but history isn't
             <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#4EA8DE" /><Text style={styles.loadingText}>Loading Scans...</Text></View>
        ) : processedHistory.length > 0 ? (
          <FlatList
            data={processedHistory}
            renderItem={renderHistoryItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContentContainer}
            ListHeaderComponent={<Text style={styles.pageTitle}>Full Scan History</Text>}
          />
        ) : (
          <View style={styles.emptyHistoryContainer}>
            <Ionicons name="document-text-outline" size={60} color="#E0E0E0" />
            <Text style={styles.emptyHistoryText}>No scan history found.</Text>
            <Text style={styles.emptyHistorySubText}>Items you scan will appear here.</Text>
            <Pressable style={styles.scanButton} onPress={() => router.push('/(tabs)/Scan')}>
                 <Ionicons name="scan-outline" size={20} color="#FFFFFF" style={{marginRight: 8}}/>
                <Text style={styles.scanButtonText}>Start Scanning</Text>
            </Pressable>
          </View>
        )}

        {/* Profile Options Modal */}
        <Modal animationType="fade" transparent={true} visible={isProfileOptionsVisible} onRequestClose={() => setIsProfileOptionsVisible(false)}>
            <TouchableWithoutFeedback onPress={() => setIsProfileOptionsVisible(false)}>
            <View style={styles.modalOverlay_homeScreen}>
                <Animated.View style={[styles.profileOptionsModal_homeScreen, { opacity: menuFadeAnim, top: Platform.OS === 'ios' ? 60 : 45, left: 16 }]}>
                {(currentUserProfile?.full_name || currentUserProfile?.username) && (
                    <View style={styles.modalProfileHeader_homeScreen}>
                    <Text style={styles.modalProfileName_homeScreen} numberOfLines={1}>{currentUserProfile.full_name || currentUserProfile.username}</Text>
                    {currentUserProfile.full_name && currentUserProfile.username && (
                        <Text style={styles.modalProfileUsername_homeScreen} numberOfLines={1}>@{currentUserProfile.username}</Text>
                    )}
                    </View>
                )}
                <TouchableOpacity style={styles.modalOptionButton_homeScreen} onPress={handleVisitProfile}><Ionicons name="person-outline" size={20} color="#000000" style={styles.modalOptionIcon_homeScreen} /><Text style={styles.modalOptionText_homeScreen}>Visit Profile</Text></TouchableOpacity>
                <TouchableOpacity style={styles.modalOptionButton_homeScreen} onPress={handleChangeAccount}><Ionicons name="swap-horizontal-outline" size={20} color="#000000" style={styles.modalOptionIcon_homeScreen} /><Text style={styles.modalOptionText_homeScreen}>Change Account</Text></TouchableOpacity>
                <TouchableOpacity style={styles.modalOptionButton_homeScreen} onPress={handleLogout}><Ionicons name="log-out-outline" size={20} color="#E53E3E" style={styles.modalOptionIcon_homeScreen} /><Text style={[styles.modalOptionText_homeScreen, { color: '#E53E3E' }]}>Logout</Text></TouchableOpacity>
                </Animated.View>
            </View>
            </TouchableWithoutFeedback>
        </Modal>

        {/* Notifications Modal (for the bell in the header) */}
        <Modal animationType="fade" transparent={true} visible={isNotificationsModalVisible} onRequestClose={() => setIsNotificationsModalVisible(false)}>
            <TouchableWithoutFeedback onPress={() => setIsNotificationsModalVisible(false)}>
            <View style={styles.modalOverlay_homeScreen}>
                <Animated.View style={[styles.notificationsModal_homeScreen, { opacity: notificationsMenuFadeAnim, top: Platform.OS === 'ios' ? 60 : 45, right: 16 }]}>
                <View style={styles.modalHeader_homeScreen_notifications}><Text style={styles.modalTitle_homeScreen_notifications}>Recent Scans (Notifications)</Text></View>
                {sharedScannedItemsForBell.length > 0 ? (
                    <FlatList data={sharedScannedItemsForBell.slice(0, 15)} keyExtractor={(item) => item.id}
                    renderItem={({ item, index }) => (
                        <View style={[styles.notificationItem_homeScreen, index === sharedScannedItemsForBell.slice(0,15).length -1 && styles.notificationItemLast_homeScreen]}>
                        <Ionicons name="barcode-outline" size={22} color="#4EA8DE" style={styles.notificationItemIcon_homeScreen} />
                        <View style={styles.notificationItemContent_homeScreen}>
                            <Text style={styles.notificationItemText_homeScreen} numberOfLines={2}>{item.name}</Text>
                            <Text style={styles.notificationItemTimestamp_homeScreen}>{new Date(item.scannedAt).toLocaleDateString()} {new Date(item.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</Text>
                        </View></View>
                    )}/>
                ) : ( <View style={styles.notificationItem_homeScreen}><Text style={styles.noNotificationsText_homeScreen}>No new scan notifications.</Text></View> )}
                {sharedScannedItemsForBell.length > 0 && (
                    <TouchableOpacity style={styles.clearHistoryButton_homeScreen} onPress={handleClearSharedScanHistoryForBell}>
                        <Ionicons name="trash-outline" size={18} color="#E53E3E" style={{marginRight: 8}}/><Text style={styles.clearHistoryButtonText_homeScreen}>Clear All Notifications</Text>
                    </TouchableOpacity>
                )}
                </Animated.View>
            </View>
            </TouchableWithoutFeedback>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFF' },
  container: { flex: 1, backgroundColor: '#F8FAFF' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFF' },
  loadingText: { marginTop: 10, fontSize: 16, color: '#4EA8DE' },
  pageTitle: { fontSize: 24, fontWeight: 'bold', color: '#1A202C', marginHorizontal:16, marginBottom: 16, marginTop: 10 },
  listContentContainer: { paddingBottom: 20 },

  historyItemContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#9FB0C7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
    borderLeftWidth: 5,
    borderLeftColor: '#FFC107', // Default/Warning color
  },
  historyItemSafe: {
    borderLeftColor: '#E3E430', // Green for safe
  },
  historyItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyItemTimestamp: { fontSize: 12, color: '#718096' },
  allergenWarningBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFC107', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, },
  allergenWarningBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  allergenSafeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E3E430', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, },
  allergenSafeBadgeText: { color: '#000000', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  historyItemScanTextContainer: { marginBottom: 8, },
  historyItemScanText: { fontSize: 15, color: '#334155', lineHeight: 22 },
  highlightedAllergenText: { fontWeight: 'bold', color: '#D32F2F', backgroundColor: '#FFEBEE' }, // Red and bold for allergens
  detectedAllergensSection: { marginTop: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F4F8' },
  detectedAllergensTitle: { fontSize: 13, fontWeight: '600', color: '#D32F2F', marginBottom: 4 },
  detectedAllergensList: { fontSize: 14, color: '#D32F2F', fontStyle: 'italic' },
  configureAllergiesPrompt: { flexDirection:'row', alignItems:'center', marginTop: 10, paddingVertical: 8, justifyContent:'center', backgroundColor:'#E3F2FD', borderRadius: 8},
  configureAllergiesText: { fontSize: 13, color: '#007AFF', fontWeight:'500' },

  emptyHistoryContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyHistoryText: { fontSize: 18, fontWeight: '600', color: '#718096', marginTop: 16, marginBottom:8, textAlign:'center' },
  emptyHistorySubText: { fontSize: 14, color: '#A0AEC0', textAlign:'center', marginBottom:20 },
  scanButton: { flexDirection:'row', backgroundColor: '#4EA8DE', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25, alignItems:'center', elevation:2, shadowColor:'#4EA8DE', shadowOpacity:0.3, shadowOffset:{width:0, height:2}, shadowRadius:3 },
  scanButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },

  // Header and Modal Styles (copied from DetectText, originally from HomeScreen)
  header_homeScreen: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 0 : 8, paddingBottom: 10, backgroundColor: '#F8FAFF', borderBottomWidth:1, borderBottomColor:'#E0E0E0' },
  profileContainer_homeScreen: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0F4FE', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth:1, borderColor: '#E0E0E0'},
  profileImage_homeScreen: { width: '100%', height: '100%', },
  profileImagePlaceholder_homeScreen: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4FE'},
  searchContainer_homeScreen: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 15, paddingVertical: Platform.OS === 'ios' ? 10 : 8, marginLeft: 12, marginRight: 12, height: 40, shadowColor: '#B0C4DE', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 1, borderWidth:1, borderColor: '#E0E0E0'},
  searchIcon_homeScreen: { marginRight: 8, },
  searchInput_homeScreen: { flex: 1, color: '#000000', fontSize: 14, padding: 0, margin: 0, height: '100%', },
  notificationBellContainer_homeScreen: { padding: 8, position: 'relative', marginRight: -8 },
  notificationDot_homeScreen: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53E3E', borderWidth: 1.5, borderColor: '#FFFFFF' },
  modalOverlay_homeScreen: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', zIndex: 50 },
  profileOptionsModal_homeScreen: { backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 8, minWidth: 220, position: 'absolute', zIndex: 51},
  modalProfileHeader_homeScreen: { paddingHorizontal: 16, paddingVertical:12, borderBottomWidth: 1, borderBottomColor: '#F0F4FE', marginBottom: 8, },
  modalProfileName_homeScreen: { fontSize: 16, fontWeight: '600', color: '#000000', },
  modalProfileUsername_homeScreen: { fontSize: 13, color: '#718096', marginTop: 2, },
  modalOptionButton_homeScreen: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, },
  modalOptionIcon_homeScreen: { marginRight: 12, width: 20, alignItems:'center' },
  modalOptionText_homeScreen: { fontSize: 15, color: '#000000', fontWeight:'500' },
  notificationsModal_homeScreen: { backgroundColor: '#FFFFFF', borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 8, minWidth: 280, maxWidth: '90%', maxHeight: '70%', position: 'absolute', overflow:'hidden', zIndex: 51 },
  modalHeader_homeScreen_notifications: { paddingHorizontal: 16, paddingTop:16, paddingBottom:12, borderBottomWidth: 1, borderBottomColor: '#F0F4FE', },
  modalTitle_homeScreen_notifications: { fontSize: 17, fontWeight: '600', color: '#000000', },
  notificationItem_homeScreen: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F8FAFF', },
  notificationItemLast_homeScreen: { borderBottomWidth: 0, },
  notificationItemIcon_homeScreen: { marginRight: 12, marginTop: 2 },
  notificationItemContent_homeScreen: { flex:1 },
  notificationItemText_homeScreen: { fontSize: 14, color: '#334155', fontWeight:'500', lineHeight:18, marginBottom:3 },
  notificationItemTimestamp_homeScreen: { fontSize: 11, color: '#64748B', },
  noNotificationsText_homeScreen: { textAlign: 'center', color: '#64748B', paddingVertical: 25, fontSize: 14, },
  clearHistoryButton_homeScreen: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#F0F4FE', backgroundColor: '#FFF7F7' },
  clearHistoryButtonText_homeScreen: { fontSize: 14, color: '#E53E3E', fontWeight: '500', },
});

export default ScanHistoryScreen;
