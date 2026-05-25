"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  Lock,
  Shield,
  Clock,
  Copy,
  Check,
  Play,
  Pause,
  X,
  ChevronRight,
  Mail,
  QrCode,
  Download,
  AlertTriangle,
} from "lucide-react";
import { useUploadStore } from "@/store/uploadStore";

export default function LandingPage() {
  const {
    file,
    status,
    progress,
    errorMsg,
    publicId,
    deleteToken,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    resetUpload,
  } = useUploadStore();

  // Local Form Settings
  const [expiresIn, setExpiresIn] = useState<number>(60); // 60 minutes default (1h)
  const [maxDownloads, setMaxDownloads] = useState<number | null>(1); // 1 download default
  const [enableLimit, setEnableLimit] = useState(true);
  const [password, setPassword] = useState("");
  const [enablePassword, setEnablePassword] = useState(false);

  // UI state
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedDelete, setCopiedDelete] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const appOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = status === "completed" && publicId ? `${appOrigin}/share/${publicId}` : "";
  const deleteUrl =
    status === "completed" && publicId && deleteToken
      ? `${appOrigin}/api/upload/${publicId}?token=${deleteToken}`
      : "";

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0 && status === "idle") {
      const selectedFile = acceptedFiles[0];
      // Store in state (Zustand will handle active manager)
      useUploadStore.setState({ file: selectedFile });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: status !== "idle" || !!file,
  });

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    startUpload(file, {
      expiresIn,
      maxDownloads: enableLimit ? maxDownloads : null,
      password: enablePassword ? password : "",
    });
  };

  const copyToClipboard = async (text: string, type: "share" | "delete") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "share") {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedDelete(true);
        setTimeout(() => setCopiedDelete(false), 2000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Helper format bytes
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // Helper format speed
  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec <= 0) return "0 B/s";
    return `${formatBytes(bytesPerSec, 1)}/s`;
  };

  // Helper format ETA
  const formatEta = (seconds: number) => {
    if (seconds <= 0) return "Estimating...";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="flex-1 w-full flex flex-col relative overflow-hidden bg-background">
      {/* Background glow graphics */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Navbar */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center shadow-glow">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <span className="font-sans font-bold text-xl tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            GhostShare
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs px-3 py-1 rounded-full bg-secondary border border-border text-muted-foreground font-mono">
            Direct-to-Storage
          </span>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center z-10 pb-20">
        
        {/* Left Side: Product Description */}
        <div className="lg:col-span-6 space-y-8 flex flex-col justify-center">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              SaaS Grade Ephemeral Sharing
            </div>
            <h1 className="font-sans text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight">
              Share Files.
              <br />
              <span className="bg-gradient-to-r from-primary via-purple-400 to-pink-500 bg-clip-text text-transparent glow-primary">
                Leave No Trace.
              </span>
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg max-w-xl leading-relaxed">
              GhostShare uses end-to-end temporary signed URLs. Files are uploaded directly from your browser to private storage buckets. Set passwords, download limits, and watch files vanish completely upon expiration.
            </p>
          </div>

          {/* Core Feature List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
            <div className="flex items-start gap-3 p-4 rounded-xl glass-card">
              <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">Direct to Storage</h4>
                <p className="text-xs text-muted-foreground mt-1">Files bypass the backend entirely for enterprise upload speeds.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl glass-card">
              <Clock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">Self-Destruct</h4>
                <p className="text-xs text-muted-foreground mt-1">Automatic cron workers purge database entries and storage bytes.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl glass-card">
              <Lock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">Password Locked</h4>
                <p className="text-xs text-muted-foreground mt-1">Cryptographic hashes protect shares with brute-force rate limits.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl glass-card">
              <ChevronRight className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">Split-Chunk Pipeline</h4>
                <p className="text-xs text-muted-foreground mt-1">Large files are sliced into parallel chunks, offering pause & resume.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Upload Card Area */}
        <div className="lg:col-span-6 w-full max-w-xl mx-auto z-20">
          <AnimatePresence mode="wait">
            
            {/* Status: Idle, and File Not Selected */}
            {status === "idle" && !file && (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div
                  className="w-full rounded-2xl glass-panel p-8 shadow-glow flex flex-col items-center justify-center min-h-[400px] border border-border group cursor-pointer"
                  {...getRootProps()}
                >
                  <input {...getInputProps()} />
                  <div className="h-20 w-20 rounded-full bg-secondary border border-border flex items-center justify-center mb-6 group-hover:scale-105 transition-transform duration-300">
                    <UploadCloud className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                  </div>
                  <h3 className="font-sans font-bold text-xl mb-2 text-center">
                    {isDragActive ? "Drop the file here..." : "Drag & drop your file"}
                  </h3>
                  <p className="text-muted-foreground text-sm text-center max-w-xs mb-6">
                    Select any file up to 2GB to generate a self-destructing sharing link
                  </p>
                  <button
                    type="button"
                    className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/95 transition-all text-sm shadow-glow"
                  >
                    Browse Files
                  </button>
                </div>
              </motion.div>
            )}

            {/* Status: Idle, but File is Selected (Config Settings Page) */}
            {status === "idle" && file && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full rounded-2xl glass-panel p-8 shadow-glow border border-border"
              >
                <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
                  <div className="truncate pr-4">
                    <h3 className="font-bold text-lg truncate font-mono text-white">
                      {file.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatBytes(file.size)} • {file.type || "unknown type"}
                    </p>
                  </div>
                  <button
                    onClick={() => useUploadStore.setState({ file: null })}
                    className="p-1.5 rounded-lg bg-secondary hover:bg-muted text-muted-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={handleUploadSubmit} className="space-y-6">
                  {/* Expiration Setting */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      Self-Destructs After
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: "10m", val: 10 },
                        { label: "1h", val: 60 },
                        { label: "24h", val: 1440 },
                        { label: "7d", val: 10080 },
                      ].map((item) => (
                        <button
                          key={item.val}
                          type="button"
                          onClick={() => setExpiresIn(item.val)}
                          className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                            expiresIn === item.val
                              ? "bg-primary border-primary text-white shadow-glow"
                              : "bg-secondary/40 border-border text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Download Limits Setting */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Download className="h-3.5 w-3.5 text-primary" />
                        Download Limits
                      </label>
                      <input
                        type="checkbox"
                        checked={enableLimit}
                        onChange={(e) => setEnableLimit(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary h-4 w-4 bg-secondary"
                      />
                    </div>
                    {enableLimit && (
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min="1"
                          max="50"
                          value={maxDownloads || 1}
                          onChange={(e) => setMaxDownloads(parseInt(e.target.value))}
                          className="flex-1 accent-primary h-1.5 bg-secondary rounded-lg"
                        />
                        <span className="font-mono font-bold text-sm bg-secondary px-3 py-1 rounded-lg border border-border">
                          {maxDownloads} {maxDownloads === 1 ? "download" : "downloads"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Password Protection */}
                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5 text-primary" />
                        Password Protection
                      </label>
                      <input
                        type="checkbox"
                        checked={enablePassword}
                        onChange={(e) => setEnablePassword(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary h-4 w-4 bg-secondary"
                      />
                    </div>
                    {enablePassword && (
                      <input
                        type="password"
                        placeholder="Enter download protection password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full px-4 py-2.5 rounded-xl bg-secondary/60 border border-border text-sm focus:outline-none focus:border-primary transition-colors text-white"
                      />
                    )}
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary to-purple-600 hover:from-primary/95 hover:to-purple-600/95 font-semibold text-white transition-all shadow-glow flex items-center justify-center gap-2"
                  >
                    <UploadCloud className="h-5 w-5" />
                    Share Securely
                  </button>
                </form>
              </motion.div>
            )}

            {/* Status: Uploading Progress Page */}
            {["initiating", "uploading", "paused", "completing"].includes(status) && (
              <motion.div
                key="uploading-screen"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full rounded-2xl glass-panel p-8 shadow-glow border border-border space-y-6"
              >
                <div className="space-y-1">
                  <h3 className="font-sans font-bold text-lg text-white">
                    {status === "initiating" && "Preparing Direct Pipeline..."}
                    {status === "uploading" && "Uploading directly to Storage..."}
                    {status === "paused" && "Upload Paused"}
                    {status === "completing" && "Finalizing Share Cryptography..."}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate font-mono">
                    {file?.name}
                  </p>
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary to-purple-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress?.percent || 0}%` }}
                      transition={{ duration: 0.2 }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground font-mono">
                    <span>{progress?.percent || 0}%</span>
                    <span>
                      {formatBytes(progress?.uploadedBytes || 0)} / {formatBytes(progress?.totalBytes || 0)}
                    </span>
                  </div>
                </div>

                {/* Upload analytics */}
                {status === "uploading" && (
                  <div className="grid grid-cols-2 gap-4 bg-secondary/30 p-4 rounded-xl border border-border/40 font-mono text-xs">
                    <div>
                      <p className="text-muted-foreground">Upload Speed</p>
                      <p className="text-sm font-bold text-white mt-1">
                        {formatSpeed(progress?.speed || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Remaining ETA</p>
                      <p className="text-sm font-bold text-white mt-1">
                        {formatEta(progress?.eta || 0)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Controls */}
                <div className="flex items-center gap-3 border-t border-border/60 pt-4">
                  {status === "uploading" && (
                    <button
                      onClick={pauseUpload}
                      className="flex-1 py-2.5 rounded-xl bg-secondary border border-border text-sm font-semibold hover:bg-secondary/80 text-white transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Pause className="h-4 w-4" />
                      Pause
                    </button>
                  )}
                  {status === "paused" && (
                    <button
                      onClick={resumeUpload}
                      className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/95 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Play className="h-4 w-4" />
                      Resume
                    </button>
                  )}
                  <button
                    onClick={cancelUpload}
                    className="flex-1 py-2.5 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}

            {/* Status: Upload Completed Area */}
            {status === "completed" && (
              <motion.div
                key="completed-screen"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full rounded-2xl glass-panel p-8 shadow-glow border border-border space-y-6"
              >
                <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 p-4 rounded-xl">
                  <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                    <Check className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-green-400">Share Created Successfully</h4>
                    <p className="text-xs text-muted-foreground">Files are stored securely direct on cloud.</p>
                  </div>
                </div>

                {/* Share Link copy box */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Public Share URL
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-secondary/80 border border-border text-sm font-mono focus:outline-none text-white select-all truncate"
                    />
                    <button
                      onClick={() => copyToClipboard(shareUrl, "share")}
                      className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary/95 transition-all shadow-glow"
                    >
                      {copiedLink ? <Check className="h-4.5 w-4.5" /> : <Copy className="h-4.5 w-4.5" />}
                    </button>
                  </div>
                </div>

                {/* Share/Bonus Actions */}
                <div className="flex items-center justify-between border-t border-b border-border/60 py-4 text-xs font-semibold text-muted-foreground font-mono">
                  <button
                    onClick={() => setShowQr(!showQr)}
                    className="flex items-center gap-1.5 hover:text-white transition-colors"
                  >
                    <QrCode className="h-4 w-4 text-primary" />
                    {showQr ? "Hide QR Code" : "Show QR Code"}
                  </button>

                  <a
                    href={`mailto:?subject=Secure File Share&body=I shared a secure self-destructing file with you via GhostShare. Download it here: ${shareUrl}`}
                    className="flex items-center gap-1.5 hover:text-white transition-colors"
                  >
                    <Mail className="h-4 w-4 text-primary" />
                    Share via Email
                  </a>
                </div>

                {/* QR Code image */}
                {showQr && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="flex flex-col items-center justify-center p-4 bg-secondary/30 rounded-xl border border-border/40 space-y-2"
                  >
                    <Image
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                        shareUrl
                      )}`}
                      alt="Share Link QR Code"
                      width={150}
                      height={150}
                      unoptimized
                      className="w-36 h-36 border border-border rounded-lg p-2 bg-white"
                    />
                    <p className="text-[10px] text-muted-foreground">Scan with mobile to download directly</p>
                  </motion.div>
                )}

                {/* Delete Credentials block */}
                <div className="bg-secondary/40 border border-border/80 p-4 rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-orange-400 font-bold uppercase tracking-wider">
                    <AlertTriangle className="h-4 w-4" />
                    Administrative Delete Token
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    To delete this share manually before expiration, use this link:
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={deleteUrl}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-background border border-border text-[11px] font-mono focus:outline-none text-muted-foreground select-all truncate"
                    />
                    <button
                      onClick={() => copyToClipboard(deleteUrl, "delete")}
                      className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-white hover:bg-muted transition-colors border border-border"
                    >
                      {copiedDelete ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <button
                  onClick={resetUpload}
                  className="w-full py-3 rounded-xl bg-secondary border border-border hover:bg-muted font-semibold text-white transition-colors text-sm"
                >
                  Upload Another File
                </button>
              </motion.div>
            )}

            {/* Status: Error area */}
            {status === "error" && (
              <motion.div
                key="error-screen"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full rounded-2xl glass-panel p-8 shadow-glow border border-border text-center space-y-6"
              >
                <div className="h-16 w-16 rounded-full bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center mx-auto">
                  <AlertTriangle className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-sans font-bold text-xl text-white">Upload Failed</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    {errorMsg || "An unexpected error occurred during direct storage upload."}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={resetUpload}
                    className="flex-1 py-3 rounded-xl bg-secondary border border-border text-sm font-semibold hover:bg-muted transition-colors"
                  >
                    Start Over
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border z-10 bg-background/50 backdrop-blur-sm mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-4 font-mono">
          <span>&copy; {new Date().getFullYear()} GhostShare. All rights reserved.</span>
          <div className="flex items-center gap-6">
            <span>Powered by Next.js 15 & Supabase Storage</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
