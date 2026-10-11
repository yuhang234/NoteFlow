import * as React from "react";
import { useUIStore, Theme } from "@/stores/ui-store";

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { theme, setTheme } = useUIStore();

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark", "paper");
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "paper") {
      root.classList.add("paper");
    }
  }, [theme]);

  return <>{children}</>;
}
