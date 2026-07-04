# Eloqua Design & Accessibility Guide

*This document is the single reference for all future screen design and implementation work.
Every new screen and every edit to an existing screen must comply with every rule here.*

**Three goals, in priority order:**
1. **Consistency** — every screen feels like the same product
2. **Accessibility for lower-cognitive users** — stroke and Parkinson's patients experiencing
   fatigue, reduced motor precision, and slower processing speed
3. **Good, attractive design** — warm confidence; never clinical, never cold

---

## 1. Brand Identity

### Logo & Wordmark
- "Eloqua" wordmark in white with a dolphin silhouette swimming through the letters
- Always centred, always on a teal gradient background
- Never place the logo on a white or light background
- Never resize the wordmark below the point where the dolphin becomes illegible

### Brand Vibe
- **Teal** = calm, clinical trust (the journey, the path, the background world)
- **Orange** = human energy, action, progress, achievement
- **Mint/white** = breathing room, labels, clarity on dark surfaces
- Emotional tone: *warm confidence* — the app is a supportive coach, not a clinical test

### Dolphin Mascot
The dolphin is the app's character. It appears in animations and exercise icons.
Four distinct forms exist — use only the correct form in each context:

| Dolphin form | When to use | Animation notes |
|---|---|---|
| **Original Dolphin** — full white silhouette, swimming right | Splash screen, static branding | Static image |
| **Swimming Dolphin** — 3 animation frames (nose-down → flat → arching) | Loading states, gentle ambient motion | Loop the 3 frames |
| **Loading Dolphin** — dolphin arc swimming in a circle | Any loading spinner replacement | Rotate the arc smoothly |
| **Clapping Dolphin** — 4 frames, dolphin leaping and clapping | Celebration moments (streak, session complete) | Play once on event; emit small bubbles simultaneously |

### Bubble
A large dark sphere with a bright specular highlight dot — used as an interactive element
(e.g. the breathing exercise bubble). Smaller bubbles appear when the Clapping Dolphin animates.
Never use the bubble as a decorative background element; it always has a functional meaning.

---

## 2. Colour System

**All colours must come from `frontend/src/theme/index.js`. Never hardcode hex values in screen files.**

### Core Palette

| Token | Hex | Use |
|---|---|---|
| `colors.bgDark` | `#1C4047` | Primary background for all main app screens |
| `colors.bgDeep` | `#0A1618` | Gradient end / deepest dark |
| `colors.bgSession` | `#243E44` | Assessment and check-in screens |
| `colors.bgLight` | `#E0ECDE` | Onboarding form screens (light mint) |
| `colors.orange` | `#FFA940` | **The one orange.** CTAs, streaks, recording state, progress fills, section headings |
| `colors.green` | `#48D28C` | Success, waveform bars, positive tier changes |
| `colors.red` | `#E05252` | Errors, destructive actions only |
| `colors.mint` | `#C3DECE` | Accent labels on dark backgrounds |
| `colors.white` | `#FFFFFF` | All text on dark backgrounds, icons |
| `colors.surface` | `#2D6974` | Card surface on dark |
| `colors.surfaceSubtle` | `rgba(255,255,255,0.07)` | Ghost card / panel |

### Screen Background Gradients

Every screen uses one of the defined gradients — never a flat colour except where stated.

| Gradient token | Screens |
|---|---|
| `colors.gradients.darkApp` | Home, Settings, Progress, HomeScreen header |
| `colors.gradients.auth` | SignUp, SignIn, SetupPermissions |
| `colors.gradients.lightForm` | SetupAboutYou (light mint) |
| `colors.gradients.speech` | SpeechEnhancement, VocalTraining header panel |
| `colors.gradients.session` | Assessment, Check-in | --> dont make this different bg, same as other vocal training screens 
| `colors.gradients.instruction` | Exercise instruction slides |
| `colors.gradients.ready` | Ready countdown (SustainedPhonation) | --> This should not be a separate bg, make it the same as another

### Text Opacity Tiers

On dark backgrounds, white text uses opacity to create hierarchy — never use grey text:

| Role | Value | Use |
|---|---|---|
| Primary text | `rgba(255,255,255,1.0)` = `colors.white` | Headings, button labels, key values |
| Secondary text | `rgba(255,255,255,0.60)` = `colors.textSecondary` | Subtitles, body copy |
| Faint / hint text | `rgba(255,255,255,0.38)` = `colors.textFaint` | Placeholders, captions — **minimum opacity** |

