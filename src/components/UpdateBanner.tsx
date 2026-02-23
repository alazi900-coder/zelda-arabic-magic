import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    // Listen for SW update events from vite-plugin-pwa
    const handleSWUpdate = () => setShowUpdate(true);

    // Check if there's a waiting service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          setShowUpdate(true);
        }
        reg?.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          newSW?.addEventListener("statechange", () => {
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              setShowUpdate(true);
            }
          });
        });
      });

      // Also listen for controllerchange to auto-reload
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    // Periodic check every 5 minutes
    const interval = setInterval(() => {
      navigator.serviceWorker?.getRegistration().then((reg) => reg?.update());
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const handleUpdate = () => {
    setUpdating(true);
    navigator.serviceWorker?.getRegistration().then((reg) => {
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      } else {
        // No waiting SW, just hard reload
        window.location.reload();
      }
    });
  };

  if (!showUpdate) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-gradient-to-l from-emerald-600 to-teal-700 text-white py-2.5 px-4 flex items-center justify-center gap-4 shadow-xl animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold">🎉 تحديث جديد!</span>
        <span className="text-xs opacity-90">تحسينات في الأداء وإصلاح أخطاء</span>
      </div>
      <Button
        size="sm"
        onClick={handleUpdate}
        disabled={updating}
        className="gap-1.5 h-7 text-xs bg-white/20 hover:bg-white/30 text-white border-white/30 border"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${updating ? "animate-spin" : ""}`} />
        {updating ? "جارٍ التحديث..." : "تحديث الآن"}
      </Button>
    </div>
  );
}
