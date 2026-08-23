"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/client-api";
import { Brand } from "./Brand";

type Mode = "create" | "join";

export function HomeClient() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("create");
  const [nickname, setNickname] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setNickname(window.localStorage.getItem("harumal_nickname") ?? "");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cleanNickname = nickname.trim();
      if (!cleanNickname) throw new Error("닉네임을 입력해 주세요.");
      if (!/^\d{4}$/.test(pin)) throw new Error("재입장 비밀번호를 숫자 4자리로 입력해 주세요.");
      window.localStorage.setItem("harumal_nickname", cleanNickname);
      if (mode === "create") {
        const room = await apiFetch<{ code: string }>("/api/rooms", {
          method: "POST",
          body: JSON.stringify({ nickname: cleanNickname, pin }),
        });
        router.push(`/r/${room.code}`);
      } else {
        const cleanCode = code.trim().toUpperCase();
        if (cleanCode.length !== 6) throw new Error("6자리 초대코드를 입력해 주세요.");
        await apiFetch(`/api/rooms/${cleanCode}/join`, {
          method: "POST",
          body: JSON.stringify({ nickname: cleanNickname, pin }),
        });
        router.push(`/r/${cleanCode}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="homePage">
      <header className="siteHeader">
        <Brand />
        <div className="wordHeaderActions">
          <Link className="allGamesLink" href="/">게임 모음</Link>
          <span className="dateChip">오늘 23:59까지</span>
        </div>
      </header>

      <section className="homeHero">
        <div className="homeCopy">
          <p className="eyebrow"><span>DAILY WORD RACE</span> 친구랑 매일 한 판</p>
          <h1>한 명도 쉬지 않는<br /><em>우리들의 단어 게임.</em></h1>
          <p className="heroLead">
            각자 한 문제를 내고 친구들의 문제를 풀어요. 단어는 자음과 모음으로 쪼개지고,
            다섯 번의 단서 끝에 오늘의 순위가 정해집니다.
          </p>

          <div className="ruleStrip" aria-label="핵심 게임 규칙">
            <div><b>6</b><span>최대 인원</span></div>
            <div><b>1</b><span>한 사람당 문제</span></div>
            <div><b>5</b><span>문제별 기회</span></div>
            <div><b>DAY</b><span>오늘만 유효</span></div>
          </div>
        </div>

        <div className="entryPanel">
          <div className="modeTabs" role="tablist" aria-label="방 시작 방식">
            <button role="tab" aria-selected={mode === "create"} className={mode === "create" ? "active" : ""} onClick={() => { setMode("create"); setError(""); }}>새 방 만들기</button>
            <button role="tab" aria-selected={mode === "join"} className={mode === "join" ? "active" : ""} onClick={() => { setMode("join"); setError(""); }}>코드로 참가</button>
          </div>

          <form className="entryForm" onSubmit={submit}>
            <div className="panelHeading">
              <span>{mode === "create" ? "오늘의 방" : "친구의 방"}</span>
              <h2>{mode === "create" ? "친구들을 불러볼까요?" : "초대코드를 받았나요?"}</h2>
              <p>{mode === "create" ? "가입 없이 방을 만들고 링크를 공유하세요." : "닉네임과 코드만 있으면 바로 참가할 수 있어요."}</p>
            </div>

            <label htmlFor="nickname">내 닉네임</label>
            <input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, 12))} placeholder="예: 단어왕민지" autoComplete="nickname" />

            <label htmlFor="pin">재입장 비밀번호 <em>숫자 4자리</em></label>
            <input
              id="pin"
              className="pinInput"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
            />
            <p className="fieldHelp">창을 닫거나 다른 브라우저에서 다시 들어올 때, 같은 닉네임과 이 번호로 내 자리를 이어받습니다.</p>

            {mode === "join" && (
              <>
                <label htmlFor="room-code">6자리 초대코드</label>
                <input id="room-code" className="codeInput" value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6))} placeholder="H6RUMA" autoComplete="off" />
              </>
            )}

            {error && <p className="formError" role="alert">{error}</p>}
            <button className="primaryButton wide" type="submit" disabled={loading}>
              <span>{loading ? "잠시만요…" : mode === "create" ? "방 만들기" : "참가하기"}</span><b>→</b>
            </button>
          </form>

          <div className="soloEntry">
            <p>혼자서도 풀 수 있어요</p>
            <div>
              <Link href="/daily">오늘의 단어 <b>→</b></Link>
              <Link href="/practice">연습 모드 <b>→</b></Link>
            </div>
          </div>
        </div>
      </section>

      <section className="homeHow">
        <p className="sectionLabel">HOW IT WORKS</p>
        <div className="howGrid">
          <article><span>01</span><h3>각자 하나씩 출제</h3><p>단어를 하나 등록하면 친구들의 문제 목록에 실시간으로 나타나요.</p></article>
          <article><span>02</span><h3>자모 단서로 추리</h3><p><b>사진</b>은 <b>ㅅ ㅏ ㅈ ㅣ ㄴ</b>. 초록·노랑·검정 단서로 다섯 번 안에 맞혀요.</p></article>
          <article><span>03</span><h3>오늘의 순위 완성</h3><p>정답 수, 시도 횟수, 풀이 시간을 합쳐 23:59에 최종 순위를 정해요.</p></article>
        </div>
      </section>
    </main>
  );
}