**Never go below 0.38 opacity for any visible text.** The WCAG 2.1 AA floor on the dark teal
backgrounds is ~0.50 for secondary copy; use 0.60 as the safe default for anything the user
should actually read.

### The One Orange Rule
`#FFA940` is the **only orange** in the entire app. If something needs emphasis or energy,
use this orange. Do not introduce any other orange, amber, or yellow tone.

---

## 3. Typography

**Font family: Kulim Park Bold for display/heading text. System sans-serif for body.**
All sizes are fixed px values defined in `type` export from `frontend/src/theme/index.js`.

### Type Scale

| Token | Size | Weight | Use |
|---|---|---|---|
| `type.score` | 128px | 900 | Hero numbers: scores, countdown timers |
| `type.display` | 56px | 800 | Screen-defining impact text ("THINK LOUD", exercise titles) |
| `type.h1` | 38px | 800 | Page titles (max 2 lines) |
| `type.h2` | 32px | 800 | Section headings |
| `type.h3` | 24px | 700 | Sub-section headings |
| `type.h4` | 20px | 700 | Card titles, field labels |
| `type.bodyLg` | 18px | 400 | Primary instruction text in exercises |
| `type.body` | 17px | 400 | Standard body copy |
| `type.bodySm` | 16px | 400 | Captions, secondary descriptions |
| `type.buttonLg` | 20px | 800 | Primary CTA labels |
| `type.button` | 18px | 700 | Standard button labels |
| `type.label` | 16px | 600 | Field labels, icon button glyphs |
| `type.caption` | 16px | 700 | Uppercase badges, eyebrow labels |
| `type.pill` | 16px | 800 | Pill/badge labels |
| `type.icon` | 20px | 500 | Icon button glyphs (arrow, ✕) |
| `type.iconLg` | 24px | 900 | Large icon button glyphs |

### Style Guide Mapping (from StyleGuide/Text.png)

| Style guide name | Maps to |
|---|---|
| "Headings" — 64px Kulim Park Bold White | Use `type.display` (56px) or `type.h1` (38px) |
| "Smaller Instructions" — 30/28px Kulim Park Bold White | Use `type.h2` (32px) or `type.h3` (24px) |
| "Section Headings" — uppercase orange | Use `type.caption` with `color: colors.orange`, `textTransform: 'uppercase'` |

### Hard Rules on Text
- **Minimum 16px for every piece of text in the app, no exceptions.**
- **Never multiply a font size by the SC scale factor** (`Dimensions.width / 402`). SC is for
  spacing and icon sizing only. Text must be fixed px so it stays readable on all screen sizes.
- **Never hardcode a font size in a screen file.** Always spread a `type.*` token.
- Line heights are defined in each `type.*` token — do not override them unless fixing a known
  rendering issue.

---

## 4. Spacing & Layout

### Grid
All spacing uses the 4-point grid exported as `space` from `theme/index.js`:

| Token | Value | Use |
|---|---|---|
| `space.xs` | 4px | Tight internal gaps (icon to label) |
| `space.sm` | 8px | Small gaps between related elements |
| `space.md` | 16px | Standard padding inside cards, between sections |
| `space.lg` | 24px | Section gaps, screen horizontal padding |
| `space.xl` | 32px | Large vertical gaps between major sections |
| `space.xxl` | 48px | Top/bottom screen breathing room |

### Screen Layout Principles

1. **One primary action per screen.** Every screen has one thing the user should do next.
   If a screen has two actions, one should be clearly primary (orange CTA) and one clearly
   secondary (ghost/text style).

2. **Primary action lives at the bottom, in the thumb zone.** On a ~402px wide device the
   bottom 120px is most reachable. Place the primary CTA there, above the safe area.

3. **Generous vertical breathing room.** Screens should never feel packed. Use `space.xl` or
   `space.xxl` between the hero visual and the first text block.

4. **Max 2 instruction sentences per screen.** If you need more than 2 sentences to explain
   what the user should do, the UX needs redesign, not more text.

5. **Respect safe areas.** Always use `SafeAreaView` or `useSafeAreaInsets` so content
   does not sit under the notch or home indicator.

---

## 5. Border Radius

All radii from `radius` export in `theme/index.js`:

| Token | Value | Use |
|---|---|---|
| `radius.sm` | 12px | Chips, small tags, input fields |
| `radius.md` | 16px | Standard cards (most surfaces) |
| `radius.lg` | 24px | Large cards, bottom sheet surfaces |
| `radius.xl` | 28px | Primary CTA buttons (pill shape) |
| `radius.full` | 999px | Perfect circles (icon buttons, avatar) |

---

## 6. Buttons

Every button type is defined below. Use the exact spec — do not improvise new button styles.

### Primary CTA Button (spread `ui.primaryBtn`)
```
Background:     #FFA940 (colors.orange)
PaddingVertical: 20px  →  resulting height ~58px
BorderRadius:   28px (pill)
Width:          100% of container (full-width)
Text style:     type.buttonLg (20px, weight 800)
Text colour:    colors.white
Shadow:         orange, offset (0,6), opacity 0.35, radius 12, elevation 8
```
Use for: the one main action on a screen ("Begin", "Continue", "Start My Journey").

When the primary CTA is disabled (loading), show an `ActivityIndicator` in place of the label
and set `opacity: 0.55`. Never hide the button entirely during loading.

### Secondary / Ghost CTA Button
```
Background:     transparent
BorderWidth:    1.5
BorderColor:    rgba(255,255,255,0.30)
PaddingVertical: 20px
BorderRadius:   28px
Text style:     type.button (18px, weight 700)
Text colour:    colors.white
```
Use for: "Skip", "Not now", "Back to Home" — actions that are valid but not encouraged.

### Icon Buttons — Ghost (spread `ui.ghostBtn`)
```
Size:           56 × 56px (fixed, never SC-scaled)
BorderRadius:   28px (circle)
Background:     rgba(255,255,255,0.10)
BorderWidth:    1.5
BorderColor:    rgba(255,255,255,0.20)
Icon:           type.icon or type.iconLg, color white
```
Use for: back arrow ←, close ✕, navigation icons (Settings gear, Home house, Progress trophy).

### Icon Buttons — Orange (spread `ui.orangeBtn`)
```
Size:           56 × 56px (fixed)
BorderRadius:   28px (circle)
Background:     #FFA940
Icon glyph:     dark (#1A1A1A), NOT white — white on orange fails WCAG AA (1.9:1 contrast)
Shadow:         orange, offset (0,4), opacity 0.45, radius 10, elevation 8
```
Use for: Help button (?) only. The orange icon button is always the "get help" affordance.

### Skip / Redo Pill Buttons
```
Background:     #FFA940 (orange)
BorderRadius:   radius.full
PaddingHorizontal: 14px
PaddingVertical:   8px
Text style:     type.label (16px, weight 600)
Text colour:    #1A1A1A (dark) — NOT white (white on orange fails contrast)
Icon:           skip ⏭ or redo ↺, same dark colour
```

### Recording Button (microphone)
```
Idle state:     Background colors.surface (#2D6974), white mic icon
Active state:   Background #FFA940, white mic icon
Size:           At least 72 × 72px (larger target for tremor users)
BorderRadius:   radius.full (circle)
Label below:    "Tap to record" (idle) / "Recording… tap to stop" (active), type.body
```
The state change must be visually unmistakable — colour flip from teal to orange is the signal.

### Page Pop-up / Feedback Card (inline feedback, not modal)
```
Background:     colors.surface or surfaceMid
BorderRadius:   radius.md (16px)
BorderColor:    colors.border (mint @ 18%)
Padding:        space.md
Message text:   type.h3 or h4, colours.white
Arrow button:   ghost circle (ui.ghostBtn) with → icon
```
Use for: exercise feedback ("Doesn't sound correct. Give it another try!").
Copy must be warm and non-blaming — see Section 11 (Copy Rules).

### Play / Share / Action Buttons (orange square with icon)
```
Background:     #FFA940
BorderRadius:   radius.md (16px)
Size:           At least 64 × 64px
Icon:           white ▶ or ↑ etc.
Shadow:         orange shadow
```
Use for: play recorded audio, share results.

### Social Auth Buttons (Apple / Google)
```
Background:     colors.white
BorderRadius:   radius.md (16px)
BorderColor:    rgba(0,0,0,0.12)
PaddingVertical: 16px
Text:           type.button, dark text
Icon:           Apple  or Google G, left-aligned
```
Full-width, stacked vertically with space.sm between them.

