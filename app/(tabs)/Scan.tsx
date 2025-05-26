import { Fonts } from '@/constants/Fonts';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Link, router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Vibration,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Constants
const SHARED_SCANNED_ITEMS_STORAGE_KEY = '@scannedItemsHistory';
const LAST_SEEN_SCAN_COUNT_KEY = '@lastSeenScanCount';
const DEEPSEEK_API_KEY = 'sk-463297a1e36a423ba2885d6b2a4ca5ca';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DAILY_SCAN_GOAL = 10;
const { width, height } = Dimensions.get('window');

// Interfaces
interface SharedScannedItem {
  id: string;
  name: string;
  scannedAt: string;
}

interface LocalScanResult {
  id: string;
  text: string;
  imageUri: string;
  timestamp: string;
  detectedAllergens: string[];
}

interface UserProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  allergies: string[] | string | null;
}

interface DeepSeekInsight {
  health_summary?: string;
  identified_user_allergens?: string[];
  actionable_health_tips?: string[];
  boycott_suggestion?: string;
  halal_status?: string;
  age_factor_notes?: string;
  raw_response?: string;
}

const DetectText = () => {
  // Hooks and refs
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const soundObject = useRef<Audio.Sound | null>(null);
  const menuFadeAnim = useRef(new Animated.Value(0)).current;
  const notificationsMenuFadeAnim = useRef(new Animated.Value(0)).current;
  const waveAnim = useRef(new Animated.Value(0)).current;

  // State management
  const [image, setImage] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [isLoadingOCR, setIsLoadingOCR] = useState(false);
  const [localScanHistory, setLocalScanHistory] = useState<LocalScanResult[]>([]);
  const [containsAllergens, setContainsAllergens] = useState(false);
  const [detectedAllergenList, setDetectedAllergenList] = useState<string[]>([]);
  const [isAlertModalVisible, setIsAlertModalVisible] = useState(false);
  const [hasAllergiesConfiguredState, setHasAllergiesConfiguredState] = useState(false);
  const [dailyScanCount, setDailyScanCount] = useState(0);
  const [isProfileOptionsVisible, setIsProfileOptionsVisible] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [sharedScannedItemsHistory, setSharedScannedItemsHistory] = useState<SharedScannedItem[]>([]);
  const [isNotificationsModalVisible, setIsNotificationsModalVisible] = useState(false);
  const [hasNewNotifications, setHasNewNotifications] = useState(false);
  const [scanInsight, setScanInsight] = useState<DeepSeekInsight | null>(null);
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  const [isInsightModalVisible, setIsInsightModalVisible] = useState(false);
  const [isWavingHandVisible, setIsWavingHandVisible] = useState(false);
  const [deepSeekPrompt, setDeepSeekPrompt] = useState<string | null>(null);

  // Derived values
  const waveRotation = waveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-15deg', '15deg'],
  });

  // Animation effects
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

  useEffect(() => {
    if (isWavingHandVisible) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(waveAnim, {
            toValue: 0,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
        ])
      ).start();
    } else {
      waveAnim.setValue(0);
    }
  }, [isWavingHandVisible]);

  // Memoized values
  const allergenModalContent = useMemo(() => {
    if (!currentUserProfile?.id) {
      return {
        iconName: 'log-in-outline' as const,
        color: '#FFA000',
        title: 'Sign In Required',
        message: 'Please sign in to use allergen check and save history.',
        details: null
      };
    }
    if (!hasAllergiesConfiguredState) {
      return {
        iconName: 'settings-outline' as const,
        color: '#FFC107',
        title: 'Allergies Not Set',
        message: 'Configure allergies in your profile for accurate checks.',
        details: "Go to Profile > Edit Profile to set your allergies."
      };
    }
    if (containsAllergens) {
      const allergenCount = detectedAllergenList.length;
      return {
        iconName: 'warning-outline' as const,
        color: '#FF4444',
        title: `Allergen${allergenCount > 1 ? 's' : ''} Detected! (${allergenCount})`,
        message: 'Potential allergens based on your profile (and identified by AI):',
        details: detectedAllergenList.join(', ')
      };
    }
    return {
      iconName: 'checkmark-circle-outline' as const,
      color: '#E3E430',
      title: 'No Configured Allergens Found',
      message: 'AI did not find your configured allergens in the scanned text.',
      details: 'Always double-check labels if you have severe allergies.'
    };
  }, [currentUserProfile, hasAllergiesConfiguredState, containsAllergens, detectedAllergenList]);

  // Data fetching and processing
  const fetchAppUserProfile = useCallback(async () => {
    try {
      setLoadingProfile(true);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        setCurrentUserProfile(null);
        setHasAllergiesConfiguredState(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, avatar_url, full_name, username, allergies')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      if (profileData) {
        setCurrentUserProfile(profileData as UserProfile);
        const allergies = (profileData as UserProfile).allergies;
        const hasAllergies = allergies &&
          (
            (Array.isArray(allergies) && allergies.length > 0) ||
            (typeof allergies === 'string' && allergies.trim() !== '')
          );
        setHasAllergiesConfiguredState(!!hasAllergies);
      } else {
        setCurrentUserProfile(null);
        setHasAllergiesConfiguredState(false);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setCurrentUserProfile(null);
      setHasAllergiesConfiguredState(false);
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const loadSharedScannedDataForNotifications = useCallback(async () => {
    try {
      const [storedItems, lastSeenCountStr] = await Promise.all([
        AsyncStorage.getItem(SHARED_SCANNED_ITEMS_STORAGE_KEY),
        AsyncStorage.getItem(LAST_SEEN_SCAN_COUNT_KEY)
      ]);

      const items: SharedScannedItem[] = storedItems ? JSON.parse(storedItems) : [];
      setSharedScannedItemsHistory(items);
      
      const lastSeenCount = lastSeenCountStr ? parseInt(lastSeenCountStr, 10) : 0;
      setHasNewNotifications(items.length > lastSeenCount);
    } catch (error) {
      console.error('Error loading shared scan data:', error);
    }
  }, []);

  const loadLocalScanHistory = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        const savedLocalHistory = await AsyncStorage.getItem('@scanHistory');
        if (savedLocalHistory) {
          const history: LocalScanResult[] = JSON.parse(savedLocalHistory);
          setLocalScanHistory(history);
          calculateDailyScanCount(history);
        }
        return;
      }

      const { data: scans, error } = await supabase
        .from('user_scan_history')
        .select('id, scan_data, image_url, detected_allergens, scan_date')
        .eq('user_id', user.id)
        .order('scan_date', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (scans?.length) {
        const formattedScans = scans.map(scan => ({
          id: scan.id,
          text: scan.scan_data?.scanned_text || '',
          imageUri: scan.image_url || '',
          timestamp: scan.scan_date,
          detectedAllergens: scan.detected_allergens || []
        }));
        
        setLocalScanHistory(formattedScans);
        calculateDailyScanCount(formattedScans);
        await AsyncStorage.setItem('@scanHistory', JSON.stringify(formattedScans));
      } else {
        setLocalScanHistory([]);
      }
    } catch (error) {
      console.error('Error loading scan history:', error);
      setLocalScanHistory([]);
    }
  }, []);

  const calculateDailyScanCount = useCallback((history: LocalScanResult[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const count = history.filter(scan => new Date(scan.timestamp) >= today).length;
    setDailyScanCount(count);
  }, []);

  // Image handling
  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setImage(result.assets[0].uri);
        await analyzeImage(result.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to pick image.');
    }
  }, []);

  const takePhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setImage(result.assets[0].uri);
        await analyzeImage(result.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to take photo.');
    }
  }, []);

  // Core scanning functionality
  const analyzeImage = useCallback(async (imageUri: string) => {
    if (!imageUri) return;

    // Reset states
    setIsLoadingOCR(true);
    setIsAlertModalVisible(false);
    setExtractedText('');
    setContainsAllergens(false);
    setDetectedAllergenList([]);
    setScanInsight(null);
    setIsInsightModalVisible(false);
    setIsWavingHandVisible(false);

    try {
      const base64Image = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const apiKey = 'AIzaSyC1UAE-9vpDZX8VvTa5IZILzTMYvn0NMf4';
      const apiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
      
      const response = await axios.post(apiUrl, {
        requests: [{
          image: { content: base64Image },
          features: [{ type: 'TEXT_DETECTION' }]
        }],
      });

      const text = response.data.responses[0]?.fullTextAnnotation?.text;

      if (text) {
        setExtractedText(text);
        let userAllergiesForAPI: string[] = [];

        if (currentUserProfile?.allergies) {
          const rawAllergies = currentUserProfile.allergies;
          if (typeof rawAllergies === 'string' && rawAllergies.trim() !== '') {
            userAllergiesForAPI = rawAllergies.split(',').map(a => a.trim().toLowerCase()).filter(a => a);
          } else if (Array.isArray(rawAllergies)) {
            userAllergiesForAPI = rawAllergies.map(a => String(a).trim().toLowerCase()).filter(a => a);
          }
        }

        setHasAllergiesConfiguredState(userAllergiesForAPI.length > 0);
        const llmAnalysisResult = await fetchInsightAndAllergensFromLLM(text, userAllergiesForAPI);
        const allergensFromLLM = llmAnalysisResult?.identified_user_allergens || [];
        const containsAllergensFromLLM = allergensFromLLM.length > 0;

        if (containsAllergensFromLLM && hasAllergiesConfiguredState) {
          Vibration.vibrate([200, 100, 200]);
        }

        await processSuccessfulScan(text, imageUri, allergensFromLLM);
        setContainsAllergens(containsAllergensFromLLM);
        setDetectedAllergenList(allergensFromLLM);
        setIsAlertModalVisible(true);
      } else {
        Alert.alert("No Text Found", "Could not detect text in the image.");
      }
    } catch (error: any) {
      let errorMessage = 'Failed to analyze image. Please try again.';
      if (error.response) {
        errorMessage += `\nStatus: ${error.response.status}`;
        if (error.response.data?.error?.message) {
          errorMessage += `\nDetails: ${error.response.data.error.message}`;
        } else if (typeof error.response.data === 'string') {
          errorMessage += `\nDetails: ${error.response.data}`;
        }
      } else if (error.message) {
        errorMessage += `\nDetails: ${error.message}`;
      }
      Alert.alert("Processing Error", errorMessage);
    } finally {
      setIsLoadingOCR(false);
    }
  }, [currentUserProfile]);

  const fetchInsightAndAllergensFromLLM = useCallback(async (textToAnalyze: string, userAllergies: string[]): Promise<DeepSeekInsight | null> => {
    if (!textToAnalyze.trim()) {
      setIsWavingHandVisible(false);
      return null;
    }

    setIsLoadingInsight(true);
    setScanInsight(null);
    setIsWavingHandVisible(false);
    setDeepSeekPrompt(null);

    const userAllergyListString = userAllergies.length > 0 ? userAllergies.join(', ') : "none specified";
    const prompt = `Analyze the following scanned food label text. The user has these allergies: [${userAllergyListString}]. Scanned Text: "${textToAnalyze}" Provide a JSON response with ONLY the following structure, no introductory or concluding text: {"health_summary": "A brief health summary (1-2 sentences) in English, then provide an Arabic translation prefixed with 'AR: '. Use emojis.", "identified_user_allergens": ["List user's specific allergies found in the text, considering common English and Arabic translations (e.g., 'milk' for 'حليب'). If none of the user's specific allergies are found, return an empty array []. List each allergen only once."], "actionable_health_tips": ["One or two actionable health tips related to this product in English, then provide an Arabic translation for each tip prefixed with 'AR: '. Use emojis."], "boycott_suggestion": "Analyze brand/origin for boycott status: 'Supports entity', 'Does not support entity', or 'Origin/Brand unclear'. Provide in English, then Arabic translation prefixed with 'AR: '.", "halal_status": "Analyze for Halal status: 'Appears Halal', 'Not Halal', or 'Unclear'. Provide in English, then Arabic translation prefixed with 'AR: '.", "age_factor_notes": "Any age-specific considerations in English, then Arabic translation prefixed with 'AR: '."} Keep each part concise and friendly. Do not include markdown like '*' in the JSON string values.`;

    setDeepSeekPrompt(prompt);
    const apiMessages = [
      { 
        role: 'system', 
        content: "You are a friendly food & health advisor. Provide insights based on scanned food labels, including boycott information based on brand/origin if identifiable. Respond strictly in the specified JSON format." 
      },
      { 
        role: 'user', 
        content: prompt 
      }
    ];

    try {
      const response = await axios.post(
        DEEPSEEK_API_URL,
        {
          model: 'deepseek-chat',
          messages: apiMessages,
          max_tokens: 500,
          temperature: 0.6,
          response_format: { type: "json_object" }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
          }
        }
      );

      if (response.data?.choices?.[0]?.message?.content) {
        const content = response.data.choices[0].message.content;
        try {
          const parsedResponse: DeepSeekInsight = JSON.parse(content);
          setScanInsight(parsedResponse);
          return parsedResponse;
        } catch (parseError) {
          console.error("DeepSeek JSON parseError:", parseError, "Raw content:", content);
          setScanInsight({ raw_response: "Could not parse insights. Raw: " + content, identified_user_allergens: [] });
          return { identified_user_allergens: [] };
        }
      }
      setScanInsight({ raw_response: "Could not retrieve insights at this time.", identified_user_allergens: [] });
      return { identified_user_allergens: [] };
    } catch (error) {
      console.error("Error fetching insight from DeepSeek:", error);
      setScanInsight({ raw_response: "Sorry, an error occurred while fetching insights. Please try again later.", identified_user_allergens: [] });
      return { identified_user_allergens: [] };
    } finally {
      setIsLoadingInsight(false);
      setIsWavingHandVisible(true);
    }
  }, []);

  const processSuccessfulScan = useCallback(async (text: string, imageUri: string, detectedAllergensFromLLM: string[]) => {
    const scanTimestamp = new Date().toISOString();
    let dbScanId: string | null = null;

    if (currentUserProfile?.id) {
      try {
        const { data: insertedData, error: dbError } = await supabase
          .from('user_scan_history')
          .insert({
            user_id: currentUserProfile.id,
            scan_data: { scanned_text: text },
            image_url: null,
            detected_allergens: detectedAllergensFromLLM,
            scan_date: scanTimestamp,
          })
          .select('id')
          .single();

        if (dbError) {
          console.error('Supabase DB Error saving scan:', dbError);
          Alert.alert("Database Error", "Could not save scan to your history: " + dbError.message);
        } else if (insertedData) {
          dbScanId = insertedData.id;
        }
      } catch (e: any) {
        console.error('Catch block error saving scan to DB:', e);
        Alert.alert("Error", "An unexpected error occurred while saving your scan");
      }
    } else {
      console.warn("User not logged in or profile not loaded. Scan not saved to database.");
    }

    // Update local history
    const newLocalScanItem: LocalScanResult = {
      id: dbScanId || `local_${Date.now()}`,
      text,
      imageUri,
      timestamp: scanTimestamp,
      detectedAllergens: detectedAllergensFromLLM
    };

    const updatedLocalHistory = [newLocalScanItem, ...localScanHistory.slice(0, 9)];
    setLocalScanHistory(updatedLocalHistory);
    
    try {
      await AsyncStorage.setItem('@scanHistory', JSON.stringify(updatedLocalHistory));
    } catch (asyncStorageError) {
      console.error("Error saving local scan history:", asyncStorageError);
    }

    calculateDailyScanCount(updatedLocalHistory);

    // Update shared history
    try {
      const existingSharedHistoryString = await AsyncStorage.getItem(SHARED_SCANNED_ITEMS_STORAGE_KEY);
      let sharedHistory: SharedScannedItem[] = existingSharedHistoryString ? JSON.parse(existingSharedHistoryString) : [];
      
      const newSharedItem: SharedScannedItem = {
        id: dbScanId || `shared_local_${Date.now()}`,
        name: text.length > 70 ? `${text.substring(0, 67).replace(/\n/g, ' ')}...` : text.replace(/\n/g, ' '),
        scannedAt: scanTimestamp,
      };
      
      sharedHistory.unshift(newSharedItem);
      if (sharedHistory.length > 20) {
        sharedHistory = sharedHistory.slice(0, 20);
      }
      
      await AsyncStorage.setItem(SHARED_SCANNED_ITEMS_STORAGE_KEY, JSON.stringify(sharedHistory));
      loadSharedScannedDataForNotifications();
    } catch (error) {
      console.error('Error updating shared history:', error);
    }
  }, [currentUserProfile, localScanHistory]);

  // Utility functions
  const shareResult = useCallback(async () => {
    if (!extractedText) return;
    try {
      await Share.share({
        message: extractedText,
        title: 'Scanned Text'
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to share.');
    }
  }, [extractedText]);

  const copyToClipboard = useCallback(async () => {
    if (!extractedText) return;
    try {
      await AsyncStorage.setItem('@clipboard_temp', extractedText);
      Alert.alert('Copied!', '(Simulated)');
      Vibration.vibrate(50);
    } catch (e) {
      Alert.alert('Error', 'Failed to copy.');
    }
  }, [extractedText]);

  const handleProfilePress = useCallback(() => setIsProfileOptionsVisible(prev => !prev), []);
  const handleBellPress = useCallback(async () => {
    setIsNotificationsModalVisible(true);
    if (hasNewNotifications) {
      setHasNewNotifications(false);
      try {
        await AsyncStorage.setItem(LAST_SEEN_SCAN_COUNT_KEY, sharedScannedItemsHistory.length.toString());
      } catch (error) {
        console.error('Error updating last seen count:', error);
      }
    }
  }, [hasNewNotifications, sharedScannedItemsHistory.length]);

  const handleVisitProfile = useCallback(() => {
    setIsProfileOptionsVisible(false);
    router.push('/(tabs)/profile');
  }, []);

  const handleLogout = useCallback(async () => {
    setIsProfileOptionsVisible(false);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await AsyncStorage.multiRemove(['@userToken', '@userProfile', SHARED_SCANNED_ITEMS_STORAGE_KEY, LAST_SEEN_SCAN_COUNT_KEY]);
      setCurrentUserProfile(null);
      setHasAllergiesConfiguredState(false);
      router.replace('/auth/login');
    } catch (error: any) {
      Alert.alert('Logout Error', error.message || 'An unexpected error occurred.');
    }
  }, []);

  const handleChangeAccount = useCallback(async () => {
    setIsProfileOptionsVisible(false);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await AsyncStorage.multiRemove(['@userToken', '@userProfile', SHARED_SCANNED_ITEMS_STORAGE_KEY, LAST_SEEN_SCAN_COUNT_KEY]);
      setCurrentUserProfile(null);
      setHasAllergiesConfiguredState(false);
      router.replace('/auth/login');
    } catch (error: any) {
      Alert.alert('Logout Error', error.message || 'An unexpected error occurred.');
    }
  }, []);

  const handleClearSharedScanHistory = useCallback(async () => {
    Alert.alert(
      "Clear Scan Notification History",
      "Are you sure you want to clear all scanned item history from notifications?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Clear", 
          style: "destructive", 
          onPress: async () => {
            setSharedScannedItemsHistory([]);
            setHasNewNotifications(false);
            await AsyncStorage.removeItem(SHARED_SCANNED_ITEMS_STORAGE_KEY);
            await AsyncStorage.setItem(LAST_SEEN_SCAN_COUNT_KEY, '0');
            setIsNotificationsModalVisible(false);
            Alert.alert("History Cleared", "Scan notification history has been cleared.");
          }
        }
      ]
    );
  }, []);

  const handleScanForBoycott = useCallback(() => {
    Alert.alert("Feature Coming Soon", "Brand scanning for boycott info is not implemented yet.");
  }, []);

  const renderInsightSection = useCallback((
    title: string,
    content?: string | string[] | null,
    iconName?: keyof typeof Ionicons.glyphMap,
    iconColor?: string,
    contentStyle?: object
  ) => {
    if (!content || (Array.isArray(content) && content.length === 0)) return null;
    
    const displayContent = Array.isArray(content) 
      ? content.map((item, index) => `• ${item}`).join('\n')
      : content;

    return (
      <View style={styles.insightSection}>
        <View style={styles.insightSectionHeader}>
          {iconName && (
            <Ionicons 
              name={iconName} 
              size={22} 
              color={iconColor || styles.insightSectionTitle.color} 
              style={styles.insightSectionIcon} 
            />
          )}
          <Text style={[styles.insightSectionTitle, { color: iconColor || styles.insightSectionTitle.color }]}>
            {title}
          </Text>
        </View>
        <Text style={[styles.insightSectionContent, contentStyle]}>
          {displayContent}
        </Text>
      </View>
    );
  }, []);

  // Initialization effects
  useEffect(() => {
    const init = async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to scan documents.');
      }

      try {
        const soundUrl = '';
        if (soundUrl) {
          const { sound } = await Audio.Sound.createAsync({ uri: soundUrl });
          soundObject.current = sound;
        }
      } catch (error) {
        console.error('Error initializing sound:', error);
      }

      fetchAppUserProfile();
      loadLocalScanHistory();
      loadSharedScannedDataForNotifications();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true
      }).start();
    };

    init();

    return () => {
      soundObject.current?.unloadAsync();
    };
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
        fetchAppUserProfile();
        loadLocalScanHistory();
      } else if (event === 'SIGNED_OUT') {
        setCurrentUserProfile(null);
        setHasAllergiesConfiguredState(false);
        setLocalScanHistory([]);
        setDailyScanCount(0);
        AsyncStorage.removeItem('@scanHistory');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSharedScannedDataForNotifications();
      fetchAppUserProfile();
      loadLocalScanHistory();
    }, [])
  );

  // Render
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'left']}>
      <StatusBar style="dark" />
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        {/* Header */}
        <View style={styles.header_homeScreen}>
          <Pressable onPress={handleProfilePress} style={styles.profileContainer_homeScreen}>
            {loadingProfile ? (
              <ActivityIndicator size="small" color="#4EA8DE" />
            ) : currentUserProfile?.avatar_url ? (
              <Image 
                source={{ uri: currentUserProfile.avatar_url.trim() || 'https://placehold.co/100x100/EAF2FF/9FB0C7?text=User' }} 
                style={styles.profileImage_homeScreen} 
                resizeMode="cover" 
              />
            ) : (
              <View style={styles.profileImagePlaceholder_homeScreen}>
                <Ionicons name="person-outline" size={20} color="#A0AEC0" />
              </View>
            )}
          </Pressable>

          <Pressable onPress={handleBellPress} style={styles.notificationBellContainer_homeScreen}>
            <Ionicons name="notifications-outline" size={26} color="#000000" />
            {hasNewNotifications && <View style={styles.notificationDot_homeScreen} />}
          </Pressable>
        </View>

        {/* Main Content */}
        <ScrollView 
          contentContainerStyle={styles.scrollContainer} 
          keyboardShouldPersistTaps="handled" 
          showsVerticalScrollIndicator={false}
        >
          {/* Progress Card */}
          <View style={[styles.card, styles.progressCard]}>
            <Text style={styles.sectionTitle}>Daily Scan Goal</Text>
            <Text style={styles.progressText}>{dailyScanCount} / {DAILY_SCAN_GOAL} Scans Today</Text>
            <View style={styles.progressBarBackground}>
              <Animated.View 
                style={[
                  styles.progressBarFill, 
                  { width: `${Math.min(100, (dailyScanCount / DAILY_SCAN_GOAL) * 100)}%` }
                ]} 
              />
            </View>
          </View>

          {/* Image Container */}
          <View style={styles.imageContainer}>
            {image ? (
              <Image 
                source={{ uri: image }} 
                style={styles.image} 
                accessibilityLabel="Scanned document preview" 
              />
            ) : (
              <Pressable onPress={takePhoto} style={styles.placeholder}>
                <Ionicons name="camera-outline" size={60} color="#D3D9FD" />
                <Text style={styles.placeholderText}>Tap to Scan or Select Image</Text>
              </Pressable>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <Pressable 
              onPress={pickImage} 
              style={({ pressed }) => [
                styles.actionButton, 
                pressed && styles.actionButtonPressed
              ]} 
              accessibilityLabel="Select from gallery"
            >
              <Ionicons name="images-outline" size={22} color="white" />
              <Text style={[Fonts.medium, {color: '#FFFFFF', marginLeft: 8}]}>Gallery</Text>
            </Pressable>
            
            <Pressable 
              onPress={takePhoto} 
              style={({ pressed }) => [
                styles.actionButton, 
                styles.cameraButton, 
                pressed && styles.actionButtonPressed
              ]} 
              accessibilityLabel="Take a photo"
            >
              <Ionicons name="camera-outline" size={22} color="black" />
              <Text style={styles.buttonText}>Camera</Text>
            </Pressable>
          </View>

          {/* Extracted Text */}
          {(extractedText || isLoadingOCR) && (
            <View style={styles.textContainer}>
              <Text style={styles.sectionTitle}>Extracted Text</Text>
              <ScrollView style={styles.textScroll} nestedScrollEnabled={true}>
                <Text selectable style={styles.extractedText}>
                  {isLoadingOCR ? 'Analyzing image content...' : (extractedText || 'Scan results will appear here.')}
                </Text>
              </ScrollView>
            </View>
          )}

          {/* Text Actions */}
          {extractedText && !isLoadingOCR && (
            <View style={styles.actionRow}>
              <Pressable 
                onPress={copyToClipboard} 
                style={({ pressed }) => [
                  styles.smallActionButton, 
                  pressed && styles.smallActionButtonPressed
                ]} 
                accessibilityLabel="Copy to clipboard"
              >
                <Ionicons name="copy-outline" size={20} color="#4EA8DE" />
                <Text style={styles.smallButtonText}>Copy</Text>
              </Pressable>
              
              <Pressable 
                onPress={shareResult} 
                style={({ pressed }) => [
                  styles.smallActionButton, 
                  pressed && styles.smallActionButtonPressed
                ]} 
                accessibilityLabel="Share results"
              >
                <Ionicons name="share-social-outline" size={20} color="#4EA8DE" />
                <Text style={styles.smallButtonText}>Share</Text>
              </Pressable>
            </View>
          )}

          {/* Recent Scans */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Recent Scans (This Device)</Text>
              <Link href="/tracking/history" asChild>
                <Pressable accessibilityLabel="View full scan history">
                  <Text style={styles.seeAllLink}>See All</Text>
                </Pressable>
              </Link>
            </View>
            
            {localScanHistory.length > 0 ? (
              localScanHistory.slice(0, 3).map((scan, index) => (
                <View 
                  key={scan.id} 
                  style={[
                    styles.historyItem, 
                    index === localScanHistory.slice(0, 3).length - 1 && styles.historyItemLast
                  ]}
                >
                  <Image 
                    source={{ 
                      uri: scan.imageUri.trim() || 'https://placehold.co/40x40/E2E8F0/A0AEC0?text=No+Image' 
                    }} 
                    style={styles.historyItemImage} 
                  />
                  <View style={styles.historyItemTextContainer}>
                    <Text 
                      style={styles.historyItemText} 
                      numberOfLines={1} 
                      ellipsizeMode="tail"
                    >
                      {scan.text.replace(/\n/g, ' ').substring(0, 40)}
                      {scan.text.length > 40 ? "..." : ""}
                    </Text>
                    <Text style={styles.historyItemTimestamp}>
                      {new Date(scan.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}, 
                      {new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward-outline" size={18} color="#E0E0E0" />
                </View>
              ))
            ) : (
              <Text style={[styles.placeholderText, { textAlign: 'center', paddingVertical: 20 }]}>
                No local scan history yet.
              </Text>
            )}
          </View>
        </ScrollView>

        {/* Loading Overlay */}
        {isLoadingOCR && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#4EA8DE" />
            <Text style={styles.loadingTextOverlay}>Analyzing Image...</Text>
          </View>
        )}

        {/* Waving Hand (Insight Indicator) */}
        {isWavingHandVisible && !isLoadingOCR && !isLoadingInsight && scanInsight && (
          <Animated.View 
            style={[
              styles.wavingHandContainer, 
              { 
                bottom: insets.bottom + 20, 
                transform: [{ rotate: waveRotation }] 
              }
            ]}
          >
            <TouchableOpacity onPress={() => setIsInsightModalVisible(true)}>
              <Ionicons name="sparkles-outline" size={36} color="#FFC107" />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Allergen Alert Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={isAlertModalVisible}
          onRequestClose={() => setIsAlertModalVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setIsAlertModalVisible(false)}>
            <View style={styles.modalOverlayGlobal_allergen} />
          </TouchableWithoutFeedback>
          
          <View style={styles.modalCenteredView_allergen}>
            <Animated.View 
              style={[
                styles.modalView_allergen, 
                { 
                  borderColor: allergenModalContent.color, 
                  borderWidth: 1.5, 
                  shadowColor: allergenModalContent.color, 
                  shadowOpacity: 0.3 
                }
              ]}
            >
              <View style={[styles.modalIconContainer_allergen, { backgroundColor: allergenModalContent.color }]}>
                <Ionicons name={allergenModalContent.iconName} size={36} color="white" />
              </View>
              
              <Text style={styles.modalTitle_allergen}>{allergenModalContent.title}</Text>
              <Text style={styles.modalMessage_allergen}>{allergenModalContent.message}</Text>
              
              {allergenModalContent.details && (
                <Text style={styles.modalDetails_allergen}>{allergenModalContent.details}</Text>
              )}
              
              <Pressable 
                style={({ pressed }) => [
                  styles.modalButton_allergen, 
                  { backgroundColor: allergenModalContent.color }, 
                  pressed && styles.modalButtonPressed_allergen
                ]} 
                onPress={() => {
                  setIsAlertModalVisible(false);
                  if (allergenModalContent.iconName === 'settings-outline' || allergenModalContent.iconName === 'log-in-outline') {
                    router.push('/(tabs)/profile');
                  }
                }}
              >
                <Text style={styles.modalButtonText_allergen}>
                  {allergenModalContent.iconName === 'settings-outline' || allergenModalContent.iconName === 'log-in-outline' 
                    ? "Go to Profile" 
                    : "Close"}
                </Text>
              </Pressable>
            </Animated.View>
          </View>
        </Modal>

        {/* Profile Options Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={isProfileOptionsVisible}
          onRequestClose={() => setIsProfileOptionsVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setIsProfileOptionsVisible(false)}>
            <View style={styles.modalOverlay_homeScreen}>
              <Animated.View 
                style={[
                  styles.profileOptionsModal_homeScreen, 
                  { 
                    opacity: menuFadeAnim, 
                    top: insets.top + 10, 
                    left: 16 
                  }
                ]}
              >
                <TouchableOpacity 
                  style={styles.modalOptionButton_homeScreen} 
                  onPress={handleVisitProfile}
                >
                  <Ionicons name="person-outline" size={20} color="#000000" style={styles.modalOptionIcon_homeScreen} />
                  <Text style={styles.modalOptionText_homeScreen}>Visit Profile</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.modalOptionButton_homeScreen} 
                  onPress={handleChangeAccount}
                >
                  <Ionicons name="swap-horizontal-outline" size={20} color="#000000" style={styles.modalOptionIcon_homeScreen} />
                  <Text style={styles.modalOptionText_homeScreen}>Change Account</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.modalOptionButton_homeScreen} 
                  onPress={handleLogout}
                >
                  <Ionicons name="log-out-outline" size={20} color="#E53E3E" style={styles.modalOptionIcon_homeScreen} />
                  <Text style={[styles.modalOptionText_homeScreen, { color: '#E53E3E' }]}>Logout</Text>
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
            <View style={styles.modalOverlay_homeScreen}>
              <Animated.View 
                style={[
                  styles.notificationsModal_homeScreen, 
                  { 
                    opacity: notificationsMenuFadeAnim, 
                    top: insets.top + 10, 
                    right: 16 
                  }
                ]}
              >
                <View style={styles.modalHeader_homeScreen_notifications}>
                  <Text style={styles.modalTitle_homeScreen_notifications}>Recent Scans (Notifications)</Text>
                </View>
                
                {sharedScannedItemsHistory.length > 0 ? (
                  <FlatList 
                    data={sharedScannedItemsHistory.slice(0, 15)}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item, index }) => (
                      <View 
                        style={[
                          styles.notificationItem_homeScreen, 
                          index === sharedScannedItemsHistory.slice(0, 15).length - 1 && 
                            styles.notificationItemLast_homeScreen
                        ]}
                      >
                        <Ionicons 
                          name="barcode-outline" 
                          size={22} 
                          color="#4EA8DE" 
                          style={styles.notificationItemIcon_homeScreen} 
                        />
                        <View style={styles.notificationItemContent_homeScreen}>
                          <Text 
                            style={styles.notificationItemText_homeScreen} 
                            numberOfLines={2}
                          >
                            {item.name}
                          </Text>
                          <Text style={styles.notificationItemTimestamp_homeScreen}>
                            {new Date(item.scannedAt).toLocaleDateString()} 
                            {new Date(item.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                      </View>
                    )}
                  />
                ) : (
                  <View style={styles.notificationItem_homeScreen}>
                    <Text style={styles.noNotificationsText_homeScreen}>No new scan notifications.</Text>
                  </View>
                )}
                
                {sharedScannedItemsHistory.length > 0 && (
                  <TouchableOpacity 
                    style={styles.clearHistoryButton_homeScreen} 
                    onPress={handleClearSharedScanHistory}
                  >
                    <Ionicons name="trash-outline" size={18} color="#E53E3E" style={{ marginRight: 8 }} />
                    <Text style={styles.clearHistoryButtonText_homeScreen}>Clear All Notifications</Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Insight Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={isInsightModalVisible}
          onRequestClose={() => setIsInsightModalVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setIsInsightModalVisible(false)}>
            <View style={styles.insightModalOverlay} />
          </TouchableWithoutFeedback>
          
          <View style={styles.insightModalContainer}>
            <View style={styles.insightModalHeader}>
              <Text style={styles.insightModalTitle}>Quick Insight | نصائح فورية</Text>
              <TouchableOpacity 
                onPress={() => setIsInsightModalVisible(false)} 
                style={styles.insightCloseButton}
              >
                <Ionicons name="close-circle" size={28} color="#A0AEC0" />
              </TouchableOpacity>
            </View>
            
            <ScrollView contentContainerStyle={styles.insightModalContentScroll}>
              {isLoadingInsight ? (
                <ActivityIndicator size="large" color="#4EA8DE" style={{ marginVertical: 30 }} />
              ) : scanInsight ? (
                <>
                  {renderInsightSection(
                    "Health Summary | ملخص صحي", 
                    scanInsight.health_summary, 
                    "fitness-outline", 
                    "#3498DB"
                  )}
                  
                  {(scanInsight.identified_user_allergens?.length ?? 0) > 0 &&
                    renderInsightSection(
                      "Your Allergens Found | تم العثور على مسببات الحساسية الخاصة بك", 
                      scanInsight.identified_user_allergens, 
                      "alert-circle-outline", 
                      "#E74C3C", 
                      styles.insightAllergenText
                    )
                  }
                  
                  {(scanInsight.actionable_health_tips?.length ?? 0) > 0 &&
                    renderInsightSection(
                      "Health Tips | نصائح صحية", 
                      scanInsight.actionable_health_tips, 
                      "bulb-outline", 
                      "#2ECC71"
                    )
                  }
                  
                  {renderInsightSection(
                    "Brand/Origin Info | معلومات العلامة التجارية/المنشأ", 
                    scanInsight.boycott_suggestion, 
                    "information-circle-outline", 
                    "#9B59B6"
                  )}
                  
                  {renderInsightSection(
                    "Halal Status | حالة الحلال", 
                    scanInsight.halal_status, 
                    "checkmark-done-circle-outline", 
                    "#1ABC9C"
                  )}
                  
                  {renderInsightSection(
                    "Age Considerations | اعتبارات العمر", 
                    scanInsight.age_factor_notes, 
                    "body-outline", 
                    "#F39C12"
                  )}
                  
                  {scanInsight.raw_response && !scanInsight.health_summary && (
                    <Text style={styles.insightText}>{scanInsight.raw_response}</Text>
                  )}
                </>
              ) : (
                <Text style={styles.insightText}>No insights available for this scan.</Text>
              )}
            </ScrollView>
            
            <TouchableOpacity 
              style={styles.scanForBoycottButton} 
              onPress={handleScanForBoycott}
            >
              <Ionicons name="camera-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.scanForBoycottButtonText}>Scan Brand for Info</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </Animated.View>
    </SafeAreaView>
  );
};

// Styles remain the same as in your original code
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFF' },
  container: { flex: 1, backgroundColor: '#F8FAFF' },
  scrollContainer: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40, },
  header_homeScreen: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 0 : 5,
    paddingBottom: 5,
    backgroundColor: '#F8FAFF',
  },
  profileContainer_homeScreen: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0F4FE', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#E0E0E0' },
  profileImage_homeScreen: { width: '100%', height: '100%', },
  profileImagePlaceholder_homeScreen: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4FE' },
  searchContainer_homeScreen: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 15, paddingVertical: Platform.OS === 'ios' ? 10 : 8, marginLeft: 12, marginRight: 12, height: 40, shadowColor: '#B0C4DE', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 1, borderWidth: 1, borderColor: '#E0E0E0' },
  searchIcon_homeScreen: { marginRight: 8, },
  searchInput_homeScreen: { flex: 1, color: '#000000', fontSize: 14, padding: 0, margin: 0, height: '100%', },
  notificationBellContainer_homeScreen: { padding: 8, position: 'relative', marginRight: -8 },
  notificationDot_homeScreen: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53E3E', borderWidth: 1.5, borderColor: '#FFFFFF' },

  card: { 
    backgroundColor: 'rgba(255, 255, 255, 0.76)', 
    borderRadius: 16, 
    padding: 20, 
    marginBottom: 24, 
    borderWidth: 1, 
    borderColor: '#E0E0E0' 
  },
  progressCard: { paddingBottom: 15, },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#000000', },
  progressText: { fontSize: 14, marginBottom: 10, fontWeight: '500', color: '#4A5568' },
  progressBarBackground: { height: 10, borderRadius: 5, marginTop: 4, overflow: 'hidden', backgroundColor: '#EAF0F6', },
  progressBarFill: { height: '100%', borderRadius: 5, backgroundColor: '#4EA8DE', },

  imageContainer: { marginBottom: 24, borderRadius: 16, overflow: 'hidden', shadowColor: '#9FB0C7', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 5, elevation: 2, },
  image: { width: '100%', height: 250, backgroundColor: '#EAEFFD', },
  placeholder: { height: 250, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4FE', borderRadius: 16, borderWidth: 1, borderColor: '#E0E0E0' },
  placeholderText: { marginTop: 12, fontSize: 15, fontWeight: '500', color: '#718096', },

  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, gap: 16, },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4EA8DE', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, },
  actionButtonPressed: { backgroundColor: '#4C6BFF', transform: [{ scale: 0.98 }] },
  cameraButton: { backgroundColor: '#E3E430' },
  buttonText: { fontFamily: 'mediumFont', color: 'black', marginLeft: 10,  fontSize: 16, },

  textContainer: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 24, shadowColor: '#9FB0C7', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2, borderWidth: Platform.OS === 'ios' ? 0 : 1, borderColor: '#E0E0E0' },
  textScroll: { maxHeight: 180, },
  extractedText: { fontSize: 15, lineHeight: 23, color: '#334155', },

  actionRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 24, gap: 12, },
  smallActionButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 25, backgroundColor: '#EDF2F7', },
  smallActionButtonPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  smallButtonText: { marginLeft: 8, fontWeight: '500', fontSize: 14, color: '#4C51BF', },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EAF0F6', },
  seeAllLink: { fontSize: 14, fontWeight: '500', paddingVertical: 5, color: '#4EA8DE', },

  historyItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F7FAFC', },
  historyItemLast: { borderBottomWidth: 0, },
  historyItemImage: { width: 40, height: 40, borderRadius: 8, marginRight: 12, backgroundColor: '#E0E0E0' },
  historyItemTextContainer: { flex: 1 },
  historyItemText: { fontSize: 14, fontWeight: '500', color: '#4A5568', },
  historyItemTimestamp: { fontSize: 12, color: '#718096', },

  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(248, 250, 255, 0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 100, },
  loadingTextOverlay: { marginTop: 16, fontSize: 16, fontWeight: '500', color: '#4EA8DE', },

  modalOverlayGlobal_allergen: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 20 },
  modalCenteredView_allergen: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 21 },
  modalView_allergen: { borderRadius: 20, padding: 25, paddingTop: 30, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2, }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5, width: Platform.OS === 'web' ? '50%' : '88%', maxWidth: 400, backgroundColor: 'white', },
  modalIconContainer_allergen: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 20, marginTop: -55, backgroundColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 3 },
  modalTitle_allergen: { marginBottom: 15, textAlign: 'center', fontSize: 22, fontWeight: 'bold', color: '#000000', },
  modalMessage_allergen: { marginBottom: 10, textAlign: 'center', fontSize: 16, lineHeight: 22, color: '#4A5568', },
  modalDetails_allergen: { marginBottom: 25, textAlign: 'center', fontSize: 14, fontStyle: 'italic', lineHeight: 20, color: '#718096', },
  modalButton_allergen: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, elevation: 2, marginTop: 10, width: '100%', alignItems: 'center', },
  modalButtonText_allergen: { color: 'white', fontWeight: 'bold', textAlign: 'center', fontSize: 16, },
  modalButtonPressed_allergen: { opacity: 0.8 },

  modalOverlay_homeScreen: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', zIndex: 50 },
  profileOptionsModal_homeScreen: { backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 8, minWidth: 220, position: 'absolute', zIndex: 51 },
  modalProfileHeader_homeScreen: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4FE', marginBottom: 8, },
  modalProfileName_homeScreen: { fontSize: 16, fontWeight: '600', color: '#000000', },
  modalProfileUsername_homeScreen: { fontSize: 13, color: '#718096', marginTop: 2, },
  modalOptionButton_homeScreen: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, },
  modalOptionIcon_homeScreen: { marginRight: 12, width: 20, alignItems: 'center' },
  modalOptionText_homeScreen: { fontSize: 15, color: '#000000', fontWeight: '500' },

  notificationsModal_homeScreen: { backgroundColor: '#FFFFFF', borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 8, minWidth: 280, maxWidth: '90%', maxHeight: '70%', position: 'absolute', overflow: 'hidden', zIndex: 51 },
  modalHeader_homeScreen_notifications: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4FE', },
  modalTitle_homeScreen_notifications: { fontSize: 17, fontWeight: '600', color: '#000000', },
  notificationItem_homeScreen: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#F8FAFF', },
  notificationItemLast_homeScreen: { borderBottomWidth: 0, },
  notificationItemIcon_homeScreen: { marginRight: 12, marginTop: 2 },
  notificationItemContent_homeScreen: { flex: 1 },
  notificationItemText_homeScreen: { fontSize: 14, color: '#334155', fontWeight: '500', lineHeight: 18, marginBottom: 3 },
  notificationItemTimestamp_homeScreen: { fontSize: 11, color: '#64748B', },
  noNotificationsText_homeScreen: { textAlign: 'center', color: '#64748B', paddingVertical: 25, fontSize: 14, },
  clearHistoryButton_homeScreen: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#F0F4FE', backgroundColor: '#FFF7F7' },
  clearHistoryButtonText_homeScreen: { fontSize: 14, color: '#E53E3E', fontWeight: '500', },

  insightModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  insightModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 0,
    maxHeight: height * 0.75,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 30,
  },
  insightModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EAF0F6',
  },
  insightModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  insightCloseButton: {
    padding: 8,
  },
  insightModalContentScroll: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  insightSection: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAF0F6',
  },
  insightSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  insightSectionIcon: {
    marginRight: 10,
  },
  insightSectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#3A5FD8',

  },
  insightSectionContent: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4A5568',
  },
  insightAllergenText: {
    color: '#C53030',
    fontWeight: '600',
    backgroundColor: '#FED7D7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 4,
  },
  insightText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4A5568',
    marginBottom: 10,
  },
  wavingHandContainer: {
    position: 'absolute',
    right: 20,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1001,
  },
  scanForBoycottButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 16,
    marginHorizontal: 20,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  scanForBoycottButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default DetectText;