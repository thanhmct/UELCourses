"use client";
import { useParams } from "next/navigation";
import { RegulationInfoCard } from "@/components/regulations/RegulationInfoCard";

export default function RegulationDocumentPage() {
  const { docId } = useParams<{ docId: string }>();

  return (
    <div className="card mx-auto max-w-3xl p-4 sm:p-6">
      <RegulationInfoCard key={docId} docId={docId} />
    </div>
  );
}
