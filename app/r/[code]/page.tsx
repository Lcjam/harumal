import type { Metadata } from "next";
import { RoomClient } from "@/components/RoomClient";

export const metadata: Metadata = {
  title: "친구 방",
  description: "초대코드로 하루말 친구 방에 참가하세요.",
};

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomClient code={code.toUpperCase()} />;
}
