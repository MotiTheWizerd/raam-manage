"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function ThemeToggle({ initialIsDark = false }: { initialIsDark?: boolean }) {
  const [isDark, setIsDark] = useState(initialIsDark);

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    const val = next ? "dark" : "light";
    localStorage.setItem("theme", val);
    document.cookie = `theme=${val}; path=/; max-age=31536000; SameSite=lax`;
    setIsDark(next);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="החלף מצב כהה/בהיר"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  );
}
