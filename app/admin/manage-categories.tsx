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

interface Category {
  id: string;
  name: string;
  created_at?: string;
}

const AdminManageCategoriesScreen = () => {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');

  // Reset form fields
  const resetForm = () => {
    setNewCategoryName('');
    setEditCategoryName('');
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
      setIsAdmin(!!adminData);
      if (!adminData) {
        Alert.alert("Access Denied", "You do not have permission to access this page.");
        router.replace('/(tabs)');
      } else {
        fetchCategories();
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
        fetchCategories();
      }
    }, [isAdmin])
  );

  const fetchCategories = async () => {
    setLoadingCategories(true);
    try {
      const { data, error } = await supabase.from('categories').select('*').order('name', { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load categories.');
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Validation Error', 'Category name cannot be empty.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('categories').insert({ name: newCategoryName.trim() });
      if (error) throw error;
      Alert.alert('Success', 'Category added successfully!');
      setNewCategoryName('');
      setShowAddForm(false);
      fetchCategories();
    } catch (error: any) {
      Alert.alert('Error', `Failed to add category: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setEditCategoryName(category.name);
    setShowAddForm(false); // Close add form if open
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !editCategoryName.trim()) {
      Alert.alert('Validation Error', 'Category name cannot be empty.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('categories')
        .update({ name: editCategoryName.trim(), updated_at: new Date().toISOString() })
        .eq('id', editingCategory.id);
      if (error) throw error;
      Alert.alert('Success', 'Category updated successfully!');
      setEditingCategory(null);
      setEditCategoryName('');
      fetchCategories();
    } catch (error: any) {
      Alert.alert('Error', `Failed to update category: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    Alert.alert(
      "Confirm Deletion", 
      "Are you sure you want to delete this category? Products in this category will have their category unassigned (set to null). This action cannot be undone.", 
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
            setIsSubmitting(true);
            try {
              // Note: Products linked to this category will have category_id set to NULL due to ON DELETE SET NULL
              const { error } = await supabase.from('categories').delete().eq('id', categoryId);
              if (error) throw error;
              Alert.alert("Success", "Category deleted successfully.");
              fetchCategories();
            } catch (error: any) { Alert.alert("Error", `Failed to delete category: ${error.message}`); }
            finally { setIsSubmitting(false); }
        }}
      ]
    );
  };

  if (loadingAuth) {
    return ( <SafeAreaView style={styles.centeredScreen}><ActivityIndicator size="large" color="#4EA8DE" /><Text style={styles.loadingText}>Verifying access...</Text></SafeAreaView> );
  }
  if (!isAdmin) {
     // Should have been redirected by checkAdminStatus, this is a fallback.
    return ( <SafeAreaView style={styles.centeredScreen}><Text>Access Denied.</Text></SafeAreaView> );
  }

  const renderCategoryItem = ({ item }: { item: Category }) => (
    <View style={styles.listItem}>
      <View style={styles.listItemTextContainer}>
        <Text style={styles.listItemName}>{item.name}</Text>
      </View>
      <View style={styles.listItemActions}>
          <TouchableOpacity onPress={() => handleEditCategory(item)} style={[styles.actionIcon, styles.editIcon]}>
              <Ionicons name="pencil-outline" size={22} color="#4EA8DE" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeleteCategory(item.id)} style={[styles.actionIcon, styles.deleteIcon]}>
              <Ionicons name="trash-outline" size={22} color="#E53E3E" />
          </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: 'Admin: Manage Categories' }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.pageHeader}>
          <Ionicons name="pricetags-outline" size={32} color="#000000" />
          <Text style={styles.pageTitle}>Manage Categories</Text>
        </View>
        <Text style={styles.pageSubtitle}>Add, edit, or remove product categories.</Text>

        <TouchableOpacity 
            style={styles.toggleFormButton} 
            onPress={() => {
                setShowAddForm(!showAddForm); 
                setEditingCategory(null); 
                if(showAddForm) resetForm();
            }}
        >
            <Ionicons name={showAddForm || editingCategory ? "close-circle-outline" : "add-circle-outline"} size={22} color="#FFFFFF" style={{marginRight: 8}} />
            <Text style={styles.toggleFormButtonText}>{showAddForm || editingCategory ? "Cancel" : "Add New Category"}</Text>
        </TouchableOpacity>

        {(showAddForm && !editingCategory) && (
            <View style={styles.formSection}>
                <Text style={styles.formTitle}>Add New Category</Text>
                <View style={styles.formField}>
                    <Text style={styles.label}>Category Name*</Text>
                    <TextInput style={styles.input} value={newCategoryName} onChangeText={setNewCategoryName} placeholder="e.g., Organic Snacks" />
                </View>
                <TouchableOpacity style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]} onPress={handleAddCategory} disabled={isSubmitting}>
                    {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Add Category</Text>}
                </TouchableOpacity>
            </View>
        )}

        {editingCategory && (
            <View style={styles.formSection}>
                <Text style={styles.formTitle}>Edit Category: {editingCategory.name}</Text>
                <View style={styles.formField}>
                    <Text style={styles.label}>New Category Name*</Text>
                    <TextInput style={styles.input} value={editCategoryName} onChangeText={setEditCategoryName} placeholder="Enter new name" />
                </View>
                <TouchableOpacity style={[styles.submitButton, styles.updateButton, isSubmitting && styles.submitButtonDisabled]} onPress={handleUpdateCategory} disabled={isSubmitting}>
                    {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>Update Category</Text>}
                </TouchableOpacity>
                 <TouchableOpacity style={styles.cancelEditButton} onPress={() => setEditingCategory(null)}>
                    <Text style={styles.cancelEditButtonText}>Cancel Edit</Text>
                </TouchableOpacity>
            </View>
        )}


        <View style={styles.listSection}>
            <Text style={styles.sectionTitle}>Existing Categories</Text>
            {loadingCategories ? <ActivityIndicator /> : categories.length === 0 ? <Text style={styles.emptyListText}>No categories found. Add one above!</Text> :
                <FlatList
                    data={categories}
                    renderItem={renderCategoryItem}
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
  submitButton: { backgroundColor: '#38A169', paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  updateButton: { backgroundColor: '#DD6B20' },
  submitButtonDisabled: { backgroundColor: '#A0AEC0' },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  cancelEditButton: { backgroundColor: '#EDF2F7', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  cancelEditButtonText: { color: '#4A5568', fontSize: 15, fontWeight: '500' },
  listSection: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#000000', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', paddingBottom: 8 },
  emptyListText: { textAlign:'center', color: '#667085', paddingVertical: 20},
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EAF0F6' },
  listItemTextContainer: { flex: 1, marginRight: 8 },
  listItemName: { fontSize: 16, fontWeight: '600', color: '#000000' },
  listItemActions: { flexDirection: 'row' },
  actionIcon: { padding: 8 },
  editIcon: { marginRight: 0 },
  deleteIcon: {},
});

export default AdminManageCategoriesScreen;
