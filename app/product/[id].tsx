import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Linking,
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
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height: screenHeight } = Dimensions.get('window');
const RELATED_CARD_WIDTH = width * 0.4;
const HEADER_VISUAL_HEIGHT = Platform.OS === 'ios' ? 60 : 70;
const BOTTOM_PANEL_PEEK_HEIGHT_PERCENTAGE = 0.25; 
const BOTTOM_PANEL_FULL_HEIGHT_PERCENTAGE = 0.70;


interface Product {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  image_url?: string | null;
  category_id?: string | null;
  category_name?: string;
  icon_name?: keyof typeof Ionicons.glyphMap | null;
  rating?: number | null;
  stock_quantity?: number;
  is_featured?: boolean;
}

interface StoreAvailability {
    store_id: string;
    store_name: string;
    store_address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    price_in_store?: number | null;
    stock_status?: string | null;
    product_url_at_store?: string | null;
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

const SHARED_SCANNED_ITEMS_STORAGE_KEY = '@scannedItemsHistory';
const LAST_SEEN_SCAN_COUNT_KEY = '@lastSeenScanCount';


const ProductDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const actualPeekHeight = screenHeight * BOTTOM_PANEL_PEEK_HEIGHT_PERCENTAGE;
  const actualFullHeight = screenHeight * BOTTOM_PANEL_FULL_HEIGHT_PERCENTAGE;

  const [product, setProduct] = useState<Product | null>(null);
  const [storeAvailability, setStoreAvailability] = useState<StoreAvailability[]>([]);
  const [relatedProductsList, setRelatedProductsList] = useState<Product[]>([]);


