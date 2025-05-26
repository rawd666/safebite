import GreenGerm from '@/components/GreenGerm';
import { Fonts } from '@/constants/Fonts';
import { supabase } from '@/lib/supabase';
import { ProductCard } from '@/styles/productCard';
import { QuickActionCard } from '@/styles/quickActionCard';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';


const { width, height } = Dimensions.get('window');

const PRODUCT_CARD_HORIZONTAL_PADDING = 16;
const PRODUCT_CARD_MARGIN = 8;
const NUM_COLUMNS = 2;
const PRODUCT_CARD_WIDTH = (width - (PRODUCT_CARD_HORIZONTAL_PADDING * 2) - (PRODUCT_CARD_MARGIN * (NUM_COLUMNS -1))) / NUM_COLUMNS;

interface ProductFromDB {
  id: string;
  name: string;
  price: number;
  image_url?: string | null;
  category_id?: string | null;
  rating?: number | null;
  is_featured?: boolean;
  description?: string | null;
  stock_quantity?: number | null;
  categories?: { name: string }[];
  category_name?: string;
  isFavorite?: boolean;
}

interface UserProfileHeader {
  avatar_url: string | null;
  full_name: string | null;
  username: string | null;
}

interface ScannedItem {
  id: string;
  name: string;
  scannedAt: string;
}

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

const SCANNED_ITEMS_STORAGE_KEY = '@scannedItemsHistory';
const LAST_SEEN_SCAN_COUNT_KEY = '@lastSeenScanCount';

const DEEPSEEK_API_KEY = 'sk-463297a1e36a423ba2885d6b2a4ca5ca';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

