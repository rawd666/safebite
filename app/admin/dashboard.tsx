import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AdminDashboardItem = {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  route: string;
};

type UserProfile = {
  full_name: string | null;
  username: string | null;
};

const AdminDashboardScreen = () => {
  const [authState, setAuthState] = useState<{
    loading: boolean;
    isAdmin: boolean | null;
    adminName: string;
  }>({
    loading: true,
    isAdmin: null,
    adminName: '',
  });

  const dashboardItems: AdminDashboardItem[] = [
    {
      id: 'products',
      title: 'Manage Products',
      description: 'Add, edit, or delete products and their store availability.',
      icon: 'cube-outline',
      color: '#4EA8DE',
      route: '/admin/manage-products',
    },
    {
      id: 'stores',
      title: 'Manage Stores',
      description: 'Add, edit, or delete store locations and details.',
      icon: 'storefront-outline',
      color: '#DD6B20',
      route: '/admin/manage-stores',
    },
    {
      id: 'categories',
      title: 'Manage Categories',
      description: 'Add, edit, or delete product categories.',
      icon: 'pricetags-outline',
      color: '#38A169',
      route: '/admin/manage-categories',
    },
  ];

  const checkAdminStatus = useCallback(async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('Authentication failed');
      }

      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .single();

      if (adminError && adminError.code !== 'PGRST116') {
        throw adminError;
      }
      
      const isAdminUser = !!adminData;

      if (isAdminUser) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, username')
          .eq('id', user.id)
          .single<UserProfile>();

        setAuthState({
          loading: false,
          isAdmin: true,
          adminName: profileData?.full_name || profileData?.username || 'Admin',
        });
      } else {
        throw new Error('Not an admin');
      }
    } catch (error) {
      Alert.alert(
        "Access Denied", 
        error instanceof Error ? error.message : "You don't have permission to access this area"
      );
      
      setAuthState(prev => ({
        ...prev,
        loading: false,
        isAdmin: false,
      }));
      
      router.replace(authState.isAdmin ? '/(tabs)' : '/auth/login');
    }
  }, []);

  useEffect(() => {
    checkAdminStatus();
  }, [checkAdminStatus]);

  if (authState.loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Verifying admin access...</Text>
      </SafeAreaView>
    );
  }

  if (!authState.isAdmin) {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="lock-closed-outline" size={64} color={COLORS.danger} />
        <Text style={styles.title}>Access Denied</Text>
        <Text style={styles.subtitle}>You don't have permission to view this page</Text>
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.buttonText}>Go to Home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'right', 'left', 'bottom']}>
      <Stack.Screen 
        options={{ 
          title: 'Admin Dashboard', 
          headerBackTitle: "Home",
          headerTitleStyle: styles.headerTitle,
        }} 
      />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Ionicons name="settings-outline" size={36} color={COLORS.dark} />
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
        </View>
        
        <Text style={styles.welcomeText}>Welcome, {authState.adminName}</Text>
        <Text style={styles.subHeader}>Select an option below to manage application data</Text>

        <View style={styles.grid}>
          {dashboardItems.map((item) => (
            <DashboardCard 
              key={item.id}
              item={item}
              onPress={() => router.push(item.route)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const DashboardCard = ({
  item,
  onPress,
}: {
  item: AdminDashboardItem;
  onPress: () => void;
}) => (
  <TouchableOpacity 
    style={styles.card}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <View style={[styles.iconContainer, { backgroundColor: `${item.color}20` }]}>
      <Ionicons name={item.icon} size={32} color={item.color} />
    </View>
    
    <View style={styles.cardContent}>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardDescription}>{item.description}</Text>
    </View>
    
    <Ionicons 
      name="chevron-forward-outline" 
      size={20} 
      color={COLORS.gray} 
      style={styles.chevron}
    />
  </TouchableOpacity>
);

const COLORS = {
  primary: '#4EA8DE',
  danger: '#E53E3E',
  success: '#38A169',
  warning: '#DD6B20',
  dark: '#1A202C',
  gray: '#718096',
  lightGray: '#E2E8F0',
  white: '#FFFFFF',
  background: '#F8FAFC',
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

const RADII = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 16,
    color: COLORS.gray,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.danger,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.gray,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.md,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    flexGrow: 1,
    padding: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.dark,
    marginLeft: SPACING.sm,
  },
  welcomeText: {
    fontSize: 18,
    color: COLORS.dark,
    marginBottom: SPACING.xs,
  },
  subHeader: {
    fontSize: 15,
    color: COLORS.gray,
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  grid: {
    gap: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...SHADOWS.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: RADII.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: SPACING.xs,
  },
  cardDescription: {
    fontSize: 14,
    color: COLORS.gray,
  },
  chevron: {
    marginLeft: SPACING.sm,
  },
});

export default AdminDashboardScreen;