  const [isLoadingProduct, setIsLoadingProduct] = useState(true);
  const [isLoadingStores, setIsLoadingStores] = useState(false);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);

  const [isProfileOptionsVisible, setIsProfileOptionsVisible] = useState(false);
  const menuFadeAnim = useRef(new Animated.Value(0)).current;
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfileHeader | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [scannedItemsForBell, setScannedItemsForBell] = useState<ScannedItem[]>([]);
  const [isNotificationsModalVisible, setIsNotificationsModalVisible] = useState(false);
  const [hasNewNotificationsForBell, setHasNewNotificationsForBell] = useState(false);
  const notificationsMenuFadeAnim = useRef(new Animated.Value(0)).current;

  const panelHeightAnim = useRef(new Animated.Value(actualPeekHeight)).current;
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);

  useEffect(() => { Animated.timing(menuFadeAnim, { toValue: isProfileOptionsVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start(); }, [isProfileOptionsVisible]);
  useEffect(() => { Animated.timing(notificationsMenuFadeAnim, { toValue: isNotificationsModalVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start(); }, [isNotificationsModalVisible]);

  const fetchHeaderUserProfile = async () => {
    try {
      setLoadingProfile(true);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { setCurrentUserProfile(null); return; }
      const { data: profileData, error: profileError } = await supabase.from('profiles').select('avatar_url, full_name, username').eq('id', user.id).single<UserProfileHeader>();
      if (profileError) throw profileError;
      setCurrentUserProfile(profileData);
    } catch (err){ setCurrentUserProfile(null); }
    finally { setLoadingProfile(false); }
  };

   useEffect(() => {
    fetchHeaderUserProfile();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') fetchHeaderUserProfile();
      else if (event === 'SIGNED_OUT') setCurrentUserProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadSharedScannedDataForBell = async () => {
    try {
      const storedItems = await AsyncStorage.getItem(SHARED_SCANNED_ITEMS_STORAGE_KEY);
      const items: ScannedItem[] = storedItems ? JSON.parse(storedItems) : [];
      setScannedItemsForBell(items);
      const lastSeenCountStr = await AsyncStorage.getItem(LAST_SEEN_SCAN_COUNT_KEY);
      const lastSeenCount = lastSeenCountStr ? parseInt(lastSeenCountStr, 10) : 0;
      setHasNewNotificationsForBell(items.length > lastSeenCount);
    } catch (err){}
  };
  useFocusEffect(useCallback(() => { loadSharedScannedDataForBell(); }, []));

  const fetchProductDetails = async () => {
    if (!id) { setError("Product ID is missing."); setIsLoadingProduct(false); return; }
    setIsLoadingProduct(true); setError(null);
    try {
      const { data, error: productError } = await supabase.from('products').select(`*, categories ( name )`).eq('id', id).single();
      if (productError) throw productError;
      if (data) {
        const fetchedProduct = { ...data, category_name: (data.categories as any)?.name || 'N/A', };
        setProduct(fetchedProduct);
        if (fetchedProduct.category_id) { fetchRelatedProductsForDetailScreen(fetchedProduct.category_id, fetchedProduct.id); }
      } else { setError('Product not found.'); }
    } catch (err) { setError('Failed to load product details.'); }
    finally { setIsLoadingProduct(false); }
  };

  const fetchStoreAvailability = async () => {
    if (!id) return;
    setIsLoadingStores(true);
    try {
      const { data, error: availabilityError } = await supabase.from('product_store_availability').select(`price_in_store, is_available, product_url_at_store, stores (id, name, address, latitude, longitude)`).eq('product_id', id);
      if (availabilityError) throw availabilityError;
      const availabilityData = data?.map(item => ({
        store_id: (item.stores as any)?.id,
        store_name: (item.stores as any)?.name,
        store_address: (item.stores as any)?.address,
        latitude: (item.stores as any)?.latitude,
        longitude: (item.stores as any)?.longitude,
        price_in_store: item.price_in_store,
        stock_status: item.is_available ? 'In Stock' : 'Out of Stock',
        product_url_at_store: item.product_url_at_store,
      })).filter(store => store.latitude != null && store.longitude != null) || [];
      setStoreAvailability(availabilityData);
      if (availabilityData.length > 0 && mapRef.current) {
        const coordinates = availabilityData.map(s => ({ latitude: s.latitude!, longitude: s.longitude!, }));
        setTimeout(() => { mapRef.current?.fitToCoordinates(coordinates, { edgePadding: { top: HEADER_VISUAL_HEIGHT + insets.top + 20, right: 20, bottom: (isPanelExpanded ? actualFullHeight : actualPeekHeight) + insets.bottom + 20, left: 20 }, animated: true }); }, 500);
      }
    } catch (err){}
    finally { setIsLoadingStores(false); }
  };

  const fetchRelatedProductsForDetailScreen = async (categoryId: string, currentProductId: string) => {
    if (!categoryId) return;
    setIsLoadingRelated(true);
    try {
      const { data, error } = await supabase.from('products').select(`*, categories (name)`).eq('category_id', categoryId).neq('id', currentProductId).limit(6);
      if (error) throw error;
      const transformedData = data?.map(p => ({ ...p, category_name: (p.categories as any)?.name || 'N/A', })) || [];
      setRelatedProductsList(transformedData);
    } catch (err){}
    finally { setIsLoadingRelated(false); }
  };

  useEffect(() => { fetchProductDetails(); fetchStoreAvailability(); }, [id]);

  const handleViewOnMap = (store: StoreAvailability) => {
    if (store.latitude && store.longitude && mapRef.current) { mapRef.current.animateToRegion( { latitude: store.latitude, longitude: store.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005, }, 1000 ); } else { Alert.alert("Location not available", "This store's location is not available on the map."); }
  };

  const handleGetDirections = (store: StoreAvailability) => {
    if (store.latitude && store.longitude) { const scheme = `geo:${store.latitude},${store.longitude}?q=`; const latLng = `${store.latitude},${store.longitude}`; const label = encodeURIComponent(store.store_name || 'Store Location'); const url = `${scheme}${latLng}(${label})`; if (url) Linking.openURL(url).catch(() => Alert.alert("Error", "Could not open map application.")); } else { Alert.alert("Directions not available", "Cannot get directions for this store."); }
  };

  const handleProfilePressHeader = useCallback(() => setIsProfileOptionsVisible(p => !p), []);
  const clearAllUserDataForHeader = async () => { await AsyncStorage.multiRemove(['@userToken', '@userProfile', SHARED_SCANNED_ITEMS_STORAGE_KEY, LAST_SEEN_SCAN_COUNT_KEY,]); };
  const handleVisitProfileHeader = useCallback(() => { setIsProfileOptionsVisible(false); router.push('/(tabs)/profile'); }, []);
  const handleLogoutHeader = useCallback(async () => { setIsProfileOptionsVisible(false); try { const { error } = await supabase.auth.signOut(); if (error) Alert.alert('Logout Error', error.message); else { await clearAllUserDataForHeader(); setCurrentUserProfile(null); router.replace('/auth/login');}} catch (e: any) { Alert.alert('Logout Error', (e as Error).message || "An unknown error occurred"); }}, []);
  const handleChangeAccountHeader = useCallback(async () => { setIsProfileOptionsVisible(false); try { const { error } = await supabase.auth.signOut(); if (error) Alert.alert('Logout Error', error.message); else { await clearAllUserDataForHeader(); setCurrentUserProfile(null); router.replace('/auth/login');}} catch (e: any) { Alert.alert('Logout Error', (e as Error).message || "An unknown error occurred"); }}, []);
  const handleBellPressHeader = async () => { setIsNotificationsModalVisible(true); if (hasNewNotificationsForBell) { setHasNewNotificationsForBell(false); try { await AsyncStorage.setItem(LAST_SEEN_SCAN_COUNT_KEY, scannedItemsForBell.length.toString()); } catch {} }};
  const handleClearSharedScanHistoryForBell = async () => { Alert.alert("Clear Notifications?", "Clear all scan notifications?", [{ text: "Cancel" }, { text: "Clear", style: "destructive", onPress: async () => { setScannedItemsForBell([]); setHasNewNotificationsForBell(false); await AsyncStorage.removeItem(SHARED_SCANNED_ITEMS_STORAGE_KEY); await AsyncStorage.setItem(LAST_SEEN_SCAN_COUNT_KEY, '0'); setIsNotificationsModalVisible(false); Alert.alert("Cleared!"); }}]); };

  const renderRelatedProductItem = (item: Product) => (
    <TouchableOpacity key={item.id} style={styles.relatedProductCard} onPress={() => router.push({pathname: `../product/${item.id}`, params: {name: item.name}})}>
      <Image source={{ uri: item.image_url || 'https://placehold.co/150x120/EAF2FF/9FB0C7?text=N/A' }} style={styles.relatedProductImage} />
      <Text style={styles.relatedProductName} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.relatedProductPrice}>${item.price.toFixed(2)}</Text>
    </TouchableOpacity>
  );
   const renderRelatedProductItem2 = (item: Product) => (
    <TouchableOpacity key={item.id} style={styles.relatedProductCard} onPress={() => router.push({pathname: `../product/${item.id}`, params: {name: item.name}})}>
      <Image source={{ uri: item.image_url || 'https://placehold.co/150x120/EAF2FF/9FB0C7?text=N/A' }} style={styles.relatedProductImage} />
      <Text style={styles.relatedProductName} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.relatedProductPrice}>${item.price.toFixed(2)}</Text>
    </TouchableOpacity>
  );

  const togglePanel = () => {
    const toValue = isPanelExpanded ? actualPeekHeight : actualFullHeight;
    Animated.spring(panelHeightAnim, {
      toValue: toValue,
      friction: 9,
      tension: 70,
      useNativeDriver: false,
    }).start();
    setIsPanelExpanded(!isPanelExpanded);
  };

  if (isLoadingProduct) { return (<SafeAreaView style={styles.safeAreaViewContainer}><View style={styles.loadingContainer}><ActivityIndicator size="large" color="#4EA8DE" /><Text style={styles.loadingText}>Loading Product Details...</Text></View></SafeAreaView>); }
  if (error && !product) { return (<SafeAreaView style={styles.safeAreaViewContainer}><Stack.Screen options={{ title: "Error", headerBackVisible: true, headerTransparent: false, headerStyle:{backgroundColor: '#F7F9FC'}, headerTintColor: '#1D2939' }} /><View style={styles.errorContainer}><Ionicons name="alert-circle-outline" size={60} color="#D92D20" /><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={() => router.back()} style={styles.actionButton}><Text style={styles.actionButtonText}>Go Back</Text></TouchableOpacity></View></SafeAreaView>); }
  if (!product) { return (<SafeAreaView style={styles.safeAreaViewContainer}><Stack.Screen options={{ title: "Product Not Found", headerBackVisible: true, headerTransparent: false, headerStyle:{backgroundColor: '#F7F9FC'}, headerTintColor: '#1D2939' }} /><View style={styles.errorContainer}><Ionicons name="sad-outline" size={60} color="#98A2B3" /><Text style={styles.errorText}>Sorry, this product could not be found.</Text><TouchableOpacity onPress={() => router.back()} style={styles.actionButton}><Text style={styles.actionButtonText}>Back to Shop</Text></TouchableOpacity></View></SafeAreaView>); }

  const initialMapRegion = storeAvailability.length > 0 && storeAvailability[0].latitude && storeAvailability[0].longitude ? { latitude: storeAvailability[0].latitude, longitude: storeAvailability[0].longitude, latitudeDelta: 0.05, longitudeDelta: 0.05, } : { latitude: 31.8474, longitude: 35.7945, latitudeDelta: 0.15, longitudeDelta: 0.15, };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeAreaViewContainer} edges={['top', 'right', 'bottom', 'left']}>
        <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            initialRegion={initialMapRegion}
            showsUserLocation={true}
            mapPadding={{ top: HEADER_VISUAL_HEIGHT + insets.top + 10, right: 10, bottom: (isPanelExpanded ? actualFullHeight : actualPeekHeight) + insets.bottom + 10, left: 10 }}
        >
            {storeAvailability.map(store => (
                store.latitude && store.longitude && (
                    <Marker
                        key={store.store_id}
                        coordinate={{ latitude: store.latitude, longitude: store.longitude }}
                        title={store.store_name}
                        description={store.store_address || ''}
                        pinColor="#4EA8DE"
                        onPress={() => handleViewOnMap(store)}
                    />
                )
            ))}
        </MapView>

        <View style={styles.productDetail_Header}>
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)/shop')} style={styles.productDetail_HeaderBackButton}>
                <Ionicons name="arrow-back-outline" size={26} color="#1D2939" />
            </TouchableOpacity>
            <Pressable onPress={handleProfilePressHeader} style={styles.productDetail_HeaderProfileContainer}>
                {loadingProfile ? <ActivityIndicator size="small" color="#4EA8DE" />
                    : currentUserProfile?.avatar_url ? <Image source={{ uri: currentUserProfile.avatar_url }} style={styles.productDetail_HeaderProfileImage} resizeMode="cover" />
                    : <Ionicons name="person-outline" size={20} color="#A0AEC0" />
                }
            </Pressable>
            <View style={styles.productDetail_HeaderSearchContainer}>
                <Ionicons name="search-outline" size={18} color="#A0AEC0" style={styles.productDetail_HeaderSearchIcon} />
                <TextInput
                    placeholder="Search in shop..."
                    placeholderTextColor="#A0AEC0"
                    style={styles.productDetail_HeaderSearchInput}
                    editable={false}
                    onPressIn={() => router.push('/(tabs)/shop')}
                />
            </View>
            <Pressable onPress={handleBellPressHeader} style={styles.productDetail_HeaderNotificationBellContainer}>
                <Ionicons name="notifications-outline" size={26} color="#2D3748" />
                {hasNewNotificationsForBell && <View style={styles.productDetail_HeaderNotificationDot} />}
            </Pressable>
        </View>

        <Animated.View style={[styles.bottomPanel, { height: panelHeightAnim }]}>
            <TouchableOpacity onPress={togglePanel} activeOpacity={0.7} style={styles.panelHandleArea}>
                <View style={styles.panelHandle} />
            </TouchableOpacity>
            <ScrollView
                contentContainerStyle={styles.bottomPanelScrollViewContent}
                showsVerticalScrollIndicator={false}
                scrollEnabled={isPanelExpanded}
            >
                <View style={styles.bottomPanelContentContainer}>
                    <Text style={styles.bottomPanelProductName} numberOfLines={2}>{product.name}</Text>
                    {product.category_name && <Text style={styles.bottomPanelProductCategory}><Ionicons name="pricetag-outline" size={14} color="#4EA8DE"/> {product.category_name}</Text>}
                    <View style={styles.bottomPanelPriceRatingRow}>
                        <Text style={styles.bottomPanelProductPrice}>${product.price.toFixed(2)}</Text>
                        {product.rating !== null && product.rating !== undefined && (<View style={styles.bottomPanelRatingContainer}><Ionicons name="star" size={16} color="#FFBE0B" /><Text style={styles.bottomPanelRatingText}>{product.rating.toFixed(1)}</Text></View>)}
                    </View>
                    {product.description && (<View style={styles.bottomPanelDescriptionContainer}><Text style={styles.bottomPanelSectionTitle}>About this Product</Text><Text style={styles.bottomPanelProductDescription}>{product.description}</Text></View>)}

                    <View style={styles.bottomPanelStoreSection}>
                        <Text style={styles.bottomPanelSectionTitle}>Find in Stores</Text>
                        {isLoadingStores ? (<ActivityIndicator color="#4EA8DE" style={{ marginTop: 10, marginBottom: 10 }} />)
                        : storeAvailability.length > 0 ? (storeAvailability.map((store, index) => (
                            <View key={store.store_id || index.toString()} style={styles.bottomPanelStoreCard}>
                                <View style={styles.bottomPanelStoreIconContainer}><Ionicons name="storefront-outline" size={24} color="#4EA8DE" /></View>
                                <View style={styles.bottomPanelStoreInfo}>
                                    <Text style={styles.bottomPanelStoreName}>{store.store_name}</Text>
                                    {store.store_address && <Text style={styles.bottomPanelStoreAddress} numberOfLines={2}>{store.store_address}</Text>}
                                    <View style={styles.bottomPanelStoreDetailsRow}>
                                        {store.price_in_store && <Text style={styles.bottomPanelStorePrice}>${store.price_in_store.toFixed(2)}</Text>}
                                        {store.stock_status && <Text style={[styles.bottomPanelStockStatus, store.stock_status.toLowerCase() === 'in stock' ? styles.bottomPanelInStock : styles.bottomPanelOutOfStock]}>{store.stock_status}</Text>}
                                    </View>
                                </View>
                                <View style={styles.bottomPanelStoreActions}>
                                    <TouchableOpacity style={styles.bottomPanelActionButtonSmall} onPress={() => handleViewOnMap(store)}><Ionicons name="map-outline" size={18} color="#4EA8DE" /></TouchableOpacity>
                                    <TouchableOpacity style={[styles.bottomPanelActionButtonSmall, styles.bottomPanelDirectionsButton]} onPress={() => handleGetDirections(store)}><Ionicons name="navigate-outline" size={18} color="#FFFFFF" /></TouchableOpacity>
                                </View>
                            </View>
                        )))
                        : (<View style={styles.bottomPanelEmptyStateCard}><Ionicons name="information-circle-outline" size={20} color="#667085" /><Text style={styles.bottomPanelNoStoresText}>Availability information not yet available.</Text></View> )}
                    </View>

                    {relatedProductsList.length > 0 && (
                        <View style={styles.bottomPanelRelatedItemsSection}>
                            <Text style={styles.bottomPanelSectionTitle}>Related Items</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bottomPanelRelatedItemsContainer}>
                                {relatedProductsList.map(item => renderRelatedProductItem(item as Product))}
                                {relatedProductsList.map(item => renderRelatedProductItem2(item as Product))}
                            </ScrollView>
                        </View>
                    )}
                    {isLoadingRelated && <ActivityIndicator color="#4EA8DE" style={{ marginVertical: 15 }} />}
                </View>
            </ScrollView>
        </Animated.View>


      <Modal animationType="fade" transparent={true} visible={isProfileOptionsVisible} onRequestClose={() => setIsProfileOptionsVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setIsProfileOptionsVisible(false)}>
          <View style={styles.productDetail_ModalOverlay}>
            <Animated.View style={[styles.productDetail_ProfileOptionsModal, { opacity: menuFadeAnim, top: insets.top + HEADER_VISUAL_HEIGHT + 5, left: 16 }]}>
              {(currentUserProfile?.full_name || currentUserProfile?.username) && (<View style={styles.productDetail_ModalProfileHeader}><Text style={styles.productDetail_ModalProfileName} numberOfLines={1}>{currentUserProfile.full_name || currentUserProfile.username}</Text>{currentUserProfile.full_name && currentUserProfile.username && (<Text style={styles.productDetail_ModalProfileUsername} numberOfLines={1}>@{currentUserProfile.username}</Text>)}</View>)}
              <TouchableOpacity style={styles.productDetail_ModalOptionButton} onPress={handleVisitProfileHeader}><Ionicons name="person-outline" size={20} color="#344054" style={styles.productDetail_ModalOptionIcon} /><Text style={styles.productDetail_ModalOptionText}>Visit Profile</Text></TouchableOpacity>
              <TouchableOpacity style={styles.productDetail_ModalOptionButton} onPress={handleChangeAccountHeader}><Ionicons name="swap-horizontal-outline" size={20} color="#344054" style={styles.productDetail_ModalOptionIcon} /><Text style={styles.productDetail_ModalOptionText}>Change Account</Text></TouchableOpacity>
              <TouchableOpacity style={styles.productDetail_ModalOptionButton} onPress={handleLogoutHeader}><Ionicons name="log-out-outline" size={20} color="#D92D20" style={styles.productDetail_ModalOptionIcon} /><Text style={[styles.productDetail_ModalOptionText, { color: '#D92D20' }]}>Logout</Text></TouchableOpacity>
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal animationType="fade" transparent={true} visible={isNotificationsModalVisible} onRequestClose={() => setIsNotificationsModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setIsNotificationsModalVisible(false)}>
          <View style={styles.productDetail_ModalOverlay}>
            <Animated.View style={[styles.productDetail_NotificationsModal, { opacity: notificationsMenuFadeAnim, top: insets.top + HEADER_VISUAL_HEIGHT + 5, right: 16 }]}>
              <View style={styles.productDetail_ModalHeaderNotifications}><Text style={styles.productDetail_ModalTitleNotifications}>Recent Scans</Text></View>
              {scannedItemsForBell.length > 0 ? (<FlatList data={scannedItemsForBell.slice(0, 15)} keyExtractor={(item) => item.id} renderItem={({ item, index }) => (<View style={[styles.productDetail_NotificationItem, index === scannedItemsForBell.slice(0,15).length -1 && styles.productDetail_NotificationItemLast]}><Ionicons name="barcode-outline" size={22} color="#4EA8DE" style={styles.productDetail_NotificationItemIcon} /><View style={styles.productDetail_NotificationItemContent}><Text style={styles.productDetail_NotificationItemText} numberOfLines={2}>{item.name}</Text><Text style={styles.productDetail_NotificationItemTimestamp}>{new Date(item.scannedAt).toLocaleDateString()} {new Date(item.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</Text></View></View>)}/>) : ( <View style={styles.productDetail_NotificationItem}><Text style={styles.productDetail_NoNotificationsText}>No scan notifications yet.</Text></View> )}
              {scannedItemsForBell.length > 0 && (<TouchableOpacity style={styles.productDetail_ClearHistoryButton} onPress={handleClearSharedScanHistoryForBell}><Ionicons name="trash-outline" size={18} color="#D92D20" style={{marginRight: 8}}/><Text style={styles.productDetail_ClearHistoryButtonText}>Clear Notification History</Text></TouchableOpacity>)}
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeAreaViewContainer: {
    flex: 1,
    backgroundColor: '#F7F9FC'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#667085',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#D92D20',
    marginVertical: 16,
    textAlign: 'center',
  },
  actionButton: {
    backgroundColor: '#4EA8DE',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 12,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  productDetail_Header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 1,
    paddingTop:40,
    height: '13%',
    backgroundColor: 'rgba(78, 168, 222, 0.64)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(27, 27, 27, 0)',
    zIndex: 1000,
  },
  productDetail_HeaderBackButton: {
    padding: 8,
    marginRight: 8,
  },
  productDetail_HeaderProfileContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F4FE',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  productDetail_HeaderProfileImage: {
    width: '100%',
    height: '100%',
  },
  productDetail_HeaderSearchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    height: 40,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginLeft: 12,
    marginRight: 12,
    shadowColor: '#B0C4DE',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  productDetail_HeaderSearchIcon: {
    marginRight: 8,
  },
  productDetail_HeaderSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#2D3748',
    padding: 0,
    margin:0,
    height: '100%',
  },
  productDetail_HeaderNotificationBellContainer: {
    padding: 8,
    position: 'relative',
    marginLeft: 8,
  },
  productDetail_HeaderNotificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E53E3E',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
    zIndex: 500,
  },
  panelHandleArea: {
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EAECF0',
  },
  panelHandle: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#D0D5DD',
  },
  bottomPanelScrollViewContent: {
     paddingBottom: 20,
  },
  bottomPanelContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  bottomPanelProductName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1D2939',
    marginBottom: 4,
    textAlign: 'left',
  },
  bottomPanelProductCategory: {
    fontSize: 13,
    color: '#4EA8DE',
    fontWeight: '500',
    marginBottom: 8,
    textAlign: 'left',
  },
  bottomPanelPriceRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  bottomPanelProductPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#101828',
    marginRight: 12,
  },
  bottomPanelRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  bottomPanelRatingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D97706',
    marginLeft: 4,
  },
  bottomPanelDescriptionContainer: {
    marginTop: 6,
    marginBottom: 12,
  },
  bottomPanelSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1D2939',
    marginBottom: 8,
  },
  bottomPanelProductDescription: {
    fontSize: 14,
    color: '#475467',
    lineHeight: 20,
  },
  bottomPanelStoreSection: {
    marginTop: 10,
  },
  bottomPanelStoreCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  bottomPanelStoreIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0EFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  bottomPanelStoreInfo: {
    flex: 1,
    minWidth: 0,
  },
  bottomPanelStoreName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D2939',
    marginBottom: 2,
  },
  bottomPanelStoreAddress: {
    fontSize: 12,
    color: '#667085',
    marginBottom: 3,
  },
  bottomPanelStoreDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  bottomPanelStorePrice: {
    fontSize: 13,
    color: '#4EA8DE',
    fontWeight: '600',
    marginRight: 8,
  },
  bottomPanelStockStatus: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bottomPanelInStock: {
    backgroundColor: '#E6F9F0',
    color: '#12B76A',
  },
  bottomPanelOutOfStock: {
    backgroundColor: '#FDECEC',
    color: '#D92D20',
  },
  bottomPanelStoreActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
  },
  bottomPanelActionButtonSmall: {
    backgroundColor: '#EAF2FF',
    borderRadius: 6,
    padding: 5,
    marginRight: 5,
  },
  bottomPanelDirectionsButton: {
    backgroundColor: '#4EA8DE',
    marginRight: 0,
  },
  bottomPanelEmptyStateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9FC',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  bottomPanelNoStoresText: {
    fontSize: 13,
    color: '#667085',
    marginLeft: 8,
    flex: 1,
  },
  bottomPanelRelatedItemsSection: {
    marginTop: 16,
  },
  bottomPanelRelatedItemsContainer: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  relatedProductCard: {
    width: RELATED_CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginRight: 16,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  relatedProductImage: {
    width: '100%',
    height: 90,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#EAF2FF',
  },
  relatedProductName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D2939',
    marginBottom: 4,
    textAlign: 'center',
  },
  relatedProductPrice: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4EA8DE',
    textAlign: 'center',
  },
  productDetail_ModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    bottom :60, 
    },
  productDetail_ProfileOptionsModal: {
    position: 'absolute',
    minWidth: 210,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 0,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    zIndex: 100,
  },
  productDetail_ModalProfileHeader: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
    marginBottom: 8,
  },
  productDetail_ModalProfileName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1D2939',
  },
  productDetail_ModalProfileUsername: {
    fontSize: 13,
    color: '#667085',
    marginTop: 2,
  },
  productDetail_ModalOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  productDetail_ModalOptionIcon: {
    marginRight: 10,
  },
  productDetail_ModalOptionText: {
    fontSize: 15,
    color: '#344054',
    fontWeight: '500',
  },
  productDetail_NotificationsModal: {
    position: 'absolute',
    minWidth: 270,
    maxWidth: 240,
    maxHeight: 420,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 0,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    zIndex: 100,
  },
  productDetail_ModalHeaderNotifications: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
    marginBottom: 8,
  },
  productDetail_ModalTitleNotifications: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1D2939',
  },
  productDetail_NotificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  productDetail_NotificationItemLast: {
    borderBottomWidth: 0,
  },
  productDetail_NotificationItemIcon: {
    marginRight: 10,
  },
  productDetail_NotificationItemContent: {
    flex: 1,
    minWidth: 0,
  },
  productDetail_NotificationItemText: {
    fontSize: 15,
    color: '#344054',
    fontWeight: '500',
  },
  productDetail_NotificationItemTimestamp: {
    fontSize: 12,
    color: '#98A2B3',
    marginTop: 2,
  },
  productDetail_NoNotificationsText: {
    fontSize: 15,
    color: '#98A2B3',
    textAlign: 'center',
    flex: 1,
    paddingVertical: 18,
  },
  productDetail_ClearHistoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F2F5',
  },
  productDetail_ClearHistoryButtonText: {
    color: '#D92D20',
    fontWeight: '600',
    fontSize: 15,
  },
});

export default ProductDetailScreen;
