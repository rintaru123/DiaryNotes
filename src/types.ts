export interface Note {
  id: string;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO string
  text: string;
  photo?: string; // base64 data URL
  audio?: string; // base64 data URL
}

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceHover: string;
  text: string;
  textSecondary: string;
  primary: string;
  primaryHover: string;
  primaryText: string;
  border: string;
  input: string;
  inputText: string;
  danger: string;
  dangerHover: string;
  shadow: string;
  modalOverlay: string;
  accent: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  emoji: string;
  colors: ThemeColors;
}