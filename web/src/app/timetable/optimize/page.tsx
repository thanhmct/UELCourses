"use client";

import { useRouter } from "next/navigation";
import { TimetableWorkspace } from "../TimetableWorkspace";

export default function OptimizeTimetablePage() {
  const router = useRouter();

  return <TimetableWorkspace view="optimize" onSaved={(message) => {
    router.push("/timetable");
    window.dispatchEvent(new CustomEvent("uel:toast", { detail: message }));
  }} />;
}
