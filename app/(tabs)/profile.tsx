import { supabase } from '@/lib/supabase';
import { BackgroundShapes } from '@/styles/globalStyles';
import { Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { decode } from 'base64-arraybuffer';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Keyboard,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

const HEADER_MAX_HEIGHT = 290;
const HEADER_MIN_HEIGHT = 120;
const PROFILE_IMAGE_SIZE = 140;
const PROFILE_IMAGE_COLLAPSED_SIZE = 90;
const PROFILE_IMAGE_MARGIN_TOP = PROFILE_IMAGE_SIZE + 10;

const ALLERGENS_DB = [
  'Peanuts', 'Tree Nuts', 'Milk', 'Eggs', 'Wheat', 'Soy',
  'Fish', 'Shellfish', 'Gluten', 'Sesame', 'Sulfites',
  'Mustard', 'Lupin', 'Celery', 'Mollusks'
];

type AllergySeverity = 'mild' | 'moderate' | 'severe';

type Profile = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  background_url: string;
  bio: string;
  website: string;
  location: string;
  birth_date: string | null;
  allergies: string[];
  allergy_severity: AllergySeverity;
  emergency_contact: {
    name: string;
    phone: string;
    relationship?: string;
  };

  created_at: string;
  updated_at: string;
};

const ProfileScreen = React.memo(() => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState<Profile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [date, setDate] = useState(new Date());
  const [editDate, setEditDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newAllergen, setNewAllergen] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      setIsProcessing(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) {
        const profileData = {
          ...data,
          allergies: data.allergies || [],
          allergy_severity: data.allergy_severity || 'moderate',
          emergency_contact: data.emergency_contact || { name: '', phone: '' }
        };
        setProfile(profileData);
        if (data.birth_date) {
          const parsedDate = new Date(data.birth_date);
          if (!isNaN(parsedDate.getTime())) {
            setDate(parsedDate);
            setEditDate(parsedDate);
          }
        }
      } else if (error) {
        console.error("Error fetching profile:", error);
      }
    } finally {
      setIsProcessing(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const headerHeight = useMemo(() => scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [HEADER_MAX_HEIGHT, HEADER_MIN_HEIGHT],
    extrapolate: 'clamp'
  }), [scrollY]);

  const backgroundTranslateY = useMemo(() => scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [0, 0],
    extrapolate: 'clamp'
  }), [scrollY]);

  const profileImageSize = useMemo(() => scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [PROFILE_IMAGE_SIZE, PROFILE_IMAGE_COLLAPSED_SIZE],
    extrapolate: 'clamp'
  }), [scrollY]);

  const profileImageTranslateY = useMemo(() => scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [0, -(PROFILE_IMAGE_MARGIN_TOP - (HEADER_MIN_HEIGHT - PROFILE_IMAGE_COLLAPSED_SIZE) / 2)],
    extrapolate: 'clamp'
  }), [scrollY]);

  const profileImageTranslateX = useMemo(() => scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [0, -width / 2 + PROFILE_IMAGE_COLLAPSED_SIZE / 2 + 20],
    extrapolateRight: 'clamp',
    extrapolateLeft: 'extend'
  }), [scrollY]);

  const nameOpacity = useMemo(() => scrollY.interpolate({
    inputRange: [0, (HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT) * 0.7],
    outputRange: [1, 0],
    extrapolate: 'clamp'
  }), [scrollY]);

  const nameTranslateY = useMemo(() => scrollY.interpolate({
    inputRange: [0, HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT],
    outputRange: [0, -30],
    extrapolate: 'clamp'
  }), [scrollY]);

  const openEditModal = useCallback(() => {
    if (profile) {
      setEditForm({...profile});
      if (profile.birth_date) {
        const parsedDate = new Date(profile.birth_date);
        if (!isNaN(parsedDate.getTime())) {
          setEditDate(parsedDate);
        }
      }
    }
    setEditModalVisible(true);
  }, [profile]);

  const handleUpdate = useCallback(async () => {
    if (!editForm) return;

    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const updates = {
        ...editForm,
        updated_at: new Date().toISOString(),
        birth_date: editDate.toISOString(),
        id: user.id,
      };

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (!error) {
        setProfile(editForm);
        setDate(editDate);
        setEditModalVisible(false);
        Alert.alert('Success', 'Profile updated successfully');
      } else {
        Alert.alert('Update Error', error.message);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [editForm, editDate]);

  const handleCancel = useCallback(() => {
    setEditModalVisible(false);
  }, []);

  const addAllergen = useCallback(() => {
    if (newAllergen.trim() && !editForm?.allergies?.includes(newAllergen)) {
      setEditForm(prev => ({
        ...prev!,
        allergies: [...prev!.allergies, newAllergen.trim()]
      }));
      setNewAllergen('');
      Keyboard.dismiss();
    }
  }, [newAllergen, editForm?.allergies]);

  const removeAllergen = useCallback((allergen: string) => {
    setEditForm(prev => ({
      ...prev!,
      allergies: prev!.allergies.filter(a => a !== allergen)
    }));
  }, []);

  const toggleAllergen = useCallback((allergen: string) => {
    setEditForm(prev => {
      if (!prev) return prev;
      const currentAllergies = prev.allergies || [];
      const updatedAllergies = currentAllergies.includes(allergen)
        ? currentAllergies.filter(a => a !== allergen)
        : [...currentAllergies, allergen];
      return { ...prev, allergies: updatedAllergies };
    });
  }, []);

  const getSeverityColor = useCallback((severity: AllergySeverity) => {
    switch(severity) {
      case 'mild': return '#FFD700';
      case 'moderate': return '#FFA500';
      case 'severe': return '#FF4500';
      default: return '#FF6B6B';
    }
  }, []);

  const openUrl = useCallback(async (url: string | undefined) => {
    if (!url) return;
    try {
      const fullUrl = url.startsWith('http') ? url : `https://${url}`;
      await Linking.openURL(fullUrl);
    } catch (error) {
      Alert.alert('Error', 'Could not open the link.');
    }
  }, []);

  const uploadImage = useCallback(async (type: 'avatar' | 'background') => {
    setIsProcessing(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: type === 'avatar' ? [1, 1] : [4, 3],
        quality: 0.7,
        base64: true
      });

      if (result.canceled) return;

      const file = result.assets[0];
      const fileExt = file.uri.split('.').pop();
      const fileName = `${type}_${Math.random()}.${fileExt}`;
      const filePath = `${type}s/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('profile-media')
        .upload(filePath, decode(file.base64 || ''), {
          contentType: file.mimeType || 'image/jpeg',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('profile-media')
        .getPublicUrl(filePath);

      if (!data?.publicUrl) throw new Error("Could not get public URL");

      const update = { [`${type}_url`]: data.publicUrl };

      setProfile(prev => prev ? { ...prev, ...update } : null);
      if (editModalVisible) {
        setEditForm(prev => prev ? { ...prev, ...update } : null);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update(update)
          .eq('id', user.id);
      }
    } catch (error) {
      Alert.alert('Upload Error', 'Failed to upload image');
    } finally {
      setIsProcessing(false);
    }
  }, [editModalVisible]);

  const onChangeDate = useCallback((event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setEditDate(selectedDate);
      setEditForm(prev => prev ? {
        ...prev,
        birth_date: selectedDate.toISOString()
      } : null);
    }
  }, []);

  const formatBirthDate = useCallback((dateString: string | null) => {
    if (!dateString) return 'Not set';
    try {
      const dateObj = new Date(dateString);
      return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : 'Invalid Date';
    } catch (e) {
      return 'Invalid Date';
    }
  }, []);

  const formatJoinedDate = useCallback((dateString: string | null) => {
    if (!dateString) return '';
    try {
      const dateObj = new Date(dateString);
      return !isNaN(dateObj.getTime())
        ? `Joined ${dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}`
        : '';
    } catch (e) {
      return '';
    }
  }, []);

  if (!profile && !isProcessing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4EA8DE" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'right', 'left']}>
      <StatusBar style={editModalVisible ? 'dark' : 'dark'} />
      <BackgroundShapes />
      <ScrollView
        ref={scrollViewRef}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } }}],
          { useNativeDriver: false }
        )}
        contentContainerStyle={styles.scrollViewContent}
      >

        <Animated.View style={[
          styles.profileImageContainer,
          {
            transform: [
              { translateY: profileImageTranslateY },
              { translateX: profileImageTranslateX }
            ],
          }
        ]}>
          <Animated.View style={[
            styles.avatarWrapper,
            {
              width: profileImageSize,
              height: profileImageSize,
              borderRadius: Animated.divide(profileImageSize, 2)
            }
          ]}>
            <View style={styles.avatarContainer}>
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={styles.avatar}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={48} color="#ddd" />
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.smallPhotoEditButton}
              onPress={() => uploadImage('avatar')}
              disabled={isProcessing}
            >
              <Ionicons name="camera" size={16} color="white" />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        <View style={{ height: HEADER_MAX_HEIGHT - PROFILE_IMAGE_MARGIN_TOP }} />

        <Animated.View style={{
          opacity: nameOpacity,
          transform: [{ translateY: nameTranslateY }],
          alignItems: 'center'
        }}>
          <Text style={styles.fullName}>{profile?.full_name}</Text>
          <Text style={styles.username}>@{profile?.username}</Text>
        </Animated.View>

        <View style={styles.content}>
          {profile?.created_at && (
            <Text style={styles.joinedDate}>{formatJoinedDate(profile.created_at)}</Text>
          )}

          <View style={styles.combinedSection}>
            <Text style={styles.sectionTitle}>Allergy Profile</Text>

            <View style={styles.detailRow}>
              <Ionicons name="warning" size={20} color={getSeverityColor(profile?.allergy_severity || 'moderate')} style={styles.sectionIcon} />
              <View style={styles.severityDisplay}>
                <Text style={[styles.detailText, { color: getSeverityColor(profile?.allergy_severity || 'moderate') }]}>
                  {profile?.allergy_severity?.toUpperCase() || 'MODERATE'}
                </Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="medical" size={20} color="#666" style={styles.sectionIcon} />
              <View style={styles.allergensContainer}>
                <Text style={styles.detailLabel}>Allergens:</Text>
                <View style={styles.allergensGrid}>
                  {profile?.allergies?.length ? (
                    profile.allergies.map(allergen => (
                      <View key={allergen} style={[
                        styles.allergenTag,
                        styles.viewModeAllergenTag,
                        { borderColor: getSeverityColor(profile?.allergy_severity || 'moderate') }
                      ]}>
                        <Text style={styles.allergenTagText}>{allergen}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyState}>No allergens configured</Text>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="call" size={20} color="#FF6B6B" style={styles.sectionIcon} />
              <View style={styles.emergencyContactContainer}>
                <Text style={styles.detailLabel}>Emergency Contact:</Text>
                <>
                  <Text style={styles.detailText}>
                    {profile?.emergency_contact?.name || 'Not set'}
                  </Text>
                  {profile?.emergency_contact?.phone && (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${profile.emergency_contact.phone}`)}>
                      <Text style={[styles.detailText, styles.linkText]}>
                        {profile.emergency_contact.phone}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              </View>
            </View>
          </View>

          {(profile?.bio || profile?.location || profile?.birth_date || profile?.website) && (
            <View style={styles.combinedSection}>
              <Text style={styles.sectionTitle}>About & Details</Text>

              <View style={styles.detailRow}>
                <Ionicons name="information-circle-outline" size={20} color="#666" style={styles.sectionIcon} />
                <Text style={styles.bioText} numberOfLines={3}>
                  {profile?.bio || 'No bio yet'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={20} color="#666" style={styles.sectionIcon} />
                <Text style={styles.detailText} numberOfLines={1}>
                  {profile?.location || 'Not set'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Ionicons name="calendar-outline" size={20} color="#666" style={styles.sectionIcon} />
                <Text style={styles.detailText} numberOfLines={1}>
                  {profile?.birth_date ? formatBirthDate(profile.birth_date) : 'Not set'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <MaterialIcons name="link" size={20} color="#666" style={styles.sectionIcon} />
                <TouchableOpacity onPress={() => openUrl(profile?.website)}>
                  <Text style={[styles.detailText, styles.linkText]} numberOfLines={1}>
                    {profile?.website ? profile.website.replace(/^https?:\/\//, '') : 'Not set'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

        
        </View>
      </ScrollView>

      {!editModalVisible && (
        <TouchableOpacity
          style={[styles.editButton, { bottom: insets.bottom + 80 }]}
          onPress={openEditModal}
        >
          <Feather name="edit" size={20} color="white" />
        </TouchableOpacity>
      )}

      {editModalVisible && editForm && (
        <>
          <BlurView
            intensity={20}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />

          <View style={[
            styles.editModalContainer,
            { top: insets.top + 20, bottom: insets.bottom + 20 }
          ]}>
            <ScrollView
              contentContainerStyle={styles.editModalContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.editSection}>
                <Text style={styles.editSectionTitle}>Profile Info</Text>

                <View style={styles.detailRow}>
                  <Ionicons name="person-outline" size={20} color="#666" style={styles.sectionIcon} />
                  <TextInput
                    style={styles.editInput}
                    value={editForm.full_name || ''}
                    onChangeText={(text) => setEditForm(prev => prev ? { ...prev, full_name: text } : null)}
                    placeholder="Full Name"
                    placeholderTextColor="#999"
                  />
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="at" size={20} color="#666" style={styles.sectionIcon} />
                  <TextInput
                    style={styles.editInput}
                    value={editForm.username || ''}
                    onChangeText={(text) => setEditForm(prev => prev ? { ...prev, username: text } : null)}
                    placeholder="Username"
                    placeholderTextColor="#999"
                  />
                </View>
              </View>

              <View style={styles.editSection}>
                <Text style={styles.editSectionTitle}>Allergy Profile</Text>

                <View style={styles.detailRow}>
                  <Ionicons name="warning" size={20} color="#666" style={styles.sectionIcon} />
                  <View style={styles.severityPicker}>
                    <Text style={styles.detailLabel}>Severity:</Text>
                    <View style={styles.severityOptions}>
                      <TouchableOpacity
                        style={[
                          styles.severityOption,
                          editForm.allergy_severity === 'mild' && styles.severityOptionSelected,
                          { borderColor: getSeverityColor('mild') }
                        ]}
                        onPress={() => setEditForm(prev => prev ? { ...prev, allergy_severity: 'mild' } : null)}
                      >
                        <Text style={editForm.allergy_severity === 'mild' ? styles.severityOptionTextSelected : styles.severityOptionText}>
                          Mild
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.severityOption,
                          editForm.allergy_severity === 'moderate' && styles.severityOptionSelected,
                          { borderColor: getSeverityColor('moderate') }
                        ]}
                        onPress={() => setEditForm(prev => prev ? { ...prev, allergy_severity: 'moderate' } : null)}
                      >
                        <Text style={editForm.allergy_severity === 'moderate' ? styles.severityOptionTextSelected : styles.severityOptionText}>
                          Moderate
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.severityOption,
                          editForm.allergy_severity === 'severe' && styles.severityOptionSelected,
                          { borderColor: getSeverityColor('severe') }
                        ]}
                        onPress={() => setEditForm(prev => prev ? { ...prev, allergy_severity: 'severe' } : null)}
                      >
                        <Text style={editForm.allergy_severity === 'severe' ? styles.severityOptionTextSelected : styles.severityOptionText}>
                          Severe
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="medical" size={20} color="#666" style={styles.sectionIcon} />
                  <View style={styles.allergensContainer}>
                    <Text style={styles.detailLabel}>Allergens:</Text>
                    <View style={styles.allergensInputRow}>
                      <TextInput
                        style={styles.allergenInput}
                        value={newAllergen}
                        onChangeText={setNewAllergen}
                        placeholder="Add custom allergen"
                        placeholderTextColor="#999"
                        onSubmitEditing={addAllergen}
                        returnKeyType="done"
                      />
                      <TouchableOpacity
                        style={[styles.addButton, !newAllergen.trim() && styles.disabledButton]}
                        onPress={addAllergen}
                        disabled={!newAllergen.trim()}
                      >
                        <Ionicons name="add" size={20} color={newAllergen.trim() ? '#4EA8DE' : '#ccc'} />
                      </TouchableOpacity>
                    </View>
                    
                    <Text style={styles.subSectionTitle}>Common Allergens:</Text>
                    <View style={styles.allergensGrid}>
                      {ALLERGENS_DB.map(allergen => (
                        <TouchableOpacity
                          key={allergen}
                          style={[
                            styles.allergenTag,
                            editForm.allergies?.includes(allergen) && {
                              backgroundColor: getSeverityColor(editForm.allergy_severity || 'moderate')
                            }
                          ]}
                          onPress={() => toggleAllergen(allergen)}
                        >
                          <Text style={[
                            styles.allergenTagText,
                            editForm.allergies?.includes(allergen) && styles.selectedAllergenTagText
                          ]}>
                            {allergen}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    
                    {editForm.allergies.filter(a => !ALLERGENS_DB.includes(a)).length > 0 && (
                      <>
                        <Text style={styles.subSectionTitle}>Your Allergens:</Text>
                        <View style={styles.allergensGrid}>
                          {editForm.allergies
                            .filter(a => !ALLERGENS_DB.includes(a))
                            .map(allergen => (
                              <View key={allergen} style={styles.customAllergenTag}>
                                <Text style={styles.customAllergenTagText}>{allergen}</Text>
                                <TouchableOpacity
                                  style={styles.removeAllergenButton}
                                  onPress={() => removeAllergen(allergen)}
                                >
                                  <Ionicons name="close" size={16} color="#FF6B6B" />
                                </TouchableOpacity>
                              </View>
                            ))}
                        </View>
                      </>
                    )}
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="call" size={20} color="#666" style={styles.sectionIcon} />
                  <View style={styles.emergencyContactContainer}>
                    <Text style={styles.detailLabel}>Emergency Contact:</Text>
                    <TextInput
                      style={styles.editInput}
                      value={editForm.emergency_contact?.name || ''}
                      onChangeText={(text) => setEditForm(prev => ({
                        ...prev!,
                        emergency_contact: prev ? {...prev.emergency_contact, name: text} : { name: text, phone: '' }
                      }))}
                      placeholder="Name"
                      placeholderTextColor="#999"
                    />
                    <TextInput
                      style={styles.editInput}
                      value={editForm.emergency_contact?.phone || ''}
                      onChangeText={(text) => setEditForm(prev => ({
                        ...prev!,
                        emergency_contact: prev ? {...prev.emergency_contact, phone: text} : { name: '', phone: text }
                      }))}
                      placeholder="Phone"
                      placeholderTextColor="#999"
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>
              </View>

              <View style={styles.editSection}>
                <Text style={styles.editSectionTitle}>About & Details</Text>

                <View style={styles.detailRow}>
                  <Ionicons name="information-circle-outline" size={20} color="#666" style={styles.sectionIcon} />
                  <TextInput
                    style={[styles.editInput, { height: 80 }]}
                    value={editForm.bio || ''}
                    onChangeText={(text) => setEditForm(prev => prev ? { ...prev, bio: text } : null)}
                    placeholder="Tell about yourself"
                    placeholderTextColor="#999"
                    multiline
                  />
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="location-outline" size={20} color="#666" style={styles.sectionIcon} />
                  <TextInput
                    style={styles.editInput}
                    value={editForm.location || ''}
                    onChangeText={(text) => setEditForm(prev => prev ? { ...prev, location: text } : null)}
                    placeholder="Location"
                    placeholderTextColor="#999"
                  />
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={20} color="#666" style={styles.sectionIcon} />
                  <TouchableOpacity
                    style={styles.editInput}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={{ color: editForm.birth_date ? '#000' : '#999' }}>
                      {editForm.birth_date ? formatBirthDate(editForm.birth_date) : "Birth Date"}
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={editDate}
                      mode="date"
                      display="default"
                      onChange={onChangeDate}
                    />
                  )}
                </View>

                <View style={styles.detailRow}>
                  <MaterialIcons name="link" size={20} color="#666" style={styles.sectionIcon} />
                  <TextInput
                    style={styles.editInput}
                    value={editForm.website || ''}
                    onChangeText={(text) => setEditForm(prev => prev ? { ...prev, website: text } : null)}
                    placeholder="Website"
                    placeholderTextColor="#999"
                    keyboardType="url"
                  />
                </View>
              </View>



              <View style={styles.editButtons}>
                <TouchableOpacity
                  style={[styles.editActionButton, styles.cancelButton]}
                  onPress={handleCancel}
                >
                  <Text style={styles.editActionButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editActionButton, styles.saveButton]}
                  onPress={handleUpdate}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.editActionButtonText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </>
      )}
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    zIndex: 1,
  },
  backgroundContainer: {
    width: '100%',
    height: '50%',
    overflow: 'hidden',
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    resizeMode: 'cover',
  },
  backgroundPlaceholder: {
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollViewContent: {
    paddingBottom: 120,
  },
  profileImageContainer: {
    position: 'absolute',
    left: '31%',
    top: HEADER_MAX_HEIGHT - PROFILE_IMAGE_SIZE -70,
    zIndex: 3,
  },
  avatarContainer: {
    width: '100%',
    height: '100%',
    borderRadius: PROFILE_IMAGE_SIZE / 2,
    overflow: 'hidden',
  },
  avatarWrapper: {
    position: 'relative',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    backgroundColor: '#fff',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },  avatarPlaceholder: {
    backgroundColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    marginTop: 10,
  },
  fullName: {
    fontFamily: 'titleFont',
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 2,
    color: '#333',
    marginTop: 90,
  },
  username: {
    fontFamily: 'subtitleFont',
    fontSize: 18,
    textAlign: 'center',
    color: '#666',
  },
  joinedDate: {
    fontFamily: 'bodyFont',
    fontSize: 14,
    textAlign: 'center',
    color: '#999',
    marginBottom: 20,
  },
  combinedSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
    borderRadius: 12,
    borderColor: '#E0E0E0',
    borderWidth: 1,
    padding: 15,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
    textAlign: 'left',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 15,
  },
  sectionIcon: {
    marginRight: 12,
    marginTop: 4,
  },
  bioText: {
    flex: 1,
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 5,
  },
  detailText: {
    flex: 1,
    fontSize: 14,
    color: '#555',
  },
  linkText: {
    color: '#4EA8DE',
    textDecorationLine: 'underline',
  },
  severityPicker: {
    flex: 1,
  },
  severityOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  severityOption: {
    flex: 1,
    marginHorizontal: 2,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  severityOptionSelected: {
    backgroundColor: '#f0f0f0',
  },
  severityOptionText: {
    fontSize: 14,
    color: '#666',
  },
  severityOptionTextSelected: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  severityDisplay: {
    flex: 1,
    paddingVertical: 8,
  },
  allergensContainer: {
    flex: 1,
  },
  allergensInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  allergenInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  allergensGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
  },
  allergenTag: {
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  selectedAllergenTag: {
    backgroundColor: '#FF6B6B',
    borderColor: '#FF6B6B',
  },
  viewModeAllergenTag: {
    backgroundColor: '#fff',
  },
  allergenTagText: {
    fontSize: 14,
    color: '#666',
  },
  selectedAllergenTagText: {
    color: 'white',
    fontWeight: '500',
  },
  customAllergenTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  customAllergenTagText: {
    fontSize: 14,
    color: '#666',
    marginRight: 4,
  },
  removeAllergenButton: {
    padding: 2,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#777',
    marginTop: 10,
    marginBottom: 5,
  },
  addButton: {
    padding: 10,
    borderRadius: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  socialIconsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 10,
  },
  socialIconButton: {
    marginRight: 15,
    padding: 8,
  },
  emptyState: {
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 10,
  },
  editButton: {
    position: 'absolute',
    right: 19,
    top: '93%',
    backgroundColor: '#4EA8DE',
    width: 60,
    height: 60,
    borderRadius: 47,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  editModalContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 100,
  },
  editModalContent: {
    paddingBottom: 20,
  },
  editSection: {
    marginBottom: 20,
  },
  editSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 8,
  },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  editActionButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
    marginRight: 10,
  },
  saveButton: {
    backgroundColor: '#4EA8DE',
    marginLeft: 10,
  },
  editActionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  emergencyContactContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  photoEditButtons: {
    position: 'absolute',
    right: 10,
    top: 100,
    flexDirection: 'row',
  },
  photoEditButton: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 20,
    marginLeft: 8,
  },
  smallPhotoEditButton: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: '#4EA8DE',
    width: 29,
    height: 29,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ProfileScreen;