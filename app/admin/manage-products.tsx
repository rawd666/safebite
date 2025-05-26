import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert,
    Image,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import * as mime from 'react-native-mime-types';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Category {
  id: string;
  name: string;
}

interface ProductForList {
    id: string;
    name: string;
    category_name?: string;
    price?: number;
    image_url?: string | null;
}

interface ProductFormData {
  name: string;
  description: string;
  price: string;
  image_uri: string | null;
  image_url_current?: string | null;
  category_id: string | null;
  stock_quantity: string;
  is_featured: boolean;
}

const AdminProductManagementScreen = () => {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [adminName, setAdminName] = useState<string>('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductForList[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductForList | null>(null);
  
  const [formData, setFormData] = useState<ProductFormData>({
    name: '', description: '', price: '', image_uri: null, image_url_current: null,
    category_id: null, stock_quantity: '0', is_featured: false,
  });

  const resetForm = () => {
    setFormData({
        name: '', description: '', price: '', image_uri: null, image_url_current: null,
        category_id: null, stock_quantity: '0', is_featured: false,
    });
    setEditingProduct(null);
  };

  const checkAdminStatus = useCallback(async () => {
    setLoadingAuth(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { setIsAdmin(false); router.replace('/auth/login'); return; }
      const { data: adminData, error: adminError } = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).single();
      if (adminError && adminError.code !== 'PGRST116') throw adminError;
      const isAdminUser = !!adminData;
      setIsAdmin(isAdminUser);
      if (isAdminUser) {
        const { data: profileData } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).single();
        setAdminName(profileData?.full_name || profileData?.username || 'Admin');
        fetchInitialAdminData();
      } else { router.replace('/(tabs)'); }
    } catch (error) { setIsAdmin(false); router.replace('/(tabs)'); }
    finally { setLoadingAuth(false); }
  }, []);

  const fetchInitialAdminData = async () => {
    setLoadingData(true);
    try {
      const [categoriesRes, productsRes] = await Promise.all([
        supabase.from('categories').select('id, name').order('name'),
        supabase.from('products').select('id, name, price, image_url, categories(name)').order('name')
      ]);
      if (categoriesRes.error) throw categoriesRes.error;
      if (productsRes.error) throw productsRes.error;

      setCategories(categoriesRes.data || []);
      const fetchedProducts = productsRes.data?.map(p => ({ ...p, category_name: (p.categories as any)?.name || 'N/A' })) || [];
      setProducts(fetchedProducts);
      if (!editingProduct) { 
        resetForm();
      }
    } catch (error) { Alert.alert('Error', 'Failed to load initial admin data.'); }
    finally { setLoadingData(false); }
  };
  
  useEffect(() => { checkAdminStatus(); }, [checkAdminStatus]);
  useFocusEffect(useCallback(() => { if(isAdmin) fetchInitialAdminData(); }, [isAdmin]));

  const handleInputChange = (field: keyof ProductFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.7 });
    if (!result.canceled && result.assets && result.assets[0].uri) { handleInputChange('image_uri', result.assets[0].uri); }
  };

  const uploadImage = async (imageUri: string): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated for image upload.");
      const fileExt = imageUri.split('.').pop()?.toLowerCase();
      const fileName = `products/${user.id}_${Date.now()}.${fileExt}`;
      let mimeType = mime.lookup(imageUri);
      if (!mimeType && fileExt) {
        if (fileExt === 'jpg' || fileExt === 'jpeg') mimeType = 'image/jpeg';
        else if (fileExt === 'png') mimeType = 'image/png';
      }
      mimeType = mimeType || 'application/octet-stream';
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const { data, error: uploadError } = await supabase.storage.from('product_images').upload(fileName, blob, { contentType: mimeType, upsert: !!editingProduct });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('product_images').getPublicUrl(data.path);
      return publicUrl;
    } catch (error) { Alert.alert("Image Upload Failed", error instanceof Error ? error.message : "Could not upload image."); return null; }
  };

  const handleEditProduct = async (productToEdit: ProductForList) => {
    setShowForm(true);
    setIsSubmitting(true);
    const { data: fullProductData, error: productError } = await supabase
        .from('products')
        .select(`*, categories(id, name)`) // Removed product_store_availability from select
        .eq('id', productToEdit.id)
        .single();
    setIsSubmitting(false);
    if (productError || !fullProductData) { Alert.alert('Error', 'Failed to fetch full product details for editing.'); setShowForm(false); return; }
    
    setFormData({ 
        name: fullProductData.name, 
        description: fullProductData.description || '', 
        price: fullProductData.price?.toString() || '', 
        image_uri: null, 
        image_url_current: fullProductData.image_url, 
        category_id: fullProductData.category_id, 
        stock_quantity: fullProductData.stock_quantity?.toString() || '0', 
        is_featured: fullProductData.is_featured || false
    });
    setEditingProduct(productToEdit);
  };

  const handleDeleteProduct = async (productId: string) => {
    Alert.alert("Confirm Deletion", "Are you sure you want to delete this product? This will also remove its store availability records.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
            setIsSubmitting(true);
            try {
                const { error: availabilityError } = await supabase.from('product_store_availability').delete().eq('product_id', productId);
                if (availabilityError) throw availabilityError;
                const { error: productError } = await supabase.from('products').delete().eq('id', productId);
                if (productError) throw productError;
                Alert.alert("Success", "Product deleted successfully.");
                fetchInitialAdminData();
            } catch (error: any) { Alert.alert("Error", `Failed to delete product: ${error.message}`); }
            finally { setIsSubmitting(false); }
        }}
    ]);
  };

  const handleSubmitProduct = async () => {
    setIsSubmitting(true);
    let finalImageUrl = editingProduct ? formData.image_url_current : null;
    if (!formData.name || !formData.category_id || !formData.price || !formData.stock_quantity) { Alert.alert("Validation Error", "Please fill in all required product fields (Name, Category, Price, Stock Quantity)."); setIsSubmitting(false); return; }
    try {
      if (formData.image_uri) { finalImageUrl = await uploadImage(formData.image_uri); if (!finalImageUrl && formData.image_uri) { setIsSubmitting(false); return; } }
      
      const productPayload = { name: formData.name, description: formData.description || null, price: parseFloat(formData.price), image_url: finalImageUrl, category_id: formData.category_id, stock_quantity: parseInt(formData.stock_quantity, 10), is_featured: formData.is_featured, };
      
      if (editingProduct) { 
        const { error: productUpdateError } = await supabase.from('products').update(productPayload).eq('id', editingProduct.id); 
        if (productUpdateError) throw productUpdateError; 
      } else { 
        const { data: newProduct, error: productInsertError } = await supabase.from('products').insert(productPayload).select().single(); 
        if (productInsertError) throw productInsertError; 
        if (!newProduct) throw new Error("Failed to create product.");
      }
      Alert.alert('Success', `Product ${editingProduct ? 'updated' : 'added'} successfully!`); setShowForm(false); resetForm(); fetchInitialAdminData();
    } catch (error: any) { Alert.alert('Error', `Failed to ${editingProduct ? 'update' : 'add'} product: ${error.message}`); }
    finally { setIsSubmitting(false); }
  };

  if (loadingAuth) { return ( <SafeAreaView style={styles.centeredScreen}><ActivityIndicator size="large" color="#4EA8DE" /><Text style={styles.loadingText}>Verifying access...</Text></SafeAreaView> ); }
  if (!isAdmin) { return ( <SafeAreaView style={styles.centeredScreen}><Ionicons name="lock-closed-outline" size={64} color="#E53E3E" /><Text style={styles.accessDeniedTitle}>Access Denied</Text><Text style={styles.accessDeniedMessage}>You do not have permission.</Text><TouchableOpacity style={styles.goHomeButton} onPress={() => router.replace('/(tabs)')}><Text style={styles.goHomeButtonText}>Go Home</Text></TouchableOpacity></SafeAreaView> ); }

  const renderProductListItem = ({ item }: { item: ProductForList }) => (
    <View style={styles.productListItem}>
      <Image source={{ uri: item.image_url || 'https://placehold.co/50x50/EAF2FF/9FB0C7?text=N/A' }} style={styles.productListImage} />
      <View style={styles.productListItemInfo}>
          <Text style={styles.productListItemName}>{item.name}</Text>
          <Text style={styles.productListItemCategory}>{item.category_name}</Text>
          <Text style={styles.productListItemPrice}>${item.price?.toFixed(2) || 'N/A'}</Text>
      </View>
      <View style={styles.productListItemActions}>
          <TouchableOpacity onPress={() => handleEditProduct(item)} style={[styles.actionIcon, styles.editIcon]}><Ionicons name="pencil-outline" size={20} color="#4EA8DE" /></TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeleteProduct(item.id)} style={[styles.actionIcon, styles.deleteIcon]}><Ionicons name="trash-outline" size={20} color="#E53E3E" /></TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: 'Admin: Products' }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.dashboardHeader}><Ionicons name="cube-outline" size={32} color="#000000" /><Text style={styles.dashboardTitle}>Product Management</Text></View>
        <Text style={styles.dashboardWelcomeText}>Hello, {adminName}.</Text>

        {!showForm && (<TouchableOpacity style={styles.addNewButton} onPress={() => { resetForm(); setShowForm(true); setEditingProduct(null); }}><Ionicons name="add-circle-outline" size={22} color="#FFFFFF" style={{marginRight: 8}} /><Text style={styles.addNewButtonText}>Add New Product</Text></TouchableOpacity>)}

        {showForm && (
            <View style={styles.formContainer}>
                <Text style={styles.formTitle}>{editingProduct ? "Edit Product" : "Add New Product"}</Text>
                <View style={styles.formField}><Text style={styles.label}>Product Name*</Text><TextInput style={styles.input} value={formData.name} onChangeText={val => handleInputChange('name', val)} placeholder="e.g., Organic Apples" /></View>
                <View style={styles.formField}><Text style={styles.label}>Description</Text><TextInput style={[styles.input, styles.textArea]} value={formData.description} onChangeText={val => handleInputChange('description', val)} placeholder="Product details..." multiline /></View>
                <View style={styles.formField}><Text style={styles.label}>Base Price*</Text><TextInput style={styles.input} value={formData.price} onChangeText={val => handleInputChange('price', val)} placeholder="e.g., 3.99" keyboardType="numeric" /></View>
                <View style={styles.formField}><Text style={styles.label}>Total Stock Quantity*</Text><TextInput style={styles.input} value={formData.stock_quantity} onChangeText={val => handleInputChange('stock_quantity', val)} placeholder="e.g., 100" keyboardType="number-pad" /></View>
                <View style={styles.formField}>
                    <Text style={styles.label}>Category*</Text>
                    <View style={styles.pickerContainer}>
                        <Text style={styles.pickerText}>{formData.category_id ? categories.find(c=>c.id === formData.category_id)?.name : "Select Category"}</Text>
                        <Ionicons name="chevron-down" size={20} color="#A0AEC0" />
                    </View>
                    <ScrollView style={styles.categoryOptionsScroll} nestedScrollEnabled>
                        {categories.map(cat => (<TouchableOpacity key={cat.id} style={[styles.categoryOption, formData.category_id === cat.id && styles.categoryOptionSelected]} onPress={() => handleInputChange('category_id', cat.id)}><Text style={formData.category_id === cat.id ? styles.categoryOptionTextSelected : styles.categoryOptionText}>{cat.name}</Text></TouchableOpacity>))}
                    </ScrollView>
                </View>
                <View style={styles.formField}><Text style={styles.label}>Product Image</Text><TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}><Ionicons name="image-outline" size={22} color="#FFFFFF" style={{marginRight: 8}}/><Text style={styles.imagePickerButtonText}>{formData.image_uri || formData.image_url_current ? "Change Image" : "Select Image"}</Text></TouchableOpacity>{(formData.image_uri || formData.image_url_current) && <Image source={{ uri: formData.image_uri || formData.image_url_current! }} style={styles.imagePreview} />}</View>
                <View style={[styles.formField, styles.switchContainer]}><Text style={styles.label}>Is Featured?</Text><Switch value={formData.is_featured} onValueChange={val => handleInputChange('is_featured', val)} trackColor={{false: '#E0E0E0', true: '#667EEA'}} thumbColor={formData.is_featured ? '#4EA8DE' : '#E0E0E0'}/></View>
                
                <TouchableOpacity style={[styles.submitButton, {marginTop: 20}]} onPress={handleSubmitProduct} disabled={isSubmitting}>{isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>{editingProduct ? "Update Product" : "Add Product"}</Text>}</TouchableOpacity>
                <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowForm(false); resetForm(); }}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
            </View>
        )}

        {!showForm && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Existing Products</Text>
            {loadingData ? <ActivityIndicator/> : products.length === 0 ? <Text style={styles.emptyListText}>No products found.</Text> :
             products.map((item) => renderProductListItem({item}))
            }
          </View>
        )}
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
  dashboardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, },
  dashboardTitle: { fontSize: 26, fontWeight: 'bold', color: '#1A202C', marginLeft: 12 },
  dashboardWelcomeText: { fontSize: 16, color: '#4A5568', marginBottom: 24, },
  section: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#000000', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', paddingBottom: 8 },
  addNewButton: { flexDirection: 'row', backgroundColor: '#38A169', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  addNewButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  formContainer: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  formTitle: { fontSize: 20, fontWeight: '700', color: '#1A202C', marginBottom: 20, textAlign: 'center' },
  formField: { marginBottom: 16 },
  formFieldInner: { marginBottom: 10 },
  label: { fontSize: 14, fontWeight: '600', color: '#4A5568', marginBottom: 6 },
  input: { backgroundColor: '#F7FAFC', borderColor: '#E0E0E0', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#000000' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  pickerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F7FAFC', borderColor: '#E0E0E0', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8 },
  pickerText: { fontSize: 15, color: '#000000' },
  categoryOptionsScroll: { maxHeight: 150, borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8 },
  categoryOption: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth:1, borderBottomColor: '#EAF0F6' },
  categoryOptionSelected: { backgroundColor: '#E0EFFF'},
  categoryOptionText: { fontSize: 15, color: '#4A5568' },
  categoryOptionTextSelected: { fontSize: 15, color: '#3A5FD8', fontWeight: 'bold' },
  imagePickerButton: { flexDirection: 'row', backgroundColor: '#4EA8DE', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  imagePickerButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  imagePreview: { width: 100, height: 100, borderRadius: 8, marginTop: 8, alignSelf: 'center', borderWidth: 1, borderColor: '#E0E0E0' },
  switchContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  storeAvailabilityCard: { backgroundColor: '#F9FAFB', borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#EAF0F6' },
  storeName: { fontSize: 16, fontWeight: '600', color: '#334155', marginBottom: 8 },
  
  nextButton: { backgroundColor: '#4EA8DE', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 10, marginBottom: 10 },
  nextButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { backgroundColor: '#A0AEC0' },
  backButton: { backgroundColor: '#A0AEC0', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  backButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  
  addStoreSubForm: { marginTop: 10, padding: 10, backgroundColor: '#F0F4F8', borderRadius: 8, marginBottom:16 },
  subFormTitle: { fontSize: 16, fontWeight: '600', color: '#4A5568', marginBottom: 10 },
  confirmAddStoreButton: { backgroundColor: '#4299E1', paddingVertical: 10, borderRadius: 6, alignItems: 'center', marginTop: 10 },
  confirmAddStoreButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  addedStoreEntry: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EAF0F6'},
  addedStoreName: { fontSize: 14, color: '#000000', flex:1 },
  removeStoreButton: { padding: 6, marginLeft: 8 },
  manageStoresButton: {
    flexDirection: 'row',
    backgroundColor: '#4A5568',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  manageStoresButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },

  submitButton: { backgroundColor: '#38A169', paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  submitButtonDisabled: { backgroundColor: '#A0AEC0' },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  cancelButton: { backgroundColor: '#EDF2F7', paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  cancelButtonText: { color: '#4A5568', fontSize: 16, fontWeight: '600' },
  productListItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EAF0F6' },
  productListImage: { width: 50, height: 50, borderRadius: 8, marginRight: 12, backgroundColor: '#E0E0E0' },
  productListItemInfo: { flex: 1 },
  productListItemName: { fontSize: 15, fontWeight: '600', color: '#000000' },
  productListItemCategory: { fontSize: 13, color: '#718096', marginTop: 2 },
  productListItemPrice: { fontSize: 14, color: '#3A5FD8', marginTop: 2, fontWeight: '500' },
  productListItemActions: { flexDirection: 'row' },
  actionIcon: { padding: 8 },
  editIcon: { marginRight: 8},
  deleteIcon: {},
  emptyListText: { textAlign: 'center', color: '#A0AEC0', fontSize: 16, marginVertical: 16 },
});

export default AdminProductManagementScreen;
