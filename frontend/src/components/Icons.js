/**
 * Icons — shared SVG icon components used throughout the app.
 *
 * All icons are drawn with react-native-svg so they scale cleanly at any
 * size and can be tinted with a `color` prop.  Stroke-only icons use
 * strokeLinecap/strokeLinejoin="round" for a consistent soft look.
 *
 * Usage:
 *   import { MicIcon, StarIcon } from '../components/Icons';
 *   <MicIcon size={24} color="#FFFFFF" />
 *
 * PNG replacements: swap the relevant icon component once the PNG assets
 * are provided.  Only the component needs updating — all call-sites stay the
 * same.
 */
import React from 'react';
import Svg, { Path, Rect, Circle, Polygon } from 'react-native-svg';

// ── Microphone ─────────────────────────────────────────────────────────────────
// Matches the DailyVoiceNote mic style: wide pill capsule body, U-shaped arc,
// thin stem. No horizontal base line at bottom.
export function MicIcon({ size = 24, color = '#FFFFFF' }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      {/* Capsule body — pill shape (rx = half width) gives a more rounded look */}
      <Rect x="7.5" y="1" width="9" height="13" rx="4.5" fill={color} />
      {/* U-shaped stand arc — stroke only, no fill, no top edge */}
      <Path
        d="M4.5 13a7.5 7.5 0 0 0 15 0"
        stroke={color} strokeWidth="2" strokeLinecap="round"
      />
      {/* Thin vertical stem below the arc */}
      <Path d="M12 20.5v3" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// ── Speaker / volume (🔊) ─────────────────────────────────────────────────────
export function SpeakerIcon({ size = 24, color = '#FFFFFF' }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      {/* Cone */}
      <Path d="M11 5L6 9H2v6h4l5 4V5z" fill={color} />
      {/* Inner wave */}
      <Path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Outer wave */}
      <Path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// ── Stop square (used for recording-active state) ──────────────────────────────
export function StopIcon({ size = 24, color = '#FFFFFF' }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Rect x="5" y="5" width="14" height="14" rx="2" fill={color} />
    </Svg>
  );
}

// ── Lock ───────────────────────────────────────────────────────────────────────
export function LockIcon({ size = 24, color = '#FFFFFF' }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      {/* Shackle */}
      <Path
        d="M8 11V7a4 4 0 0 1 8 0v4"
        stroke={color} strokeWidth="2" strokeLinecap="round"
      />
      {/* Body */}
      <Rect x="4" y="11" width="16" height="11" rx="2.5" fill={color} />
      {/* Keyhole */}
      <Circle cx="12" cy="16.5" r="1.5" fill="rgba(0,0,0,0.35)" />
    </Svg>
  );
}

// ── Trash / delete ─────────────────────────────────────────────────────────────
export function TrashIcon({ size = 24, color = '#FFFFFF' }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      {/* Lid */}
      <Path d="M3 6h18" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Handle */}
      <Path d="M8 6V4h8v2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Can body */}
      <Path
        d="M19 6l-1.4 14a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L5 6"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Inner lines */}
      <Path d="M10 11v6M14 11v6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// ── Lightning bolt (⚡) ────────────────────────────────────────────────────────
export function LightningIcon({ size = 24, color = '#FFFFFF' }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Polygon points="13,2 4,14 12,14 11,22 20,10 12,10" fill={color} />
    </Svg>
  );
}

// ── Upward chart / progress (📈) ───────────────────────────────────────────────
export function ChartIcon({ size = 24, color = '#FFFFFF' }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      {/* Trend line */}
      <Path
        d="M3 17l5-5 4 4 5-6 4-3"
        stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Axes */}
      <Path d="M3 3v18h18" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// ── Megaphone / speaker (📢) ───────────────────────────────────────────────────
export function MegaphoneIcon({ size = 24, color = '#FFFFFF' }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      {/* Cone body */}
      <Path
        d="M18 3l-7 5H5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6l7 5V3z"
        fill={color}
      />
      {/* Sound waves */}
      <Path d="M21 7a7 7 0 0 1 0 10" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// ── Music note (🎵) ────────────────────────────────────────────────────────────
export function MusicIcon({ size = 24, color = '#FFFFFF' }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      {/* Stem + flag */}
      <Path d="M9 18V5l12-2v13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Bottom note head */}
      <Circle cx="6" cy="18" r="3" fill={color} />
      {/* Top note head */}
      <Circle cx="18" cy="16" r="3" fill={color} />
    </Svg>
  );
}

// ── Speaking person (🗣️) ──────────────────────────────────────────────────────
export function SpeakingIcon({ size = 24, color = '#FFFFFF' }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      {/* Head */}
      <Circle cx="9" cy="6" r="3" fill={color} />
      {/* Body */}
      <Path d="M3 20c0-4 2.7-6 6-6s6 2 6 6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Speech waves */}
      <Path d="M17 9a3 3 0 0 1 0 6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M20 6.5a7 7 0 0 1 0 11" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// ── Star (🌟) ──────────────────────────────────────────────────────────────────
export function StarIcon({ size = 24, color = '#FFFFFF' }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Polygon
        points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
        fill={color}
      />
    </Svg>
  );
}

// ── Trophy (🏆) — wraps the existing TrophyIcon.png asset ─────────────────────
// Drawn as SVG until the PNG is wired; replace this export with an Image when ready.
export function TrophyIcon({ size = 24, color = '#FFFFFF' }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      {/* Cup body */}
      <Path
        d="M8 21h8M12 17v4M7 4H4a2 2 0 0 0-2 2v2a4 4 0 0 0 4 4M17 4h3a2 2 0 0 1 2 2v2a4 4 0 0 1-4 4"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Main body */}
      <Path
        d="M7 4h10a1 1 0 0 1 1 1v8a6 6 0 0 1-12 0V5a1 1 0 0 1 1-1z"
        fill={color}
      />
    </Svg>
  );
}

// ── Clipboard / copy (📋) ─────────────────────────────────────────────────────
export function ClipboardIcon({ size = 24, color = '#FFFFFF' }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      {/* Page */}
      <Rect x="5" y="4" width="14" height="17" rx="2" stroke={color} strokeWidth="2" />
      {/* Clip top */}
      <Path d="M9 4V2h6v2" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Lines */}
      <Path d="M9 12h6M9 16h4" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

// ── Fire (🔥) — wraps FireIcon.png intent; SVG stand-in ──────────────────────
export function FireIcon({ size = 24, color = '#FFA940' }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2C6.48 2 3 7 3 12c0 3.9 2.1 7.4 5.6 9.1-.4-1.2-.3-2.8.6-4 .8 1.1 1.8 1.9 2.8 2 0-2.5 1.5-5 3-6.5-.2 1.2.1 2.5.8 3.5C18 14.6 18 12 16.5 10c1.3 1 2 2.5 2 4 1.5-1.5 2.5-3.8 2.5-6C21 4.5 17.5 2 12 2z"
        fill={color}
      />
    </Svg>
  );
}
