import axios, { AxiosResponse, CancelTokenSource } from "axios";

interface ApiErrorResponse {
  error?: string;
}

export interface DownloadChunk {
  index: number;
  downloadUrl: string;
}

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  speed: number; // bytes/sec
  eta: number; // seconds
}

export class ChunkDownloadManager {
  private publicId: string;
  private token: string;
  private filename: string = "";
  private mimeType: string = "";
  private fileSize: number = 0;
  private chunks: DownloadChunk[] = [];
  
  // Progress tracking
  private chunkProgress: { [index: number]: number } = {};
  private chunkData: { [index: number]: ArrayBuffer } = {};
  private activeRequests: { [index: number]: CancelTokenSource } = {};
  
  private isAborted = false;
  private startTime = 0;

  // Callbacks
  public onProgress?: (progress: DownloadProgress) => void;
  public onStatusChange?: (status: "idle" | "fetching_meta" | "downloading" | "assembling" | "completed" | "error") => void;
  public onError?: (error: Error) => void;
  public onCompleted?: (blob: Blob, filename: string) => void;

  constructor(publicId: string, token = "") {
    this.publicId = publicId;
    this.token = token;
  }

  /**
   * Initiates and executes the download process
   */
  public async start(): Promise<void> {
    try {
      this.isAborted = false;
      this.setStatus("fetching_meta");

      // 1. Request signed download URLs for chunks from server
      const response = await axios.get(`/api/download/${this.publicId}?token=${this.token}`);
      const { filename, mimeType, fileSize, chunks } = response.data;
      
      this.filename = filename;
      this.mimeType = mimeType;
      this.fileSize = fileSize;
      this.chunks = chunks;

      // Initialize progress state
      for (let i = 0; i < chunks.length; i++) {
        this.chunkProgress[i] = 0;
      }

      this.startTime = Date.now();
      this.setStatus("downloading");

      // 2. Download chunks in parallel (max 3 concurrent)
      await this.downloadAllChunks();
    } catch (err: unknown) {
      this.handleError(err);
    }
  }

  /**
   * Aborts the download process
   */
  public abort(): void {
    this.isAborted = true;
    Object.keys(this.activeRequests).forEach((key) => {
      const idx = parseInt(key);
      this.activeRequests[idx].cancel("Download aborted by user");
      delete this.activeRequests[idx];
    });
    this.setStatus("idle");
  }

  /**
   * Worker pool to download chunks concurrently
   */
  private async downloadAllChunks(): Promise<void> {
    const concurrencyLimit = Math.min(3, this.chunks.length);
    let indexInQueue = 0;

    const worker = async () => {
      while (indexInQueue < this.chunks.length && !this.isAborted) {
        const chunk = this.chunks[indexInQueue++];
        await this.downloadChunkWithRetry(chunk, 0);
      }
    };

    const workers = Array.from({ length: concurrencyLimit }, () => worker());
    await Promise.all(workers);

    if (this.isAborted) return;

    // Verify all chunks are downloaded
    const downloadedCount = Object.keys(this.chunkData).length;
    if (downloadedCount === this.chunks.length) {
      this.assembleFile();
    } else {
      throw new Error("Failed to download all file chunks");
    }
  }

  /**
   * Downloads a single chunk with retry and exponential backoff
   */
  private async downloadChunkWithRetry(chunk: DownloadChunk, attempt: number): Promise<void> {
    if (this.isAborted) return;

    const maxRetries = 4;
    const cancelTokenSource = axios.CancelToken.source();
    this.activeRequests[chunk.index] = cancelTokenSource;

    try {
      const response: AxiosResponse<ArrayBuffer> = await axios.get(chunk.downloadUrl, {
        responseType: "arraybuffer",
        cancelToken: cancelTokenSource.token,
        onDownloadProgress: (progressEvent) => {
          if (this.isAborted) return;
          const loaded = progressEvent.loaded || 0;
          this.chunkProgress[chunk.index] = loaded;
          this.updateProgress();
        },
      });

      this.chunkData[chunk.index] = response.data;
      delete this.activeRequests[chunk.index];
    } catch (err: unknown) {
      delete this.activeRequests[chunk.index];

      if (axios.isCancel(err)) {
        return;
      }

      if (attempt < maxRetries && !this.isAborted) {
        const backoffTime = Math.pow(2, attempt) * 1000;
        const message = err instanceof Error ? err.message : "Unknown download error";
        console.warn(
          `Chunk ${chunk.index} download failed. Retrying in ${backoffTime}ms (Attempt ${attempt + 1}/${maxRetries}). Error:`,
          message
        );
        
        await new Promise((res) => setTimeout(res, backoffTime));
        return this.downloadChunkWithRetry(chunk, attempt + 1);
      } else {
        const message = err instanceof Error ? err.message : "Unknown download error";
        throw new Error(
          `Failed to download chunk ${chunk.index} after ${maxRetries} attempts. Error: ${message}`
        );
      }
    }
  }

  /**
   * Calculates overall progress and fires callbacks
   */
  private updateProgress(): void {
    if (!this.onProgress) return;

    const downloadedBytes = Object.values(this.chunkProgress).reduce((a, b) => a + b, 0);
    const totalBytes = this.fileSize;
    const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));

    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const speed = elapsedSeconds > 0 ? Math.round(downloadedBytes / elapsedSeconds) : 0;
    const remainingBytes = totalBytes - downloadedBytes;
    const eta = speed > 0 ? Math.ceil(remainingBytes / speed) : 0;

    this.onProgress({
      downloadedBytes,
      totalBytes,
      percent,
      speed,
      eta,
    });
  }

  /**
   * Concatenates all chunk ArrayBuffers and triggers download
   */
  private assembleFile(): void {
    this.setStatus("assembling");

    // Order chunk data by index
    const sortedChunks: ArrayBuffer[] = [];
    for (let i = 0; i < this.chunks.length; i++) {
      sortedChunks.push(this.chunkData[i]);
    }

    // Assemble blob
    const finalBlob = new Blob(sortedChunks, { type: this.mimeType });

    this.setStatus("completed");

    if (this.onCompleted) {
      this.onCompleted(finalBlob, this.filename);
    }
  }

  private handleError(err: unknown): void {
    if (this.isAborted) return;
    this.setStatus("error");
    if (this.onError) {
      const message = axios.isAxiosError<ApiErrorResponse>(err)
        ? err.response?.data?.error || err.message || "Download failed"
        : err instanceof Error
          ? err.message
          : "Download failed";
      this.onError(new Error(message));
    }
  }

  private setStatus(status: "idle" | "fetching_meta" | "downloading" | "assembling" | "completed" | "error"): void {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }
}
