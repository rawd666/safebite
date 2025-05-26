import { supabase } from '@/lib/supabase';
import { BackgroundShapes } from '@/styles/globalStyles';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { Link, router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false); 
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const checkSessionAndSetupListener = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Error getting session on load:", sessionError.message);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }).start();
        return; 
      }
      
      if (session) {
        console.log("Existing session found, attempting to redirect to home.");
        router.replace('/(tabs)'); 
      } else {
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }).start();
      }
    };

    checkSessionAndSetupListener();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN") {
          console.log("Auth state changed to SIGNED_IN, redirecting.");
          if (session?.access_token) {
            await AsyncStorage.setItem('@userToken', session.access_token);
          }
          router.replace("/(tabs)");
        } else if (event === "SIGNED_OUT") {
          console.log("Auth state changed to SIGNED_OUT on LoginScreen.");
        }
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []); 

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        let errorMessage = 'Login failed';
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = 'Invalid email or password';
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = 'Please verify your email first';
        }
        throw new Error(errorMessage);
      }

      if (data.session && data.user) {
        const osName = Device.osName || Platform.OS;
        const osVersion = Device.osVersion || Platform.Version.toString();
        const modelName = Device.modelName || 'Unknown Device';
        const deviceInfo = `${modelName}, ${osName} ${osVersion}`;
        
        const { error: sessionError } = await supabase
          .from('user_sessions')
          .insert({ 
            user_id: data.user.id, 
            device_info: deviceInfo,
            is_revoked: false 
          });

        if (sessionError) {
          console.error('Error creating user session in database:', sessionError.message);
        }
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, full_name')
          .eq('id', data.user.id)
          .single();

        await AsyncStorage.setItem('@userToken', data.session.access_token);
        await AsyncStorage.setItem('@userProfile', JSON.stringify(profile || {}));
        
        if (rememberMe) {
          await AsyncStorage.setItem('@rememberedEmail', email.trim());
        } else {
          await AsyncStorage.removeItem('@rememberedEmail');
        }
        
        Vibration.vibrate(50);
        router.replace('/(tabs)');
      } else {
        throw new Error('Login successful, but no session data received.');
      }
    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadRememberedEmail = async () => {
      const rememberedEmail = await AsyncStorage.getItem('@rememberedEmail');
      if (rememberedEmail) {
        setEmail(rememberedEmail);
        setRememberMe(true); 
      }
    };
    loadRememberedEmail();
  }, []);


  return (
    <SafeAreaView style={styles.safeArea}>
      <BackgroundShapes />
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>SafeBite</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color="#4EA8DE" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="your@email.com"
                  placeholderTextColor="#A0AEC0"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color="#4EA8DE" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#A0AEC0"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.passwordToggle}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#4EA8DE"
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.rowBetween}>
              <Pressable style={styles.rememberMe} onPress={() => setRememberMe(!rememberMe)}>
                <Ionicons 
                  name={rememberMe ? "checkbox" : "checkbox-outline"} 
                  size={20} 
                  color="#4EA8DE" 
                />
                <Text style={styles.rememberMeText}>Remember me</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/auth/reset-password')}>
                <Text style={styles.forgotPassword}>Forgot password?</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleLogin}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                isLoading && styles.primaryButtonDisabled
              ]}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.primaryButtonText}>Log In</Text>
              )}
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialButtons}>
              <Pressable style={styles.socialButton} accessibilityLabel="Login with Google">
                <Ionicons name="logo-google" size={24} color="#DB4437" />
              </Pressable>
              <Pressable style={styles.socialButton} accessibilityLabel="Login with Apple">
                <Ionicons name="logo-apple" size={24} color="black" />
              </Pressable>
              <Pressable style={styles.socialButton} accessibilityLabel="Login with Facebook">
                <Ionicons name="logo-facebook" size={24} color="#4267B2" />
              </Pressable>
            </View>
          </View>

          <View style={styles.signupContainer}>
            <Text style={styles.signupText}>Don't have an account? </Text>
            <Link href="/auth/signup" asChild>
              <Pressable>
                <Text style={styles.signupLink}>Sign up</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>

        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#4EA8DE" />
            <Text style={styles.loadingText}>Signing in...</Text>
          </View>
        )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 30, 
  },
  header: {
    alignItems: 'center',
    marginBottom: 30, 
  },
  logoContainer: {
    backgroundColor: '#4EA8DE',
    borderRadius: 50,
    padding: 12, 
    marginBottom: 12,
  },
  title: {
    fontSize: 26, 
    fontWeight: 'bold',
    color: '#000000',
  },
  subtitle: {
    fontSize: 16,
    color: '#4A5568',
    marginTop: 4,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
    borderRadius: 20, 
    padding: 24, 
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  inputContainer: {
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    color: '#4A5568',
    marginBottom: 3,
    fontWeight: '500',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8, 
    paddingHorizontal: 12,
    backgroundColor: '#FDFDFD', 
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 44, 
    color: '#000000',
    fontSize: 15,
  },
  passwordToggle: {
    padding: 8, 
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  rememberMe: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rememberMeText: {
    fontFamily: 'bodyFont',
    marginLeft: 8, 
    color: '#4A5568',
    fontSize: 14,
  },
  forgotPassword: {
    fontFamily: 'bodyFont',
    color: '#4EA8DE',
    fontSize: 14,
    fontWeight: '500',
  },
  primaryButton: {
    width: "100%",
    backgroundColor: '#4EA8DE',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonPressed: {
    backgroundColor: '#4C6BFF', 
    opacity: 0.9,
  },
  primaryButtonDisabled: {
    backgroundColor: '#A0AEC0',
  },
  primaryButtonText: {
    fontFamily: 'mediumFont',
    color: '#FFFFFF',
    fontSize: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#718096', 
    fontSize: 13,
    fontWeight: '500',
  },
  socialButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around', 
    marginBottom: 20,
  },
  socialButton: {
    padding: 12, 
    borderRadius: 8, 
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
    paddingBottom: 10, 
  },
  signupText: {
    color: '#4A5568',
    fontSize: 15,
  },
  signupLink: {
    color: '#4EA8DE',
    fontWeight: 'bold',
    fontSize: 15,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.7)', 
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, 
  },
  loadingText: {
    color: '#000000', 
    marginTop: 10,
    fontSize: 15,
    fontWeight: '500',
  },
});

export default LoginScreen;
