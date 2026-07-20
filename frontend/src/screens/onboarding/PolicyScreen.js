/**
 * PolicyScreen — Privacy Policy and Terms of Use viewer.
 *
 * Shown when the user taps "Privacy Policy" or "Terms of Use" on the
 * Sign Up screen. A two-tab layout lets them read both documents in one
 * place without leaving the onboarding flow.
 *
 * Content is embedded directly so it is always available offline —
 * no network request required.
 */
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG_GRADIENT  = ['#37767A', '#1C4047', '#0A1618'];
const ORANGE       = '#FFA940';
const WHITE        = '#FFFFFF';
const MINT         = '#C3DECE';
const DIM          = 'rgba(255,255,255,0.60)';
const FAINT        = 'rgba(255,255,255,0.50)'; // WCAG AA floor — 0.38 failed 4.5:1
const CARD_BG      = 'rgba(45,105,116,0.40)';
const CARD_BORDER  = 'rgba(195,222,206,0.15)';
const DIVIDER      = 'rgba(195,222,206,0.18)';

// ── Effective date ────────────────────────────────────────────────────────────
const EFFECTIVE_DATE = 'July 2026 · Pilot Version 1.0';
const CONTACT_EMAIL  = 'devansh0505@gmail.com';

// ── Privacy Policy content ─────────────────────────────────────────────────────
// Structured as an array of sections so we can apply consistent styling
// without hard-coding font sizes in the content itself.
const PRIVACY_SECTIONS = [
  {
    title: 'About This App',
    body: 'Eloqua is a voice training application for people with Parkinson\'s disease, developed as part of a research pilot study at Imperial College London. This pilot involves a small group of participants.\n\nThis Privacy Policy explains what personal data Eloqua collects, why it is collected, how it is used, and your rights under the UK General Data Protection Regulation (UK GDPR).',
  },
  {
    title: 'Who We Are',
    body: 'Eloqua is operated for research purposes by Devansh Goyal, a student at Imperial College London. For the purposes of UK GDPR, the data controller is the Imperial College London research team.\n\nContact: ' + CONTACT_EMAIL,
  },
  {
    title: 'What Data We Collect',
    body: 'We collect the following personal data:\n\n• Account information — Your name and email address, provided when you create your account.\n\n• Voice recordings — Audio recordings made during training sessions and daily voice notes. Used to create a personalised voice profile and generate enhanced speech audio.\n\n• Session performance data — Scores and progress metrics from your voice training sessions, including voice power, expression, fluency, and Maximum Phonation Time.\n\n• App usage data — Information about how you use the app, such as which screens you visit and session durations. This is used for research analysis and service improvement.\n\nWe do not collect sensitive health information beyond the voice data you provide during training.',
  },
  {
    title: 'How We Use Your Data',
    body: '• Personalisation — Your voice recordings are used to create a personal voice profile and generate AI-enhanced speech playback, so you can hear your voice\'s potential.\n\n• Progress tracking — Session scores are stored to track improvement over time and adapt your training difficulty.\n\n• Research — As part of the Imperial College pilot study, anonymised and aggregated data (from which no individual can be identified) may be analysed to evaluate the effectiveness of the app. No individually identifiable data will be published or shared.',
  },
  {
    title: 'Who We Share Your Data With',
    body: 'Your data may be shared with the following third-party processors:\n\n• ElevenLabs, Inc. — Voice cloning and speech synthesis. Servers located in the United States. Transfer safeguard: Standard Contractual Clauses.\n\n• Google Firebase (Auth + Firestore) — Account authentication and data storage. Servers located in the United States. Transfer safeguard: Standard Contractual Clauses.\n\n• OpenAI — Speech transcription and text enhancement. Servers located in the United States. Transfer safeguard: Standard Contractual Clauses.\n\nWe do not sell your personal data to any third party, and never will.',
  },
  {
    title: 'Data Transfers Outside the UK',
    body: 'Some of our processors are based in the United States. All transfers of personal data outside the UK are protected under Standard Contractual Clauses (SCCs), which is the appropriate UK GDPR safeguard for international data transfers.',
  },
  {
    title: 'How Long We Keep Your Data',
    body: 'We retain your data for the duration of the pilot study. You may request deletion of your data at any time (see Your Rights below).\n\nAt the conclusion of the pilot, all personal data will either be anonymised or permanently deleted, in accordance with Imperial College London\'s data retention policy.',
  },
  {
    title: 'Your Rights',
    body: 'Under UK GDPR, you have the right to:\n\n• Access — Request a copy of the personal data we hold about you.\n\n• Correction — Ask us to correct inaccurate or incomplete data.\n\n• Deletion — Delete your account and all associated data at any time from Settings > Delete Account within the app. This permanently removes your account, voice profile, and all session data.\n\n• Object — Object to processing of your data for research purposes.\n\n• Withdraw consent — Withdraw your participation at any time without penalty.\n\nTo exercise any right other than in-app deletion, contact: ' + CONTACT_EMAIL,
  },
  {
    title: 'Legal Basis for Processing',
    body: 'We process your personal data on the basis of your explicit consent, given when you agree to this Privacy Policy and participate in the pilot study. For research analysis, we rely on legitimate interests under the Imperial College London ethical framework for research involving human participants.',
  },
  {
    title: 'Security',
    body: 'Your data is transmitted over encrypted connections (HTTPS/TLS). Voice recordings are processed securely and not retained on our servers beyond what is required for synthesis. Account data is protected by Google Firebase\'s enterprise security infrastructure, including encryption at rest.',
  },
  {
    title: 'Children',
    body: 'Eloqua is intended for adult participants in the pilot study. The app is not directed at anyone under the age of 18, and we do not knowingly collect data from children.',
  },
  {
    title: 'Changes to This Policy',
    body: 'We may update this Privacy Policy. Any material changes will be communicated to pilot participants directly. The current version is always available in the app by tapping the links on the Create Account screen.',
  },
  {
    title: 'Contact & Complaints',
    body: 'For any data-related queries, contact: ' + CONTACT_EMAIL + '\n\nThis research is conducted under the Imperial College London ethical framework. If you have a complaint about how we handle your data, you may also contact the UK Information Commissioner\'s Office (ICO) at ico.org.uk.',
  },
];

