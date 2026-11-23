"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useWorkspace } from "@/lib/workspace";
import { Loading } from "@/components/ui";

/** Legacy URL /regulations/<doc>#dieu-N -> opens the doc in the workspace. */
export default function RegulationRedirect() {
  const { docId } = useParams<{ docId: string }>();
  const router = useRouter();
  useEffect(() => {
    useWorkspace.getState().open(decodeURIComponent(docId), window.location.hash.slice(1) || undefined);
    router.replace("/regulations");
  }, [docId, router]);
  return <Loading />;
}
