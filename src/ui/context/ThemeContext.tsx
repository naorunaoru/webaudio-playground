import { createContext, useContext, type ReactNode } from "react";
import {
  type ControlTheme,
  type ChromeColors,
  defaultTheme,
  chrome as defaultChrome,
} from "@ui/types/theme";

interface ThemeContextValue {
  theme: ControlTheme;
  chrome: ChromeColors;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: defaultTheme,
  chrome: defaultChrome,
});

export interface ThemeProviderProps {
  theme?: ControlTheme;
  chrome?: ChromeColors;
  children: ReactNode;
}

export function ThemeProvider({
  theme = defaultTheme,
  chrome = defaultChrome,
  children,
}: ThemeProviderProps) {
  return (
    <ThemeContext.Provider value={{ theme, chrome }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
