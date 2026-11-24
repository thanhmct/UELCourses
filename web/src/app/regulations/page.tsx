"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChatWindow } from "@/components/regulations/ChatWindow";
import { wikilinkHref } from "@/lib/vault";

export default function RegulationsPage() {
  const router = useRouter();

  // Preserve old citation URLs, including the fragment that only the browser sees.
  useEffect(() => {
    const doc = new URLSearchParams(window.location.search).get("doc");
    if (doc) router.replace(wikilinkHref(doc) + window.location.hash);
  }, [router]);

  return (
    <section className="card mx-auto h-[calc(100dvh-10rem)] min-h-[420px] w-full max-w-5xl overflow-hidden p-0 md:h-[calc(100dvh-7rem)]">
      <ChatWindow />
    </section>
  );
}
