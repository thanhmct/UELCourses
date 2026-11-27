"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

export function OfflineSafeSticker(props: ImageProps) {
  const [unavailableSrc, setUnavailableSrc] = useState<string | null>(null);
  if (unavailableSrc === props.src) return null;
  return <Image {...props} alt={props.alt} onError={() => setUnavailableSrc(String(props.src))} />;
}
