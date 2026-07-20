/**
 * Eloqua Design System — v3
 *
 * ════════════════════════════════════════════════════════════════
 * STYLE GUIDE — read this before editing any screen
 * ════════════════════════════════════════════════════════════════
 *
 * BRAND VIBE: warm confidence.
 *   Teal   = calm clinical trust (the journey, the path)
 *   Orange = human energy (streaks, progress, CTA)
 *   Mint   = clarity, breathing room (labels, accents on dark)
 *
 * ── THE THREE GRADIENTS ─────────────────────────────────────────
 * Every screen background must use exactly one of these three.
 * Never use a flat colour as the full-screen background.
 *
 *  1. colors.gradients.app      (dark teal → near-black)
 *     Use for: Home, Settings, Progress, SpeechEnhancement,
 *              StreakCelebration, Opening, SpeechDemo, splash dark phase
 *
 *  2. colors.gradients.session  (deep teal → very dark)
 *     Use for: Assessment, Checkin, VocalTrainingSession,
 *              all exercise screens, BaselineSession
 *
 *  3. colors.gradients.form     (light mint → mid mint)
 *     Use for: top halves of onboarding/auth screens that use
 *              a split light/dark layout (SignUp, SignIn,
 *              SetupAboutYou, SetupVoice, SetupPermissions)
 *
 * ── TYPOGRAPHY ──────────────────────────────────────────────────
 * - All body text ≥ 16px (WCAG 2.1 minimum)
 * - Only use font tokens from `type.*` (h1–h4, body, button, etc.)
 * - Never hard-code fontWeight / fontSize / letterSpacing inline
 * - Large Text support: `useFontSize(base)` from PrefsContext
 *
 * ── COLOURS ─────────────────────────────────────────────────────
 * - Import from `colors.*` — never hard-code hex values in screens
 * - One orange: colors.orange (#FFA940) — all CTAs, accents, streaks
 * - Secondary text: colors.textSecondary (rgba white 0.60)
 * - Faint text: colors.textFaint (rgba white 0.50) — hints only
 * - Cards: colors.surfaceSubtle + colors.border
 * - Destructive: colors.red (#E05252)
 *
 * ── SPACING ─────────────────────────────────────────────────────
 * - Use space.* tokens (xs=4, sm=8, md=16, lg=24, xl=32, xxl=48)
 * - Standard horizontal padding: space.md (16px)
 * - Card internal padding: 18–20px
 *
 * ── COMPONENTS ──────────────────────────────────────────────────
 * - Primary CTA: spread `ui.primaryBtn`, text uses type.button style
 * - Ghost buttons (back/close): spread `ui.ghostBtn` (56×56, rounded)
 * - Help buttons: spread `ui.orangeBtn` (56×56, orange)
 * - Cards: spread `ui.card` (borderRadius 16, mint border at 18%)
 * - Tab bar: <TabBar activeTab="home|settings|progress" navigation={nav} />
 *
 * ── ACCESSIBILITY ───────────────────────────────────────────────
 * - All interactive elements: accessibilityRole + accessibilityLabel
 * - No white text on orange backgrounds (use '#1A1A1A' instead)
 * - Min tap target: 48×48px
 *
 * ════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────────
// Raw palette — internal only.  Components reference semantic tokens below.
// ─────────────────────────────────────────────────────────────────────────────
const _p = {
  // Teal family (brand identity — used in backgrounds, surfaces, gradients)
  teal950: '#0A1618',   // absolute darkest
  teal900: '#1C4047',   // primary dark background
  teal800: '#243E44',   // session / assessment screens
  teal700: '#2D6974',   // card / surface
  teal600: '#326F77',   // auth gradient start
  teal500: '#37767A',   // app gradient start
  teal400: '#68B39F',   // mint teal (speech / onboarding mid)
  teal300: '#9FCFBD',   // light mint
  teal200: '#C3DECE',   // pale mint (accent labels on dark)
  teal100: '#E0ECDE',   // lightest mint (splash, light accents)

  // Forest green (exercise score zone — top half of exercise screens)
  forest:  '#1E3828',

  // Accent — one orange to rule them all
  orange:  '#FFA940',

  // Functional
  green:   '#48D28C',   // success, waveform bars
  red:     '#E05252',   // error, destructive actions
  white:   '#FFFFFF',
};


// ─────────────────────────────────────────────────────────────────────────────
// Semantic color tokens
// ─────────────────────────────────────────────────────────────────────────────
export const colors = {

  // ── Backgrounds ─────────────────────────────────────────────────────────────
  bgDark:        _p.teal900,                     // main app screens
  bgDeep:        _p.teal950,                     // deepest dark (gradient end)
  bgSession:     _p.teal800,                     // assessment / check-in
  bgForest:      _p.forest,                      // exercise score zone top
  bgLight:       _p.teal100,                     // splash / light accent backgrounds

  // ── Surfaces ─────────────────────────────────────────────────────────────────
  surface:       _p.teal700,                     // card on dark (#2D6974)
  surfaceSubtle: 'rgba(255,255,255,0.07)',        // ghost card on dark
  surfaceMid:    'rgba(45,105,116,0.40)',         // translucent teal panel

  // ── Borders ──────────────────────────────────────────────────────────────────
  border:        'rgba(195,222,206,0.18)',        // standard — mint @ 18%
  borderMid:     'rgba(195,222,206,0.25)',        // slightly more visible
  borderLight:   'rgba(255,255,255,0.18)',        // white-based border

  // ── Text on dark backgrounds ─────────────────────────────────────────────────
  textPrimary:   _p.white,
  textSecondary: 'rgba(255,255,255,0.60)',        // subtitles, body copy
  textFaint:     'rgba(255,255,255,0.50)',        // hints, placeholders — min 0.50 for WCAG AA at 16px

  // ── Text on light (mint) backgrounds ─────────────────────────────────────────
  textDark:      _p.teal900,                     // #1C4047
  textDarkDim:   'rgba(28,64,71,0.60)',
  textDarkFaint: 'rgba(28,64,71,0.38)',

  // ── Accent colours ───────────────────────────────────────────────────────────
  orange:  _p.orange,    // #FFA940 — energy, streaks, primary CTA
  green:   _p.green,     // #48D28C — success, waveform bars
  red:     _p.red,       // #E05252 — error, destructive
  mint:    _p.teal200,   // #C3DECE — accent label on dark
  mintMid: _p.teal300,   // #9FCFBD
  white:   _p.white,

  // ── Gradients (pass directly as `colors` prop to <LinearGradient>) ───────────
  //
  // ONLY THREE CANONICAL GRADIENTS — use these everywhere.
  // See style guide at top of file for which screens use which.
  gradients: {
    // ① MAIN APP — Home, Settings, Progress, SpeechEnhancement, Opening, StreakCelebration
    app:          [_p.teal500, _p.teal900, _p.teal950],  // '#37767A' → '#1C4047' → '#0A1618'

    // ② SESSION   — Assessment, Checkin, VocalTrainingSession, all exercise screens
    session:      [_p.teal800, _p.teal900, _p.teal950],  // '#243E44' → '#1C4047' → '#0A1618'

    // ③ FORM      — top halves of split onboarding/auth screens (light section only)
    form:         [_p.teal100, '#C5E0D4'],                // '#E0ECDE' → mint-teal

    // ── Legacy aliases — kept for backward compatibility with existing screen imports.
    // New code must use the canonical names above.
    darkApp:      [_p.teal500, _p.teal900, _p.teal950],  // → use `app`
    auth:         [_p.teal500, _p.teal900, _p.teal950],  // → use `app`
    lightForm:    [_p.teal100, '#C5E0D4'],                // → use `form`
    speech:       [_p.teal500, _p.teal900, _p.teal950],  // → use `app`
    instruction:  [_p.teal800, _p.teal900, _p.teal950],  // → use `session`
    ready:        [_p.teal800, _p.teal900, _p.teal950],  // → use `session`
  },

  // ── Splash screen palette — used by SplashScreen.js ─────────────────────────
  splash: {
    gradientStart: _p.teal500,   // '#37767A'
    gradientEnd:   _p.teal950,   // '#0A1618'
    revealLight:   _p.teal100,   // '#E0ECDE'
    revealMid:     _p.teal400,   // '#68B39F'
    revealDark:    '#418182',
    // BrandReveal + SplashButtons text / button tokens (light reveal phase)
    text:         _p.teal900,                  // '#1C4047' — dark teal on mint bg
    buttonBg:     _p.white,                    // '#FFFFFF' — solid login button
    buttonBorder: 'rgba(28,64,71,0.30)',       // subtle teal outline
  },

  // ── Legacy keys — keep AppNavigator + AuthContext happy ─────────────────────
  primary:    _p.orange,
  background: _p.teal900,
  surface:    _p.teal700,
  textDark2:  _p.teal900,
};


// ─────────────────────────────────────────────────────────────────────────────
// Typography
// All sizes ≥ 16 px — WCAG 2.1 minimum for body text.
// ─────────────────────────────────────────────────────────────────────────────
export const type = {
  // Hero numbers — score display, countdown
  score:    { fontSize: 128, fontWeight: '900', letterSpacing: -5,  includeFontPadding: false },

  // Screen-defining impact text ("THINK LOUD", exercise titles)
  display:  { fontSize: 56,  fontWeight: '800', letterSpacing: 1.0 },

  // Page titles (2-line max)
  h1:       { fontSize: 38,  fontWeight: '800', letterSpacing: 0.2, lineHeight: 46 },
  h2:       { fontSize: 32,  fontWeight: '800', lineHeight: 40 },
  h3:       { fontSize: 24,  fontWeight: '700', lineHeight: 32 },
  h4:       { fontSize: 20,  fontWeight: '700', lineHeight: 28 },

  // Body
  bodyLg:   { fontSize: 18,  fontWeight: '400', lineHeight: 26 },
  body:     { fontSize: 17,  fontWeight: '400', lineHeight: 24 },
  bodySm:   { fontSize: 16,  fontWeight: '400', lineHeight: 23 },

  // Interactive
  buttonLg: { fontSize: 20,  fontWeight: '800', letterSpacing: 0.3 },
  button:   { fontSize: 18,  fontWeight: '700', letterSpacing: 0.3 },
  label:    { fontSize: 16,  fontWeight: '600', letterSpacing: 0.2 },

  // Badges / pills / eyebrow labels
  caption:  { fontSize: 16,  fontWeight: '700', letterSpacing: 1.0 },
  pill:     { fontSize: 16,  fontWeight: '800', letterSpacing: 0.8 },

  // Icon button glyphs  ←  ✕  ?
  icon:     { fontSize: 20,  fontWeight: '500', includeFontPadding: false, textAlign: 'center', lineHeight: 20 },
  iconLg:   { fontSize: 24,  fontWeight: '900', includeFontPadding: false, textAlign: 'center', lineHeight: 24 },
};

// Legacy alias used by some existing imports
export const typography = {
  heading:      type.h2,
  headingLarge: type.h1,
  subheading:   type.bodyLg,
  body:         type.body,
  bodySmall:    type.bodySm,
  caption:      type.caption,
  button:       type.button,
};


// ─────────────────────────────────────────────────────────────────────────────
// Spacing — 4-point grid
// ─────────────────────────────────────────────────────────────────────────────
export const space = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

// Legacy alias
export const spacing = space;


// ─────────────────────────────────────────────────────────────────────────────
// Border radius
// ─────────────────────────────────────────────────────────────────────────────
export const radius = {
  sm:   12,    // chips, small elements
  md:   16,    // standard cards, secondary buttons
  lg:   24,    // large cards, bottom sheets
  xl:   28,    // primary CTA buttons (pill)
  full: 999,   // perfect circles
};

// Legacy alias
export const borderRadius = radius;


// ─────────────────────────────────────────────────────────────────────────────
// Reusable component style objects
// Spread these into your screen's StyleSheet.create({}) entries.
// e.g.  closeBtn: { ...ui.ghostBtn }
// ─────────────────────────────────────────────────────────────────────────────
export const ui = {

  // 56 × 56 ghost circle — back ←  close ✕
  ghostBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center', justifyContent: 'center',
  },

  // 56 × 56 orange circle — help ?
  orangeBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: _p.orange,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: _p.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 8,
  },

  // Full-width primary CTA — orange pill
  primaryBtn: {
    backgroundColor: _p.orange,
    paddingVertical: 20, borderRadius: 28,
    alignItems: 'center',
    shadowColor: _p.orange,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },

  // Standard card on dark background
  card: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(195,222,206,0.18)',
    padding: 18,
  },

  // Instructions / label pill — orange background
  labelPill: {
    flex: 1,
    backgroundColor: _p.orange,
    borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 6,
    alignItems: 'center',
  },

  // Session progress bar track
  progressTrack: {
    height: 8, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  progressFill: {
    height: '100%', borderRadius: 8,
    backgroundColor: _p.orange,
  },
};
