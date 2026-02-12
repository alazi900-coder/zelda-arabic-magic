import { useEffect, useState } from "react";
import { getSyncManager, type SyncStatus } from "@/lib/offline-sync";
import { Cloud, CloudOff, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export function OfflineSyncStatus() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    status: "online",
    message: "",
  });

  useEffect(() => {
    const manager = getSyncManager();
    const unsubscribe = manager.subscribe(setSyncStatus);

    // Set initial status
    if (!manager.isOnlineStatus()) {
      setSyncStatus({ status: "offline", message: "بدون اتصال بالإنترنت" });
    }

    return () => {
      unsubscribe();
    };
  }, []);

  const getIcon = () => {
    switch (syncStatus.status) {
      case "offline":
        return <CloudOff className="w-4 h-4" />;
      case "syncing":
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case "error":
        return <AlertCircle className="w-4 h-4" />;
      case "synced":
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return <Cloud className="w-4 h-4" />;
    }
  };

  const getColorClass = () => {
    switch (syncStatus.status) {
      case "offline":
        return "bg-orange-900/20 text-orange-200 border-orange-700";
      case "syncing":
        return "bg-blue-900/20 text-blue-200 border-blue-700";
      case "error":
        return "bg-red-900/20 text-red-200 border-red-700";
      case "synced":
        return "bg-green-900/20 text-green-200 border-green-700";
      default:
        return "bg-gray-800 text-gray-200 border-gray-700";
    }
  };

  if (syncStatus.status === "online" && syncStatus.message === "") {
    return null;
  }

  return (
    <div
      className={`fixed bottom-4 right-4 flex items-center gap-2 px-4 py-3 rounded-lg border ${getColorClass()} font-body text-sm backdrop-blur-sm`}
    >
      {getIcon()}
      <span>{syncStatus.message}</span>
    </div>
  );
}
