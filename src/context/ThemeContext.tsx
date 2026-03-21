import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ThemeDefinition, ThemeColors } from '../types';
import { themes } from '../themes';
import { getSetting, saveSetting } from '../db';

interface ThemeContextType {
  theme: ThemeDefinition;
  setThemeById: (id: string) => void;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: themes[0],
  setThemeById: () => {},
  colors: themes[0].colors,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeDefinition>(themes[0]);

  useEffect(() => {
    getSetting('themeId').then((id) => {
      if (id) {
        const found = themes.find((t) => t.id === id);
        if (found) setTheme(found);
      }
    });
  }, []);

  const setThemeById = (id: string) => {
    const found = themes.find((t) => t.id === id);
    if (found) {
      setTheme(found);
      saveSetting('themeId', id);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setThemeById, colors: theme.colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}