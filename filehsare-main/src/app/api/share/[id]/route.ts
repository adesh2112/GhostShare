import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    if (!id || id.trim() === "") {
      return NextResponse.json({ error: "Missing public ID" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Fetch the upload metadata from the database
    const { data: upload, error: dbError } = await supabaseAdmin
      .from("uploads")
      .select("*")
      .eq("public_id", id)
      .single();

    if (dbError || !upload) {
      return NextResponse.json({ error: "File share link not found" }, { status: 404 });
    }

    // Check if the upload was ever completed
    if (upload.upload_status === "pending") {
      return NextResponse.json({ error: "File upload is not yet complete" }, { status: 400 });
    }

    // Check if status is marked as expired
    if (upload.upload_status === "expired") {
      return NextResponse.json({ error: "This file has expired and is no longer available" }, { status: 410 });
    }

    // Check if expired based on time
    const expiresAt = new Date(upload.expires_at).getTime();
    if (Date.now() > expiresAt) {
      // Mark as expired asynchronously/directly
      await supabaseAdmin
        .from("uploads")
        .update({ upload_status: "expired" })
        .eq("id", upload.id);
      
      return NextResponse.json({ error: "This file has expired and is no longer available" }, { status: 410 });
    }

    // Check download limits
    if (upload.max_downloads !== null && upload.current_downloads >= upload.max_downloads) {
      await supabaseAdmin
        .from("uploads")
        .update({ upload_status: "expired" })
        .eq("id", upload.id);

      return NextResponse.json({ error: "Download limit has been reached for this file" }, { status: 410 });
    }

    // Return sanitized metadata
    return NextResponse.json({
      publicId: upload.public_id,
      filename: upload.original_filename,
      mimeType: upload.mime_type,
      fileSize: upload.file_size,
      expiresAt: upload.expires_at,
      maxDownloads: upload.max_downloads,
      currentDownloads: upload.current_downloads,
      hasPassword: upload.password_hash !== null && upload.password_hash !== "",
      chunkCount: upload.chunk_count,
      createdAt: upload.created_at,
    });
  } catch (error) {
    console.error("Unexpected error in share metadata endpoint:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
