import type { Metadata } from "next";
import { SoloClient } from "@/components/SoloClient";

export const metadata: Metadata = {
  title: "오늘의 단어",
  description: "하루에 한 번, 모두에게 똑같이 주어지는 오늘의 단어를 다섯 번 안에 맞혀보세요.",
};

export default function DailyPage() {
  return <SoloClient mode="daily" />;
}
