import { Fonts } from '@/constants/Fonts';
import { supabase } from '@/lib/supabase'; // Ensure this path is correct
import { BackgroundShapes } from '@/styles/globalStyles';
import PrimaryButton from '@/styles/roundButton';
import { Section } from '@/styles/Section';
import { SectionItem } from '@/styles/SectionItem';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const SETTINGS_STORAGE_KEY = '@app_settings_v3';
const LAST_SEEN_SCAN_COUNT_KEY = '@lastSeenScanCount';

const AppColors = {
  background: '#ffffff',
  cardBackground: '#FFFFFF',
  textPrimary: '#000000',
  textSecondary: '#718096',
  accent: '#4EA8DE',
  accentLight: '#90CDF4', 
  borderColor: '#E0E0E0',
  danger: '#E53E3E',
  switchThumb: '#FFFFFF',
  switchTrackFalse: '#E0E0E0',
  switchTrackTrue: '#4EA8DE', 
  mediumGrey: '#A0AEC0', 
  white: '#FFFFFF',
  black: '#000000',
};

interface AppSettings {
  scanInsightsEnabled: boolean;
  allergyAlertsEnabled: boolean;
}

const FAQ_DATA = [
  {
    q: "How does the product scanning work?",
    a: "Our app uses your phone's camera to scan product  text on labels. We then analyze this information against our database and your configured allergies to provide insights."
  },
  {
    q: "How accurate is the allergy detection?",
    a: "We strive for high accuracy by matching scanned text with known allergen lists and your personal allergy profile. However, always double-check product labels, especially for severe allergies, as formulations can change and OCR technology may have limitations."
  },
  {
    q: "Can I add my own specific allergies?",
    a: "Yes! You can add and manage your specific allergies in the 'Manage Profile' section. This helps the app provide more personalized alerts."
  },
  {
    q: "Is my scanned data and profile information private?",
    a: "We take your privacy seriously. Please refer to our Privacy Policy for detailed information on how we collect, use, and protect your data."
  },
  {
    q: "What if the app doesn't recognize a product or shows incorrect information?",
    a: "While we aim for comprehensive coverage, some products might not be in our database or information might occasionally be outdated. You can use the 'Contact Support' option to report such issues, helping us improve!"
  },
  {
    q: "How can I provide feedback or get help?",
    a: "You can use the 'Contact Support' option in the settings to send us your feedback, questions, or report any issues you encounter."
  }
];


const SettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [settings, setSettings] = useState<AppSettings>({
    scanInsightsEnabled: true, 
    allergyAlertsEnabled: true,
  });
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isTermsModalVisible, setIsTermsModalVisible] = useState(false);
  const [isPrivacyModalVisible, setIsPrivacyModalVisible] = useState(false);
  const [isFaqModalVisible, setIsFaqModalVisible] = useState(false); // New state for FAQ modal
  const [isDeleteAccountModalVisible, setIsDeleteAccountModalVisible] = useState(false);


  useEffect(() => {
    const loadSettings = async () => {
      setIsLoadingSettings(true);
      try {
        const savedSettings = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (savedSettings !== null) {
          const parsedSettings = JSON.parse(savedSettings);
          setSettings(prev => ({ 
            scanInsightsEnabled: parsedSettings.scanInsightsEnabled !== undefined ? parsedSettings.scanInsightsEnabled : prev.scanInsightsEnabled,
            allergyAlertsEnabled: parsedSettings.allergyAlertsEnabled !== undefined ? parsedSettings.allergyAlertsEnabled : prev.allergyAlertsEnabled,
          }));
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoadingSettings(false);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const saveSettings = async () => {
      if (!isLoadingSettings) { 
        try {
          await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        } catch (error) {
          console.error('Failed to save settings:', error);
        }
      }
    };
    saveSettings();
  }, [settings, isLoadingSettings]);

  const toggleSetting = useCallback((key: keyof AppSettings) => {
    setSettings(prevSettings => ({
      ...prevSettings,
      [key]: !prevSettings[key],
    }));
  }, []);

  const handleChangePassword = useCallback(() => {
    router.push('/auth/reset-password'); 
  }, [router]);

  const handleLogout = useCallback(async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          onPress: async () => {
            try {
              const { error } = await supabase.auth.signOut();
              if (error) {
                Alert.alert('Logout Error', error.message);
              } else {
                await AsyncStorage.removeItem('@userToken');
                await AsyncStorage.removeItem('@userProfile');
                router.replace('/auth/login');
              }
            } catch (error: any) {
              Alert.alert('Logout Error', error.message || 'An unexpected error occurred during logout.');
            }
          },
          style: 'destructive',
        },
      ],
      { cancelable: false }
    );
  }, [router]);

  const handleClearFullScanHistory = async () => {
    Alert.alert(
      "Clear All Scan History",
      "This will permanently delete all your scan history from the database. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear History",
          style: "destructive",
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) {
                Alert.alert("Error", "You must be logged in to clear history.");
                return;
              }
              const { error } = await supabase
                .from('user_scan_history') 
                .delete()
                .eq('user_id', user.id);

              if (error) {
                Alert.alert("Error", "Could not clear scan history: " + error.message);
              } else {
                Alert.alert("Success", "Your scan history has been cleared.");
                await AsyncStorage.setItem(LAST_SEEN_SCAN_COUNT_KEY, '0');
              }
            } catch (e: any) {
              Alert.alert("Error", "An unexpected error occurred.");
            }
          },
        },
      ]
    );
  };
  
  const handleClearAppCache = async () => {
     Alert.alert(
      "Clear App Cache",
      "This will clear locally cached data like seen notifications and recent scan list (not your full history from the database). Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Cache",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(LAST_SEEN_SCAN_COUNT_KEY);
              await AsyncStorage.removeItem('@scanHistory'); 
              Alert.alert("Cache Cleared", "App cache has been cleared.");
            } catch (e) {
              Alert.alert("Error", "Could not clear app cache.");
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = async () => {
    setIsDeleteAccountModalVisible(false); 
    Alert.alert(
        "Account Deletion Requested", 
        "Account deletion is a permanent action. We will process your request. For immediate concerns, please contact support.",
        [{text: "OK"}] 
    );
  };

  const contactSupport = () => {
    Linking.openURL('mailto:support@safebite.app?subject=App Support Request'); 
  };
  
  const openFAQModal = () => { 
    setIsFaqModalVisible(true);
  };


  if (isLoadingSettings) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
          <ActivityIndicator size="large" color={AppColors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'left']}>
      <StatusBar style="dark"/>
      <BackgroundShapes />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={Fonts.title}>Settings</Text>
        </View>

        <Section title="Data Management">
          <SectionItem
            icon={<Ionicons name="trash-bin-outline" size={24} />}
            label="Clear Full Scan History"
            onPress={handleClearFullScanHistory}
            right={<Ionicons name="chevron-forward" size={20} />}
          />
          <SectionItem
            icon={<Ionicons name="refresh-circle-outline" size={24} />}
            label="Clear App Cache"
            onPress={handleClearAppCache}
            right={<Ionicons name="chevron-forward" size={20} />}
          />
        </Section>

        <Section title="Account">
          <SectionItem
            icon={<Ionicons name="person-circle-outline" size={24} style={styles.settingIconAccent} />}
            label="Manage Profile"
            onPress={() => router.push('/(tabs)/profile')}
            right={<Ionicons name="chevron-forward" size={20} />}
          />
          <SectionItem
            icon={<Ionicons name="lock-closed-outline" size={24} />}
            label="Change Password"
            onPress={handleChangePassword}
            right={<Ionicons name="chevron-forward" size={20} />}
          />
          <SectionItem
            icon={<Ionicons name="log-out-outline" size={24} color={AppColors.danger} />}
            label="Logout"
            onPress={handleLogout}
            labelStyle={{ color: AppColors.danger }}
          />
        </Section>

        <Section title="Support & Legal">
          <SectionItem
            icon={<Ionicons name="document-text-outline" size={24} />}
            label="Terms of Service"
            onPress={() => setIsTermsModalVisible(true)}
            right={<Ionicons name="chevron-forward" size={20} />}
          />
          <SectionItem
            icon={<Ionicons name="shield-outline" size={24} />}
            label="Privacy Policy"
            onPress={() => setIsPrivacyModalVisible(true)}
            right={<Ionicons name="chevron-forward" size={20} />}
          />
          <SectionItem
            icon={<Ionicons name="help-buoy-outline" size={24} />}
            label="Contact Support"
            onPress={contactSupport}
            right={<Ionicons name="chevron-forward" size={20} />}
          />
          <SectionItem
            icon={<Ionicons name="help-circle-outline" size={24} />}
            label="FAQ"
            onPress={openFAQModal}
            right={<Ionicons name="chevron-forward" size={20} />}
          />
        </Section>

        <PrimaryButton
          title="Delete Account"
          onPress={() => setIsDeleteAccountModalVisible(true)}
          backgroundColor='#E53E3E'
          textStyle={{ color: 'white'}}
        />
        
        <Text style={styles.appVersionText}>App Version 1.0.0</Text>


      </ScrollView>

      {/* Terms of Service Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isTermsModalVisible}
        onRequestClose={() => setIsTermsModalVisible(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalView}>
          <Text style={[Fonts.title, {textAlign: 'center'}]}>Terms of Service</Text>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            <Text style={styles.modalTextContent}>
              Welcome to SafeBite!{'\n\n'}
              These terms and conditions outline the rules and regulations for the use of SafeBite's Application.
              By accessing this app we assume you accept these terms and conditions. Do not continue to use SafeBite if you do not agree to take all of the terms and conditions stated on this page.{'\n\n'}
              <Text style={styles.modalSubHeader}>1. License to Use Application</Text>{'\n'}
              Unless otherwise stated, SafeBite and/or its licensors own the intellectual property rights for all material on SafeBite. All intellectual property rights are reserved. You may access this from SafeBite for your own personal use subjected to restrictions set in these terms and conditions.{'\n\n'}
              You must not:{'\n'}
              - Republish material from SafeBite{'\n'}
              - Sell, rent or sub-license material from SafeBite{'\n'}
              - Reproduce, duplicate or copy material from SafeBite{'\n'}
              - Redistribute content from SafeBite{'\n\n'}
              <Text style={styles.modalSubHeader}>2. User Content</Text>{'\n'}
              In these Terms of Service, “Your User Content” means material (including without limitation text, images, audio material, video material and audio-visual material) that you submit to this app, for whatever purpose. You grant to SafeBite a worldwide, irrevocable, non-exclusive, royalty-free license to use, reproduce, adapt, publish, translate and distribute your user content in any existing or future media. You also grant to SafeBite the right to sub-license these rights, and the right to bring an action for infringement of these rights.{'\n\n'}
              Your user content must not be illegal or unlawful, must not infringe any third party's legal rights, and must not be capable of giving rise to legal action whether against you or SafeBite or a third party (in each case under any applicable law).{'\n\n'}
              <Text style={styles.modalSubHeader}>3. Disclaimer</Text>{'\n'}
              The information provided by SafeBite is for general guidance on matters of interest only. Even if the Company takes every precaution to insure that the content of the Service is both current and accurate, errors can occur. Plus, given the changing nature of laws, rules and regulations, there may be delays, omissions or inaccuracies in the information contained on the Service.{'\n\n'}
              The Application is provided "as is," with all faults, and SafeBite expresses no representations or warranties, of any kind related to this Application or the materials contained on this Application. Also, nothing contained on this Application shall be interpreted as advising you.{'\n\n'}
              <Text style={styles.modalSubHeader}>4. Accuracy of Information</Text>{'\n'}
              The content on this Application is provided for general information only. It is not intended to amount to advice on which you should rely. You must obtain more specific or professional advice before taking, or refraining from, any action on the basis of the content on our app. Although we make reasonable efforts to update the information on our app, we make no representations, warranties or guarantees, whether express or implied, that the content on our app is accurate, complete or up to date.{'\n\n'}
              <Text style={styles.modalSubHeader}>5. Limitation of Liability</Text>{'\n'}
              In no event shall SafeBite, nor any of its officers, directors and employees, be held liable for anything arising out of or in any way connected with your use of this Application whether such liability is under contract. SafeBite, including its officers, directors and employees shall not be held liable for any indirect, consequential or special liability arising out of or in any way related to your use of this Application.{'\n\n'}
              <Text style={styles.modalSubHeader}>6. Changes to Terms</Text>{'\n'}
              SafeBite is permitted to revise these terms at any time as it sees fit, and by using this Application you are expected to review these terms on a regular basis.{'\n\n'}
              <Text style={styles.modalSubHeader}>7. Governing Law & Jurisdiction</Text>{'\n'}
              These terms will be governed by and interpreted in accordance with the laws of the Hashemite Kingdom of Jordan, and you submit to the non-exclusive jurisdiction of the state and federal courts located in Jordan for the resolution of any disputes.{'\n\n'}
            </Text>
          </ScrollView>
          <PrimaryButton
            title="Close"
            onPress={() => setIsTermsModalVisible(false)}
            backgroundColor='#4EA8DE'
          />
        </View>
        </SafeAreaView>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isPrivacyModalVisible}
        onRequestClose={() => setIsPrivacyModalVisible(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalView}>
          <Text style={[Fonts.title, {textAlign: 'center'}]}>Privacy Policy</Text>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            <Text style={styles.modalTextContent}>
              Last updated: May 23, 2025{'\n\n'}
              SafeBite ("us", "we", or "our") operates the SafeBite mobile application (the "Service").{'\n\n'}
              This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our Service and the choices you have associated with that data.{'\n\n'}
              We use your data to provide and improve the Service. By using the Service, you agree to the collection and use of information in accordance with this policy.{'\n\n'}
              <Text style={styles.modalSubHeader}>1. Information Collection and Use</Text>{'\n'}
              We collect several different types of information for various purposes to provide and improve our Service to you.{'\n'}
              Types of Data Collected:{'\n'}
              - <Text style={{fontWeight: 'bold'}}>Personal Data:</Text> While using our Service, we may ask you to provide us with certain personally identifiable information that can be used to contact or identify you ("Personal Data"). Personally identifiable information may include, but is not limited to: Email address, First name and last name, Phone number, Address, Cookies and Usage Data, Allergy information, Scanned product data and images.{'\n'}
              - <Text style={{fontWeight: 'bold'}}>Usage Data:</Text> We may also collect information that your device sends whenever you use our Service ("Usage Data"). This Usage Data may include information such as your device's Internet Protocol address (e.g. IP address), device type, device version, the pages of our Service that you visit, the time and date of your visit, the time spent on those pages, unique device identifiers and other diagnostic data.{'\n\n'}
              <Text style={styles.modalSubHeader}>2. Use of Data</Text>{'\n'}
              SafeBite uses the collected data for various purposes:{'\n'}
              - To provide and maintain our Service{'\n'}
              - To notify you about changes to our Service{'\n'}
              - To allow you to participate in interactive features of our Service when you choose to do so{'\n'}
              - To provide customer support{'\n'}
              - To gather analysis or valuable information so that we can improve our Service{'\n'}
              - To monitor the usage of our Service{'\n'}
              - To detect, prevent and address technical issues{'\n'}
              - To provide you with allergy alerts and insights based on your scans and profile.{'\n\n'}
              <Text style={styles.modalSubHeader}>3. Storage and Transfer of Data</Text>{'\n'}
              Your information, including Personal Data, may be transferred to — and maintained on — computers located outside of your state, province, country or other governmental jurisdiction where the data protection laws may differ than those from your jurisdiction.{'\n'}
              Your consent to this Privacy Policy followed by your submission of such information represents your agreement to that transfer.{'\n'}
              SafeBite will take all steps reasonably necessary to ensure that your data is treated securely and in accordance with this Privacy Policy and no transfer of your Personal Data will take place to an organization or a country unless there are adequate controls in place including the security of your data and other personal information.{'\n\n'}
              <Text style={styles.modalSubHeader}>4. Disclosure of Data</Text>{'\n'}
              Legal Requirements: SafeBite may disclose your Personal Data in the good faith belief that such action is necessary to: To comply with a legal obligation, To protect and defend the rights or property of SafeBite, To prevent or investigate possible wrongdoing in connection with the Service, To protect the personal safety of users of the Service or the public, To protect against legal liability.{'\n\n'}
              <Text style={styles.modalSubHeader}>5. Security of Data</Text>{'\n'}
              The security of your data is important to us, but remember that no method of transmission over the Internet, or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your Personal Data, we cannot guarantee its absolute security.{'\n\n'}
              <Text style={styles.modalSubHeader}>6. Your Data Protection Rights</Text>{'\n'}
              You have certain data protection rights. SafeBite aims to take reasonable steps to allow you to correct, amend, delete, or limit the use of your Personal Data. If you wish to be informed what Personal Data we hold about you and if you want it to be removed from our systems, please contact us.{'\n\n'}
              <Text style={styles.modalSubHeader}>7. Changes to This Privacy Policy</Text>{'\n'}
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page. You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.{'\n\n'}
              <Text style={styles.modalSubHeader}>8. Contact Us</Text>{'\n'}
              If you have any questions about this Privacy Policy, please contact us: By email: support@safebite.app{'\n\n'}
            </Text>
          </ScrollView>
          <PrimaryButton
            title="Close"
            onPress={() => setIsPrivacyModalVisible(false)}
            backgroundColor='#4EA8DE'
          />
        </View>
        </SafeAreaView>
      </Modal>

       {/* FAQ Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isFaqModalVisible}
        onRequestClose={() => setIsFaqModalVisible(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalView}>
          <Text style={[Fonts.title, {textAlign: 'center'}]}>Frequently Asked Questions</Text>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            {FAQ_DATA.map((faq, index) => (
              <View key={index} style={styles.faqItem}>
                <Text style={styles.faqQuestion}>{index + 1}. {faq.q}</Text>
                <Text style={styles.faqAnswer}>{faq.a}</Text>
              </View>
            ))}
          </ScrollView>
          <PrimaryButton
            title="Close"
            onPress={() => setIsFaqModalVisible(false)}
            backgroundColor='#4EA8DE'
          />
        </View>
        </SafeAreaView>
      </Modal>

       <Modal
            animationType="fade"
            transparent={true}
            visible={isDeleteAccountModalVisible}
            onRequestClose={() => setIsDeleteAccountModalVisible(false)}
        >
            <View style={styles.deleteModalOverlay}>
                <View style={styles.deleteModalView}>
                    <Ionicons name="alert-circle-outline" size={54} color={AppColors.danger} style={{ marginBottom: 15 }} />
                    <Text style={styles.deleteModalTitle}>Delete Account?</Text>
                    <Text style={styles.deleteModalMessage}>
                        This action is irreversible and will permanently delete all your data associated with SafeBite, including your profile, scan history, and preferences.
                    </Text>
                    <View style={styles.deleteModalButtonRow}>
                        <TouchableOpacity
                            style={[styles.deleteModalButton, styles.deleteModalCancelButton]}
                            onPress={() => setIsDeleteAccountModalVisible(false)}
                        >
                            <Text style={styles.deleteModalButtonTextCancel}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.deleteModalButton, styles.deleteModalConfirmButton]}
                            onPress={handleDeleteAccount}
                        >
                            <Text style={styles.deleteModalButtonTextConfirm}>Delete Account</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  scrollContent: {
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  header: {
    marginBottom: 24,
    alignItems: 'center', 
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  settingItemNoBorder: { 
    borderBottomWidth: 0,
  },
  settingIcon: {
    marginRight: 16, 
    color: AppColors.textSecondary, 
  },
  settingIconAccent: { 
    marginRight: 16,
    color: AppColors.accent,
  },
  settingLabel: {
    flex: 1,
    fontSize: 16,
    color: AppColors.textPrimary,
  },
  chevronIcon: {
    color: AppColors.mediumGrey,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  logoutButtonText: {
    fontSize: 16,
    color: AppColors.danger, 
    fontWeight: '500',
  },
  appVersionText: {
    textAlign: 'center',
    fontSize: 12,
    color: AppColors.mediumGrey,
    marginTop: 20,
    marginBottom: 10,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.danger,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 10,
  },
  deleteAccountButtonText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  modalSafeArea: {
    flex:1, 
    backgroundColor:'rgba(0,0,0,0.5)'
  },
  modalView: {
    flex: 1,
    margin: 20,
    marginTop: Platform.OS === 'ios' ? 50 : 30,
    marginBottom: Platform.OS === 'ios' ? 30 : 20,
    backgroundColor: AppColors.background,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    color: AppColors.textPrimary,
    textAlign: 'center',
  },
  modalScroll: {
    flex: 1,
    marginBottom: 15,
  },
  modalScrollContent: {
    paddingBottom: 10,
  },
  modalSubHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: AppColors.textPrimary,
    marginTop: 10,
    marginBottom: 5,
  },
  modalTextContent: {
    fontSize: 15,
    lineHeight: 22,
    color: AppColors.textSecondary,
  },
  faqItem: {
    marginBottom: 20,
  },
  faqQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: AppColors.textPrimary,
    marginBottom: 6,
  },
  faqAnswer: {
    fontSize: 15,
    lineHeight: 22,
    color: AppColors.textSecondary,
  },
  modalButton: {
    borderRadius: 8,
    padding: 12,
    elevation: 2,
    marginTop: 10,
  },
  modalButtonText: {
    color: AppColors.white,
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteModalView: {
    margin: 20,
    backgroundColor: AppColors.cardBackground,
    borderRadius: 16,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
    maxWidth: 380,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
  },
  deleteModalMessage: {
    fontSize: 15,
    color: AppColors.textSecondary,
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 22,
  },
  deleteModalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  deleteModalButton: {
    borderRadius: 8,
    paddingVertical: 12,
    flex: 1, 
    alignItems: 'center',
  },
  deleteModalCancelButton: {
    marginRight: 10,
  },
  deleteModalButtonTextCancel: {
    color: AppColors.textSecondary,
    fontWeight: '600',
    fontSize: 16,
  },
  deleteModalConfirmButton: {
    backgroundColor: AppColors.danger,
    marginLeft: 10,
  },
  deleteModalButtonTextConfirm: {
    color: AppColors.white,
    fontWeight: '600',
    fontSize: 16,
  },
});

export default SettingsScreen;
