import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@app_theme_mode';

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  // Detect the system's preferred color scheme
  const systemColorScheme = useColorScheme();
  // Initialize state with system preference or default to light if system preference is null
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === 'dark');

  // Effect to load the saved theme preference from AsyncStorage on app start
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme !== null) {
          // If a preference is saved, use it (either 'dark' or 'light')
          setIsDarkMode(savedTheme === 'dark');
        } else {
          // If no preference is saved, use the system's color scheme
          setIsDarkMode(systemColorScheme === 'dark');
        }
      } catch (error) {
        console.error('Failed to load theme preference from AsyncStorage:', error);
        // Fallback to system preference or default if loading fails
        setIsDarkMode(systemColorScheme === 'dark');
      }
    };
    loadTheme();
  }, [systemColorScheme]); // Dependency on systemColorScheme ensures it reacts if the system setting changes while the app is open

  // Effect to save the current theme preference to AsyncStorage whenever it changes
  useEffect(() => {
    const saveTheme = async () => {
      try {
        // Save 'dark' or 'light' string based on the state
        await AsyncStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light');
      } catch (error) {
        console.error('Failed to save theme preference to AsyncStorage:', error);
      }
    };
    saveTheme();
  }, [isDarkMode]); // Dependency on isDarkMode ensures this runs whenever the theme is toggled

  // Function to toggle the dark mode state
  const toggleDarkMode = () => {
    setIsDarkMode(prevMode => !prevMode);
  };

  // The value provided by the context
  const contextValue: ThemeContextType = {
    isDarkMode,
    toggleDarkMode,
  };

  // Provide the context value to the children components
  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

// Custom hook to easily consume the ThemeContext
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    // Throw an error if the hook is used outside of a ThemeProvider
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
