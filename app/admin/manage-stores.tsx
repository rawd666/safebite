import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Store {
  id: string;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone_number?: string | null;
  website?: string | null;
  opening_hours?: any | null; // JSONB
  created_at?: string;
}

interface StoreFormData {
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  phone_number: string;
  website: string;
  opening_hours: string; // Will be stringified JSON for input
}

const AdminManageStoresScreen = () => {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  
  const [stores, setStores] = useState<Store[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  
  const [formData, setFormData] = useState<StoreFormData>({
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    phone_number: '',
    website: '',
    opening_hours: '{\n  "Mon-Fri": "9am-6pm",\n  "Sat": "10am-4pm",\n  "Sun": "Closed"\n}',
  });

  const resetForm = () => {
    setFormData({
      name: '', address: '', latitude: '', longitude: '',
      phone_number: '', website: '',
      opening_hours: '{\n  "Mon-Fri": "9am-6pm",\n  "Sat": "10am-4pm",\n  "Sun": "Closed"\n}',
    });
    setEditingStore(null);
  };

  const checkAdminStatus = useCallback(async () => {
    setLoadingAuth(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setIsAdmin(false);
        router.replace('/auth/login');
        return;
      }
      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .single();
      if (adminError && adminError.code !== 'PGRST116') throw adminError;
      
      const isAdminUser = !!adminData;
      setIsAdmin(isAdminUser);

      if (!isAdminUser) {
        Alert.alert("Access Denied", "You do not have permission to access this page.");
        router.replace('/(tabs)');
      } else {
        fetchStores();
      }
    } catch (error) {
      setIsAdmin(false);
      router.replace('/(tabs)');
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    checkAdminStatus();
  }, [checkAdminStatus]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) {
        fetchStores();
      }
    }, [isAdmin])
  );

  const fetchStores = async () => {
    setLoadingStores(true);
    try {
      const { data, error } = await supabase.from('stores').select('*').order('name', { ascending: true });
      if (error) throw error;
      setStores(data || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load stores.');
    } finally {
      setLoadingStores(false);
    }
  };

  const handleInputChange = (field: keyof StoreFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmitStore = async () => {
    if (!formData.name.trim() || !formData.address.trim() || !formData.latitude.trim() || !formData.longitude.trim()) {
      Alert.alert('Validation Error', 'Please fill in Name, Address, Latitude, and Longitude.');
      return;
    }
    setIsSubmitting(true);
    let parsedOpeningHours = null;
    if (formData.opening_hours.trim()) {
        try {
          parsedOpeningHours = JSON.parse(formData.opening_hours);
        } catch (e) {
          Alert.alert('Invalid JSON', 'Opening hours format is invalid. Please use valid JSON (e.g., {"Mon-Fri": "9am-5pm"}) or leave blank.');
          setIsSubmitting(false);
          return;
        }
    }

    try {
      const storePayload = {
        name: formData.name.trim(),
        address: formData.address.trim(),
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        phone_number: formData.phone_number.trim() || null,
        website: formData.website.trim() || null,
        opening_hours: parsedOpeningHours,
      };

      if (editingStore) {
        const { error } = await supabase.from('stores').update({...storePayload, updated_at: new Date().toISOString()}).eq('id', editingStore.id);
        if (error) throw error;
        Alert.alert('Success', 'Store updated successfully!');
      } else {
        const { error } = await supabase.from('stores').insert(storePayload);
        if (error) throw error;
        Alert.alert('Success', 'Store added successfully!');
      }
      
      resetForm();
      setShowAddForm(false);
      fetchStores();
    } catch (error: any) {
      Alert.alert('Error', `Failed to ${editingStore ? 'update' : 'add'} store: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleEditStore = (store: Store) => {
    setEditingStore(store);
    setFormData({
        name: store.name,
        address: store.address || '',
        latitude: store.latitude?.toString() || '',
        longitude: store.longitude?.toString() || '',
        phone_number: store.phone_number || '',
        website: store.website || '',
        opening_hours: store.opening_hours ? JSON.stringify(store.opening_hours, null, 2) : '{\n  "Monday-Friday": "9am-6pm",\n  "Saturday": "10am-4pm",\n  "Sunday": "Closed"\n}',
    });
    setShowAddForm(true);
  };

  const handleDeleteStore = async (storeId: string) => {
    Alert.alert(
      "Confirm Deletion", 
      "Are you sure you want to delete this store? This will also remove its availability records for all products (if cascade delete is set up on product_store_availability). This action cannot be undone.", 
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
            setIsSubmitting(true);
            try {
              // First, delete related product_store_availability records
              const { error: availabilityError } = await supabase
                .from('product_store_availability')
                .delete()
                .eq('store_id', storeId);
              
              if (availabilityError) {
                // Log error but attempt to delete store anyway, or handle more gracefully
                console.error("Error deleting store availability records:", availabilityError.message);
              }

              const { error } = await supabase.from('stores').delete().eq('id', storeId);
              if (error) throw error;
              Alert.alert("Success", "Store deleted successfully.");
              fetchStores();
            } catch (error: any) { Alert.alert("Error", `Failed to delete store: ${error.message}`); }
            finally { setIsSubmitting(false); }
        }}
      ]
    );
  };

  if (loadingAuth) { return ( <SafeAreaView style={styles.centeredScreen}><ActivityIndicator size="large" color="#4EA8DE" /><Text style={styles.loadingText}>Verifying access...</Text></SafeAreaView> ); }
  if (!isAdmin) { return ( <SafeAreaView style={styles.centeredScreen}><Text>Access Denied.</Text></SafeAreaView> ); }

  const renderStoreItem = ({ item }: { item: Store }) => (
    <View style={styles.listItem}>
      <Ionicons name="storefront-outline" size={24} color="#4A5568" style={styles.listItemIcon} />
      <View style={styles.listItemTextContainer}>
        <Text style={styles.listItemName}>{item.name}</Text>
        <Text style={styles.listItemAddress} numberOfLines={1} ellipsizeMode="tail">{item.address}</Text>
      </View>
      <View style={styles.listItemActions}>
          <TouchableOpacity onPress={() => handleEditStore(item)} style={[styles.actionIcon, styles.editIcon]}>
              <Ionicons name="pencil-outline" size={22} color="#4EA8DE" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeleteStore(item.id)} style={[styles.actionIcon, styles.deleteIcon]}>
              <Ionicons name="trash-outline" size={22} color="#E53E3E" />
          </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: 'Admin: Manage Stores' }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.pageHeader}>
          <Ionicons name="storefront-outline" size={32} color="#000000" />
          <Text style={styles.pageTitle}>Manage Stores</Text>
        </View>
        <Text style={styles.pageSubtitle}>Add, edit, or remove store locations.</Text>

        <TouchableOpacity 
            style={styles.toggleFormButton} 
            onPress={() => {
                setShowAddForm(!showAddForm); 
                if(showAddForm || editingStore) resetForm(); // Reset form if closing or was editing
            }}
        >
            <Ionicons name={showAddForm || editingStore ? "close-circle-outline" : "add-circle-outline"} size={22} color="#FFFFFF" style={{marginRight: 8}} />
            <Text style={styles.toggleFormButtonText}>{showAddForm || editingStore ? "Cancel" : "Add New Store"}</Text>
        </TouchableOpacity>

        {(showAddForm || editingStore) && (
            <View style={styles.formSection}>
                <Text style={styles.formTitle}>{editingStore ? `Edit Store: ${editingStore.name}` : "Add New Store"}</Text>
                <View style={styles.formField}><Text style={styles.label}>Store Name*</Text><TextInput style={styles.input} value={formData.name} onChangeText={val => handleInputChange('name', val)} placeholder="e.g., Healthy Hub" /></View>
                <View style={styles.formField}><Text style={styles.label}>Address*</Text><TextInput style={styles.input} value={formData.address} onChangeText={val => handleInputChange('address', val)} placeholder="Full address" /></View>
                <View style={styles.row}>
                    <View style={[styles.formField, styles.halfWidth]}><Text style={styles.label}>Latitude*</Text><TextInput style={styles.input} value={formData.latitude} onChangeText={val => handleInputChange('latitude', val)} placeholder="e.g., 31.950556" keyboardType="numeric" /></View>
                    <View style={[styles.formField, styles.halfWidth]}><Text style={styles.label}>Longitude*</Text><TextInput style={styles.input} value={formData.longitude} onChangeText={val => handleInputChange('longitude', val)} placeholder="e.g., 35.923056" keyboardType="numeric" /></View>
                </View>
                <View style={styles.formField}><Text style={styles.label}>Phone Number</Text><TextInput style={styles.input} value={formData.phone_number} onChangeText={val => handleInputChange('phone_number', val)} placeholder="e.g., +962 X XXX XXXX" keyboardType="phone-pad" /></View>
                <View style={styles.formField}><Text style={styles.label}>Website</Text><TextInput style={styles.input} value={formData.website} onChangeText={val => handleInputChange('website', val)} placeholder="e.g., https://store.com" keyboardType="url" /></View>
                <View style={styles.formField}><Text style={styles.label}>Opening Hours (JSON format)</Text><TextInput style={[styles.input, styles.textArea]} value={formData.opening_hours} onChangeText={val => handleInputChange('opening_hours', val)} multiline /></View>
                
                <TouchableOpacity style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]} onPress={handleSubmitStore} disabled={isSubmitting}>
                    {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>{editingStore ? "Update Store" : "Add Store"}</Text>}
                </TouchableOpacity>
                {editingStore && (
                    <TouchableOpacity style={styles.cancelEditButton} onPress={() => { setEditingStore(null); resetForm(); setShowAddForm(false);}}>
                        <Text style={styles.cancelEditButtonText}>Cancel Edit</Text>
                    </TouchableOpacity>
                )}
            </View>
        )}

        <View style={styles.listSection}>
            <Text style={styles.sectionTitle}>Existing Stores</Text>
            {loadingStores ? <ActivityIndicator /> : stores.length === 0 ? <Text style={styles.emptyListText}>No stores found. Add one using the button above!</Text> :
                <FlatList
                    data={stores}
                    renderItem={renderStoreItem}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false} 
                />
            }
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F0F4F8' },
  centeredScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#F0F4F8' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#4A5568' },
  accessDeniedTitle: { fontSize: 24, fontWeight: 'bold', color: '#E53E3E', marginTop: 16, marginBottom: 8, textAlign: 'center' },
  accessDeniedMessage: { fontSize: 16, color: '#4A5568', textAlign: 'center', marginBottom: 24 },
  goHomeButton: { backgroundColor: '#4EA8DE', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 8 },
  goHomeButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  container: { flexGrow: 1, padding: 16, backgroundColor: '#F0F4F8' },
  pageHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  pageTitle: { fontSize: 26, fontWeight: 'bold', color: '#1A202C', marginLeft: 12 },
  pageSubtitle: { fontSize: 16, color: '#4A5568', marginBottom: 24, },
  toggleFormButton: { flexDirection: 'row', backgroundColor: '#4EA8DE', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  toggleFormButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  formSection: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  formTitle: { fontSize: 20, fontWeight: '700', color: '#1A202C', marginBottom: 20, textAlign: 'center' },
  formField: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#4A5568', marginBottom: 6 },
  input: { backgroundColor: '#F7FAFC', borderColor: '#E0E0E0', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#000000' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  halfWidth: { width: '48%' },
  submitButton: { backgroundColor: '#38A169', paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  submitButtonDisabled: { backgroundColor: '#A0AEC0' },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  cancelEditButton: { backgroundColor: '#EDF2F7', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  cancelEditButtonText: { color: '#4A5568', fontSize: 15, fontWeight: '500' },
  listSection: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#000000', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', paddingBottom: 8 },
  emptyListText: { textAlign:'center', color: '#667085', paddingVertical: 20},
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EAF0F6' },
  listItemIcon: { marginRight: 12 },
  listItemTextContainer: { flex: 1, marginRight: 8 },
  listItemName: { fontSize: 16, fontWeight: '600', color: '#000000' },
  listItemAddress: { fontSize: 13, color: '#718096', marginTop: 2 },
  listItemActions: { flexDirection: 'row' },
  actionIcon: { padding: 8 },
  editIcon: { marginRight: 0 },
  deleteIcon: {},
});

export default AdminManageStoresScreen;
