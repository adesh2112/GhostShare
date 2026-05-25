import { create } from "zustand";
import { ChunkUploadManager, UploadProgress, UploadOptions } from "@/utils/uploadManager";

interface UploadState {
  file: File | null;
  status: "idle" | "initiating" | "uploading" | "paused" | "completing" | "completed" | "error";
  progress: UploadProgress | null;
  errorMsg: string | null;
  publicId: string | null;
  deleteToken: string | null;
  manager: ChunkUploadManager | null;

  // Actions
  startUpload: (file: File, options: Omit<UploadOptions, "filename" | "mimeType" | "fileSize">) => void;
  pauseUpload: () => void;
  resumeUpload: () => void;
  cancelUpload: () => void;
  resetUpload: () => void;
}

export const useUploadStore = create<UploadState>((set, get) => ({
  file: null,
  status: "idle",
  progress: null,
  errorMsg: null,
  publicId: null,
  deleteToken: null,
  manager: null,

  startUpload: (file, options) => {
    // Abort previous manager if exists
    const currentManager = get().manager;
    if (currentManager) {
      currentManager.abort();
    }

    const manager = new ChunkUploadManager(file, options);

    // Setup callbacks
    manager.onStatusChange = (status) => {
      set({ status });
    };

    manager.onProgress = (progress) => {
      set({ progress });
    };

    manager.onError = (err) => {
      set({ errorMsg: err.message, status: "error" });
    };

    manager.onCompleted = (publicId, deleteToken) => {
      set({ publicId, deleteToken, status: "completed" });
    };

    set({
      file,
      manager,
      progress: null,
      errorMsg: null,
      publicId: null,
      deleteToken: null,
      status: "initiating",
    });

    manager.start();
  },

  pauseUpload: () => {
    const { manager, status } = get();
    if (manager && status === "uploading") {
      manager.pause();
    }
  },

  resumeUpload: () => {
    const { manager, status } = get();
    if (manager && status === "paused") {
      manager.resume();
    }
  },

  cancelUpload: () => {
    const { manager } = get();
    if (manager) {
      manager.abort();
    }
    set({
      file: null,
      manager: null,
      progress: null,
      errorMsg: null,
      publicId: null,
      deleteToken: null,
      status: "idle",
    });
  },

  resetUpload: () => {
    set({
      file: null,
      manager: null,
      progress: null,
      errorMsg: null,
      publicId: null,
      deleteToken: null,
      status: "idle",
    });
  },
}));
