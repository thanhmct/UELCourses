"use client";

import { useSettings } from "@/lib/store";
import { useMounted } from "@/lib/useMounted";
import { ProgramProfileDialog } from "./ProgramProfileDialog";

/** Hộp thoại chào lần đầu: hỏi mã lớp và ngành 2 thông qua ProgramProfileDialog. Có thể đổi sau trong Cài đặt hoặc trên thanh trên. */
export function FirstVisitModal() {
  const mounted = useMounted();
  const programCode = useSettings((s) => s.programCode);
  const prompted = useSettings((s) => s.programPrompted);
  const setPrompted = useSettings((s) => s.setProgramPrompted);

  if (!mounted || prompted || programCode) return null;

  return (
    <ProgramProfileDialog
      open={true}
      onClose={() => setPrompted(true)}
      firstVisit={true}
    />
  );
}
