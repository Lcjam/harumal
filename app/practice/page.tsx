import type { Metadata } from "next";
import { SoloClient } from "@/components/SoloClient";

export const metadata: Metadata = {
  title: "연습 모드",
  description: "친구를 기다리는 동안 혼자서 자모 단어를 몇 번이든 풀어보세요.",
};

export default function PracticePage() {
  return <SoloClient mode="practice" />;
}
