import { optimizeTimetable, type OptimizationInput } from "@/lib/timetableOptimizer";

self.onmessage = ({ data }: MessageEvent<OptimizationInput>) => {
  self.postMessage(optimizeTimetable(data));
};
