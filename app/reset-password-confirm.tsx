import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Link, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

const ResetPasswordConfirmScreen = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionSet, setSessionSet] = useState(false);

  const params = useLocalSearchParams();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    const { access_token, refresh_token } = params;

    const setSupabaseSession = async () => {
      if (access_token && refresh_token) {
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: access_token as string,
            refresh_token: refresh_token as string,
          });

          if (error) {
            console.error("Error setting session:", error);
            Alert.alert('Session Error', error.message || 'Failed to set session from link.');
            router.replace('/auth/login');
          } else if (data.session) {
             setSessionSet(true);
          } else {
             Alert.alert('Session Error', 'Could not set session from link.');
             router.replace('/auth/login');
          }
        } catch (error: any) {
          console.error("Unexpected error setting session:", error);
          Alert.alert('Error', error.message || 'An unexpected error occurred.');
          router.replace('/auth/login');
        } finally {
          setLoadingSession(false);
        }
      } else {
        Alert.alert('Invalid Link', 'Password reset link is invalid or expired.');
        router.replace('/auth/login');
      }
    };

    if (loadingSession) {
        setSupabaseSession();
    }

  }, [params, loadingSession]);

  const handlePasswordUpdate = async () => {
    if (!password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters long.');
        return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        console.error("Password update error:", error);
        Alert.alert('Update Error', error.message || 'Failed to update password.');
      } else {
        Alert.alert('Success', 'Your password has been updated.');
        router.replace('/auth/login');
      }
    } catch (error: any) {
      console.error("Unexpected password update error:", error);
      Alert.alert('Error', error.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  if (loadingSession || !sessionSet) {
      return (
          <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4EA8DE" />
              <Text style={styles.loadingText}>Verifying link...</Text>
          </View>
      );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="lock-closed" size={32} color="white" />
          </View>
          <Text style={styles.title}>Set New Password</Text>
          <Text style={styles.subtitle}>Enter and confirm your new password</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#4EA8DE" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#A0AEC0"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={!isLoading}
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

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Confirm New Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#4EA8DE" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#A0AEC0"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                editable={!isLoading}
              />
               <Pressable
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.passwordToggle}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#4EA8DE"
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={handlePasswordUpdate}
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
              <Text style={styles.primaryButtonText}>Reset Password</Text>
            )}
          </Pressable>

          <View style={styles.signupContainer}>
            <Link href="/auth/login" asChild>
              <Pressable disabled={isLoading}>
                <Text style={styles.signupLink}>Back to Login</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4EA8DE" />
          <Text style={styles.loadingText}>Updating password...</Text>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoContainer: {
    backgroundColor: '#4EA8DE',
    borderRadius: 50,
    padding: 12,
    marginBottom: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#4A5568',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#4A5568',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E0',
    borderRadius: 5,
    paddingHorizontal: 12,
    height: 45,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: '100%',
    color: '#2D3748',
    fontSize: 16,
  },
  passwordToggle: {
    padding: 5,
  },
  primaryButton: {
    backgroundColor: '#4EA8DE',
    borderRadius: 5,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  primaryButtonPressed: {
    opacity: 0.8,
  },
  primaryButtonDisabled: {
    backgroundColor: '#A0AEC0',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  signupText: {
    color: '#4A5568',
  },
  signupLink: {
    color: '#4EA8DE',
    fontWeight: 'bold',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 10,
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
  },
});

export default ResetPasswordConfirmScreen;
