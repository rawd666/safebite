import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const CARD_HORIZONTAL_PADDING = 16;
const CARD_MARGIN = 8;
const NUM_COLUMNS = 2;
const CARD_WIDTH = (width - (CARD_HORIZONTAL_PADDING * 2) - (CARD_MARGIN * (NUM_COLUMNS -1))) / NUM_COLUMNS;


const RELATED_CARD_WIDTH = width / 2.5;


interface Category {
    id: string;
    name: string;
}

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

const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
    let timeout: ReturnType<typeof setTimeout>;
    return (...args: Parameters<F>): Promise<ReturnType<F>> =>
        new Promise(resolve => {
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(() => resolve(func(...args)), waitFor);
        });
};

const ShopScreen = () => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
    const [relatedProducts, setRelatedProducts] = useState<{[key: string]: Product[]}>({});

    const [isLoadingCategories, setIsLoadingCategories] = useState(true);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const fadeAnim = useRef(new Animated.Value(0)).current; 

    const [isProfileOptionsVisible, setIsProfileOptionsVisible] = useState(false);
    const menuFadeAnim = useRef(new Animated.Value(0)).current;
    const [currentUserProfile, setCurrentUserProfile] = useState<UserProfileHeader | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [scannedItemsForBell, setScannedItemsForBell] = useState<ScannedItem[]>([]);
    const [isNotificationsModalVisible, setIsNotificationsModalVisible] = useState(false);
    const [hasNewNotificationsForBell, setHasNewNotificationsForBell] = useState(false);
    const notificationsMenuFadeAnim = useRef(new Animated.Value(0)).current;

    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => { Animated.timing(menuFadeAnim, { toValue: isProfileOptionsVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start(); }, [isProfileOptionsVisible]);
    useEffect(() => { Animated.timing(notificationsMenuFadeAnim, { toValue: isNotificationsModalVisible ? 1 : 0, duration: 200, useNativeDriver: true }).start(); }, [isNotificationsModalVisible]);

    const fetchHeaderUserProfile = async () => {
        try {
            setLoadingProfile(true);
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) { setCurrentUserProfile(null); return; }
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('avatar_url, full_name, username')
                .eq('id', user.id)
                .single<UserProfileHeader>();
            if (profileError) throw profileError;
            setCurrentUserProfile(profileData);
        } catch (err) { setCurrentUserProfile(null); }
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
        } catch (err) { }
    };

    useFocusEffect(useCallback(() => { loadSharedScannedDataForBell(); }, []));

    const fetchCategories = async () => {
        setIsLoadingCategories(true);
        setError(null);
        try {
            const { data, error: categoriesError } = await supabase.from('categories').select('id, name').order('name', { ascending: true });
            if (categoriesError) throw categoriesError;
            setCategories([{ id: 'all-categories-pseudo-id', name: 'All Products' }, ...data]);
            if (!selectedCategoryId) setSelectedCategoryId('all-categories-pseudo-id');
        } catch (err: any) {
            setError('Failed to load categories.');
            setCategories([{ id: 'all-categories-pseudo-id', name: 'All Products' }]);
        } finally {
            setIsLoadingCategories(false);
        }
    };

    const fetchFeaturedProducts = async () => {
        try {
            const { data, error: featuredError } = await supabase.from('products').select(`id, name, description, price, image_url, category_id, icon_name, rating, stock_quantity, is_featured, categories ( name )`).eq('is_featured', true).limit(5);
            if (featuredError) throw featuredError;
            const transformedData = data?.map(p => ({ ...p, category_name: (p.categories as any)?.name || 'Uncategorized' })) || [];
            setFeaturedProducts(transformedData);
        } catch (err) { }
    };

    const fetchRelatedProducts = async (categoryIdsForRelated: string[]) => {
        if (!categoryIdsForRelated || categoryIdsForRelated.length === 0) { setRelatedProducts({}); return; }
        try {
            const { data, error } = await supabase.from('products').select(`id, name, price, image_url, category_id, categories ( name )`).in('category_id', categoryIdsForRelated.filter(id => id)).neq('is_featured', true).limit(6);
            if (error) throw error;
            const transformedData = data?.map(p => ({ ...p, category_name: (p.categories as any)?.name || 'Uncategorized' })) || [];
            const relatedByCategory: {[key: string]: Product[]} = {};
            transformedData.forEach(product => {
                if (product.category_id) {
                    if (!relatedByCategory[product.category_id]) relatedByCategory[product.category_id] = [];
                    if (relatedByCategory[product.category_id].length < 4) relatedByCategory[product.category_id].push(product);
                }
            });
            setRelatedProducts(relatedByCategory);
        } catch (err) { }
    };

    const fetchProductsInternal = async (currentSearchQuery: string, currentCategoryId: string | null) => {
        setIsLoadingProducts(true);
        setError(null);
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start();
        
        try {
            let query = supabase.from('products').select(`id, name, description, price, image_url, category_id, icon_name, rating, stock_quantity, is_featured, categories ( name ) `).order('name', { ascending: true });

            if (currentSearchQuery) {
                query = query.ilike('name', `%${currentSearchQuery}%`);
            } else if (currentCategoryId && currentCategoryId !== 'all-categories-pseudo-id') {
                query = query.eq('category_id', currentCategoryId);
            }
            
            const { data, error: productsError } = await query;
            if (productsError) throw productsError;

            const transformedData = data?.map(p => ({ ...p, category_name: (p.categories as any)?.name || 'Uncategorized' })) || [];
            setProducts(transformedData);

            if (!currentSearchQuery) {
                const categoryIdsForRelated = Array.from(new Set(transformedData.map(p => p.category_id).filter(Boolean) as string[]));
                if (categoryIdsForRelated.length > 0) {
                    fetchRelatedProducts(categoryIdsForRelated);
                } else if (currentCategoryId === 'all-categories-pseudo-id' && featuredProducts.length > 0) {
                    const featuredCategoryIds = Array.from(new Set(featuredProducts.map(p => p.category_id).filter(Boolean) as string[]));
                    if(featuredCategoryIds.length > 0) fetchRelatedProducts(featuredCategoryIds);
                } else {
                    setRelatedProducts({});
                }
            } else {
                setRelatedProducts({});
            }

        } catch (err: any) {
            setError('Failed to load products. Please try again.');
            setProducts([]);
            setRelatedProducts({});
        } finally {
            setIsLoadingProducts(false);
            Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        }
    };
    
    const debouncedFetchProducts = useCallback(debounce(fetchProductsInternal, 400), [isLoadingCategories, featuredProducts]);

    useEffect(() => {
        fetchCategories();
        fetchFeaturedProducts();
    }, []);

    useEffect(() => {
        const activeSearchQuery = searchQuery.trim();
        if ((!isLoadingCategories && selectedCategoryId) || activeSearchQuery) {
            if (activeSearchQuery) {
                debouncedFetchProducts(activeSearchQuery, null);
            } else {
                fetchProductsInternal("", selectedCategoryId);
            }
        }
    }, [selectedCategoryId, searchQuery, isLoadingCategories, debouncedFetchProducts]);


    const onRefresh = useCallback(() => {
        setIsRefreshing(true);
        setError(null);
        const prevSearchQuery = searchQuery;
        const prevSelectedCategoryId = selectedCategoryId;
        setSearchQuery(''); 
        
        Promise.all([
            fetchCategories(), 
            fetchFeaturedProducts()
        ]).then(() => {
            if (prevSearchQuery) {
                setSearchQuery(prevSearchQuery);
            } else if (prevSelectedCategoryId) {
                setSelectedCategoryId(prevSelectedCategoryId);
                 if (prevSelectedCategoryId === 'all-categories-pseudo-id' && !prevSearchQuery) {
                     fetchProductsInternal("", 'all-categories-pseudo-id');
                 }
            } else if (!selectedCategoryId) {
                fetchProductsInternal("", 'all-categories-pseudo-id');
            }
        }).finally(() => {
            setIsRefreshing(false);
        });
    }, [searchQuery, selectedCategoryId]);


    const renderProductCard = (item: Product, cardWidth = CARD_WIDTH) => (
        <Animated.View
            key={item.id} 
            style={[styles.productCard, { width: cardWidth }]}
        >
            <TouchableOpacity
                activeOpacity={0.8}
                style={{ flex: 1 }}
                onPress={() => router.push({
                    pathname: `../product/${item.id}`, 
                    params: { name: item.name, categoryId: item.category_id }
                })}
            >
                <View style={styles.productImageContainer}>
                    <Image
                        source={{ uri: item.image_url || 'https://placehold.co/600x400/E2E8F0/A0AEC0?text=No+Image' }}
                        style={styles.productImage}
                        accessibilityLabel={item.name}
                    />
                    {item.is_featured && (
                        <View style={styles.featuredBadgeOnCard}>
                            <Ionicons name="star" size={10} color="#000000" style={{marginRight: 4}}/>
                            <Text style={styles.featuredBadgeTextOnCard}>Featured</Text>
                        </View>
                    )}
                </View>
                <View style={styles.productInfo}>
                    <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.productCategory}>{item.category_name || 'Uncategorized'}</Text>
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
                        onPress={() => router.push({
                            pathname: `../product/${item.id}`, 
                            params: { name: item.name, categoryId: item.category_id }
                        })}
                    >
                        <Text style={styles.viewDetailsButtonText}>View Details</Text>
                        <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{marginLeft: 6}}/>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
    
    const renderRelatedProducts = () => {
        if (isLoadingProducts || Object.keys(relatedProducts).length === 0 || searchQuery.trim()) return null;

        return (
            <View style={styles.relatedSection}>
                <Text style={styles.sectionTitle}>You Might Also Like</Text>
                {Object.entries(relatedProducts).map(([catId, relProducts]) => {
                    if (relProducts.length === 0) return null;
                    const uniqueRelatedProducts = relProducts.filter(rp => 
                        !products.find(p => p.id === rp.id && p.category_id === catId)
                    ); 
                    if (uniqueRelatedProducts.length === 0) return null;

                    return (
                        <View key={catId} style={{ marginBottom: 20 }}>
                            <Text style={styles.relatedCategoryTitle}>
                                More in {uniqueRelatedProducts[0]?.category_name || 'Related Items'}
                            </Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.relatedProductsContainer}
                            >
                                {uniqueRelatedProducts.map((product, index) => (
                                    <View 
                                        key={`related-${product.id}`} 
                                        style={{
                                            marginLeft: index === 0 ? 0 : CARD_MARGIN / 2,
                                            marginRight: CARD_MARGIN / 2
                                        }}
                                    >
                                        {renderProductCard(product, RELATED_CARD_WIDTH)}
                                    </View>
                                ))}
                            </ScrollView>
                        </View>
                    );
                })}
            </View>
        );
    };
    
    const handleProfilePressHeader = useCallback(() => setIsProfileOptionsVisible(p => !p), []);
    const clearAllUserDataForHeader = async () => { await AsyncStorage.multiRemove(['@userToken', '@userProfile', SHARED_SCANNED_ITEMS_STORAGE_KEY, LAST_SEEN_SCAN_COUNT_KEY]); };
    const handleVisitProfileHeader = useCallback(() => { setIsProfileOptionsVisible(false); router.push('/(tabs)/profile'); }, []);
    const handleLogoutHeader = useCallback(async () => { setIsProfileOptionsVisible(false); try { const { error } = await supabase.auth.signOut(); if (error) Alert.alert('Logout Error', error.message); else { await clearAllUserDataForHeader(); setCurrentUserProfile(null); router.replace('/auth/login');}} catch (e: any) { Alert.alert('Logout Error', (e as Error).message); }}, []);
    const handleChangeAccountHeader = useCallback(async () => { setIsProfileOptionsVisible(false); try { const { error } = await supabase.auth.signOut(); if (error) Alert.alert('Logout Error', error.message); else { await clearAllUserDataForHeader(); setCurrentUserProfile(null); router.replace('/auth/login');}} catch (e: any) { Alert.alert('Logout Error', (e as Error).message); }}, []);
    const handleBellPressHeader = async () => { setIsNotificationsModalVisible(true); if (hasNewNotificationsForBell) { setHasNewNotificationsForBell(false); try { await AsyncStorage.setItem(LAST_SEEN_SCAN_COUNT_KEY, scannedItemsForBell.length.toString()); } catch (e) { }}};
    const handleClearSharedScanHistoryForBell = async () => { Alert.alert("Clear Notifications?", "Clear all scan notifications?", [{text:"Cancel"}, {text:"Clear", style:"destructive", onPress: async () => { setScannedItemsForBell([]); setHasNewNotificationsForBell(false); await AsyncStorage.removeItem(SHARED_SCANNED_ITEMS_STORAGE_KEY); await AsyncStorage.setItem(LAST_SEEN_SCAN_COUNT_KEY, '0'); setIsNotificationsModalVisible(false); Alert.alert("Cleared!"); }}]); };

    if (isLoadingCategories && categories.length <= 1 && !currentUserProfile && !searchQuery.trim() && !error) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.loadingContainerFullPage}>
                    <ActivityIndicator size="large" color="#4EA8DE" />
                    <Text style={styles.loadingTextFullPage}>Loading Shop...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <StatusBar style="dark" />
            <LinearGradient colors={['#FFFFFF', '#F7F9FC']} style={styles.background}>
            
            <View style={styles.header}>
                <Pressable onPress={handleProfilePressHeader} style={styles.profileContainer}>
                    {loadingProfile ? <ActivityIndicator size="small" color="#4EA8DE" />
                        : currentUserProfile?.avatar_url ? <Image source={{ uri: currentUserProfile.avatar_url }} style={styles.profileImage} resizeMode="cover" />
                        : <View style={styles.profileImagePlaceholder}><Ionicons name="person-circle-outline" size={22} color="#667085" /></View>
                    }
                </Pressable>
                <View style={styles.searchContainer}>
                    <Ionicons name="search-outline" size={20} color="#98A2B3" style={styles.searchIcon} />
                    <TextInput
                        placeholder="Search products..."
                        placeholderTextColor="#98A2B3"
                        style={styles.searchInput}
                        value={searchQuery}
                        onChangeText={(text) => setSearchQuery(text)}
                        returnKeyType="search"
                        clearButtonMode="while-editing"
                    />
                </View>
                <Pressable onPress={handleBellPressHeader} style={styles.notificationBellContainer}>
                    <Ionicons name="notifications-outline" size={28} color="#1D2939" />
                    {hasNewNotificationsForBell && <View style={styles.notificationDot} />}
                </Pressable>
            </View>
            
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={onRefresh}
                        tintColor="#4EA8DE"
                        colors={['#4EA8DE']}
                    />
                }
                keyboardShouldPersistTaps="handled"
            >
                {!searchQuery.trim() && (
                    <>
                        <View style={styles.pageTitleContainer}>
                            <Text style={styles.title}>Allergy-Friendly Shop</Text>
                            <Text style={styles.subtitle}>Safe products for your needs</Text>
                        </View>

                        {featuredProducts.length > 0 && (
                            <View style={styles.featuredSection}>
                                <Text style={styles.sectionTitle}>Featured Products</Text>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.featuredProductsContainer}
                                >
                                    {featuredProducts.map((product, index) => (
                                        <View 
                                            key={`featured-${product.id}`} 
                                            style={{
                                                marginLeft: index === 0 ? 0 : CARD_MARGIN / 2,
                                                marginRight: CARD_MARGIN / 2 
                                            }}
                                        >
                                            <Animated.View style={[styles.featuredProductCard, { opacity: fadeAnim }]}>
                                                <TouchableOpacity 
                                                    activeOpacity={0.8} 
                                                    onPress={() => router.push({
                                                        pathname: `../product/${product.id}`, 
                                                        params: { name: product.name, categoryId: product.category_id }
                                                    })}
                                                >
                                                    <Image 
                                                        source={{ uri: product.image_url || 'https://placehold.co/300x200/EAF2FF/9FB0C7?text=No+Image' }} 
                                                        style={styles.featuredProductImage}
                                                    />
                                                    <View style={styles.featuredProductInfo}>
                                                        <Text style={styles.featuredProductName} numberOfLines={2}>
                                                            {product.name}
                                                        </Text>
                                                        <Text style={styles.featuredProductPrice}>
                                                            ${product.price.toFixed(2)}
                                                        </Text>
                                                    </View>
                                                </TouchableOpacity>
                                            </Animated.View>
                                        </View>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        {!isLoadingCategories && categories.length > 1 && (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.categoryContainer}
                            >
                                {categories.map(category => (
                                    <TouchableOpacity
                                        key={category.id}
                                        style={[
                                            styles.categoryButton,
                                            selectedCategoryId === category.id && styles.selectedCategoryButton
                                        ]}
                                        onPress={() => { 
                                            setSearchQuery(''); 
                                            setSelectedCategoryId(category.id);
                                        }}
                                        disabled={isLoadingProducts}
                                    >
                                        <Text style={[
                                            styles.categoryText,
                                            selectedCategoryId === category.id && styles.selectedCategoryText
                                        ]}>
                                            {category.name}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}
                    </>
                )}

                {isLoadingCategories && !searchQuery.trim() && (
                    <ActivityIndicator color="#4EA8DE" style={{marginVertical: 20}}/>
                )}

                {searchQuery.trim() && (
                    <Text style={styles.searchResultsTitle}>Search Results for "{searchQuery}"</Text>
                )}
                
                {isLoadingProducts ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#4EA8DE" />
                        <Text style={styles.loadingText}>Fetching Products...</Text>
                    </View>
                ) : error ? (
                    <View style={styles.errorContainer}>
                        <Ionicons name="alert-circle-outline" size={52} color="#D92D20" />
                        <Text style={styles.errorText}>{error}</Text>
                        <TouchableOpacity onPress={onRefresh} style={styles.retryButton}>
                            <Text style={styles.retryButtonText}>Try Again</Text>
                        </TouchableOpacity>
                    </View>
                ) : products.length === 0 && (searchQuery.trim() || (selectedCategoryId && selectedCategoryId !== 'all-categories-pseudo-id')) ? (
                    <View style={styles.emptyStateContainer}>
                        <Ionicons name="leaf-outline" size={52} color="#98A2B3" />
                        <Text style={styles.emptyStateText}>
                            {searchQuery.trim() ? 'No products match your search.' : 'No products found in this category.'}
                        </Text>
                        <Text style={styles.emptyStateSubText}>
                            {searchQuery.trim() ? 'Try a different search term.' : 'Try another category or check back later!'}
                        </Text>
                    </View>
                ) : products.length === 0 && selectedCategoryId === 'all-categories-pseudo-id' && !isLoadingCategories && !searchQuery.trim() ? (
                     <View style={styles.emptyStateContainer}>
                        <Ionicons name="storefront-outline" size={52} color="#98A2B3" />
                        <Text style={styles.emptyStateText}>Our shop is currently empty.</Text>
                        <Text style={styles.emptyStateSubText}>Please check back soon for amazing products!</Text>
                    </View>
                ) : (
                    <Animated.View style={{ opacity: fadeAnim }}>
                        <View style={styles.productGrid}>
                            {products.map((product) => (
                                <View 
                                    key={product.id} 
                                    style={styles.productGridItemContainer}
                                >
                                    {renderProductCard(product)}
                                </View>
                            ))}
                        </View>
                        {!searchQuery.trim() && renderRelatedProducts()}
                    </Animated.View>
                )}
            </ScrollView>

            <Modal animationType="fade" transparent={true} visible={isProfileOptionsVisible} onRequestClose={() => setIsProfileOptionsVisible(false)}>
                <TouchableWithoutFeedback onPress={() => setIsProfileOptionsVisible(false)}>
                <View style={styles.modalOverlay_homeScreen}>
                    <Animated.View style={[styles.profileOptionsModal_homeScreen, { opacity: menuFadeAnim, }]}>
                    {(currentUserProfile?.full_name || currentUserProfile?.username) && (<View style={styles.modalProfileHeader_homeScreen}><Text style={styles.modalProfileName_homeScreen} numberOfLines={1}>{currentUserProfile.full_name || currentUserProfile.username}</Text>{currentUserProfile.full_name && currentUserProfile.username && (<Text style={styles.modalProfileUsername_homeScreen} numberOfLines={1}>@{currentUserProfile.username}</Text>)}</View>)}
                    <TouchableOpacity style={styles.modalOptionButton_homeScreen} onPress={handleVisitProfileHeader}><Ionicons name="person-outline" size={20} color="#344054" style={styles.modalOptionIcon_homeScreen} /><Text style={styles.modalOptionText_homeScreen}>Visit Profile</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.modalOptionButton_homeScreen} onPress={handleChangeAccountHeader}><Ionicons name="swap-horizontal-outline" size={20} color="#344054" style={styles.modalOptionIcon_homeScreen} /><Text style={styles.modalOptionText_homeScreen}>Change Account</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.modalOptionButton_homeScreen} onPress={handleLogoutHeader}><Ionicons name="log-out-outline" size={20} color="#D92D20" style={styles.modalOptionIcon_homeScreen} /><Text style={[styles.modalOptionText_homeScreen, { color: '#D92D20' }]}>Logout</Text></TouchableOpacity>
                    </Animated.View>
                </View>
                </TouchableWithoutFeedback>
            </Modal>

            <Modal animationType="fade" transparent={true} visible={isNotificationsModalVisible} onRequestClose={() => setIsNotificationsModalVisible(false)}>
                <TouchableWithoutFeedback onPress={() => setIsNotificationsModalVisible(false)}>
                <View style={styles.modalOverlay_homeScreen}>
                    <Animated.View style={[styles.notificationsModal_homeScreen, { opacity: notificationsMenuFadeAnim }]}>
                    <View style={styles.modalHeader_homeScreen_notifications}><Text style={styles.modalTitle_homeScreen_notifications}>Recent Scans</Text></View>
                    {scannedItemsForBell.length > 0 ? (<FlatList data={scannedItemsForBell.slice(0, 15)} keyExtractor={(item) => item.id} renderItem={({ item, index }) => (<View style={[styles.notificationItem_homeScreen, index === scannedItemsForBell.slice(0,15).length -1 && styles.notificationItemLast_homeScreen]}><Ionicons name="barcode-outline" size={22} color="#4EA8DE" style={styles.notificationItemIcon_homeScreen} /><View style={styles.notificationItemContent_homeScreen}><Text style={styles.notificationItemText_homeScreen} numberOfLines={2}>{item.name}</Text><Text style={styles.notificationItemTimestamp_homeScreen}>{new Date(item.scannedAt).toLocaleDateString()} {new Date(item.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</Text></View></View>)}/>) : ( <View style={styles.notificationItem_homeScreen}><Text style={styles.noNotificationsText_homeScreen}>No scan notifications yet.</Text></View> )}
                    {scannedItemsForBell.length > 0 && (<TouchableOpacity style={styles.clearHistoryButton_homeScreen} onPress={handleClearSharedScanHistoryForBell}><Ionicons name="trash-outline" size={18} color="#D92D20" style={{marginRight: 8}}/><Text style={styles.clearHistoryButtonText_homeScreen}>Clear Notification History</Text></TouchableOpacity>)}
                    </Animated.View>
                </View>
                </TouchableWithoutFeedback>
            </Modal>

            </LinearGradient>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { 
        flex: 1, 
        backgroundColor: '#F7F9FC', 
    },
    background: { 
        flex: 1, 
    },
    header: {
        paddingTop: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: '#F7F9FC',
        borderBottomWidth: 1,
        borderBottomColor: '#F7F9FC',
      },
      profileContainer: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#F0F5FF',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: '#DCE7FF',
      },
      profileImage: { width: '100%', height: '100%' },
      profileImagePlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F0F5FF',
      },
      searchContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F7F9FC',
        borderRadius: 12,
        paddingHorizontal: 12,
        marginLeft: 12,
        marginRight: 12,
        height: 42,
        borderWidth: 1,
        borderColor: '#EAECF0',
      },
      searchIcon: { marginRight: 8 },
      searchInput: {
        flex: 1,
        color: '#1D2939',
        fontSize: 15,
        paddingVertical: 0,
        marginVertical: 0,
        height: '100%',
      },
      notificationBellContainer: {
        padding: 8,
        position: 'relative',
        marginRight: -8,
      },
      notificationDot: {
        position: 'absolute',
        top: 7,
        right: 7,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#F04438',
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
      },
    scrollContent: { 
        paddingHorizontal: CARD_HORIZONTAL_PADDING, 
        paddingBottom: 20, 
        flexGrow: 1 
    },
    pageTitleContainer: { 
        marginBottom: 24, 
        paddingTop: 10 
    },
    title: { 
        fontSize: 28, 
        fontWeight: 'bold', 
        color: '#101828', 
        marginBottom: 6, 
    },
    subtitle: { 
        fontSize: 16, 
        color: '#475467', 
    },
    categoryContainer: { 
        paddingVertical: 16, 
        marginBottom: 0,
    },
    categoryButton: { 
        paddingHorizontal: 20, 
        paddingVertical: 10, 
        borderRadius: 20, 
        backgroundColor: '#FFFFFF', 
        marginRight: 10, 
        borderWidth: 1, 
        borderColor: '#D0D5DD', 
        shadowColor: "#667EEA",
        shadowOffset: { width: 0, height: 1 }, 
        shadowOpacity: 0.08,
        shadowRadius: 3,
        elevation: 2,
    },
    selectedCategoryButton: { 
        backgroundColor: '#4EA8DE', 
        borderColor: '#4EA8DE', 
        shadowColor: "#4EA8DE",
        shadowOpacity: 0.25,
        elevation: 4,
    },
    categoryText: { 
        color: '#344054', 
        fontSize: 14, 
        fontWeight: '600', 
    },
    selectedCategoryText: { 
        color: '#FFFFFF', 
        fontWeight: '700' 
    },
    featuredSection: { 
        marginBottom: 28, 
    },
    sectionTitle: { 
        fontSize: 20, 
        fontWeight: 'bold', 
        color: '#1D2939', 
        marginBottom: 16, 
    },
    searchResultsTitle: { 
        fontSize: 20, 
        fontWeight: 'bold', 
        color: '#1D2939', 
        marginVertical: 20, 
        textAlign: 'center' 
    },
    featuredProductsContainer: { 
        paddingLeft: 0,
        paddingRight: CARD_MARGIN / 2, 
    },
    featuredProductCard: { 
        width: width * 0.75, 
        backgroundColor: '#FFFFFF', 
        borderRadius: 16, 
        shadowColor: "#6B7280", 
        shadowOffset: { width: 0, height: 4 }, 
        shadowOpacity: 0.1, 
        shadowRadius: 10, 
        elevation: 5, 
        overflow: 'hidden', 
    },
    featuredProductImage: { 
        width: '100%', 
        height: 170, 
        resizeMode: 'cover', 
        backgroundColor: '#EAF2FF', 
    },
    featuredProductInfo: { 
        padding: 14, 
    },
    featuredProductName: { 
        fontSize: 16, 
        fontWeight: '600', 
        color: '#1D2939', 
        marginBottom: 5, 
    },
    featuredProductPrice: { 
        fontSize: 18, 
        fontWeight: 'bold', 
        color: '#4EA8DE', 
        marginTop: 5, 
    },
    productGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        marginTop: 8, 
    },
    productGridItemContainer: {
        width: CARD_WIDTH,
        marginBottom: CARD_MARGIN * 2,
    },
    productCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        shadowColor: "#708090",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 7,
        elevation: 4,
        overflow: 'hidden',
    },
    productImageContainer: {
        position: 'relative',
        alignItems: 'center',
        backgroundColor: '#F8F9FA',
        height: CARD_WIDTH * 0.9, 
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        overflow: 'hidden',
    },
    productImage: { 
        width: '100%', 
        height: '100%', 
        resizeMode: 'cover' 
    },
    featuredBadgeOnCard: {
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: '#E3E430', 
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 4,
        flexDirection: 'row',
        alignItems: 'center',
    },
    featuredBadgeTextOnCard: {
        color: '#000000',
        fontSize: 10,
        fontWeight: 'bold',
    },
    productInfo: { 
        padding: 10, 
    },
    productName: {
        fontSize: 14, 
        fontWeight: '600',
        color: '#1D2939',
        marginBottom: 3,
        minHeight: 36, 
    },
    productCategory: {
        fontSize: 11,
        color: '#667085',
        marginBottom: 5,
        textTransform: 'capitalize',
    },
    productFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 6,
    },
    productPrice: {
        fontSize: 15, 
        fontWeight: 'bold',
        color: '#4EA8DE',
    },
    ratingContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
    },
    ratingText: {
        fontSize: 12,
        color: '#B45309',
        marginLeft: 3,
        fontWeight: '600',
    },
    viewDetailsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#4EA8DE',
        paddingVertical: 8,
        borderRadius: 8,
        marginTop: 10,
    },
    viewDetailsButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
    },
    relatedSection: { 
        marginTop: 20, 
        marginBottom: 16 
    },
    relatedCategoryTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#344054',
        marginBottom: 12,
        marginTop: 12,
    },
    relatedProductsContainer: {
        paddingLeft: 0,
        paddingRight: CARD_MARGIN / 2,
    },
    loadingContainerFullPage: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F7F9FC',
    },
    loadingTextFullPage: {
        marginTop: 16,
        fontSize: 17,
        color: '#475467',
        fontWeight: '500',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 50,
        minHeight: 200,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 17,
        color: '#475467',
        fontWeight: '500',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        marginVertical: 40,
        backgroundColor: '#FFF8F8',
        borderRadius: 12,
        marginHorizontal: CARD_HORIZONTAL_PADDING,
        borderWidth: 1,
        borderColor: '#FEECEC',
    },
    errorText: {
        fontSize: 17,
        color: '#D92D20',
        textAlign: 'center',
        marginTop: 16,
        marginBottom: 24,
        fontWeight: '500',
        lineHeight: 24,
    },
    retryButton: {
        backgroundColor: '#4EA8DE',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 10,
    },
    retryButtonText: { 
        color: '#FFFFFF', 
        fontSize: 16, 
        fontWeight: '600' 
    },
    emptyStateContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        marginVertical: 40,
        minHeight: 220,
    },
    emptyStateText: {
        fontSize: 19,
        fontWeight: '600',
        color: '#475467',
        textAlign: 'center',
        marginTop: 20,
    },
    emptyStateSubText: {
        fontSize: 15,
        color: '#98A2B3',
        textAlign: 'center',
        marginTop: 10,
        lineHeight: 22,
    },
    modalOverlay_homeScreen: { 
        flex: 1, 
        backgroundColor: 'rgba(16, 24, 40, 0.65)', 
        zIndex: 50 
    },
    profileOptionsModal_homeScreen: { 
        backgroundColor: '#FFFFFF', 
        borderRadius: 12, 
        paddingVertical: 8, 
        shadowColor: '#101828', 
        shadowOffset: { width: 0, height: 5 }, 
        shadowOpacity: 0.12, 
        shadowRadius: 12, 
        elevation: 10, 
        minWidth: 250, 
        position: 'absolute', 
        zIndex: 51
    },
    modalProfileHeader_homeScreen: { 
        paddingHorizontal: 16, 
        paddingVertical: 12, 
        borderBottomWidth: 1, 
        borderBottomColor: '#EAECF0', 
        marginBottom: 4, 
    },
    modalProfileName_homeScreen: { 
        fontSize: 16, 
        fontWeight: '600', 
        color: '#1D2939', 
    },
    modalProfileUsername_homeScreen: { 
        fontSize: 13, 
        color: '#667085', 
        marginTop: 3, 
    },
    modalOptionButton_homeScreen: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingVertical: 12, 
        paddingHorizontal: 16, 
    },
    modalOptionIcon_homeScreen: { 
        marginRight: 12, 
        width: 22, 
        alignItems: 'center' 
    },
    modalOptionText_homeScreen: { 
        fontSize: 15, 
        color: '#344054', 
        fontWeight: '500' 
    },
    notificationsModal_homeScreen: { 
        backgroundColor: '#FFFFFF', 
        borderRadius: 12, 
        shadowColor: '#101828', 
        shadowOffset: { width: 0, height: 5 }, 
        shadowOpacity: 0.12, 
        shadowRadius: 12, 
        elevation: 10, 
        minWidth: 300, 
        maxWidth: '92%', 
        maxHeight: '70%', 
        position: 'absolute', 
        overflow: 'hidden', 
        zIndex: 51 
    },
    modalHeader_homeScreen_notifications: { 
        paddingHorizontal: 16, 
        paddingTop: 16, 
        paddingBottom: 12, 
        borderBottomWidth: 1, 
        borderBottomColor: '#EAECF0', 
    },
    modalTitle_homeScreen_notifications: { 
        fontSize: 17, 
        fontWeight: '600', 
        color: '#1D2939', 
    },
    notificationItem_homeScreen: { 
        flexDirection: 'row', 
        alignItems: 'flex-start', 
        paddingVertical: 14, 
        paddingHorizontal: 16, 
        borderBottomWidth: 1, 
        borderBottomColor: '#F2F4F7', 
    },
    notificationItemLast_homeScreen: { 
        borderBottomWidth: 0, 
    },
    notificationItemIcon_homeScreen: { 
        marginRight: 12, 
        marginTop: 2 
    },
    notificationItemContent_homeScreen: { 
        flex: 1 
    },
    notificationItemText_homeScreen: { 
        fontSize: 14, 
        color: '#344054', 
        fontWeight: '500', 
        lineHeight: 20, 
        marginBottom: 3 
    },
    notificationItemTimestamp_homeScreen: { 
        fontSize: 11, 
        color: '#667085', 
    },
    noNotificationsText_homeScreen: { 
        textAlign: 'center', 
        color: '#667085', 
        paddingVertical: 24, 
        fontSize: 14, 
    },
    clearHistoryButton_homeScreen: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'center', 
        paddingVertical: 14, 
        borderTopWidth: 1, 
        borderTopColor: '#EAECF0', 
        backgroundColor: '#FFFAFA' 
    },
    clearHistoryButtonText_homeScreen: { 
        fontSize: 14, 
        color: '#D92D20', 
        fontWeight: '600', 
    },
});

export default ShopScreen;
