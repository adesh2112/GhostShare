import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { hashIp, comparePassword } from "@/utils/crypto";
import { signDownloadToken } from "@/utils/token";

const verifySchema = z.object({
  password: z.string(),
});

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: publicId } = await params;
    const body = await request.json();
    const validation = verifySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    const { password } = validation.data;
    const supabaseAdmin = getSupabaseAdmin();

    // Fetch the upload from DB
    const { data: upload, error: dbError } = await supabaseAdmin
      .from("uploads")
      .select("*")
      .eq("public_id", publicId)
      .single();

    if (dbError || !upload) {
      return NextResponse.json({ error: "Upload session not found" }, { status: 404 });
    }

    // Check expiration and download limits
    if (
      upload.upload_status === "expired" ||
      new Date(upload.expires_at).getTime() < Date.now() ||
      (upload.max_downloads !== null && upload.current_downloads >= upload.max_downloads)
    ) {
      return NextResponse.json({ error: "File share has expired or limit reached" }, { status: 410 });
    }

    if (!upload.password_hash) {
      // No password required for this file
      const token = signDownloadToken(publicId);
      return NextResponse.json({ token });
    }

    // IP address rate limit check
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";
    const ipHash = hashIp(ip);

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { count, error: countError } = await supabaseAdmin
      .from("failed_attempts")
      .select("id", { count: "exact", head: true })
      .eq("upload_id", upload.id)
      .eq("ip_hash", ipHash)
      .gt("attempted_at", fifteenMinutesAgo);

    if (countError) {
      console.error("Error checking rate limits:", countError);
    }

    if (count && count >= 5) {
      return NextResponse.json(
        { error: "Too many failed attempts. Please try again in 15 minutes." },
        { status: 429 }
      );
    }

    // Verify password
    const isMatch = await comparePassword(password, upload.password_hash);

    if (!isMatch) {
      // Log failed attempt in DB
      await supabaseAdmin.from("failed_attempts").insert({
        upload_id: upload.id,
        ip_hash: ipHash,
      });

      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    // Successful authentication: generate download token
    const token = signDownloadToken(publicId);

    // Clean up failed attempts on successful verification
    await supabaseAdmin
      .from("failed_attempts")
      .delete()
      .eq("upload_id", upload.id)
      .eq("ip_hash", ipHash);

    return NextResponse.json({ token });
  } catch (error) {
    console.error("Unexpected error in verify password endpoint:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
