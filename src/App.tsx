import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";

import Index from "./pages/Index";
import Process from "./pages/Process";
import Results from "./pages/Results";
import Editor from "./pages/Editor";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Install from "./pages/Install";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        
        <BrowserRouter>
          <ErrorBoundary fallbackTitle="حدث خطأ في التطبيق">
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/process" element={<ErrorBoundary fallbackTitle="خطأ في المعالجة"><Process /></ErrorBoundary>} />
              <Route path="/results" element={<ErrorBoundary fallbackTitle="خطأ في النتائج"><Results /></ErrorBoundary>} />
              <Route path="/editor" element={<ErrorBoundary fallbackTitle="خطأ في المحرر"><Editor /></ErrorBoundary>} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/install" element={<Install />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
