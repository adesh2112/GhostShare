import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id: publicId } = await params;
    const url = new URL(request.url);
    const deleteToken = url.searchParams.get("token") || "";

    if (!deleteToken) {
      return NextResponse.json({ error: "Delete token is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Fetch the upload details from the database
    const { data: upload, error: dbError } = await supabaseAdmin
      .from("uploads")
      .select("*")
      .eq("public_id", publicId)
      .single();

    if (dbError || !upload) {
      return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
    }

    // Verify delete token
    if (upload.delete_token !== deleteToken) {
      return NextResponse.json({ error: "Unauthorized delete request" }, { status: 403 });
    }

    // 1. Delete all chunks from storage
    // List chunks first
    const { data: files, error: listError } = await supabaseAdmin.storage
      .from("ephemeral-files")
      .list(`${publicId}/chunks`);

    if (listError) {
      console.error(`Error listing chunks for deletion of ${publicId}:`, listError);
    }

    if (files && files.length > 0) {
      const pathsToDelete = files.map((f) => `${publicId}/chunks/${f.name}`);
      const { error: deleteStorageError } = await supabaseAdmin.storage
        .from("ephemeral-files")
        .remove(pathsToDelete);

      if (deleteStorageError) {
        console.error(`Error removing chunks from storage for ${publicId}:`, deleteStorageError);
      }
    }

    // 2. Delete database record
    const { error: deleteDbError } = await supabaseAdmin
      .from("uploads")
      .delete()
      .eq("id", upload.id);

    if (deleteDbError) {
      console.error(`Error deleting database record for ${publicId}:`, deleteDbError);
      return NextResponse.json({ error: "Failed to delete file metadata" }, { status: 500 });
    }

    return NextResponse.json({ status: "success", message: "File sharing session manually deleted" });
  } catch (error) {
    console.error("Unexpected error in manual delete endpoint:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
