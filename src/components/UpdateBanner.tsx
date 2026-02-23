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
    <div className="fixed top-0 inset-x-0 z-[100] bg-primary text-primary-foreground py-2 px-4 flex items-center justify-center gap-3 shadow-lg animate-in slide-in-from-top duration-300">
      <span className="text-sm font-medium">يتوفر تحديث جديد!</span>
      <Button
        size="sm"
        variant="secondary"
        onClick={handleUpdate}
        disabled={updating}
        className="gap-1.5 h-7 text-xs"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${updating ? "animate-spin" : ""}`} />
        {updating ? "جارٍ التحديث..." : "تحديث الآن"}
      </Button>
    </div>
  );
}
