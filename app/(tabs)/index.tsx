import GreenGerm from '@/components/GreenGerm';
import { supabase } from '@/lib/supabase';
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

// Constants
const { width } = Dimensions.get('window');
const PRODUCT_CARD_HORIZONTAL_PADDING = 16;
const PRODUCT_CARD_MARGIN = 8;
const NUM_COLUMNS = 2;
const PRODUCT_CARD_WIDTH = (width - (PRODUCT_CARD_HORIZONTAL_PADDING * 2) - (PRODUCT_CARD_MARGIN * (NUM_COLUMNS - 1))) / NUM_COLUMNS;
const LAST_SEEN_SCAN_COUNT_KEY = '@lastSeenScanCount';
const CURRENT_SESSION_ID_KEY = '@currentAppSessionId';
const DEEPSEEK_API_KEY = 'sk-463297a1e36a423ba2885d6b2a4ca5ca';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// Types
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
  categories?: { name: string } | null;
  category_name?: string;
  isFavorite?: boolean;
}

interface UserProfileHeader {
  id: string;
  avatar_url: string | null;
  full_name: string | null;
  username: string | null;
  allergies?: string[] | string | null;
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

// Main Component
const HomeScreen = () => {
  // Hooks: State & Refs
  const insets = useSafeAreaInsets();
  const [isProfileOptionsVisible, setIsProfileOptionsVisible] = useState(false);
  const menuFadeAnim = useRef(new Animated.Value(0)).current;
  const [userProfile, setUserProfile] = useState<UserProfileHeader | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isCurrentUserAdmin, setIsCurrentUserAdmin] = useState(false);

  const [scannedItemsHistory, setScannedItemsHistory] = useState<ScannedItem[]>([]);
  const [loadingScanHistory, setLoadingScanHistory] = useState(true);

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

  const [isSetupProfileModalVisible, setIsSetupProfileModalVisible] = useState(false);
  const [hasShownProfileSetupPromptThisSession, setHasShownProfileSetupPromptThisSession] = useState(false);

  // Animations
  useEffect(() => {
    Animated.timing(menuFadeAnim, {
      toValue: isProfileOptionsVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true
    }).start();
  }, [isProfileOptionsVisible]);

  useEffect(() => {
    Animated.timing(notificationsMenuFadeAnim, {
      toValue: isNotificationsModalVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true
    }).start();
  }, [isNotificationsModalVisible]);

  // Data Fetching & Auth
  const checkAdminStatus = async (userId: string) => {
    if (!userId) {
      setIsCurrentUserAdmin(false);
      return;
    }
    try {
      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', userId)
        .single();
      if (adminError && adminError.code !== 'PGRST116') throw adminError;
      setIsCurrentUserAdmin(!!adminData);
    } catch {
      setIsCurrentUserAdmin(false);
    }
  };

