/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#0f172a',
    tint: '#2a9d8f',

    // Core surfaces
    background: '#f8fafc',
    foreground: '#0f172a',

    // Cards / elevated surfaces
    card: '#ffffff',
    cardForeground: '#0f172a',

    // Primary action color (buttons, links, active states)
    primary: '#2a9d8f',
    primaryForeground: '#242424',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#e9edf1',
    secondaryForeground: '#0f172a',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#f1f4f7',
    mutedForeground: '#64748b',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#e5f7f5',
    accentForeground: '#2a665f',

    // Destructive actions (delete, error states)
    destructive: '#dc2626',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#e2e8f0',
    input: '#e2e8f0',
  },
  dark: {
    text: '#f1f5f9',
    tint: '#2a9d8f',
    background: '#080e1d',
    foreground: '#f1f5f9',
    card: '#0d1628',
    cardForeground: '#f1f5f9',
    primary: '#2a9d8f',
    primaryForeground: '#242424',
    secondary: '#182135',
    secondaryForeground: '#e2e8f0',
    muted: '#141d30',
    mutedForeground: '#7c8ba1',
    accent: '#142d2b',
    accentForeground: '#54b9ad',
    destructive: '#ba3030',
    destructiveForeground: '#ffffff',
    border: '#202c42',
    input: '#202c42',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 10,
};

export default colors;