### Input Fields
```
Background:     colors.white (or rgba(255,255,255,0.12) on dark bg)
BorderRadius:   radius.sm (12px)
BorderColor:    transparent (or rgba(255,255,255,0.20) on dark)
PaddingVertical: 16px
PaddingHorizontal: 16px
Text:           type.body, dark on white / white on dark
Placeholder:    colors.textFaint
Height:         min 52px
```

---

## 7. Exercise-Specific Visuals

These components appear only within the VocalTrainingSession flow.

### Vocal Measurement Bar
```
Track background:  colors.surface (#2D6974)
Active fill:       #FFA940 (orange) — shows the user's current output
Target zone:       white or mint semi-transparent segment showing the goal
Height:            12–16px
BorderRadius:      radius.full
```
The user's fill grows left-to-right. The target zone is a fixed overlay. This is the primary
real-time feedback element — keep it large and the orange vs background contrast very clear.

### Progress Dots (steps within an exercise)
```
Inactive dot:  rgba(255,255,255,0.30), diameter 10px
Active dot:    #FFA940, diameter 12px (slightly larger)
Spacing:       space.sm between dots
Text below:    "Step X of Y", type.bodySm, colors.textSecondary
```

### Session Progress Bar (bottom of screen, across all exercises)
```
Track:   ui.progressTrack (height 8, rounded, rgba white 12%)
Fill:    ui.progressFill (#FFA940)
Position: pinned to bottom of screen, above safe area
```
This bar fills across the whole session (not per-exercise). It is the only progress indicator
that does NOT show numbers — pure visual momentum.

### Exercise Icons (from StyleGuide/Visuals.png)
Each exercise type has a fixed icon. Do not substitute or replace these:

| Exercise | Icon description |
|---|---|
| Loudness Drills / Voice Power | Jellyfish sitting on a dark circular platform |
| Pitch Glides | Dolphin swimming through a green circle ring |
| Sustained Phonation / Sustained Sound | Green bar chart (3 tall bars) |
| Functional Speech / Everyday Speech | Two speech bubble chat icons |
| Breathing | Dark bubble (sphere) with a digital countdown timer inside |

### Feature Icons (for HomeScreen cards etc.)
| Feature | Icon |
|---|---|
| Instant Speech / Speech Enhancement | AI microphone (mic with sparkle star) |
| Vocal Training | Waveform bars (4 vertical bars of varying height) |

---

## 8. Touch Targets & Motor Accessibility

*Users may have tremor, reduced grip, or fatigue. Every interactive element must be easy to hit.*

### Minimum Sizes (non-negotiable)
| Element | Minimum size |
|---|---|
| All primary CTA buttons | 56px height (achieved by `paddingVertical: 20`) |
| All icon buttons (close, back, help) | 56 × 56px fixed |
| Recording button | 72 × 72px or larger |
| Input fields | 52px height |
| Pill/chip buttons (Skip, Redo) | 44px height minimum |

### Tap Zone Expansion
When a button is visually small (e.g. a text link), wrap it in a `TouchableOpacity` with
`hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}` to expand the tap zone without
changing the visual layout.

### Spacing Between Targets
Never place two tappable elements closer than 8px apart. If two buttons are adjacent (e.g.
Skip and Continue), use at least 12px between them, and make the secondary button clearly
smaller or less prominent so accidental taps land on the safer choice.

### Scroll vs Fixed
- **Primary CTA always fixed at the bottom** — never inside a scrollable list where the user
  might miss it or have to scroll to find it.
- **Content scrolls, action buttons do not.**

---

## 9. Accessibility Properties

Every interactive element needs the following React Native accessibility props:

```js
// Minimum on all Touchables
accessibilityRole="button"          // or "checkbox", "image", etc.
accessibilityLabel="Descriptive label here"  // what a screen reader says

// For state-bearing elements (toggles, recording)
accessibilityState={{ selected: isRecording }}

// For images / decorative icons
accessible={true}
accessibilityRole="image"
accessibilityLabel="Brief description of what the image shows"

// For purely decorative graphics (no information)
accessible={false}
importantForAccessibility="no-hide-descendants"
```

### Screen Reader Copy Rules
- `accessibilityLabel` must describe the action, not the icon. "Back" not "Arrow". "Close session" not "X button".
- For score displays, include the value: `accessibilityLabel="Voice Power score: 72 out of 100"`.
- For progress indicators: `accessibilityLabel="Step 2 of 3"`.

