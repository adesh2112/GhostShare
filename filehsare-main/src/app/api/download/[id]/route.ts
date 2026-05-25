import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { hashIp } from "@/utils/crypto";
import { verifyDownloadToken } from "@/utils/token";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: publicId } = await params;
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";
    const isPreview = url.searchParams.get("preview") === "1";

    const supabaseAdmin = getSupabaseAdmin();

    // Fetch upload details
    const { data: upload, error: dbError } = await supabaseAdmin
      .from("uploads")
      .select("*")
      .eq("public_id", publicId)
      .single();

    if (dbError || !upload) {
      return NextResponse.json({ error: "Download file not found" }, { status: 404 });
    }

    // Check expiration and download limits
    const expiresAt = new Date(upload.expires_at).getTime();
    if (
      upload.upload_status === "expired" ||
      expiresAt < Date.now() ||
      (upload.max_downloads !== null && upload.current_downloads >= upload.max_downloads)
    ) {
      return NextResponse.json(
        { error: "This file has expired or reached its download limit" },
        { status: 410 }
      );
    }

    // If password-protected, verify the token
    if (upload.password_hash) {
      const isAuthorized = verifyDownloadToken(publicId, token);
      if (!isAuthorized) {
        return NextResponse.json({ error: "Unauthorized download request" }, { status: 403 });
      }
    }

    // Client IP and user agent for logs
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";
    const ipHash = hashIp(ip);
    const userAgent = request.headers.get("user-agent") || "";

    let nextDownloads = upload.current_downloads;
    let hitLimit = false;

    if (!isPreview) {
      nextDownloads = upload.current_downloads + 1;
      hitLimit = upload.max_downloads !== null && nextDownloads >= upload.max_downloads;
      const newStatus = hitLimit ? "expired" : upload.upload_status;

      const { error: updateError } = await supabaseAdmin
        .from("uploads")
        .update({
          current_downloads: nextDownloads,
          upload_status: newStatus,
        })
        .eq("id", upload.id);

      if (updateError) {
        console.error("Error incrementing downloads:", updateError);
        return NextResponse.json(
          { error: "Failed to process download transaction" },
          { status: 500 }
        );
      }

      // Preview fetches should not consume a one-time link.
      await supabaseAdmin.from("download_logs").insert({
        upload_id: upload.id,
        ip_hash: ipHash,
        user_agent: userAgent,
      });
    }

    // Generate signed download URLs for all chunks
    const chunkUrls = [];
    for (let i = 0; i < upload.chunk_count; i++) {
      const chunkPath = `${publicId}/chunks/${i}`;
      
      const { data: signedData, error: storageError } = await supabaseAdmin.storage
        .from("ephemeral-files")
        .createSignedUrl(chunkPath, 900); // URL valid for 15 minutes

      if (storageError || !signedData) {
        console.error(`Storage Error generating signed download URL for chunk ${i}:`, storageError);
        return NextResponse.json({ error: "Failed to generate file download links" }, { status: 500 });
      }

      chunkUrls.push({
        index: i,
        downloadUrl: signedData.signedUrl,
      });
    }

    return NextResponse.json({
      filename: upload.original_filename,
      mimeType: upload.mime_type,
      fileSize: upload.file_size,
      chunkCount: upload.chunk_count,
      chunks: chunkUrls,
      willSelfDestruct: hitLimit,
      isPreview,
    });
  } catch (error) {
    console.error("Unexpected error in download endpoint:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
