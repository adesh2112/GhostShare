"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileIcon,
  Clock,
  Download,
  Lock,
  Unlock,
  AlertTriangle,
  Play,
  Image as ImageIcon,
  FileText,
  Volume2,
  Video,
  Loader2,
} from "lucide-react";
import axios from "axios";
import { ChunkDownloadManager, DownloadProgress } from "@/utils/downloadManager";

interface FileMetadata {
  publicId: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  expiresAt: string;
  maxDownloads: number | null;
  currentDownloads: number;
  hasPassword: boolean;
  chunkCount: number;
}

interface ApiErrorResponse {
  error?: string;
}

export default function SharePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  // File states
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<FileMetadata | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  // Expiration Countdown
  const [timeLeft, setTimeLeft] = useState<string>("");

  // Password Unlock states
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [shake, setShake] = useState(false);

  // Download states
  const [downloadStatus, setDownloadStatus] = useState<
    "idle" | "fetching_meta" | "downloading" | "assembling" | "completed" | "error"
  >("idle");
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadManagerRef = useRef<ChunkDownloadManager | null>(null);

  // Preview states
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewTextContent, setPreviewTextContent] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Fetch metadata on mount
  useEffect(() => {
    if (!id) return;

    const fetchMetadata = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/api/share/${id}`);
        setMeta(response.data);
        // If password is not required, it is unlocked automatically
        if (!response.data.hasPassword) {
          setIsUnlocked(true);
        }
      } catch (err: unknown) {
        const msg =
          axios.isAxiosError<ApiErrorResponse>(err)
            ? err.response?.data?.error || "Failed to load share link"
            : "Failed to load share link";
        setErrorMsg(msg);
        if (axios.isAxiosError(err) && (err.response?.status === 410 || err.response?.status === 404)) {
          setIsExpired(true);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMetadata();
  }, [id]);

  // Expiration countdown effect
  useEffect(() => {
    if (!meta) return;

    const updateCountdown = () => {
      const difference = new Date(meta.expiresAt).getTime() - Date.now();
      if (difference <= 0) {
        setTimeLeft("Expired");
        setIsExpired(true);
        setErrorMsg("This file has expired and is no longer available");
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0) parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);

      setTimeLeft(parts.join(" "));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [meta]);

  // Handle password validation
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || isVerifying) return;

    try {
      setIsVerifying(true);
      setPwError(null);
      const response = await axios.post(`/api/share/${id}/verify`, { password });
      
      setToken(response.data.token);
      setIsUnlocked(true);
    } catch (err: unknown) {
      setShake(true);
      setTimeout(() => setShake(false), 4000);
      setPwError(
        axios.isAxiosError<ApiErrorResponse>(err)
          ? err.response?.data?.error || "Incorrect password"
          : "Incorrect password"
      );
    } finally {
      setIsVerifying(false);
    }
  };

  // Run File Download Pipeline
  const handleDownload = () => {
    if (!id || downloadStatus === "downloading" || downloadStatus === "assembling") return;

    setDownloadError(null);
    setDownloadProgress(null);
    const manager = new ChunkDownloadManager(id, token);
    downloadManagerRef.current = manager;

    manager.onStatusChange = (status) => {
      setDownloadStatus(status);
    };

    manager.onProgress = (progress) => {
      setDownloadProgress(progress);
    };

    manager.onError = (err) => {
      setDownloadError(err.message);
      setDownloadStatus("error");
    };

    manager.onCompleted = (blob, filename) => {
      // Create Object URL and trigger download in browser
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      // Refresh share details after download to update remaining counts
      setTimeout(async () => {
        try {
          const response = await axios.get(`/api/share/${id}`);
          setMeta(response.data);
        } catch {
          // If 410, it self-destructed on first download!
          setIsExpired(true);
          setErrorMsg("File self-destructed upon completion of download");
        }
      }, 3000);
    };

    manager.start();
  };

  // Run File Preview Pipeline (Downloads and loads small files directly in memory)
  const handleLoadPreview = async () => {
    if (!meta || loadingPreview || previewBlobUrl) return;

    try {
      setLoadingPreview(true);
      setPreviewError(null);

      // Download file in memory
      const response = await axios.get(`/api/download/${id}?token=${token}&preview=1`);
      const chunks: { index: number; downloadUrl: string }[] = response.data.chunks;

      // Ensure file isn't too large to preview directly in memory
      if (meta.fileSize > 50 * 1024 * 1024) {
        throw new Error("File is too large to preview in browser. Please download it directly.");
      }

      // Download all chunks
      const chunkBuffers: ArrayBuffer[] = [];
      for (const chunk of chunks) {
        const chunkResponse = await axios.get(chunk.downloadUrl, { responseType: "arraybuffer" });
        chunkBuffers.push(chunkResponse.data);
      }

      const finalBlob = new Blob(chunkBuffers, { type: meta.mimeType });
      
      // If text file, read text
      if (meta.mimeType.startsWith("text/") || meta.mimeType === "application/json") {
        const text = await finalBlob.text();
        setPreviewTextContent(text);
      } else {
        const url = URL.createObjectURL(finalBlob);
        setPreviewBlobUrl(url);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError<ApiErrorResponse>(err)) {
        setPreviewError(err.response?.data?.error || err.message || "Failed to generate preview");
      } else if (err instanceof Error) {
        setPreviewError(err.message);
      } else {
        setPreviewError("Failed to generate preview");
      }
    } finally {
      setLoadingPreview(false);
    }
  };

  // Clean up Object URL on unmount
  useEffect(() => {
    return () => {
      downloadManagerRef.current?.abort();
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  // Helper format bytes
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // Helper format download speed
  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec <= 0) return "0 B/s";
    return `${formatBytes(bytesPerSec, 1)}/s`;
  };

  // Get preview icon
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <ImageIcon className="h-10 w-10 text-primary" />;
    if (mimeType.startsWith("video/")) return <Video className="h-10 w-10 text-primary" />;
    if (mimeType.startsWith("audio/")) return <Volume2 className="h-10 w-10 text-primary" />;
    if (mimeType.startsWith("text/") || mimeType === "application/json")
      return <FileText className="h-10 w-10 text-primary" />;
    return <FileIcon className="h-10 w-10 text-primary" />;
  };

  return (
    <div className="flex-1 w-full flex flex-col relative overflow-hidden bg-background">
      {/* Background glow graphics */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Navbar */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between z-10">
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => router.push("/")}
        >
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center shadow-glow">
            <Unlock className="h-5 w-5 text-white" />
          </div>
          <span className="font-sans font-bold text-xl tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            GhostShare
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-xl mx-auto px-6 flex flex-col justify-center z-10 pb-20">
        <AnimatePresence mode="wait">
          
          {/* STATE 1: Page Loading */}
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="glass-panel rounded-2xl p-8 shadow-glow border border-border flex flex-col items-center justify-center min-h-[300px]"
            >
              <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
              <p className="text-sm text-muted-foreground font-mono">Retrieving secure share credentials...</p>
            </motion.div>
          )}

          {/* STATE 2: Expired or Error Page */}
          {!loading && (isExpired || errorMsg) && (
            <motion.div
              key="expired"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass-panel rounded-2xl p-8 shadow-glow border border-border text-center space-y-6"
            >
              <div className="h-16 w-16 rounded-full bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center mx-auto">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h3 className="font-sans font-bold text-xl text-white">Share Unavailable</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  {errorMsg || "This file has expired, reached download limits, or does not exist."}
                </p>
              </div>
              <button
                onClick={() => router.push("/")}
                className="w-full py-3 rounded-xl bg-secondary border border-border text-sm font-semibold hover:bg-muted transition-colors text-white"
              >
                Create a Share Link
              </button>
            </motion.div>
          )}

          {/* STATE 3: Password Verification Gate */}
          {!loading && meta && !isUnlocked && !isExpired && (
            <motion.div
              key="password-gate"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`glass-panel rounded-2xl p-8 shadow-glow border border-border space-y-6 ${
                shake ? "animate-shake" : ""
              }`}
            >
              <div className="text-center space-y-2">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary">
                  <Lock className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-xl text-white">This Share is Encrypted</h3>
                <p className="text-xs text-muted-foreground">
                  Please enter the download protection password to access files.
                </p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <input
                  type="password"
                  placeholder="Enter Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-secondary/80 border border-border text-sm focus:outline-none focus:border-primary transition-colors text-white"
                />

                {pwError && (
                  <p className="text-xs text-destructive font-semibold text-center">{pwError}</p>
                )}

                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/95 transition-all text-sm shadow-glow flex items-center justify-center gap-2"
                >
                  {isVerifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Unlock className="h-4 w-4" />
                      Verify Password
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          )}

          {/* STATE 4: Download & Preview Dashboard */}
          {!loading && meta && isUnlocked && !isExpired && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              {/* File Info Card */}
              <div className="glass-panel rounded-2xl p-6 shadow-glow border border-border space-y-6">
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 rounded-xl bg-secondary/80 border border-border flex items-center justify-center shrink-0">
                    {getFileIcon(meta.mimeType)}
                  </div>
                  <div className="truncate flex-1">
                    <h3 className="font-bold text-lg font-mono text-white truncate" title={meta.filename}>
                      {meta.filename}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {formatBytes(meta.fileSize)} • {meta.mimeType}
                    </p>
                  </div>
                </div>

                {/* Expiration Details */}
                <div className="grid grid-cols-2 gap-4 border-t border-b border-border/50 py-4 font-mono text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Vanishes In</p>
                      <p className="text-sm font-bold text-white mt-0.5">{timeLeft}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Download className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Remaining Downloads</p>
                      <p className="text-sm font-bold text-white mt-0.5">
                        {meta.maxDownloads !== null
                          ? Math.max(0, meta.maxDownloads - meta.currentDownloads)
                          : "Unlimited"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Download Status Overlay / Progress */}
                {downloadStatus !== "idle" && (
                  <div className="bg-secondary/40 border border-border/80 p-5 rounded-xl space-y-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white">
                        {downloadStatus === "fetching_meta" && "Locating secure cloud segments..."}
                        {downloadStatus === "downloading" && "Downloading encrypted chunks..."}
                        {downloadStatus === "assembling" && "Reassembling file in browser..."}
                        {downloadStatus === "completed" && "Assembly completed!"}
                        {downloadStatus === "error" && "Download failed"}
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        {downloadStatus === "downloading" && downloadProgress
                          ? `Progress: ${downloadProgress.percent}% (${formatBytes(
                              downloadProgress.downloadedBytes
                            )} / ${formatBytes(meta.fileSize)})`
                          : downloadStatus === "error"
                            ? downloadError || "The secure download session could not be completed."
                            : "Please wait..."}
                      </p>
                    </div>

                    <div className="h-1.5 w-full bg-background rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-primary to-purple-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${downloadProgress?.percent || 0}%` }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>

                    {downloadStatus === "downloading" && downloadProgress && (
                      <div className="grid grid-cols-2 gap-4 font-mono text-[11px] text-muted-foreground border-t border-border/40 pt-3">
                        <div>
                          <span>Speed: </span>
                          <span className="font-bold text-white">
                            {formatSpeed(downloadProgress.speed)}
                          </span>
                        </div>
                        <div>
                          <span>ETA: </span>
                          <span className="font-bold text-white">
                            {downloadProgress.eta > 0 ? `${downloadProgress.eta}s` : "Calculating..."}
                          </span>
                        </div>
                      </div>
                    )}

                    {downloadStatus === "error" && (
                      <button
                        onClick={() => {
                          setDownloadError(null);
                          setDownloadProgress(null);
                          setDownloadStatus("idle");
                        }}
                        className="w-full py-2.5 rounded-xl bg-secondary border border-border text-sm font-semibold hover:bg-muted transition-colors text-white"
                      >
                        Try Again
                      </button>
                    )}
                  </div>
                )}

                {/* Main Download Button */}
                {downloadStatus === "idle" && (
                  <button
                    onClick={handleDownload}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-purple-600 hover:from-primary/95 hover:to-purple-600/95 font-semibold text-white transition-all shadow-glow flex items-center justify-center gap-2"
                  >
                    <Download className="h-5 w-5" />
                    Download File
                  </button>
                )}
              </div>

              {/* Dynamic Preview Section */}
              {downloadStatus === "idle" && (
                <div className="glass-panel rounded-2xl p-6 shadow-glow border border-border space-y-4">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <h4 className="font-bold text-sm text-white">Secure File Preview</h4>
                    {!previewBlobUrl && !previewTextContent && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-secondary font-mono border border-border text-muted-foreground">
                        Supported ({formatBytes(meta.fileSize)})
                      </span>
                    )}
                  </div>

                  {/* Button to Load Preview */}
                  {!previewBlobUrl && !previewTextContent && (
                    <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-border/80 rounded-xl space-y-3">
                      <p className="text-xs text-muted-foreground max-w-xs">
                        Decrypt and preview this file directly in your browser without writing to disk.
                      </p>
                      <button
                        onClick={handleLoadPreview}
                        disabled={loadingPreview || meta.fileSize > 50 * 1024 * 1024}
                        className="px-4 py-2 rounded-xl bg-secondary border border-border hover:bg-muted text-xs font-semibold text-white transition-colors flex items-center gap-1.5"
                      >
                        {loadingPreview ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading Preview...
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5" />
                            Load Preview
                          </>
                        )}
                      </button>
                      {meta.fileSize > 50 * 1024 * 1024 && (
                        <p className="text-[10px] text-orange-400 font-mono">
                          * File size exceeds 50MB browser preview threshold.
                        </p>
                      )}
                      {previewError && (
                        <p className="text-xs text-destructive mt-2">{previewError}</p>
                      )}
                    </div>
                  )}

                  {/* Rendering Content Previews */}
                  {previewBlobUrl && meta.mimeType.startsWith("image/") && (
                    <div className="relative border border-border rounded-xl overflow-hidden bg-black/40 flex items-center justify-center min-h-[200px]">
                      <Image
                        src={previewBlobUrl}
                        alt="Preview"
                        width={1200}
                        height={900}
                        unoptimized
                        className="max-h-[350px] object-contain max-w-full"
                      />
                    </div>
                  )}

                  {previewBlobUrl && meta.mimeType.startsWith("video/") && (
                    <div className="border border-border rounded-xl overflow-hidden bg-black/80 flex items-center justify-center">
                      <video src={previewBlobUrl} controls className="max-h-[350px] w-full" />
                    </div>
                  )}

                  {previewBlobUrl && meta.mimeType.startsWith("audio/") && (
                    <div className="border border-border rounded-xl p-4 bg-secondary/40 flex items-center justify-center">
                      <audio src={previewBlobUrl} controls className="w-full" />
                    </div>
                  )}

                  {previewBlobUrl && meta.mimeType === "application/pdf" && (
                    <div className="border border-border rounded-xl overflow-hidden h-[400px]">
                      <iframe
                        src={`${previewBlobUrl}#toolbar=0`}
                        className="w-full h-full border-none"
                      />
                    </div>
                  )}

                  {previewTextContent && (
                    <div className="border border-border rounded-xl p-4 bg-black/40 max-h-[300px] overflow-y-auto">
                      <pre className="text-xs font-mono text-left whitespace-pre-wrap break-all text-white/90 leading-relaxed select-text">
                        {previewTextContent}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border z-10 bg-background/50 backdrop-blur-sm mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-4 font-mono">
          <span>&copy; {new Date().getFullYear()} GhostShare. All rights reserved.</span>
          <div className="flex items-center gap-6">
            <span>Vanishing Shared Links Platform</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
