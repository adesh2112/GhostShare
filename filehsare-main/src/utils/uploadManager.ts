import axios, { CancelTokenSource } from "axios";

interface ApiErrorResponse {
  error?: string;
}

export interface ChunkInfo {
  index: number;
  uploadUrl: string;
  path: string;
}

export interface UploadOptions {
  filename: string;
  mimeType: string;
  fileSize: number;
  expiresIn: number;
  maxDownloads: number | null;
  password?: string;
}

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  speed: number; // bytes/sec
  eta: number; // seconds
}

export class ChunkUploadManager {
  private file: File;
  private options: UploadOptions;
  private chunkSize: number;
  private chunkCount: number;
  private publicId: string | null = null;
  private deleteToken: string | null = null;
  private chunks: ChunkInfo[] = [];
  
  // State tracking
  private chunkProgress: { [index: number]: number } = {};
  private chunkCompleted: { [index: number]: boolean } = {};
  private activeRequests: { [index: number]: CancelTokenSource } = {};
  private isPaused = false;
  private isAborted = false;
  
  // Progress analytics
  private startTime: number = 0;
  private totalUploadedBeforePause: number = 0;

  // Callbacks
  public onProgress?: (progress: UploadProgress) => void;
  public onStatusChange?: (status: "idle" | "initiating" | "uploading" | "paused" | "completing" | "completed" | "error") => void;
  public onError?: (error: Error) => void;
  public onCompleted?: (publicId: string, deleteToken: string) => void;

  constructor(file: File, options: Omit<UploadOptions, "filename" | "mimeType" | "fileSize">, chunkSize = 5 * 1024 * 1024) {
    this.file = file;
    this.chunkSize = chunkSize;
    this.chunkCount = Math.ceil(file.size / this.chunkSize);
    
    this.options = {
      ...options,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
    };
  }

  /**
   * Starts the upload process
   */
  public async start(): Promise<void> {
    try {
      this.isPaused = false;
      this.isAborted = false;
      this.setStatus("initiating");

      // 1. Initiate upload with server to get signed upload URLs
      const response = await axios.post("/api/upload/initiate", {
        filename: this.options.filename,
        mimeType: this.options.mimeType,
        fileSize: this.options.fileSize,
        chunkCount: this.chunkCount,
        expiresIn: this.options.expiresIn,
        maxDownloads: this.options.maxDownloads,
        password: this.options.password,
      });

      const { publicId, deleteToken, chunks } = response.data;
      this.publicId = publicId;
      this.deleteToken = deleteToken;
      this.chunks = chunks;

      // Initialize progress trackers
      for (let i = 0; i < this.chunkCount; i++) {
        this.chunkProgress[i] = 0;
        this.chunkCompleted[i] = false;
      }

      this.startTime = Date.now();
      this.setStatus("uploading");
      
      // 2. Start uploading chunks with a concurrency limit of 3
      this.uploadAllChunks();
    } catch (err: unknown) {
      this.handleError(err);
    }
  }

  /**
   * Pauses the upload process by cancelling active requests
   */
  public pause(): void {
    if (this.isPaused || this.isAborted || !this.publicId) return;
    
    this.isPaused = true;
    this.setStatus("paused");

    // Cancel all active chunk uploads
    Object.keys(this.activeRequests).forEach((key) => {
      const idx = parseInt(key);
      this.activeRequests[idx].cancel("Upload paused by user");
      delete this.activeRequests[idx];
    });

    // Save progress loaded before pausing
    this.totalUploadedBeforePause = this.getUploadedBytes();
  }

  /**
   * Resumes the upload process
   */
  public resume(): void {
    if (!this.isPaused || this.isAborted || !this.publicId) return;

    this.isPaused = false;
    this.startTime = Date.now();
    this.setStatus("uploading");

    // Restart worker pool
    this.uploadAllChunks();
  }

  /**
   * Aborts the upload and cleans up partial files
   */
  public async abort(): Promise<void> {
    this.isAborted = true;
    
    // Cancel active requests
    Object.keys(this.activeRequests).forEach((key) => {
      const idx = parseInt(key);
      this.activeRequests[idx].cancel("Upload aborted by user");
      delete this.activeRequests[idx];
    });

    this.setStatus("idle");

    // Attempt to manually trigger cleanup for this upload ID in backend
    if (this.publicId && this.deleteToken) {
      try {
        await axios.delete(`/api/upload/${this.publicId}?token=${this.deleteToken}`);
      } catch (err) {
        console.error("Failed to delete upload workspace after abort:", err);
      }
    }
  }

