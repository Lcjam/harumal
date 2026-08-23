import type { Metadata } from "next";
import { HomeClient } from "@/components/HomeClient";

export const metadata: Metadata = {
  title: "하루말 — 단어 맞추기",
  description: "자음과 모음 단서로 숨겨진 단어를 맞히는 게임. 혼자서 또는 최대 6명의 친구와 즐겨보세요.",
};

export default function WordGamePage() {
  return <HomeClient />;
}
