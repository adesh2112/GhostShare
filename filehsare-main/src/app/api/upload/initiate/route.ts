import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { hashIp, hashPassword, generateSecureToken } from "@/utils/crypto";

const initiateSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  fileSize: z.number().positive(),
  chunkCount: z.number().int().positive().max(1000), // Protect against abuse
  expiresIn: z.number().int().positive().refine((val) => [10, 60, 1440, 10080].includes(val), {
    message: "Invalid expiration window. Must be 10 minutes, 1 hour, 24 hours, or 7 days.",
  }),
  maxDownloads: z.number().int().positive().nullable().optional(),
  password: z.string().max(128).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = initiateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { filename, mimeType, fileSize, chunkCount, expiresIn, maxDownloads, password } =
      validation.data;

    // Retrieve client IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";
    const ipHash = hashIp(ip);

    // Hash password if provided
    let passwordHash: string | null = null;
    if (password && password.trim() !== "") {
      passwordHash = await hashPassword(password);
    }

    // Generate short public ID (e.g. 12 characters random hex)
    const publicId = crypto.randomBytes(6).toString("hex");
    const deleteToken = generateSecureToken();

    // Calculate expiration timestamp
    const expiresAt = new Date(Date.now() + expiresIn * 60 * 1000).toISOString();

    // Define unique storage path: uploads/{publicId}
    const storagePath = `${publicId}/chunks`;

    const supabaseAdmin = getSupabaseAdmin();

    // Insert metadata into DB
    const { data: uploadData, error: dbError } = await supabaseAdmin
      .from("uploads")
      .insert({
        public_id: publicId,
        original_filename: filename,
        storage_path: storagePath,
        mime_type: mimeType,
        file_size: fileSize,
        expires_at: expiresAt,
        max_downloads: maxDownloads || null,
        password_hash: passwordHash,
        upload_status: "pending",
        uploader_ip_hash: ipHash,
        chunk_count: chunkCount,
        delete_token: deleteToken,
      })
      .select("id")
      .single();

    if (dbError || !uploadData) {
      console.error("DB Error initiating upload:", dbError);
      return NextResponse.json({ error: "Failed to initiate upload in database" }, { status: 500 });
    }

    // Generate signed upload URLs for each chunk
    const chunks = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunkPath = `${publicId}/chunks/${i}`;
      
      // Request signed upload URL from Supabase Storage
      const { data: uploadUrlData, error: storageError } = await supabaseAdmin.storage
        .from("ephemeral-files")
        .createSignedUploadUrl(chunkPath);

      if (storageError || !uploadUrlData) {
        console.error(`Storage Error generating upload URL for chunk ${i}:`, storageError);
        
        // Cleanup database on failure
        await supabaseAdmin.from("uploads").delete().eq("id", uploadData.id);
        
        return NextResponse.json(
          { error: "Failed to generate upload authorization from storage" },
          { status: 500 }
        );
      }

      chunks.push({
        index: i,
        uploadUrl: uploadUrlData.signedUrl,
        path: chunkPath,
      });
    }

    return NextResponse.json({
      publicId,
      deleteToken,
      expiresAt,
      chunks,
    });
  } catch (error) {
    console.error("Unexpected error in initiate endpoint:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
