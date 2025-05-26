import { Session } from '@supabase/supabase-js';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function IndexScreen() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [initialAuthStateHandled, setInitialAuthStateHandled] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`Auth state change event: ${event}`);
      setSession(session);
      if (!initialAuthStateHandled) {
        setInitialAuthStateHandled(true);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading || !initialAuthStateHandled) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4EA8DE" />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(tabs)" />;
  } else {
    return <Redirect href="/Onboarding2" />;
  }
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
  },
});
