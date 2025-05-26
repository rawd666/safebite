import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto'; 

const customFetch = async (input: RequestInfo, init?: RequestInit) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

export const supabase = createClient(
  'https://yntlxwjozcgrbeogbndg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InludGx4d2pvemNncmJlb2dibmRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2NDg2MjEsImV4cCI6MjA2MjIyNDYyMX0.f727NU3UQL4dxHd-q5wimG1fx19rnjqzwfjT4UOL6is',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    
  }
);



