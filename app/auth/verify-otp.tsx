import { supabase } from '@/lib/supabase';
import { BackgroundShapes } from '@/styles/globalStyles';
import { Ionicons } from '@expo/vector-icons';
import { Link, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

const VerifyOtpScreen = () => {
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email || '';

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleVerifyOtp = async () => {
    if (!token) {
      Alert.alert('Error', 'Please enter the verification code.');
      return;
    }
    if (!email) {
       Alert.alert('Error', 'Email address is missing. Please go back and try again.');
       router.replace('/auth/reset-password');
       return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email,
        token: token,
        type: 'email', // Use 'email' type for OTP verification
      });

      if (error) {
        console.error("Verify OTP error:", error);
        Alert.alert('Verification Error', error.message || 'Invalid or expired code.');
      } else if (data.session) {
         // OTP successful, user is now authenticated (temporarily or fully)
         Alert.alert('Success', 'Code verified. You can now set your new password.');
         router.replace('/auth/set-new-password'); // Redirect to the new password screen
      } else {
         // This case might happen if OTP verification succeeds but no session is returned
         // which is less common for type 'email' but good to handle.
         Alert.alert('Verification Failed', 'Could not verify code or establish session.');
      }
    } catch (error: any) {
      console.error("Unexpected verify OTP error:", error);
      Alert.alert('Error', error.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <BackgroundShapes />
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="keypad-outline" size={32} color="white" />
          </View>
          <Text style={styles.title}>Verify Code</Text>
          <Text style={styles.subtitle}>Enter the code sent to {email}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Verification Code</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-open-outline" size={20} color="#4EA8DE" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter code"
                placeholderTextColor="#A0AEC0"
                value={token}
                onChangeText={setToken}
                keyboardType="number-pad"
                editable={!isLoading}
              />
            </View>
          </View>

          <Pressable
            onPress={handleVerifyOtp}
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
              <Text style={styles.primaryButtonText}>Verify Code</Text>
            )}
          </Pressable>

          <View style={styles.signupContainer}>
            <Link href="/auth/reset-password" asChild>
              <Pressable disabled={isLoading}>
                <Text style={styles.signupLink}>Resend Code</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4EA8DE" />
          <Text style={styles.loadingText}>Verifying code...</Text>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
    borderRadius: 16,
    padding: 20,
    borderColor: '#E0E0E0',
    borderWidth: 1,
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
  primaryButton: {
    backgroundColor: '#4EA8DE',
    borderRadius: 24,
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
});

export default VerifyOtpScreen;
