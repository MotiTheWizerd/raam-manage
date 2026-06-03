import { getSlprRemoteUrl } from "@/lib/slpr-mysql";

export const dynamic = "force-dynamic";

function buildRemoteImageUrl(rawPath: string): string {
  const remoteUrl = getSlprRemoteUrl();
  if (!remoteUrl) throw new Error("SLPR remote URL is missing");

  const normalized = rawPath.trim().replaceAll("\\", "/");
  if (!normalized.startsWith("/SavedImages/")) {
    throw new Error("Unsupported SLPR image path");
  }

  const encodedPath = normalized
    .split("/")
    .map((part, index) => (index === 0 ? "" : encodeURIComponent(part)))
    .join("/");

  return new URL(encodedPath, remoteUrl.endsWith("/") ? remoteUrl : `${remoteUrl}/`).toString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const imagePath = url.searchParams.get("path");
  if (!imagePath) return new Response("Missing image path", { status: 400 });

  let remoteImageUrl: string;
  try {
    remoteImageUrl = buildRemoteImageUrl(imagePath);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid image path", {
      status: 400,
    });
  }

  const response = await fetch(remoteImageUrl, { cache: "no-store" });
  if (!response.ok) {
    return new Response("SLPR image was not found", { status: response.status });
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "image/jpeg",
      "Cache-Control": "private, max-age=30",
    },
  });
}

