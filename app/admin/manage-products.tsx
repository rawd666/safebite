import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
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
import { SafeAreaView } from 'react-native-safe-area-context';

interface Category {
  id: string;
  name: string;
}

interface Store {
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

interface StoreAvailabilityFormEntry {
  db_id?: string;
  store_id: string;
  store_name?: string; 
  is_available: boolean;
  price_in_store: string;
  product_url_at_store?: string;
}

interface ProductFormData {
  name: string;
  description: string;
  price: string;
  image_uri: string | null; 
  image_base64: string | null;    // For Base64 upload
  image_mime_type: string | null; // For Base64 upload
  image_url_current?: string | null; 
  category_id: string | null;
  stock_quantity: string;
  is_featured: boolean;
  storeAvailabilities: StoreAvailabilityFormEntry[];
}

const AdminProductManagementScreen = () => {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [adminName, setAdminName] = useState<string>('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<ProductForList[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductForList | null>(null);
  const [formStep, setFormStep] = useState(1);
  
  const initialFormData: ProductFormData = {
    name: '', description: '', price: '', 
    image_uri: null, image_base64: null, image_mime_type: null, image_url_current: null,
    category_id: null, stock_quantity: '0', is_featured: false, storeAvailabilities: [],
  };
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);

  const [currentStoreSelection, setCurrentStoreSelection] = useState<string | null>(null);
  const [currentStorePrice, setCurrentStorePrice] = useState('');
  const [currentStoreIsAvailable, setCurrentStoreIsAvailable] = useState(true);
  const [currentStoreUrl, setCurrentStoreUrl] = useState('');

  const resetForm = () => {
    setFormData(initialFormData);
    setEditingProduct(null);
    setFormStep(1);
    setCurrentStoreSelection(null);
    setCurrentStorePrice('');
    setCurrentStoreIsAvailable(true);
    setCurrentStoreUrl('');
  };

  const fetchInitialAdminData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [categoriesRes, storesRes, productsRes] = await Promise.all([
        supabase.from('categories').select('id, name').order('name'),
        supabase.from('stores').select('id, name').order('name'),
        supabase.from('products').select('id, name, price, image_url, categories(name)').order('name')
      ]);
      if (categoriesRes.error) throw categoriesRes.error;
      if (storesRes.error) throw storesRes.error;
      if (productsRes.error) throw productsRes.error;

      setCategories(categoriesRes.data || []);
      setStores(storesRes.data || []);
      const fetchedProducts = productsRes.data?.map(p => ({ ...p, category_name: (p.categories as any)?.name || 'N/A' })) || [];
      setProducts(fetchedProducts);
      if (!editingProduct) { // Reset form if not in editing mode
          resetForm();
      }
    } catch (error: any) { 
        console.error("Error fetching admin data:", error);
        Alert.alert('Error Loading Admin Data', `Failed to load data: ${error?.message || 'Unknown error'}. Please try again.`); 
    }
    finally { setLoadingData(false); }
  }, [editingProduct]); // Added editingProduct dependency
  
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
        await fetchInitialAdminData(); 
      } else { router.replace('/(tabs)'); }
    } catch (error) { 
        console.error("Error in checkAdminStatus:", error);
        setIsAdmin(false); router.replace('/(tabs)'); 
    }
    finally { setLoadingAuth(false); }
  }, [fetchInitialAdminData]); 

  useEffect(() => { checkAdminStatus(); }, [checkAdminStatus]);
  
  useFocusEffect(useCallback(() => { 
    if(isAdmin === true) { 
        fetchInitialAdminData(); 
    }
  }, [isAdmin, fetchInitialAdminData])); 


  const handleInputChange = (field: keyof Omit<ProductFormData, 'storeAvailabilities' | 'image_base64' | 'image_mime_type'>, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  
  const handleFormImageChange = (uri: string | null, base64: string | null, mimeType: string | null) => {
    setFormData(prev => ({
        ...prev,
        image_uri: uri,
        image_base64: base64,
        image_mime_type: mimeType,
        image_url_current: uri ? null : prev.image_url_current 
    }));
  };

  const handleAddStoreAvailabilityEntry = () => {
    if (!currentStoreSelection) { Alert.alert("Error", "Please select a store."); return; }
    const selectedStore = stores.find(s => s.id === currentStoreSelection);
    if (!selectedStore) { Alert.alert("Error", "Selected store not found."); return; } 
    
    if (formData.storeAvailabilities.find(sa => sa.store_id === currentStoreSelection)) { 
      Alert.alert("Store Already Added", "This store has already been added for this product. You can remove and re-add it with new details if needed."); 
      return; 
    }

    const newEntry: StoreAvailabilityFormEntry = { 
      store_id: currentStoreSelection, 
      store_name: selectedStore.name, 
      is_available: currentStoreIsAvailable, 
      price_in_store: currentStorePrice, 
      product_url_at_store: currentStoreUrl.trim() === '' ? undefined : currentStoreUrl.trim(), 
    };
    setFormData(prev => ({ ...prev, storeAvailabilities: [...prev.storeAvailabilities, newEntry] }));
    
    setCurrentStoreSelection(null); 
    setCurrentStorePrice(''); 
    setCurrentStoreIsAvailable(true); 
    setCurrentStoreUrl('');
  };

  const handleRemoveStoreAvailabilityEntry = (indexToRemove: number) => { // Changed to remove by index as per user's provided code
    setFormData(prev => ({ 
        ...prev, 
        storeAvailabilities: prev.storeAvailabilities.filter((_, i) => i !== indexToRemove) 
    }));
  };


  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ 
        mediaTypes: ImagePicker.MediaTypeOptions.Images, 
        allowsEditing: true, 
        aspect: [4, 3], 
        quality: 0.7,
        base64: true, 
        exif: false, 
    });

    if (!result.canceled && result.assets && result.assets[0]) { 
        const asset = result.assets[0];
        handleFormImageChange(asset.uri, asset.base64 || null, asset.mimeType || 'image/jpeg'); 
    } else {
        console.log("Image picking cancelled or failed.");
    }
  };

  const uploadImage = async (
    imageBase64: string, 
    imageMimeType: string, 
    userId: string
  ): Promise<string | null> => {
    console.log("[uploadImage] Attempting to upload image via Base64.");
    
    try {
      const fileExt = imageMimeType.split('/')[1] || 'jpg'; 
      const fileName = `products/${userId}_${Date.now()}.${fileExt}`; 
      console.log("[uploadImage] Generated fileName for Supabase:", fileName);
      console.log("[uploadImage] Using MIME type:", imageMimeType);
      
      const arrayBuffer = decode(imageBase64);
      console.log("[uploadImage] Base64 decoded to ArrayBuffer. Size:", arrayBuffer.byteLength);

      if (arrayBuffer.byteLength === 0) {
        throw new Error("Decoded ArrayBuffer is empty. Base64 string might be corrupted or invalid.");
      }
      
      const bucketName = 'profile-media'; 
      console.log(`[uploadImage] Uploading to Supabase Storage bucket '${bucketName}' with path '${fileName}'`);
      
      const { data, error: uploadError } = await supabase.storage
        .from(bucketName) 
        .upload(fileName, arrayBuffer, { 
          contentType: imageMimeType, 
          upsert: !!editingProduct, 
          cacheControl: '3600', 
        });

      if (uploadError) {
        console.error("[uploadImage] Supabase Storage Upload Error Object:", JSON.stringify(uploadError, null, 2));
        throw uploadError; 
      }
      
      console.log("[uploadImage] Supabase upload successful. Path:", data.path);
      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(data.path); 
      console.log("[uploadImage] Public URL retrieved:", urlData.publicUrl);
      return urlData.publicUrl;

    } catch (error: any) {
      let detailedMessage = "Could not upload image using Base64 method.";
      if (error.message?.includes('StorageApiError')) detailedMessage = `Storage API Error: ${error.message}`;
      else if (error.message) detailedMessage += ` Details: ${error.message}`;
      
      if (error.name) detailedMessage += ` Type: ${error.name}`; 
      if (error.status) detailedMessage += ` Status: ${error.status}`;
      if (error.error) detailedMessage += ` ErrorCode: ${error.error}`; 
      if (error.error_description) detailedMessage += ` Description: ${error.error_description}`;
      
      console.error("[uploadImage] Full image upload error object (Base64 method):", JSON.stringify(error, Object.getOwnPropertyNames(error), 2)); 
      Alert.alert("Image Upload Failed", detailedMessage + `\nAttempted to use bucket: 'profile-media'. Please check its CORS & RLS policies if issues persist.`); 
      return null; 
    }
  };

  const handleEditProduct = async (productToEdit: ProductForList) => {
    setIsSubmitting(true); 
    try {
        const { data: fullProductData, error: productError } = await supabase
            .from('products')
            .select(`*, categories(id, name), product_store_availability(id, store_id, is_available, price_in_store, product_url_at_store)`)
            .eq('id', productToEdit.id)
            .single();

        if (productError || !fullProductData) {
            Alert.alert('Error', `Failed to fetch full product details: ${productError?.message || 'Product not found.'}`);
            setShowForm(false); return;
        }

        const storeAvailabilities: StoreAvailabilityFormEntry[] = (fullProductData.product_store_availability || []).map((pa: any) => {
            const storeDetails = stores.find(s => s.id === pa.store_id);
            return { 
                db_id: pa.id, 
                store_id: pa.store_id, 
                store_name: storeDetails?.name || 'Unknown Store', 
                is_available: pa.is_available === null ? true : pa.is_available, 
                price_in_store: pa.price_in_store?.toString() || '', 
                product_url_at_store: pa.product_url_at_store || '', 
            };
        });
        
        setFormData({ 
            name: fullProductData.name, 
            description: fullProductData.description || '', 
            price: fullProductData.price?.toString() || '', 
            image_uri: null, 
            image_base64: null, 
            image_mime_type: null, 
            image_url_current: fullProductData.image_url, 
            category_id: fullProductData.category_id, 
            stock_quantity: fullProductData.stock_quantity?.toString() || '0', 
            is_featured: fullProductData.is_featured || false, 
            storeAvailabilities, 
        });
        setEditingProduct(productToEdit); 
        setShowForm(true); 
        setFormStep(1);
    } catch (error: any) { Alert.alert('Error', `Failed to load product for editing: ${error?.message}`); setShowForm(false); }
    finally { setIsSubmitting(false); }
  };

  const handleDeleteProduct = async (productId: string) => {
    Alert.alert("Confirm Deletion", "Are you sure you want to delete this product? This action cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
            setIsSubmitting(true);
            try {
                const { error: availabilityError } = await supabase.from('product_store_availability').delete().eq('product_id', productId);
                if (availabilityError) throw availabilityError;
                const { error: productError } = await supabase.from('products').delete().eq('id', productId);
                if (productError) throw productError;
                Alert.alert("Success", "Product deleted successfully.");
                await fetchInitialAdminData(); 
            } catch (error: any) { Alert.alert("Error", `Failed to delete product: ${error.message}`); }
            finally { setIsSubmitting(false); }
        }}
    ]);
  };

  const handleSubmitProduct = async () => {
    setIsSubmitting(true);
    let finalImageUrl = editingProduct ? formData.image_url_current : null;

    if (!formData.name || !formData.category_id || !formData.price || !formData.stock_quantity) { 
        Alert.alert("Validation Error", "Please fill in all required product fields (Name, Category, Price, Stock Quantity)."); 
        setIsSubmitting(false); return; 
    }
    
    try {
      if (formData.image_base64 && formData.image_mime_type) { 
        console.log("[handleSubmitProduct] New image (Base64) present, attempting upload.");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated for image upload.");

        finalImageUrl = await uploadImage(formData.image_base64, formData.image_mime_type, user.id); 
        if (!finalImageUrl) { 
          console.error("[handleSubmitProduct] Image upload failed (Base64 method), finalImageUrl is null. Aborting product save.");
          setIsSubmitting(false); 
          return; 
        }
        console.log("[handleSubmitProduct] Image upload successful (Base64 method), new finalImageUrl:", finalImageUrl);
      } else if (formData.image_uri && !formData.image_base64) {
          console.warn("[handleSubmitProduct] Image URI is present, but Base64 is not. Image will not be uploaded/updated unless image_url_current is used.");
          if (!editingProduct) finalImageUrl = null; 
      } else {
        console.log("[handleSubmitProduct] No new image data, using current image URL or null:", finalImageUrl);
      }

      const productPayload = { name: formData.name, description: formData.description || null, price: parseFloat(formData.price), image_url: finalImageUrl, category_id: formData.category_id, stock_quantity: parseInt(formData.stock_quantity, 10), is_featured: formData.is_featured, };
      let currentProductId = editingProduct?.id;

      if (editingProduct && currentProductId) { 
        const { error: productUpdateError } = await supabase.from('products').update(productPayload).eq('id', currentProductId); 
        if (productUpdateError) throw productUpdateError; 
      } else { 
        const { data: newProduct, error: productInsertError } = await supabase.from('products').insert(productPayload).select().single(); 
        if (productInsertError) throw productInsertError; 
        if (!newProduct) throw new Error("Failed to create product or retrieve ID."); 
        currentProductId = newProduct.id; 
      }
      
      if (!currentProductId) throw new Error("Product ID is missing for store availability updates.");
      
      const { data: existingDbAvailabilitiesData } = await supabase.from('product_store_availability').select('store_id').eq('product_id', currentProductId);
      const existingDbStoreIds = existingDbAvailabilitiesData?.map(ea => ea.store_id) || [];
      const submittedFormStoreIds = new Set(formData.storeAvailabilities.map(sa => sa.store_id));

      const upsertPromises = formData.storeAvailabilities.map(entry => {
        const availabilityPayload = { 
            product_id: currentProductId!, 
            store_id: entry.store_id, 
            is_available: entry.is_available, 
            price_in_store: entry.price_in_store.trim() === '' ? null : parseFloat(entry.price_in_store), 
            product_url_at_store: entry.product_url_at_store || null,
            last_verified_at: new Date().toISOString() 
        };
        return supabase.from('product_store_availability').upsert(availabilityPayload, { onConflict: 'product_id, store_id' });
      });
      const results = await Promise.all(upsertPromises);
      results.forEach(result => { if (result.error) console.error('Error upserting availability:', result.error); });
      
      const storeIdsToRemove = existingDbStoreIds.filter(id => !submittedFormStoreIds.has(id));
      if (storeIdsToRemove.length > 0) { 
          await supabase.from('product_store_availability').delete().eq('product_id', currentProductId).in('store_id', storeIdsToRemove); 
      }

      Alert.alert('Success', `Product ${editingProduct ? 'updated' : 'added'} successfully!`); 
      setShowForm(false); 
      resetForm(); 
      await fetchInitialAdminData();
    } catch (error: any) { 
        console.error(`[handleSubmitProduct] Error ${editingProduct ? 'updating' : 'adding'} product:`, error);
        Alert.alert('Error', `Failed to ${editingProduct ? 'update' : 'add'} product: ${error.message}`); 
    }
    finally { setIsSubmitting(false); }
  };

  if (loadingAuth) { return ( <SafeAreaView style={styles.centeredScreen}><ActivityIndicator size="large" color="#4EA8DE" /><Text style={styles.loadingText}>Verifying access...</Text></SafeAreaView> ); }
  if (!isAdmin) { return ( <SafeAreaView style={styles.centeredScreen}><Ionicons name="lock-closed-outline" size={64} color="#E53E3E" /><Text style={styles.accessDeniedTitle}>Access Denied</Text><Text style={styles.accessDeniedMessage}>You do not have permission.</Text><TouchableOpacity style={styles.goHomeButton} onPress={() => router.replace('/(tabs)')}><Text style={styles.goHomeButtonText}>Go Home</Text></TouchableOpacity></SafeAreaView> ); }

  const renderProductListItem = ({ item }: { item: ProductForList }) => (
    <View style={styles.productListItem} key={item.id}>
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
        <View style={styles.dashboardHeader}><Ionicons name="construct-outline" size={32} color="#2D3748" /><Text style={styles.dashboardTitle}>Product Management</Text></View>
        <Text style={styles.dashboardWelcomeText}>Hello, {adminName}.</Text>

        {!showForm && (<TouchableOpacity style={styles.addNewButton} onPress={() => { resetForm(); setShowForm(true); setEditingProduct(null); setFormStep(1); }}><Ionicons name="add-circle-outline" size={22} color="#FFFFFF" style={{marginRight: 8}} /><Text style={styles.addNewButtonText}>Add New Product</Text></TouchableOpacity>)}

        {showForm && (
            <View style={styles.formContainer}>
                <Text style={styles.formTitle}>{editingProduct ? "Edit Product" : "Add New Product"} - Step {formStep} of 2</Text>
                {formStep === 1 && (
                    <>
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
                      <View style={styles.formField}>
                          <Text style={styles.label}>Product Image</Text>
                          <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
                              <Ionicons name="image-outline" size={22} color="#FFFFFF" style={{marginRight: 8}}/>
                              <Text style={styles.imagePickerButtonText}>{formData.image_uri || formData.image_url_current ? "Change Image" : "Select Image"}</Text>
                          </TouchableOpacity>
                          {(formData.image_uri || formData.image_url_current) && 
                              <Image source={{ uri: formData.image_uri || formData.image_url_current! }} style={styles.imagePreview} />
                          }
                      </View>
                      <View style={[styles.formField, styles.switchContainer]}><Text style={styles.label}>Is Featured?</Text><Switch value={formData.is_featured} onValueChange={val => handleInputChange('is_featured', val)} trackColor={{false: '#E2E8F0', true: '#667EEA'}} thumbColor={formData.is_featured ? '#4EA8DE' : '#CBD5E0'}/></View>
                      <TouchableOpacity style={[styles.nextButton, (!formData.name || !formData.category_id || !formData.price || !formData.stock_quantity) && styles.buttonDisabled]} onPress={() => setFormStep(2)} disabled={!formData.name || !formData.category_id || !formData.price || !formData.stock_quantity}><Text style={styles.nextButtonText}>Next: Store Availability</Text></TouchableOpacity>
                    </>
                )}

                {formStep === 2 && (
                    <>
                      <Text style={[styles.sectionTitle, {marginTop: 0, marginBottom: 10, borderBottomWidth:0}]}>Manage Store Availability</Text>
                      
                      {formData.storeAvailabilities.length > 0 && (
                        <View style={styles.addedStoresList}>
                            <Text style={styles.subSectionTitle}>Current Availabilities for this Product:</Text>
                            {formData.storeAvailabilities.map((sa, index) => (
                                <View key={index} style={styles.addedStoreEntry}>
                                    <View style={styles.addedStoreInfo}>
                                      <Text style={styles.addedStoreName}>{sa.store_name}</Text>
                                      <Text style={styles.addedStoreDetail}>Price: ${sa.price_in_store || 'N/A'}, Available: {sa.is_available ? 'Yes' : 'No'}</Text>
                                      {sa.product_url_at_store && <Text style={styles.addedStoreDetail} numberOfLines={1}>URL: {sa.product_url_at_store}</Text>}
                                    </View>
                                    <TouchableOpacity onPress={() => handleRemoveStoreAvailabilityEntry(index)} style={styles.removeStoreButton}>
                                        <Ionicons name="trash-bin-outline" size={18} color="#E53E3E" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                      )}
                      
                      <View style={styles.addStoreSubForm}>
                          <Text style={styles.subFormTitle}>Add/Update for a Store</Text>
                          <View style={styles.formFieldInner}>
                              <Text style={styles.label}>Select Store*</Text>
                              <View style={styles.pickerContainer}>
                                  <Text style={styles.pickerText}>{currentStoreSelection ? stores.find(s=>s.id === currentStoreSelection)?.name : "Select Store"}</Text>
                                  <Ionicons name="chevron-down" size={20} color="#A0AEC0" />
                              </View>
                              <ScrollView style={styles.categoryOptionsScroll} nestedScrollEnabled>
                                  {stores.map(store => (<TouchableOpacity key={store.id} style={[styles.categoryOption, currentStoreSelection === store.id && styles.categoryOptionSelected]} onPress={() => setCurrentStoreSelection(store.id)}><Text style={currentStoreSelection === store.id ? styles.categoryOptionTextSelected : styles.categoryOptionText}>{store.name}</Text></TouchableOpacity>))}
                              </ScrollView>
                          </View>
                          <View style={styles.formFieldInner}><Text style={styles.label}>Price in Store</Text><TextInput style={styles.input} value={currentStorePrice} onChangeText={setCurrentStorePrice} placeholder="e.g., 4.20" keyboardType="numeric" /></View>
                          <View style={styles.formFieldInner}><Text style={styles.label}>Product URL at Store</Text><TextInput style={styles.input} value={currentStoreUrl} onChangeText={setCurrentStoreUrl} placeholder="https://store.com/product" keyboardType="url" /></View>
                          <View style={[styles.formFieldInner, styles.switchContainer]}><Text style={styles.label}>Is Available?</Text><Switch value={currentStoreIsAvailable} onValueChange={setCurrentStoreIsAvailable} trackColor={{false: '#E2E8F0', true: '#667EEA'}} thumbColor={currentStoreIsAvailable ? '#4EA8DE' : '#CBD5E0'}/></View>
                          <TouchableOpacity style={[styles.confirmAddStoreButton, (!currentStoreSelection || !currentStorePrice) && styles.buttonDisabled]} onPress={handleAddStoreAvailabilityEntry} disabled={!currentStoreSelection || !currentStorePrice}>
                            <Text style={styles.confirmAddStoreButtonText}>Add/Update Store Details</Text>
                          </TouchableOpacity>
                      </View>
                      
                      <TouchableOpacity 
                          style={styles.manageStoresButton} 
                          onPress={() => router.push('/admin/manage-stores')} // Assuming you have this route
                      >
                          <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" style={{marginRight: 8}} />
                          <Text style={styles.manageStoresButtonText}>Add New Store to System</Text>
                      </TouchableOpacity>
                                      
                      <TouchableOpacity style={[styles.submitButton, {marginTop: 20}]} onPress={handleSubmitProduct} disabled={isSubmitting}>{isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>{editingProduct ? "Update Product & Availability" : "Save Product & Availability"}</Text>}</TouchableOpacity>
                      <TouchableOpacity style={styles.backButton} onPress={() => setFormStep(1)}><Text style={styles.backButtonText}>Back to Product Details</Text></TouchableOpacity>
                    </>
                )}
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
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#2D3748', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 8 },
  subSectionTitle: { fontSize: 16, fontWeight: '600', color: '#4A5568', marginTop:10, marginBottom: 8, },
  addNewButton: { flexDirection: 'row', backgroundColor: '#38A169', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  addNewButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  formContainer: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  formTitle: { fontSize: 20, fontWeight: '700', color: '#1A202C', marginBottom: 20, textAlign: 'center' },
  formField: { marginBottom: 16 },
  formFieldInner: { marginBottom: 10 },
  label: { fontSize: 14, fontWeight: '600', color: '#4A5568', marginBottom: 6 },
  input: { backgroundColor: '#F7FAFC', borderColor: '#E2E8F0', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#2D3748' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  pickerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F7FAFC', borderColor: '#E2E8F0', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8 },
  pickerText: { fontSize: 15, color: '#2D3748' },
  categoryOptionsScroll: { maxHeight: 150, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8 },
  categoryOption: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth:1, borderBottomColor: '#EAF0F6' },
  categoryOptionSelected: { backgroundColor: '#E0EFFF'}, 
  categoryOptionText: { fontSize: 15, color: '#4A5568' },
  categoryOptionTextSelected: { fontSize: 15, color: '#4EA8DE', fontWeight: 'bold' },
  imagePickerButton: { flexDirection: 'row', backgroundColor: '#4EA8DE', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  imagePickerButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  imagePreview: { width: 100, height: 100, borderRadius: 8, marginTop: 8, alignSelf: 'center', borderWidth: 1, borderColor: '#CBD5E0' },
  switchContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  
  nextButton: { backgroundColor: '#4EA8DE', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 10, marginBottom: 10 },
  nextButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { backgroundColor: '#A0AEC0' },
  backButton: { backgroundColor: '#A0AEC0', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  backButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  
  addStoreSubForm: { marginTop: 10, padding: 10, backgroundColor: '#F0F4F8', borderRadius: 8, marginBottom:16 },
  subFormTitle: { fontSize: 16, fontWeight: '600', color: '#4A5568', marginBottom: 10 },
  confirmAddStoreButton: { backgroundColor: '#4299E1', paddingVertical: 10, borderRadius: 6, alignItems: 'center', marginTop: 10 },
  confirmAddStoreButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  addedStoresList: { marginTop: 10, marginBottom: 15, },
  addedStoreEntry: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EAF0F6'},
  addedStoreInfo: { flex: 1, marginRight: 8, },
  addedStoreName: { fontSize: 14, fontWeight: '600', color: '#2D3748'},
  addedStoreDetail: { fontSize: 12, color: '#718096', },
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
  productListImage: { width: 50, height: 50, borderRadius: 8, marginRight: 12, backgroundColor: '#E2E8F0' },
  productListItemInfo: { flex: 1 },
  productListItemName: { fontSize: 15, fontWeight: '600', color: '#2D3748' },
  productListItemCategory: { fontSize: 13, color: '#718096', marginTop: 2 },
  productListItemPrice: { fontSize: 14, color: '#4EA8DE', marginTop: 2, fontWeight: '500' },
  productListItemActions: { flexDirection: 'row' },
  actionIcon: { padding: 8 },
  editIcon: { marginRight: 8},
  deleteIcon: {},
  emptyListText: { textAlign: 'center', color: '#718096', fontSize: 15, marginVertical: 16 },
});

export default AdminProductManagementScreen;