---

## 10. Loading & Error States

### Loading States
Every loading state must have both a visual indicator AND a text label.
An `ActivityIndicator` alone is not acceptable for this user group.

| Situation | Visual | Text |
|---|---|---|
| Voice cloning / setup | Swimming dolphin animation | "Setting up your voice…" |
| Saving data | `ActivityIndicator` | "Saving your plan…" |
| Speech enhancement | `ActivityIndicator` | "Polishing your words…" |
| Voice analysis | `ActivityIndicator` | "Analysing your voice…" |
| General network | Swimming dolphin or spinner | "Just a moment…" |

Text style: `type.body`, `colors.textSecondary`, centred below the visual.

### Error States
**Never imply the user did something wrong.** Frame all errors as a system or network issue.

| Situation | Message (exact copy to use) |
|---|---|
| No speech detected | "Nothing heard — tap again when you're ready." |
| Network failure | "Couldn't connect right now. Check your connection and try again." |
| Playback error | "Could not play the audio." |
| Microphone unavailable | "Microphone unavailable. You can skip this exercise." |
| Unknown error | "Something didn't work. Please try again." |

After the error message, always provide:
1. A primary action button: "Try again" or "Skip" (whichever is appropriate)
2. A secondary ghost button: "Go back" if retrying is not useful

Never show a raw JavaScript error, stack trace, or HTTP status code to the user.

---

## 11. Copy & Tone Rules

### Plain Language (No Clinical Jargon)
| Never write | Use instead |
|---|---|
| Sustained Phonation | Sustained Sound |
| Loudness Drills | Voice Power |
| Functional Speech | Everyday Speech |
| Tailored Exercise | Your Exercise |
| Expression (score) | Pitch Variety |
| Fluency (score) | Speech Rhythm |
| F0 / fundamental frequency | (never shown to user) |

### Warmth Rules
- Write as a supportive coach, not a medical app.
- Short sentences. Active voice. No corporate filler.
- Use the user's first name where available (AsyncStorage `name` field).
- Scores always appear *after* narrative framing, never cold.

### Motivational Message Bank
After-exercise messages (cycle through, do not repeat consecutively):
> "Nicely done." / "That's the one." / "Your voice carried that." / "Well done." / "Keep going."

Session complete:
> "One session stronger."

Midpoint rest card:
> "Breathe. You're doing great."

Home screen greeting (returning user):
> "Good to see you. Your voice is ready when you are."

Home screen greeting (first ever):
> "Welcome. Your voice journey starts here."

Assessment result:
> "That's your starting point. From here, every session moves it."

### Score Framing (Check-in Screen)
- **Improved:** "You improved!" → then show scores
- **Flat or declined:** "Keep going!" → "Consistency is what counts. Your voice is being strengthened with every session." → then show scores
- Scores appear as visual arcs, never as bare numbers alone.

### Session Exit Warning
> "Leave session? Your progress won't be saved."
Options: **Stay** (primary, orange) and **Leave** (ghost, white).

---

## 12. Session Flow & Cognitive Load

### The 8-Exercise Session Order (do not reorder)
1. Breathing — calming reset, no score, auto-advances on its own timer
2. Sustained Sound — voice warmup with tier targets
3. Pitch Glides — pitch range with visual hoop
4. Voice Power — loudness with visual level bar
5. **Midpoint rest card** — "Breathe. You're doing great."
6. Breathing — second reset (clinically: after every 3 exercises)
7. Your Exercise — adaptive, user's weakest area
8. Everyday Speech — sentence reading

### Anti-Pressure Design
- **No countdown timers visible to the user** during exercises
- Progress indicators say "Round 2 of 5" (where you are), never "3 remaining" (urgency)
- The orange progress bar fills silently — no numbers, just visual momentum
- Auto-advance after exercises (1.5s warm message shown, no "Continue" tap required)
- Breathing exercise auto-advances on its own — the user does nothing

### Session Exit Protection
Any user-initiated back gesture mid-session must trigger the "Leave session?" confirmation.
Implement via `navigation.addListener('beforeRemove')` — only fire on POP/GO_BACK actions,
not on programmatic navigation (REPLACE/RESET) so session completion still works.

---

