import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const completeSchema = z.object({
  publicId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = completeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid publicId provided" }, { status: 400 });
    }

    const { publicId } = validation.data;
    const supabaseAdmin = getSupabaseAdmin();

    // Retrieve upload metadata from database
    const { data: upload, error: dbError } = await supabaseAdmin
      .from("uploads")
      .select("*")
      .eq("public_id", publicId)
      .single();

    if (dbError || !upload) {
      return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
    }

    if (upload.upload_status !== "pending") {
      return NextResponse.json(
        { error: `Upload is already in '${upload.upload_status}' status` },
        { status: 400 }
      );
    }

    // Verify files in storage
    const { data: files, error: storageError } = await supabaseAdmin.storage
      .from("ephemeral-files")
      .list(`${publicId}/chunks`);

    if (storageError || !files) {
      console.error("Storage listing error:", storageError);
      return NextResponse.json({ error: "Failed to verify files in storage" }, { status: 500 });
    }

    // Check if the number of files matches the chunk count
    if (files.length !== upload.chunk_count) {
      console.error(
        `Chunk count mismatch for ${publicId}. DB expects ${upload.chunk_count}, found ${files.length} in storage.`
      );
      return NextResponse.json(
        { error: "Chunk count mismatch. Some chunks may not have uploaded." },
        { status: 400 }
      );
    }

    // Validate that file names match 0, 1, 2, ..., chunk_count - 1
    const fileNames = files.map((f) => f.name).sort((a, b) => parseInt(a) - parseInt(b));
    for (let i = 0; i < upload.chunk_count; i++) {
      if (fileNames[i] !== i.toString()) {
        return NextResponse.json(
          { error: `Missing chunk index ${i} in storage` },
          { status: 400 }
        );
      }
    }

    // Optional: Sum size and check
    const totalChunkSize = files.reduce((acc, curr) => acc + (curr.metadata?.size || 0), 0);
    // Note: Sometimes storage files metadata size may slightly differ due to headers or transfer encoding, 
    // but usually matches exactly. Let's log it.
    console.log(`Verified upload ${publicId}. Total chunk size in storage: ${totalChunkSize} bytes.`);

    // Update status to completed
    const { error: updateError } = await supabaseAdmin
      .from("uploads")
      .update({ upload_status: "completed" })
      .eq("id", upload.id);

    if (updateError) {
      console.error("DB Error updating status:", updateError);
      return NextResponse.json({ error: "Failed to complete upload session" }, { status: 500 });
    }

    return NextResponse.json({
      status: "success",
      publicId: upload.public_id,
      filename: upload.original_filename,
      fileSize: upload.file_size,
    });
  } catch (error) {
    console.error("Unexpected error in complete endpoint:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