  /**
   * Concurrent queue worker to manage chunk uploads
   */
  private async uploadAllChunks(): Promise<void> {
    const queue = this.chunks.filter((c) => !this.chunkCompleted[c.index]);
    
    if (queue.length === 0) {
      this.completeUpload();
      return;
    }

    const concurrencyLimit = Math.min(3, queue.length);
    let indexInQueue = 0;

    const worker = async () => {
      while (indexInQueue < queue.length && !this.isPaused && !this.isAborted) {
        const chunk = queue[indexInQueue++];
        await this.uploadChunkWithRetry(chunk, 0);
      }
    };

    // Spawn workers in parallel
    const workers = Array.from({ length: concurrencyLimit }, () => worker());
    await Promise.all(workers);

    // After all workers finish, check if upload is complete
    const remaining = this.chunks.filter((c) => !this.chunkCompleted[c.index]).length;
    if (remaining === 0 && !this.isPaused && !this.isAborted) {
      this.completeUpload();
    }
  }

  /**
   * Uploads a single chunk, with retry and exponential backoff
   */
  private async uploadChunkWithRetry(chunk: ChunkInfo, attempt: number): Promise<void> {
    if (this.isPaused || this.isAborted) return;

    const maxRetries = 4;
    const cancelTokenSource = axios.CancelToken.source();
    this.activeRequests[chunk.index] = cancelTokenSource;

    const start = chunk.index * this.chunkSize;
    const end = Math.min(start + this.chunkSize, this.file.size);
    const chunkBlob = this.file.slice(start, end);

    try {
      await axios.put(chunk.uploadUrl, chunkBlob, {
        headers: {
          "Content-Type": this.options.mimeType,
        },
        cancelToken: cancelTokenSource.token,
        onUploadProgress: (progressEvent) => {
          if (this.isPaused || this.isAborted) return;
          const loaded = progressEvent.loaded || 0;
          this.chunkProgress[chunk.index] = loaded;
          this.updateProgress();
        },
      });

      // Upload successful
      this.chunkCompleted[chunk.index] = true;
      delete this.activeRequests[chunk.index];
    } catch (err: unknown) {
      delete this.activeRequests[chunk.index];

      if (axios.isCancel(err)) {
        // Cancelled by pause or abort, ignore error
        return;
      }

      if (attempt < maxRetries && !this.isPaused && !this.isAborted) {
        const backoffTime = Math.pow(2, attempt) * 1000;
        const message = err instanceof Error ? err.message : "Unknown upload error";
        console.warn(
          `Chunk ${chunk.index} upload failed. Retrying in ${backoffTime}ms (Attempt ${attempt + 1}/${maxRetries}). Error:`,
          message
        );
        
        await new Promise((res) => setTimeout(res, backoffTime));
        return this.uploadChunkWithRetry(chunk, attempt + 1);
      } else {
        const message = err instanceof Error ? err.message : "Unknown upload error";
        throw new Error(
          `Failed to upload chunk ${chunk.index} after ${maxRetries} attempts. Error: ${message}`
        );
      }
    }
  }

  /**
   * Calculates overall progress statistics and fires callback
   */
  private updateProgress(): void {
    if (!this.onProgress) return;

    const uploadedBytes = this.getUploadedBytes();
    const totalBytes = this.file.size;
    const percent = Math.min(100, Math.round((uploadedBytes / totalBytes) * 100));

    // Calculate speed and ETA
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    
    // Bytes uploaded in current session (since start or since last resume)
    const bytesUploadedThisSession = Math.max(0, uploadedBytes - this.totalUploadedBeforePause);
    
    const speed = elapsedSeconds > 0 ? Math.round(bytesUploadedThisSession / elapsedSeconds) : 0;
    
    const remainingBytes = totalBytes - uploadedBytes;
    const eta = speed > 0 ? Math.ceil(remainingBytes / speed) : 0;

    this.onProgress({
      uploadedBytes,
      totalBytes,
      percent,
      speed,
      eta,
    });
  }

  /**
   * Helper to sum all bytes uploaded so far
   */
  private getUploadedBytes(): number {
    return Object.keys(this.chunkProgress).reduce((acc, key) => {
      const idx = parseInt(key);
      // If completed, chunk size is fully uploaded
      if (this.chunkCompleted[idx]) {
        const start = idx * this.chunkSize;
        const end = Math.min(start + this.chunkSize, this.file.size);
        return acc + (end - start);
      }
      return acc + this.chunkProgress[idx];
    }, 0);
  }

  /**
   * Signals backend that all chunks have been uploaded
   */
  private async completeUpload(): Promise<void> {
    try {
      this.setStatus("completing");

      await axios.post("/api/upload/complete", {
        publicId: this.publicId,
      });

      this.setStatus("completed");
      if (this.onCompleted && this.publicId && this.deleteToken) {
        this.onCompleted(this.publicId, this.deleteToken);
      }
    } catch (err: unknown) {
      this.handleError(err);
    }
  }

  private handleError(err: unknown): void {
    if (this.isAborted) return;
    this.setStatus("error");
    if (this.onError) {
      const message = axios.isAxiosError<ApiErrorResponse>(err)
        ? err.response?.data?.error || err.message || "Upload failed"
        : err instanceof Error
          ? err.message
          : "Upload failed";
      this.onError(new Error(message));
    }
  }

  private setStatus(status: "idle" | "initiating" | "uploading" | "paused" | "completing" | "completed" | "error"): void {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }
}