## 13. Animation Guidelines

### What to Animate (and how)
| Element | Animation type | Duration |
|---|---|---|
| Screen transitions | Default React Navigation stack slide | Standard (350ms) |
| Button press feedback | `activeOpacity={0.75}` on TouchableOpacity | Native |
| Dolphin loading | Rotation/swim loop | 1200–1500ms loop |
| Clapping dolphin | Frame sequence + bubble pop | ~600ms total |
| Exercise complete message | Fade in → hold 1500ms → auto-advance | 300ms fade |
| Progress bar fill | Animated.timing, linear | 400–600ms |
| Recording button state change | Immediate colour swap (no fade) | 0ms |

### What NOT to Animate
- Do not animate text colour or text size — it causes visual confusion
- Do not use spring physics on functional UI elements (navigation, buttons)
- Do not loop animations that the user has no way to stop — respect system "reduce motion" setting

### Reduce Motion
If `AccessibilityInfo.isReduceMotionEnabled()` returns true, disable all looping animations
and swap any motion-heavy transitions for a simple fade. Static dolphin image replaces the
swimming animation.

---

## 14. New Screen Checklist

Before submitting any new or edited screen for review, verify every item:

**Colour & Theme**
- [ ] Background uses a gradient from `colors.gradients.*` (no flat colours except `bgDark`)
- [ ] All colours reference `colors.*` tokens, no hardcoded hex values
- [ ] Secondary text uses `colors.textSecondary` (0.60), faint text uses `colors.textFaint` (0.38)
- [ ] Orange is used only as `#FFA940` (`colors.orange`)

**Typography**
- [ ] Every text element uses a `type.*` spread from theme — no hardcoded font sizes
- [ ] Smallest text on screen is ≥ 16px
- [ ] No font size is multiplied by SC scale factor

**Spacing**
- [ ] All padding/margin values use `space.*` tokens
- [ ] Screen horizontal padding is at least `space.lg` (24px)

**Buttons & Touch Targets**
- [ ] Primary CTA uses `ui.primaryBtn` spread, full-width, at bottom of screen
- [ ] All icon buttons are 56×56 using `ui.ghostBtn` or `ui.orangeBtn`
- [ ] No touch target is smaller than 44px in either dimension
- [ ] CTA button is disabled (not hidden) during loading states

**Copy**
- [ ] No clinical jargon anywhere on screen
- [ ] No more than 2 instruction sentences
- [ ] All error messages are non-blaming
- [ ] Tone is warm and human, not corporate or clinical

**Accessibility**
- [ ] Every `TouchableOpacity` / `Pressable` has `accessibilityRole` and `accessibilityLabel`
- [ ] Images have `accessibilityRole="image"` and a descriptive `accessibilityLabel`
- [ ] Purely decorative elements have `accessible={false}`
- [ ] Loading state has both a visual indicator AND text

**Layout**
- [ ] One primary action per screen
- [ ] Safe areas respected (`SafeAreaView` or `useSafeAreaInsets`)
- [ ] Primary CTA is fixed at bottom, not inside a scroll view

---

## 15. Things That Are Banned

These specific patterns have caused bugs, contrast failures, or accessibility violations in
previous sessions. Never use them:

| Banned | Reason | Use instead |
|---|---|---|
| White text on `#FFA940` orange | Contrast ratio 1.9:1 — fails WCAG AA | Use `#1A1A1A` on orange |
| `fontSize: someValue * SC` | Breaks minimum text size on small screens | Fixed px via `type.*` |
| Hardcoded hex colours in screens | Breaks consistency when palette updates | `colors.*` tokens |
| Opacity < 0.38 on visible text | Fails contrast against dark teal backgrounds | Use `textFaint` (0.38) as absolute floor |
| `'#1C4047'` as a dot/progress colour on dark bg | Almost invisible on teal900 background | Use white with opacity |
| Countdown timer shown to user | Creates time pressure / anxiety | Progress indicator without countdown |
| Clinical terms in UI copy | Confusing and alienating for target users | Plain language equivalents (see Section 11) |
| `ActivityIndicator` alone (no text) | Insufficient feedback for cognitive accessibility | Spinner + text label |
| New custom colours not in theme | Breaks colour consistency | Add to theme/index.js first, then use |
| Two equally weighted primary buttons | Confuses decision-making | One orange CTA, one ghost secondary |
