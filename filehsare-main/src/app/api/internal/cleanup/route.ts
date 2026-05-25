import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { validateEnv } from "@/config/env";

export async function POST(request: NextRequest) {
  try {
    const env = validateEnv();
    const authHeader = request.headers.get("Authorization") || request.headers.get("x-cron-secret");
    
    // Extract token
    const token = authHeader?.replace("Bearer ", "") || "";

    if (token !== env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized cleanup trigger" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    // Query for expired uploads
    // We fetch uploads where:
    // - expires_at is in the past, OR
    // - upload_status is marked 'expired', OR
    // - download limit reached (max_downloads is not null and current_downloads >= max_downloads)
    const { data: expiredUploads, error: dbQueryError } = await supabaseAdmin
      .from("uploads")
      .select("*");

    if (dbQueryError || !expiredUploads) {
      console.error("Error querying expired uploads:", dbQueryError);
      return NextResponse.json({ error: "Failed to query uploads from database" }, { status: 500 });
    }

    const toClean = expiredUploads.filter((upload) => {
      const isTimeExpired = new Date(upload.expires_at).getTime() < Date.now();
      const isStatusExpired = upload.upload_status === "expired";
      const isLimitExpired =
        upload.max_downloads !== null && upload.current_downloads >= upload.max_downloads;
      
      return isTimeExpired || isStatusExpired || isLimitExpired;
    });

    if (toClean.length === 0) {
      return NextResponse.json({
        status: "success",
        message: "No expired files to clean up",
        cleanedCount: 0,
      });
    }

    const results = [];

    for (const upload of toClean) {
      const publicId = upload.public_id;
      
      // 1. Delete all chunks from storage
      const { data: files, error: listError } = await supabaseAdmin.storage
        .from("ephemeral-files")
        .list(`${publicId}/chunks`);

      if (listError) {
        console.error(`Cleanup: Error listing chunks for ${publicId}:`, listError);
      }

      let storageSuccess = true;
      if (files && files.length > 0) {
        const pathsToDelete = files.map((f) => `${publicId}/chunks/${f.name}`);
        const { error: deleteStorageError } = await supabaseAdmin.storage
          .from("ephemeral-files")
          .remove(pathsToDelete);

        if (deleteStorageError) {
          console.error(`Cleanup: Error removing chunks from storage for ${publicId}:`, deleteStorageError);
          storageSuccess = false;
        }
      }

      // 2. Delete database record (cascade deletes logs and failed attempts)
      const { error: deleteDbError } = await supabaseAdmin
        .from("uploads")
        .delete()
        .eq("id", upload.id);

      let dbSuccess = true;
      if (deleteDbError) {
        console.error(`Cleanup: Error deleting DB record for ${publicId}:`, deleteDbError);
        dbSuccess = false;
      }

      results.push({
        publicId,
        filename: upload.original_filename,
        storageCleaned: storageSuccess,
        dbCleaned: dbSuccess,
      });
    }

    console.log(`[CLEANUP JOB] Finished. Cleaned ${results.length} files. Details:`, results);

    return NextResponse.json({
      status: "success",
      message: `Cleaned up ${results.length} expired file(s)`,
      cleanedCount: results.length,
      details: results,
    });
  } catch (error) {
    console.error("Unexpected error in cleanup endpoint:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