// ── Terms of Use content ───────────────────────────────────────────────────────
const TERMS_SECTIONS = [
  {
    title: 'Acceptance of Terms',
    body: 'By creating an account and using Eloqua, you confirm that you have read, understood, and agree to these Terms of Use. If you do not agree to these terms, please do not use the app.',
  },
  {
    title: 'Who May Use Eloqua',
    body: 'Eloqua is currently available only to participants in the Imperial College London pilot study. You must:\n\n• Be 18 years of age or older\n• Have been invited to participate in the pilot trial\n• Have completed the Participant Information Sheet and given informed consent\n\nUse of the app outside of these conditions is not permitted.',
  },
  {
    title: 'Not a Medical Device',
    body: 'Eloqua is a voice training tool developed for research purposes. It is not a regulated medical device and is not a substitute for professional medical advice, diagnosis, or treatment from a qualified speech-language pathologist, neurologist, or other healthcare professional.\n\nAlways consult your healthcare team about your Parkinson\'s care. Do not delay or disregard professional medical advice based on information or feedback from this app.',
  },
  {
    title: 'Purpose of the App',
    body: 'Eloqua is designed to support structured voice training exercises consistent with evidence-based approaches for Parkinson\'s-related speech impairment (hypophonia). The app provides:\n\n• Daily voice training exercises\n• A personalised AI voice profile for motivational feedback\n• Progress tracking across sessions\n• A Smart Speech enhancement feature\n\nResults may vary. Improvement in voice function is not guaranteed.',
  },
  {
    title: 'Your Responsibilities',
    body: '• Use the app only as intended for voice training\n• Do not share your account credentials with anyone else\n• Provide accurate information when creating your account\n• Stop using any feature that causes discomfort, pain, or distress, and contact your healthcare provider if needed\n• Do not use the app while operating a vehicle or in any situation where distraction could cause harm',
  },
  {
    title: 'Voice Data and AI Features',
    body: 'Eloqua uses AI technology (ElevenLabs) to create a voice profile from your recordings and to generate enhanced speech audio. This feature:\n\n• Produces a computer-generated voice based on your recordings\n• Is provided as a motivational tool to demonstrate your voice\'s potential\n• Should not be used for any purpose other than personal speech training\n• Does not represent a clinical voice assessment\n\nYou retain ownership of your voice data. We use it solely for the purposes described in the Privacy Policy.',
  },
  {
    title: 'Research Participation',
    body: 'By using this app as part of the Imperial College pilot study, you acknowledge that:\n\n• Anonymised data from your sessions may be used for research analysis\n• You may withdraw from the study at any time without consequence\n• Withdrawal will not affect your access to any healthcare services\n• Your participation is voluntary\n\nFull details of the study are in the Participant Information Sheet provided to you.',
  },
  {
    title: 'Intellectual Property',
    body: 'The Eloqua app, its content, design, branding, and underlying technology are the intellectual property of the Eloqua development team. You may not:\n\n• Copy, reproduce, or distribute any part of the app\n• Reverse-engineer, decompile, or modify the app\n• Use the Eloqua name or branding without permission',
  },
  {
    title: 'Limitation of Liability',
    body: 'Eloqua is provided "as is" for research and educational purposes. To the fullest extent permitted by applicable law:\n\n• We make no warranties, express or implied, about the accuracy, reliability, or suitability of the app\n• We shall not be liable for any indirect, incidental, or consequential loss or damage arising from your use of the app\n• Our total liability, where it cannot be excluded, shall not exceed the amount you paid to access the app (which, for pilot participants, is nil)',
  },
  {
    title: 'App Availability',
    body: 'We do not guarantee that the app will always be available or error-free. We may suspend, withdraw, or restrict the app at any time for operational or research reasons. We will endeavour to give reasonable notice to participants where possible.',
  },
  {
    title: 'Changes to These Terms',
    body: 'We may update these Terms of Use. Any changes will be communicated to pilot participants. Continued use of the app after notification of changes constitutes acceptance of the updated terms.',
  },
  {
    title: 'Governing Law',
    body: 'These Terms of Use are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.',
  },
  {
    title: 'Contact',
    body: 'For questions about these terms: ' + CONTACT_EMAIL + '\n\nThis research is conducted under the Imperial College London ethical framework.',
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function BackButton({ onPress }) {
  return (
    <TouchableOpacity
      style={ss.backBtn}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M15 18l-6-6 6-6"
          stroke={WHITE}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </TouchableOpacity>
  );
}

// Renders a single section: a bold title then body text
function PolicySection({ title, body, isLast }) {
  return (
    <View style={[ss.section, !isLast && ss.sectionBorder]}>
      <Text style={ss.sectionTitle}>{title}</Text>
      <Text style={ss.sectionBody}>{body}</Text>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function PolicyScreen({ navigation, route }) {
  // initialTab can be 'privacy' or 'terms', passed from SignUpScreen
  const initialTab = route?.params?.section ?? 'privacy';
  const [activeTab, setActiveTab] = useState(initialTab);
  const { top: safeTop } = useSafeAreaInsets();

  // Scroll the content to top when switching tabs
  const scrollRef = useRef(null);
  function switchTab(tab) {
    setActiveTab(tab);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  const sections = activeTab === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS;
  const docTitle = activeTab === 'privacy' ? 'Privacy Policy' : 'Terms of Use';

  return (
    <View style={ss.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={BG_GRADIENT}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[ss.header, { paddingTop: safeTop + 10 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={ss.headerTitle}>{docTitle}</Text>
        {/* Spacer keeps title centred */}
        <View style={{ width: 44 }} />
      </View>

      {/* ── Tab switcher ────────────────────────────────────────────────────── */}
      <View style={ss.tabBar}>
        <TouchableOpacity
          style={[ss.tab, activeTab === 'privacy' && ss.tabActive]}
          onPress={() => switchTab('privacy')}
          activeOpacity={0.8}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'privacy' }}
        >
          <Text style={[ss.tabLabel, activeTab === 'privacy' && ss.tabLabelActive]}>
            Privacy Policy
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ss.tab, activeTab === 'terms' && ss.tabActive]}
          onPress={() => switchTab('terms')}
          activeOpacity={0.8}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'terms' }}
        >
          <Text style={[ss.tabLabel, activeTab === 'terms' && ss.tabLabelActive]}>
            Terms of Use
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Document body ───────────────────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={ss.scroll}
        contentContainerStyle={ss.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Document header */}
        <View style={ss.docHeader}>
          <Text style={ss.docTitle}>{docTitle}</Text>
          <Text style={ss.docMeta}>{EFFECTIVE_DATE}</Text>
          <Text style={ss.docMeta}>Imperial College London · Pilot Study</Text>
        </View>

        {/* Pilot notice banner */}
        <View style={ss.pilotBanner}>
          <Text style={ss.pilotBannerText}>
            This document applies to the Eloqua pilot trial. This is a research app operated under the Imperial College London ethical framework.
          </Text>
        </View>

        {/* Sections */}
        <View style={ss.card}>
          {sections.map((sec, i) => (
            <PolicySection
              key={sec.title}
              title={sec.title}
              body={sec.body}
              isLast={i === sections.length - 1}
            />
          ))}
        </View>

        {/* Footer */}
        <Text style={ss.footer}>
          Questions? Contact {CONTACT_EMAIL}
        </Text>
        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  root: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Tab bar ──────────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: ORANGE,
  },
  tabLabel: {
    color: DIM,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: '#1A1A1A',
  },

  // ── Document content ──────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
  },

  docHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 4,
  },
  docTitle: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  docMeta: {
    color: FAINT,
    fontSize: 13,
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  // Pilot study notice
  pilotBanner: {
    backgroundColor: 'rgba(255,169,64,0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,169,64,0.25)',
    padding: 14,
    marginBottom: 16,
  },
  pilotBannerText: {
    color: MINT,
    fontSize: 13,
    lineHeight: 20,
    letterSpacing: 0.1,
  },

  // Content card
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
    marginBottom: 20,
  },

  // Individual section within the card
  section: {
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  sectionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  sectionTitle: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  sectionBody: {
    color: DIM,
    fontSize: 15,
    lineHeight: 23,
    letterSpacing: 0.1,
  },

  footer: {
    color: FAINT,
    fontSize: 13,
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
});