const HomeScreen = () => {
  const insets = useSafeAreaInsets();
  const [isProfileOptionsVisible, setIsProfileOptionsVisible] = useState(false);
  const menuFadeAnim = useRef(new Animated.Value(0)).current;
  const [userProfile, setUserProfile] = useState<UserProfileHeader | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [scannedItemsHistory, setScannedItemsHistory] = useState<ScannedItem[]>([]);
  const [isNotificationsModalVisible, setIsNotificationsModalVisible] = useState(false);
  const [hasNewNotifications, setHasNewNotifications] = useState(false);
  const notificationsMenuFadeAnim = useRef(new Animated.Value(0)).current;

  const [dbProducts, setDbProducts] = useState<ProductFromDB[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [isChatVisible, setIsChatVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentChatMessage, setCurrentChatMessage] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const chatFlatListRef = useRef<FlatList>(null);
  const chatInputRef = useRef<TextInput>(null);

  useEffect(() => { Animated.timing(menuFadeAnim, { toValue: isProfileOptionsVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start(); }, [isProfileOptionsVisible]);
  useEffect(() => { Animated.timing(notificationsMenuFadeAnim, { toValue: isNotificationsModalVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start(); }, [isNotificationsModalVisible]);

  const fetchDbProducts = async () => {
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          name,
          price,
          image_url,
          category_id,
          rating,
          is_featured,
          description,
          categories ( name )
        `)
        .eq('is_featured', true)
        .limit(6);

      if (error) throw error;
      if (data) {
        const transformedData = data.map(p => ({
          ...p,
          category_name: p.categories?.[0]?.name || 'Uncategorized',
          isFavorite: false
        }));
        setDbProducts(transformedData);
      }
    } catch (error) {
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchUserProfile = async () => {
    try {
      setLoadingProfile(true);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { setUserProfile(null); return; }
      const { data: profileData, error: profileError } = await supabase.from('profiles').select('avatar_url, full_name, username').eq('id', user.id).single();
      if (profileError) throw profileError;
      setUserProfile(profileData);
    } catch (error) { setUserProfile(null); }
    finally { setLoadingProfile(false); }
  };

  const loadScannedData = async () => {
    try {
      const storedItems = await AsyncStorage.getItem(SCANNED_ITEMS_STORAGE_KEY);
      const items: ScannedItem[] = storedItems ? JSON.parse(storedItems) : [];
      setScannedItemsHistory(items);
      const lastSeenCountStr = await AsyncStorage.getItem(LAST_SEEN_SCAN_COUNT_KEY);
      const lastSeenCount = lastSeenCountStr ? parseInt(lastSeenCountStr, 10) : 0;
      setHasNewNotifications(items.length > lastSeenCount);
    } catch (error) { }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
        await fetchUserProfile();
        await loadScannedData();
        await fetchDbProducts();
    };
    fetchInitialData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
        fetchUserProfile();
      } else if (event === 'SIGNED_OUT') {
        setUserProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useFocusEffect(useCallback(() => {
    loadScannedData();
    fetchDbProducts();
  }, []));

  const handleProfilePress = useCallback(() => setIsProfileOptionsVisible(true), []);
  const handleVisitProfile = useCallback(() => { setIsProfileOptionsVisible(false); router.push('/(tabs)/profile'); }, []);
  const clearAllUserData = async () => {
    await AsyncStorage.multiRemove(['@userToken', '@userProfile', SCANNED_ITEMS_STORAGE_KEY, LAST_SEEN_SCAN_COUNT_KEY]);
  };
  const handleLogout = useCallback(async () => {
    setIsProfileOptionsVisible(false);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) Alert.alert('Logout Error', error.message);
      else { await clearAllUserData(); router.replace('/auth/login');}
    } catch (e) { Alert.alert('Logout Error', (e as Error).message); }
  }, []);
  const handleChangeAccount = useCallback(async () => {
    setIsProfileOptionsVisible(false);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) Alert.alert('Logout Error', error.message);
      else { await clearAllUserData(); router.replace('/auth/login'); }
    } catch (e) { Alert.alert('Logout Error', (e as Error).message); }
  }, []);

  const toggleFavorite = (productId: string) => {
    setDbProducts(prev => prev.map(p => p.id === productId ? {...p, isFavorite: !p.isFavorite} : p));
  };

  const handleBellPress = async () => {
    setIsNotificationsModalVisible(true);
    if (hasNewNotifications) {
      setHasNewNotifications(false);
      try { await AsyncStorage.setItem(LAST_SEEN_SCAN_COUNT_KEY, scannedItemsHistory.length.toString()); }
      catch (e) { }
    }
  };
  const handleClearScanHistoryForNotificationModal = async () => {
    Alert.alert("Clear Notifications?", "This will clear all scan notifications.",
      [{text:"Cancel"}, {text:"Clear", style:"destructive", onPress: async () => {
        setScannedItemsHistory([]); setHasNewNotifications(false);
        await AsyncStorage.removeItem(SCANNED_ITEMS_STORAGE_KEY);
        await AsyncStorage.setItem(LAST_SEEN_SCAN_COUNT_KEY, '0');
        setIsNotificationsModalVisible(false);
        Alert.alert("Cleared!");
      }}]
    );
  };

  const toggleChatVisibility = () => {
    setIsChatVisible(!isChatVisible);
    if (!isChatVisible && chatMessages.length === 0) {
        setChatMessages([
            { id: 'greet1', text: "Hi there! I'm your Allergy & Health Assistant. How can I help you today?", sender: 'ai', timestamp: new Date() }
        ]);
    }
  };

  const handleSendChatMessage = async () => {
    const userMessageText = currentChatMessage.trim();
    if (!userMessageText) return;

    const newUserMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      text: userMessageText,
      sender: 'user',
      timestamp: new Date(),
    };
    setChatMessages(prevMessages => [...prevMessages, newUserMessage]);
    setCurrentChatMessage('');
    setIsAiTyping(true);

    const apiMessages = [
      { role: 'system', content: "You are a friendly and helpful assistant specializing in food allergies, ingredient safety, health benefits of foods, and general nutrition. Provide concise and easy-to-understand information. If a query is outside your expertise, politely state that you cannot help with that specific topic." },
      ...chatMessages.slice(-5).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text,
      })),
      { role: 'user', content: userMessageText }
    ];

    try {
      const response = await axios.post(
        DEEPSEEK_API_URL,
        {
          model: 'deepseek-chat',
          messages: apiMessages,
          max_tokens: 250,
          temperature: 0.7,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          },
        }
      );

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const aiResponseText = response.data.choices[0].message.content;
        const newAiMessage: ChatMessage = {
          id: `ai-${Date.now()}`,
          text: aiResponseText.trim(),
          sender: 'ai',
          timestamp: new Date(),
        };
        setChatMessages(prevMessages => [...prevMessages, newAiMessage]);
      } else {
        throw new Error('Invalid response structure from API');
      }
    } catch (error: any) {
      const errorAiMessage: ChatMessage = {
        id: `ai-error-${Date.now()}`,
        text: "Sorry, I couldn't connect or process your request right now. Please try again later.",
        sender: 'ai',
        timestamp: new Date(),
      };
      setChatMessages(prevMessages => [...prevMessages, errorAiMessage]);
    } finally {
      setIsAiTyping(false);
    }
  };

  useEffect(() => {
    if (chatMessages.length > 0 && chatFlatListRef.current) {
      chatFlatListRef.current.scrollToEnd({ animated: true });
    }
  }, [chatMessages]);

  const renderProductItem = ({ item }: { item: ProductFromDB }) => (
  <View style={styles.productCardWrapper} key={item.id}>
    <ProductCard
      id={item.id}
      name={item.name}
      price={item.price}
      imageUrl={item.image_url}
      category={item.category_name}
      rating={item.rating}
      isFeatured={item.is_featured}
      isFavorite={item.isFavorite}
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id, name: item.name } })}      onToggleFavorite={() => toggleFavorite(item.id)}
    />
  </View>
);

  const renderRecentScanItem = (item: ScannedItem, index: number) => (
    <TouchableOpacity key={item.id} style={styles.recentScanCard} onPress={() => router.push('/tracking/history')}>
        <Ionicons name="document-text-outline" size={24} color="#4EA8DE" style={styles.recentScanIcon} />
        <View style={styles.recentScanContent}><Text style={Fonts.medium} numberOfLines={2}>{item.name}</Text><Text style={Fonts.small}>Scanned: {new Date(item.scannedAt).toLocaleDateString()}</Text></View>
        <Ionicons name="chevron-forward-outline" size={20} color="#A0AEC0" />
    </TouchableOpacity>
  );

  const renderChatMessage = ({ item }: { item: ChatMessage }) => (
    <View style={[styles.chatMessageBubble, item.sender === 'user' ? styles.userMessageBubble : styles.aiMessageBubble]}>
      <Text style={item.sender === 'user' ? styles.userMessageText : styles.aiMessageText}>{item.text}</Text>
      <Text style={[styles.chatMessageTimestamp, item.sender === 'user' ? styles.userMessageTimestamp : styles.aiMessageTimestamp]}>{item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
    </View>
  );

  const quickActions = [
  {
    icon: <Ionicons name="scan" size={28} color="#000000" />,
    label: 'Scan',
    onPress: () => router.push('/(tabs)/Scan'),
    character: <GreenGerm fill='#E3E430' width={100} height={100} />,
  },
  {
    icon: <Ionicons name="person" size={28} color="#000000" />,
    label: 'Profile',
    onPress: () => router.push('/(tabs)/profile'),
    character: <GreenGerm fill='#4EA8DE' width={100} height={100} />,
  },
  {
    icon: <Ionicons name="cart" size={28} color="#000000" />,
    label: 'Shop',
    onPress: () => router.push('/(tabs)/shop'),
    character: <GreenGerm fill='#4EA8DE' width={100} height={100} />,
  },
  {
    icon: <Ionicons name="time" size={28} color="#000000" />,
    label: 'History',
    onPress: () => router.push('/tracking/history'),
    character: <GreenGerm fill='#4EA8DE' width={100} height={100} />,
  },
];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="dark" />
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable onPress={handleProfilePress} style={styles.profileContainer}>
              {loadingProfile ? <ActivityIndicator size="small" color="#4EA8DE" />
                : userProfile?.avatar_url ? <Image source={{ uri: userProfile.avatar_url }} style={styles.profileImage} resizeMode="cover" />
                  : <View style={styles.profileImagePlaceholder}><Ionicons name="person-outline" size={20} color="#A0AEC0" /></View>
              }
            </Pressable>
          
            <View style={styles.welcomeSection}>
              <Text style={ Fonts.medium }>Welcome back, {userProfile?.full_name?.split(' ')[0] || userProfile?.username || 'User'}!</Text>
            </View>

            <Pressable onPress={handleBellPress} style={styles.notificationBellContainer}><Ionicons name="notifications-outline" size={26} color="#000000" />{hasNewNotifications && <View style={styles.notificationDot} />}</Pressable>
          </View>
        <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>

            <View style={styles.quickActionsSection}>
              <View style={styles.sectionHeader}>
                <Text style={[Fonts.subtitle, {marginTop: 20}]}>Quick Actions</Text>
              </View>
              <QuickActionCard actions={quickActions} />
            </View>
          
          {scannedItemsHistory.length > 0 && (
            <View style={styles.recentScansSection}>
              <View style={styles.sectionHeader}>
                <Text style={Fonts.subtitle}>Recent Scans</Text>
                <TouchableOpacity onPress={() => router.push('../tracking/history')}>
                  <Text style={styles.seeAllLink}>See All</Text>
                </TouchableOpacity>
              </View>
              {scannedItemsHistory.slice(0, 3).map((item, index) => renderRecentScanItem(item, index))}
            </View>
          )}

          <View style={styles.featuredProductsSection}>
            <View style={styles.sectionHeader}><Text style={Fonts.subtitle}>Featured Products</Text><TouchableOpacity onPress={() => router.push('/(tabs)/shop')}><Text style={styles.seeAllLink}>View All</Text></TouchableOpacity></View>
            {loadingProducts ? (
                <ActivityIndicator size="large" color="#4EA8DE" style={{marginVertical: 40}} />
            ) : dbProducts.length > 0 ? (
                <View style={styles.featuredProductsGrid}>
                    {dbProducts.map((item) => (
                        renderProductItem({ item })
                    ))}
                </View>
            ) : (
                <Text style={styles.noProductsText}>No featured products available right now.</Text>
            )}
          </View>

          <View style={styles.specialOffersSection}>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Special Offers</Text><TouchableOpacity onPress={() => router.push('/(tabs)/shop')}><Text style={styles.seeAllLink}>View All</Text></TouchableOpacity></View>
            <View style={styles.offerCard}><LinearGradient colors={['#FFD700', '#FFA500']} style={styles.offerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}><View style={styles.offerContent}><View><Text style={styles.offerTitle}>Summer Sale!</Text><Text style={styles.offerText}>20% off all gluten-free products</Text></View><Ionicons name="pricetag" size={48} color="#FFFFFF" /></View></LinearGradient></View>
          </View>
        </ScrollView>
      </View>
      

      <Modal animationType="fade" transparent={true} visible={isProfileOptionsVisible} onRequestClose={() => setIsProfileOptionsVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setIsProfileOptionsVisible(false)}>
          <View style={styles.modalOverlay}><Animated.View style={[styles.profileOptionsModal, { opacity: menuFadeAnim, top: insets.top + 10, left: 16 }]}>{(userProfile?.full_name || userProfile?.username) && (<View style={styles.modalProfileHeader}><Text style={styles.modalProfileName} numberOfLines={1}>{userProfile.full_name || userProfile.username}</Text>{userProfile.full_name && userProfile.username && (<Text style={styles.modalProfileUsername} numberOfLines={1}>@{userProfile.username}</Text>)}</View>)}<TouchableOpacity style={styles.modalOptionButton} onPress={handleVisitProfile}><Ionicons name="person-outline" size={20} color="#000000" style={styles.modalOptionIcon} /><Text style={styles.modalOptionText}>Visit Profile</Text></TouchableOpacity><TouchableOpacity style={styles.modalOptionButton} onPress={handleChangeAccount}><Ionicons name="swap-horizontal-outline" size={20} color="#000000" style={styles.modalOptionIcon} /><Text style={styles.modalOptionText}>Change Account</Text></TouchableOpacity><TouchableOpacity style={styles.modalOptionButton} onPress={handleLogout}><Ionicons name="log-out-outline" size={20} color="#E53E3E" style={styles.modalOptionIcon} /><Text style={[styles.modalOptionText, { color: '#E53E3E' }]}>Logout</Text></TouchableOpacity></Animated.View></View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal animationType="fade" transparent={true} visible={isNotificationsModalVisible} onRequestClose={() => setIsNotificationsModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setIsNotificationsModalVisible(false)}>
          <View style={styles.modalOverlay}><Animated.View style={[styles.notificationsModal, { opacity: notificationsMenuFadeAnim, top: insets.top + 10, right: 16 }]}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Recent Scans</Text></View>{scannedItemsHistory.length > 0 ? (<FlatList data={scannedItemsHistory.slice(0, 15)} keyExtractor={(item) => item.id} renderItem={({ item, index }) => (<View style={[styles.notificationItem, index === scannedItemsHistory.slice(0,15).length -1 && styles.notificationItemLast]}><Ionicons name="barcode-outline" size={22} color="#4EA8DE" style={styles.notificationItemIcon} /><View style={styles.notificationItemContent}><Text style={styles.notificationItemText} numberOfLines={2}>{item.name}</Text><Text style={styles.notificationItemTimestamp}>{new Date(item.scannedAt).toLocaleDateString()} • {new Date(item.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</Text></View></View>)}/>) : ( <View style={styles.notificationItem}><Text style={styles.noNotificationsText}>No scan history yet</Text></View> )}{scannedItemsHistory.length > 0 && (<TouchableOpacity style={styles.clearHistoryButton} onPress={handleClearScanHistoryForNotificationModal}><Ionicons name="trash-outline" size={18} color="#E53E3E" style={{marginRight: 8}}/><Text style={styles.clearHistoryButtonText}>Clear Scan History</Text></TouchableOpacity>)}</Animated.View></View>
        </TouchableWithoutFeedback>
      </Modal>

      <TouchableOpacity style={styles.chatFab} onPress={toggleChatVisibility}>
        <Ionicons name="chatbubbles-outline" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isChatVisible}
        onRequestClose={toggleChatVisibility}
      >
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.chatModalOverlay}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          <TouchableWithoutFeedback onPress={toggleChatVisibility}>
            <View style={styles.chatModalBackdrop} />
          </TouchableWithoutFeedback>

          <View style={styles.chatModalContainer}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatHeaderText}>Allergy & Health Assistant</Text>
              <TouchableOpacity onPress={toggleChatVisibility} style={styles.chatCloseButton}>
                <Ionicons name="close-circle" size={28} color="#A0AEC0" />
              </TouchableOpacity>
            </View>

            <FlatList
              ref={chatFlatListRef}
              data={chatMessages}
              renderItem={renderChatMessage}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.chatMessagesContainer}
              ListEmptyComponent={
                !isAiTyping ? (
                    <View style={styles.emptyChatContainer}>
                        <Ionicons name="leaf-outline" size={48} color="#E0E0E0" style={{marginBottom:10}}/>
                        <Text style={styles.emptyChatMessage}>Ask me about food allergies, ingredients, or health benefits!</Text>
                    </View>
                ) : null
              }
            />

            {isAiTyping && (
              <View style={styles.typingIndicatorContainer}>
                <Text style={styles.aiTypingText}>Assistant is typing</Text>
                <ActivityIndicator size="small" color="#4EA8DE" style={{marginLeft: 8}}/>
              </View>
            )}

            <View style={styles.chatInputContainer}>
              <TextInput
                ref={chatInputRef}
                style={styles.chatInput}
                placeholder="Ask about allergens, health..."
                placeholderTextColor="#A0AEC0"
                value={currentChatMessage}
                onChangeText={setCurrentChatMessage}
                multiline
                onSubmitEditing={handleSendChatMessage}
              />
              <TouchableOpacity
                style={[styles.chatSendButton, !currentChatMessage.trim() && styles.chatSendButtonDisabled]}
                onPress={handleSendChatMessage}
                disabled={!currentChatMessage.trim() || isAiTyping}
              >
                <Ionicons name="send" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFF', },
  scrollView: { flex: 1, },
  container: { flex: 1, paddingHorizontal: PRODUCT_CARD_HORIZONTAL_PADDING, paddingTop: Platform.OS === 'ios' ? 8 : 10, },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, paddingTop: Platform.OS === 'ios' ? 0 : 5 },
  profileContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0F4FE', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginRight: 10, borderWidth: 1, borderColor: '#E0E0E0'},
  profileImage: { width: '100%', height: '100%', },
  profileImagePlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4FE'},
  notificationBellContainer: { padding: 8, position: 'relative', marginLeft: 'auto', },
  notificationDot: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53E3E', borderWidth: 1.5, borderColor: '#FFFFFF' },
  welcomeSection: { textAlign: 'left', justifyContent: 'flex-start'},
  welcomeText: { fontSize: 24, fontWeight: '700', color: '#1A202C', marginBottom: 4, },
  welcomeSubtext: { fontSize: 16, color: '#718096', },

  recentScansSection: { marginBottom: 24, },
  recentScanCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#rgba(255, 255, 255, 0.76)', 
    borderRadius: 12, 
    padding: 15, 
    marginBottom: 10,
    borderWidth: 1, 
    borderColor: '#E0E0E0'
  },
  recentScanIcon: { marginRight: 12, },
  recentScanContent: { flex: 1, },
  recentScanName: { fontSize: 15, fontWeight: '600', color: '#000000', marginBottom: 3, },
  recentScanTimestamp: { fontSize: 12, color: '#718096', },

  featuredProductsSection: { marginBottom: 24, },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#000000', },
  seeAllLink: { fontFamily: 'mediumFont', fontSize: 14, color: '#4EA8DE', fontWeight: '600', },

  featuredProductsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  productCardWrapper: {
    width: PRODUCT_CARD_WIDTH,
    marginBottom: PRODUCT_CARD_MARGIN * 2,
  },
  noProductsText: {
    textAlign: 'center',
    color: '#718096',
    fontSize: 15,
    marginTop: 20,
  },

  quickActionsSection: { marginBottom: 10, },
  quickActionsGrid: { flexDirection: 'column', gap: 0, },
  quickActionCard: { 
    height: 100, 
    borderColor: '#E0E0E0',
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
    borderRadius: 12, 
    marginBottom: 16, 
    overflow: 'hidden', 
  },
  actionContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  actionGradient: { flex: 1, justifyContent: 'center', alignItems: 'center', padding:10 },
  quickActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  scanAction: { shadowColor: '#4EA8DE', },
  profileAction: { shadowColor: '#00F2FE', },
  shopAction: { shadowColor: '#FF9A9E', },
  historyAction: { shadowColor: '#A18CD1', },
  specialOffersSection: { marginBottom: 24, },
  offerCard: { height: 120, borderRadius: 12, overflow: 'hidden', elevation: 3, shadowColor: '#FFA500', shadowOpacity: 0.3, shadowOffset: {width: 0, height: 2}, shadowRadius: 5 },
  offerGradient: { flex: 1, padding: 16, },
  offerContent: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', },
  offerTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4, },
  offerText: { fontSize: 14, color: '#FFFFFF', },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', },
  profileOptionsModal: { backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 8, minWidth: 200, position: 'absolute', },
  modalProfileHeader: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4FE', marginBottom: 8, },
  modalProfileName: { fontSize: 16, fontWeight: '600', color: '#000000', },
  modalProfileUsername: { fontSize: 13, color: '#718096', marginTop: 2, },
  modalOptionButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, },
  modalOptionIcon: { marginRight: 12, width: 20, alignItems: 'center' },
  modalOptionText: { fontSize: 15, color: '#000000', fontWeight: '500' },
  notificationsModal: { backgroundColor: '#FFFFFF', borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 8, minWidth: 280, maxWidth: '90%', maxHeight: '70%', position: 'absolute', overflow: 'hidden' },
  modalHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4FE', },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#000000', },
  notificationItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F8FAFF', },
  notificationItemLast: { borderBottomWidth: 0, },
  notificationItemIcon: { marginRight: 12, marginTop: 2 },
  notificationItemContent: { flex: 1 },
  notificationItemText: { fontSize: 14, color: '#334155', fontWeight: '500', lineHeight: 18, marginBottom: 3 },
  notificationItemTimestamp: { fontSize: 11, color: '#64748B', },
  noNotificationsText: { textAlign: 'center', color: '#64748B', paddingVertical: 25, fontSize: 14, },
  clearHistoryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#F0F4FE', backgroundColor: '#FFF7F7' },
  clearHistoryButtonText: { fontSize: 14, color: '#E53E3E', fontWeight: '500', },

  chatFab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4EA8DE',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 1000,
  },
  chatModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  chatModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  chatModalContainer: {
    height: height * 0.75,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#F8FAFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  chatHeaderText: {
    fontFamily: 'titleFont',
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  chatCloseButton: {
    padding: 5,
  },
  chatMessagesContainer: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexGrow: 1,
  },
  chatMessageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    marginBottom: 10,
  },
  userMessageBubble: {
    backgroundColor: '#4EA8DE',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  aiMessageBubble: {
    backgroundColor: '#E0E0E0',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  userMessageText: {
    fontFamily: 'bodyFont',
    fontSize: 15,
    lineHeight: 20,
    color: '#FFFFFF',
  },
  aiMessageText: {
      fontFamily: 'bodyFont',
      fontSize: 15,
      lineHeight: 20,
      color: '#000000',
  },
  chatMessageTimestamp: {
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  userMessageTimestamp: {
    color: '#FFFFFF',
  },
  aiMessageTimestamp: {
    color: '#000000',
  },
  emptyChatContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyChatMessage: {
    fontSize: 15,
    color: '#718096',
    textAlign: 'center',
    lineHeight: 22,
  },
  typingIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  aiTypingText: {
    fontSize: 14,
    color: '#718096',
    fontStyle: 'italic',
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#F0F4FE',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
    color: '#000000',
    marginRight: 10,
    maxHeight: 100,
  },
  chatSendButton: {
    backgroundColor: '#4EA8DE',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatSendButtonDisabled: {
    backgroundColor: '#A0AEC0',
  },
});

export default HomeScreen;
