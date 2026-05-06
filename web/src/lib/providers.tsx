"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "./auth/context";
import { ThemeCustomizerProvider } from "./theme/context";
import { SidebarConfigProvider } from "./sidebar/context";
import { PreferencesSyncer } from "./preferences-syncer";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeCustomizerProvider>
        <SidebarConfigProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              {/* Syncs theme + sidebar to/from user.preferences in DB */}
              <PreferencesSyncer />
              {children}
            </AuthProvider>
          </QueryClientProvider>
        </SidebarConfigProvider>
      </ThemeCustomizerProvider>
    </ThemeProvider>
  );
}
