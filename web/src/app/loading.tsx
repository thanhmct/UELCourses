"use client";

import { Loading } from "@/components/ui";

export default function PageLoading() {
  return (
    <div className="grid min-h-[55dvh] place-items-center px-3 text-center">
      <Loading compact />
    </div>
  );
}