  const fetchDbProducts = async () => {
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`id, name, price, image_url, category_id, rating, is_featured, description, categories ( name )`)
        .eq('is_featured', true)
        .limit(6);
      if (error) throw error;
      if (data) {
        const transformedData = data.map(p => {
          let categoryName = 'Uncategorized';
          let categoriesObj: { name: string } | null = null;
          if (Array.isArray(p.categories) && p.categories.length > 0) {
            categoryName = p.categories[0]?.name || 'Uncategorized';
            categoriesObj = { name: p.categories[0]?.name || 'Uncategorized' };
          } else if (p.categories && typeof p.categories === 'object' && 'name' in p.categories && typeof (p.categories as { name: string }).name === 'string') {
            categoryName = (p.categories as { name: string }).name;
            categoriesObj = { name: (p.categories as { name: string }).name };
          }
          return { ...p, category_name: categoryName, categories: categoriesObj, isFavorite: false };
        });
        setDbProducts(transformedData);
      }
    } finally {
      setLoadingProducts(false);
    }
  };

  const checkAndShowProfileSetupModal = (profile: UserProfileHeader | null) => {
    if (profile && !hasShownProfileSetupPromptThisSession) {
      const allergies = profile.allergies;
      const allergiesNotSet =
        !allergies ||
        (Array.isArray(allergies) && allergies.length === 0) ||
        (typeof allergies === 'string' && allergies.trim() === '');
      if (allergiesNotSet) {
        setIsSetupProfileModalVisible(true);
        setHasShownProfileSetupPromptThisSession(true);
      }
    }
  };

  const fetchUserProfile = async () => {
    setLoadingProfile(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setUserProfile(null);
        setLoadingProfile(false);
        setIsCurrentUserAdmin(false);
        return;
      }
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, avatar_url, full_name, username, allergies')
        .eq('id', user.id)
        .single();
      if (profileError) throw profileError;
      setUserProfile(profileData);
      checkAndShowProfileSetupModal(profileData);
      if (profileData) await checkAdminStatus(profileData.id);
      else setIsCurrentUserAdmin(false);
    } catch {
      setUserProfile(null);
      setIsCurrentUserAdmin(false);
    } finally {
      setLoadingProfile(false);
    }
  };

  const fetchScanHistoryFromDB = async () => {
    setLoadingScanHistory(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setScannedItemsHistory([]);
        setHasNewNotifications(false);
        setLoadingScanHistory(false);
        return;
      }
      const { data, error } = await supabase
        .from('user_scan_history')
        .select('id, scan_data, scan_date')
        .eq('user_id', user.id)
        .order('scan_date', { ascending: false })
        .limit(3);
      if (error) throw error;
      if (data) {
        const items: ScannedItem[] = data.map(item => {
          let productName = 'Scanned Product';
          if (item.scan_data && typeof item.scan_data === 'object' && (item.scan_data as any).scanned_text) {
            productName = (item.scan_data as any).scanned_text.split('\n')[0] || 'Scanned Item';
          } else if (typeof item.scan_data === 'string') {
            try {
              const parsedScanData = JSON.parse(item.scan_data);
              if (parsedScanData && parsedScanData.scanned_text) {
                productName = parsedScanData.scanned_text.split('\n')[0] || 'Scanned Item';
              }
            } catch { }
          }
          return { id: item.id, name: productName, scannedAt: item.scan_date };
        });
        setScannedItemsHistory(items);
        const lastSeenCountStr = await AsyncStorage.getItem(LAST_SEEN_SCAN_COUNT_KEY);
        const lastSeenCount = lastSeenCountStr ? parseInt(lastSeenCountStr, 10) : 0;
        const { count: totalScans } = await supabase
          .from('user_scan_history')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        setHasNewNotifications(totalScans ? totalScans > lastSeenCount : items.length > lastSeenCount);
      } else {
        setScannedItemsHistory([]);
        setHasNewNotifications(false);
      }
    } finally {
      setLoadingScanHistory(false);
    }
  };

  // Initial Data Fetch & Auth State
  useEffect(() => {
    const fetchInitialData = async () => {
      await fetchUserProfile();
      await fetchScanHistoryFromDB();
      await fetchDbProducts();
    };
    fetchInitialData();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
        fetchUserProfile();
        fetchScanHistoryFromDB();
      } else if (event === 'SIGNED_OUT') {
        setUserProfile(null);
        setScannedItemsHistory([]);
        setHasNewNotifications(false);
        setHasShownProfileSetupPromptThisSession(false);
        setIsCurrentUserAdmin(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchUserProfile();
      fetchScanHistoryFromDB();
      fetchDbProducts();
    }, [])
  );

  // Handlers
  const handleProfilePress = useCallback(() => setIsProfileOptionsVisible(true), []);
  const handleVisitProfile = useCallback(() => {
    setIsProfileOptionsVisible(false);
    router.push('/(tabs)/profile');
  }, []);

  const clearLocalSessionData = async () => {
    await AsyncStorage.multiRemove([
      '@userToken',
      '@userProfile',
      LAST_SEEN_SCAN_COUNT_KEY,
      CURRENT_SESSION_ID_KEY
    ]);
  };

  const handleLogout = useCallback(async () => {
    setIsProfileOptionsVisible(false);
    try {
      const currentSessionId = await AsyncStorage.getItem(CURRENT_SESSION_ID_KEY);
      if (currentSessionId && userProfile?.id) {
        await supabase
          .from('user_sessions')
          .delete()
          .eq('id', currentSessionId)
          .eq('user_id', userProfile.id);
      }
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) Alert.alert('Logout Error', signOutError.message);
      else {
        await clearLocalSessionData();
        router.replace('/auth/login');
      }
    } catch (e) {
      Alert.alert('Logout Error', (e as Error).message);
    }
  }, [userProfile]);

  const handleChangeAccount = useCallback(async () => {
    setIsProfileOptionsVisible(false);
    try {
      const currentSessionId = await AsyncStorage.getItem(CURRENT_SESSION_ID_KEY);
      if (currentSessionId && userProfile?.id) {
        await supabase
          .from('user_sessions')
          .delete()
          .eq('id', currentSessionId)
          .eq('user_id', userProfile.id);
      }
      const { error } = await supabase.auth.signOut();
      if (error) Alert.alert('Logout Error', error.message);
      else {
        await clearLocalSessionData();
        router.replace('/auth/login');
      }
    } catch (e) {
      Alert.alert('Logout Error', (e as Error).message);
    }
  }, [userProfile]);

  const toggleFavorite = (productId: string) => {
    setDbProducts(prev =>
      prev.map(p =>
        p.id === productId ? { ...p, isFavorite: !p.isFavorite } : p
      )
    );
  };

  const handleBellPress = async () => {
    setIsNotificationsModalVisible(true);
    if (hasNewNotifications) {
      setHasNewNotifications(false);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { count: totalScans } = await supabase
          .from('user_scan_history')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        await AsyncStorage.setItem(LAST_SEEN_SCAN_COUNT_KEY, (totalScans || 0).toString());
      } catch { }
    }
  };

  const handleClearScanHistoryForNotificationModal = async () => {
    Alert.alert(
      "Clear Scan History?",
      "This will clear all your scan history from the database.",
      [
        { text: "Cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) {
                Alert.alert("Error", "You must be logged in to clear history.");
                return;
              }
              const { error: deleteError } = await supabase
                .from('user_scan_history')
                .delete()
                .eq('user_id', user.id);
              if (deleteError) {
                Alert.alert("Error", "Could not clear scan history. " + deleteError.message);
                return;
              }
              setScannedItemsHistory([]);
              setHasNewNotifications(false);
              await AsyncStorage.setItem(LAST_SEEN_SCAN_COUNT_KEY, '0');
              setIsNotificationsModalVisible(false);
              Alert.alert("Scan History Cleared!");
            } catch {
              Alert.alert("Error", "An unexpected error occurred while clearing history.");
            }
          }
        }
      ]
    );
  };

  // Chat
  const toggleChatVisibility = () => {
    setIsChatVisible(!isChatVisible);
    if (!isChatVisible && chatMessages.length === 0) {
      setChatMessages([
        {
          id: 'greet1',
          text: "Hi there! I'm your Allergy & Health Assistant. How can I help you today?",
          sender: 'ai',
          timestamp: new Date()
        }
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
      timestamp: new Date()
    };
    setChatMessages(prevMessages => [...prevMessages, newUserMessage]);
    setCurrentChatMessage('');
    setIsAiTyping(true);

    const apiMessages = [
      {
        role: 'system',
        content:
          "You are a friendly and helpful assistant specializing in food allergies, ingredient safety, health benefits of foods, and general nutrition. Provide concise and easy-to-understand information. If a query is outside your expertise, politely state that you cannot help with that specific topic."
      },
      ...chatMessages.slice(-5).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
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
          temperature: 0.7
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
          }
        }
      );
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const aiResponseText = response.data.choices[0].message.content;
        const newAiMessage: ChatMessage = {
          id: `ai-${Date.now()}`,
          text: aiResponseText.trim(),
          sender: 'ai',
          timestamp: new Date()
        };
        setChatMessages(prevMessages => [...prevMessages, newAiMessage]);
      } else {
        throw new Error('Invalid response structure from API');
      }
    } catch {
      const errorAiMessage: ChatMessage = {
        id: `ai-error-${Date.now()}`,
        text: "Sorry, I couldn't connect or process your request right now. Please try again later.",
        sender: 'ai',
        timestamp: new Date()
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

  // Profile Setup Modal
  const handleGoToProfileFromModal = () => {
    setIsSetupProfileModalVisible(false);
    router.push('/(tabs)/profile');
  };
  const handleSkipProfileSetup = () => setIsSetupProfileModalVisible(false);

  // Renderers
  const renderProductItem = ({ item }: { item: ProductFromDB }) => (
    <View style={styles.productCardWrapper} key={item.id}>
      <TouchableOpacity
        style={styles.productCard}
        onPress={() =>
          router.push({
            pathname: `./product/${item.id}`,
            params: { name: item.name, image_url: item.image_url }
          })
        }
        activeOpacity={0.8}
      >
        <View style={styles.productImageContainer}>
          <Image
            source={{
              uri: item.image_url || 'https://placehold.co/600x400/EAF2FF/9FB0C7?text=N/A'
            }}
            style={styles.productImage}
            resizeMode="cover"
          />
          {item.is_featured && (
            <View style={styles.productFeaturedBadge}>
              <Ionicons name="star" size={10} color="#000000" style={{ marginRight: 4 }} />
              <Text style={styles.productFeaturedBadgeText}>Featured</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={() => toggleFavorite(item.id)}
          >
            <Ionicons
              name={item.isFavorite ? "heart" : "heart-outline"}
              size={22}
              color={item.isFavorite ? "#FF3B30" : "#FFFFFF"}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.productDetails}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.productCategoryText}>{item.category_name}</Text>
          <View style={styles.productFooter}>
            <Text style={styles.productPrice}>${item.price.toFixed(2)}</Text>
            {item.rating !== null && item.rating !== undefined && (
              <View style={styles.ratingContainer}>
                <Ionicons name="star" size={14} color="#FFC94D" />
                <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.viewDetailsButton}
            onPress={() =>
              router.push({
                pathname: `./product/${item.id}`,
                params: { name: item.name, image_url: item.image_url }
              })
            }
          >
            <Text style={styles.viewDetailsButtonText}>View Details</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderRecentScanItem = (item: ScannedItem, index: number) => (
    <TouchableOpacity
      key={item.id}
      style={styles.recentScanCard}
      onPress={() => router.push('/tracking/history')}
    >
      <Ionicons name="document-text-outline" size={24} color="#4EA8DE" style={styles.recentScanIcon} />
      <View style={styles.recentScanContent}>
        <Text style={styles.recentScanName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.recentScanTimestamp}>Scanned: {new Date(item.scannedAt).toLocaleDateString()}</Text>
      </View>
      <Ionicons name="chevron-forward-outline" size={20} color="#A0AEC0" />
    </TouchableOpacity>
  );

  const renderChatMessage = ({ item }: { item: ChatMessage }) => (
    <View
      style={[
        styles.chatMessageBubble,
        item.sender === 'user' ? styles.userMessageBubble : styles.aiMessageBubble
      ]}
    >
      <Text style={item.sender === 'user' ? styles.userMessageText : styles.aiMessageText}>
        {item.text}
      </Text>
      <Text
        style={[
          styles.chatMessageTimestamp,
          item.sender === 'user' ? styles.userMessageTimestamp : styles.aiMessageTimestamp
        ]}
      >
        {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
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

  // Render
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right',  'left']}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: isCurrentUserAdmin ? 80 : 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={handleProfilePress} style={styles.profileContainer}>
              {loadingProfile ? (
                <ActivityIndicator size="small" color="#4EA8DE" />
              ) : userProfile?.avatar_url ? (
                <Image
                  source={{ uri: userProfile.avatar_url }}
                  style={styles.profileImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.profileImagePlaceholder}>
                  <Ionicons name="person-outline" size={20} color="#A0AEC0" />
                </View>
              )}
            </Pressable>
            <View style={styles.searchContainer}>
              <Text style={styles.welcomeText}>
                Welcome back, {userProfile?.full_name?.split(' ')[0] || userProfile?.username || 'User'}!
              </Text>
            </View>
            <Pressable onPress={handleBellPress} style={styles.notificationBellContainer}>
              <Ionicons name="notifications-outline" size={26} color="#2D3748" />
              {hasNewNotifications && <View style={styles.notificationDot} />}
            </Pressable>
          </View>

          {/* Quick Actions */}
            <View style={styles.quickActionsSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Quick Actions</Text>
              </View>
              <QuickActionCard actions={quickActions} />
            </View>

          {/* Recent Scans */}
          <View style={styles.recentScansSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Scans</Text>
              <TouchableOpacity onPress={() => router.push('/tracking/history')}>
                <Text style={styles.seeAllLink}>See All</Text>
              </TouchableOpacity>
            </View>
            {loadingScanHistory ? (
              <ActivityIndicator size="small" color="#4EA8DE" style={{ marginVertical: 20 }} />
            ) : scannedItemsHistory.length > 0 ? (
              scannedItemsHistory.slice(0, 3).map((item, index) => renderRecentScanItem(item, index))
            ) : (
              <Text style={styles.noScansText}>No recent scans yet. Start scanning products!</Text>
            )}
          </View>

          {/* Featured Products */}
          <View style={styles.featuredProductsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Featured Products</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/shop')}>
                <Text style={styles.seeAllLink}>View All</Text>
              </TouchableOpacity>
            </View>
            {loadingProducts ? (
              <ActivityIndicator size="large" color="#4EA8DE" style={{ marginVertical: 40 }} />
            ) : dbProducts.length > 0 ? (
              <View style={styles.featuredProductsGrid}>
                {dbProducts.map(item => renderProductItem({ item }))}
              </View>
            ) : (
              <Text style={styles.noProductsText}>No featured products available right now.</Text>
            )}
          </View>

          {/* Special Offers */}
          <View style={styles.specialOffersSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Special Offers</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/shop')}>
                <Text style={styles.seeAllLink}>View All</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.offerCard}>
              <LinearGradient
                colors={['#FFD700', '#FFA500']}
                style={styles.offerGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.offerContent}>
                  <View>
                    <Text style={styles.offerTitle}>Summer Sale!</Text>
                    <Text style={styles.offerText}>20% off all gluten-free products</Text>
                  </View>
                  <Ionicons name="pricetag" size={48} color="#FFFFFF" />
                </View>
              </LinearGradient>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Admin FAB */}
      {isCurrentUserAdmin && (
        <TouchableOpacity
          style={styles.adminFab}
          onPress={() => router.push('/admin/dashboard')}
        >
          <Ionicons name="shield-checkmark-outline" size={28} color="#000000" />
        </TouchableOpacity>
      )}

      {/* Chat FAB */}
      <TouchableOpacity style={styles.chatFab} onPress={toggleChatVisibility}>
        <Ionicons name="chatbubbles-outline" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Profile Options Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isProfileOptionsVisible}
        onRequestClose={() => setIsProfileOptionsVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsProfileOptionsVisible(false)}>
          <View style={styles.modalOverlay}>
            <Animated.View
              style={[
                styles.profileOptionsModal,
                { opacity: menuFadeAnim, top: insets.top + 10, left: 16 }
              ]}
            >
              {(userProfile?.full_name || userProfile?.username) && (
                <View style={styles.modalProfileHeader}>
                  <Text style={styles.modalProfileName} numberOfLines={1}>
                    {userProfile.full_name || userProfile.username}
                  </Text>
                  {userProfile.full_name && userProfile.username && (
                    <Text style={styles.modalProfileUsername} numberOfLines={1}>
                      @{userProfile.username}
                    </Text>
                  )}
                </View>
              )}
              <TouchableOpacity style={styles.modalOptionButton} onPress={handleVisitProfile}>
                <Ionicons name="person-outline" size={20} color="#2D3748" style={styles.modalOptionIcon} />
                <Text style={styles.modalOptionText}>Visit Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOptionButton} onPress={handleChangeAccount}>
                <Ionicons name="swap-horizontal-outline" size={20} color="#2D3748" style={styles.modalOptionIcon} />
                <Text style={styles.modalOptionText}>Change Account</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOptionButton} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={20} color="#E53E3E" style={styles.modalOptionIcon} />
                <Text style={[styles.modalOptionText, { color: '#E53E3E' }]}>Logout</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Notifications Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isNotificationsModalVisible}
        onRequestClose={() => setIsNotificationsModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsNotificationsModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <Animated.View
              style={[
                styles.notificationsModal,
                { opacity: notificationsMenuFadeAnim, top: insets.top + 10, right: 16 }
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Recent Scans</Text>
              </View>
              {scannedItemsHistory.length > 0 ? (
                <FlatList
                  data={scannedItemsHistory.slice(0, 15)}
                  keyExtractor={item => item.id}
                  renderItem={({ item, index }) => (
                    <View
                      style={[
                        styles.notificationItem,
                        index === scannedItemsHistory.slice(0, 15).length - 1 && styles.notificationItemLast
                      ]}
                    >
                      <Ionicons name="barcode-outline" size={22} color="#4EA8DE" style={styles.notificationItemIcon} />
                      <View style={styles.notificationItemContent}>
                        <Text style={styles.notificationItemText} numberOfLines={2}>{item.name}</Text>
                        <Text style={styles.notificationItemTimestamp}>
                          {new Date(item.scannedAt).toLocaleDateString()} • {new Date(item.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    </View>
                  )}
                />
              ) : (
                <View style={styles.notificationItem}>
                  <Text style={styles.noNotificationsText}>No scan history yet</Text>
                </View>
              )}
              {scannedItemsHistory.length > 0 && (
                <TouchableOpacity style={styles.clearHistoryButton} onPress={handleClearScanHistoryForNotificationModal}>
                  <Ionicons name="trash-outline" size={18} color="#E53E3E" style={{ marginRight: 8 }} />
                  <Text style={styles.clearHistoryButtonText}>Clear Scan History</Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Chat Modal */}
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
              keyExtractor={item => item.id}
              contentContainerStyle={styles.chatMessagesContainer}
              ListEmptyComponent={
                !isAiTyping ? (
                  <View style={styles.emptyChatContainer}>
                    <Ionicons name="leaf-outline" size={48} color="#CBD5E0" style={{ marginBottom: 10 }} />
                    <Text style={styles.emptyChatMessage}>
                      Ask me about food allergies, ingredients, or health benefits!
                    </Text>
                  </View>
                ) : null
              }
            />
            {isAiTyping && (
              <View style={styles.typingIndicatorContainer}>
                <Text style={styles.aiTypingText}>Assistant is typing</Text>
                <ActivityIndicator size="small" color="#4EA8DE" style={{ marginLeft: 8 }} />
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
                style={[
                  styles.chatSendButton,
                  !currentChatMessage.trim() && styles.chatSendButtonDisabled
                ]}
                onPress={handleSendChatMessage}
                disabled={!currentChatMessage.trim() || isAiTyping}
              >
                <Ionicons name="send" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Profile Setup Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isSetupProfileModalVisible}
        onRequestClose={() => setIsSetupProfileModalVisible(false)}
      >
        <View style={styles.setupModalOverlay}>
          <View style={styles.setupModalView}>
            <Ionicons name="settings-outline" size={48} color="#4EA8DE" style={{ marginBottom: 15 }} />
            <Text style={styles.setupModalTitle}>Complete Your Profile</Text>
            <Text style={styles.setupModalMessage}>
              To get accurate allergy alerts and personalized insights, please set up your allergy information in your profile.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.setupModalButton,
                styles.setupModalButtonPrimary,
                pressed && styles.primaryButtonPressed
              ]}
              onPress={handleGoToProfileFromModal}
            >
              <Text style={styles.setupModalButtonTextPrimary}>Go to Profile</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.setupModalButton,
                styles.setupModalButtonSecondary,
                pressed && { opacity: 0.8 }
              ]}
              onPress={handleSkipProfileSetup}
            >
              <Text style={styles.setupModalButtonTextSecondary}>Later</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// Styles
const styles = StyleSheet.create({
 safeArea: { flex: 1, backgroundColor: '#F8FAFF', },
  scrollView: { flex: 1, },
  container: { flex: 1, paddingHorizontal: PRODUCT_CARD_HORIZONTAL_PADDING, paddingTop: Platform.OS === 'ios' ? 8 : 10, },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingTop: Platform.OS === 'ios' ? 0 : 10 },
  profileContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0F4FE', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0'},
  profileImage: { width: '100%', height: '100%', },
  profileImagePlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4FE'},
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: Platform.OS === 'ios' ? 10 : 8, marginLeft: 12, marginRight: 12, height: 40,},
  searchIcon: { marginRight: 8, },
  searchInput: { flex: 1, color: '#2D3748', fontSize: 14, padding: 0, margin: 0, height: '100%', },
  notificationBellContainer: { padding: 8, position: 'relative', marginRight: -8 },
  notificationDot: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53E3E', borderWidth: 1.5, borderColor: '#FFFFFF' },
  welcomeSection: { marginBottom: 24, },
  welcomeText: { fontSize: 16, fontWeight: '500', color: '#1A202C', marginBottom: 4, },
  welcomeSubtext: { fontSize: 16, color: '#718096', },

  recentScansSection: { marginBottom: 24, },
  recentScanCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 15, marginBottom: 10, shadowColor: "#B0C4DE", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2, borderWidth: 1, borderColor: '#F0F4FE'},
  recentScanIcon: { marginRight: 12, },
  recentScanContent: { flex: 1, },
  recentScanName: { fontSize: 15, fontWeight: '600', color: '#2D3748', marginBottom: 3, },
  recentScanTimestamp: { fontSize: 12, color: '#718096', },
  noScansText: { textAlign: 'center', color: '#718096', fontSize: 15, marginTop: 10, fontStyle: 'italic' },


  featuredProductsSection: { marginBottom: 24, },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#2D3748', },
  seeAllLink: { fontSize: 14, color: '#4EA8DE', fontWeight: '600', },

  featuredProductsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', },
  productCardWrapper: { width: PRODUCT_CARD_WIDTH, marginBottom: PRODUCT_CARD_MARGIN * 2, },
  productCard: { backgroundColor: '#FFFFFF', borderRadius: 12, shadowColor: '#9FB0C7', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4, overflow: 'hidden', },
  productImageContainer: { height: PRODUCT_CARD_WIDTH * 0.9, position: 'relative', backgroundColor: '#F0F4F8', borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden', },
  productImage: { width: '100%', height: '100%', },
  productFeaturedBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: '#E3E430', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', },
  productFeaturedBadgeText: { color: '#000000', fontSize: 10, fontWeight: 'bold', },
  favoriteButton: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center', },
  productDetails: { padding: 10, },
  productName: { fontSize: 14, fontWeight: '600', color: '#2D3748', marginBottom: 3, minHeight: 34, },
  productCategoryText: { fontSize: 11, color: '#718096', marginBottom: 5, textTransform: 'capitalize', },
  productFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, },
  productPrice: { fontSize: 15, fontWeight: 'bold', color: '#4EA8DE', },
  ratingContainer: { flexDirection: 'row', alignItems: 'center', },
  ratingText: { fontSize: 12, color: '#4A5568', marginLeft: 3, fontWeight: '500', },
  viewDetailsButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4EA8DE', paddingVertical: 8, borderRadius: 8, marginTop: 10, },
  viewDetailsButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', },
  noProductsText: { textAlign: 'center', color: '#718096', fontSize: 15, marginTop: 20, },

  quickActionsSection: { marginBottom: 24, },
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', },
  quickActionCard: { width: '48%', height: 100, backgroundColor: '#E3E430',borderRadius: 12, marginBottom: 16, overflow: 'hidden', },
  actionGradient: { flex: 1, justifyContent: 'center', alignItems: 'center', padding:10 },
  quickActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  scanAction: { shadowColor: '#764BA2', },
  profileAction: { shadowColor: '#00F2FE', },
  shopAction: { shadowColor: '#FF9A9E', },
  historyAction: { shadowColor: '#A18CD1', },
  specialOffersSection: { marginBottom: 24, },
  offerCard: { height: 120, borderRadius: 12, overflow: 'hidden', elevation: 3, shadowColor: '#FFA500', shadowOpacity: 0.3, shadowOffset: {width: 0, height: 2}, shadowRadius: 5 },
  offerGradient: { flex: 1, padding: 16, },
  offerContent: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', },
  offerTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4, },
  offerText: { fontSize: 14, color: '#FFFFFF', },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  profileOptionsModal: { backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 8, minWidth: 200, position: 'absolute', },
  modalProfileHeader: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4FE', marginBottom: 8, },
  modalProfileName: { fontSize: 16, fontWeight: '600', color: '#2D3748', },
  modalProfileUsername: { fontSize: 13, color: '#718096', marginTop: 2, },
  modalOptionButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, },
  modalOptionIcon: { marginRight: 12, width: 20, alignItems: 'center' },
  modalOptionText: { fontSize: 15, color: '#2D3748', fontWeight: '500' },
  notificationsModal: { backgroundColor: '#FFFFFF', borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 8, minWidth: 280, maxWidth: '90%', maxHeight: '70%', position: 'absolute', overflow: 'hidden' },
  modalHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4FE', },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#2D3748', },
  notificationItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F8FAFF', },
  notificationItemLast: { borderBottomWidth: 0, },
  notificationItemIcon: { marginRight: 12, marginTop: 2 },
  notificationItemContent: { flex: 1 },
  notificationItemText: { fontSize: 14, color: '#334155', fontWeight: '500', lineHeight: 18, marginBottom: 3 },
  notificationItemTimestamp: { fontSize: 11, color: '#64748B', },
  noNotificationsText: { textAlign: 'center', color: '#64748B', paddingVertical: 25, fontSize: 14, },
  clearHistoryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#F0F4FE', backgroundColor: '#FFF7F7' },
  clearHistoryButtonText: { fontSize: 14, color: '#E53E3E', fontWeight: '500', },

  chatFab: { position: 'absolute', bottom: 30, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: '#4EA8DE', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 8, zIndex: 1000, },
  adminFab: { position: 'absolute', bottom: 100, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: '#E3E430', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 9, zIndex: 1000, },
  chatModalOverlay: { flex: 1, justifyContent: 'flex-end', },
  chatModalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.5)', },
  chatModalContainer: { height: '90%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 0, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 5, elevation: 10, },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#F8FAFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, },
  chatHeaderText: { fontSize: 18, fontWeight: '600', color: '#2D3748', },
  chatCloseButton: { padding: 5 },
  chatMessagesContainer: { paddingVertical: 10, paddingHorizontal: 12, flexGrow: 1, },
  chatMessageBubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, marginBottom: 10, },
  userMessageBubble: { backgroundColor: '#4EA8DE', alignSelf: 'flex-end', borderBottomRightRadius: 4, },
  aiMessageBubble: { backgroundColor: '#E2E8F0', alignSelf: 'flex-start', borderBottomLeftRadius: 4, },
  userMessageText: { fontSize: 15, lineHeight: 20, color: '#FFFFFF', },
  aiMessageText: { fontSize: 15, lineHeight: 20, color: '#2D3748', },
  chatMessageTimestamp: { fontSize: 10, alignSelf: 'flex-end', marginTop: 4, },
  userMessageTimestamp: { color: 'rgba(255,255,255,0.7)', },
  aiMessageTimestamp: { color: '#718096', },
  emptyChatContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, },
  emptyChatMessage: { fontSize: 15, color: '#718096', textAlign: 'center', lineHeight: 22, },
  typingIndicatorContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, },
  aiTypingText: { fontSize: 14, color: '#718096', fontStyle: 'italic', },
  chatInputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFFFFF', },
  chatInput: { flex: 1, backgroundColor: '#F0F4FE', borderRadius: 20, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 15, color: '#2D3748', marginRight: 10, maxHeight: 100, },
  chatSendButton: { backgroundColor: '#4EA8DE', borderRadius: 20, width: 40, height: 40, justifyContent: 'center', alignItems: 'center', },
  chatSendButtonDisabled: { backgroundColor: '#A0AEC0', },
  setupModalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', alignItems: 'center', },
  setupModalView: { margin: 20, backgroundColor: 'white', borderRadius: 20, padding: 30, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2, }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5, width: '90%', maxWidth: 400, },
  setupModalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2D3748', marginBottom: 15, textAlign: 'center', },
  setupModalMessage: { fontSize: 16, color: '#4A5568', textAlign: 'center', marginBottom: 25, lineHeight: 24, },
  setupModalButton: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20, elevation: 2, width: '100%', alignItems: 'center', marginBottom: 10, },
  setupModalButtonPrimary: { backgroundColor: '#4EA8DE', },
  setupModalButtonTextPrimary: { color: 'white', fontWeight: 'bold', fontSize: 16, },
  setupModalButtonSecondary: { backgroundColor: '#EDF2F7', },
  setupModalButtonTextSecondary: { color: '#4A5568', fontWeight: '500', fontSize: 16, },
  primaryButtonPressed: { opacity: 0.8, },
});


export default HomeScreen;
