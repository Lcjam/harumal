"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DailyDto, PracticeDto, SoloGuessResultDto, SoloPlayDto, SoloStatsDto } from "@/lib/contracts";
import { feedbackToEmoji } from "@/lib/game";
import { apiFetch } from "@/lib/client-api";
import { PuzzlePad } from "./PuzzlePad";

type Mode = "daily" | "practice";

function durationText(durationMs: number | null): string {
  if (durationMs === null) return "—";
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  // 오늘의 단어는 아침에 열어 두고 저녁에 풀 수도 있어서 시간 단위까지 씁니다.
  if (hours) return `${hours}시간 ${minutes}분`;
  return minutes ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

function remainingText(endAt: string, now: number): string {
  const remaining = Math.max(0, new Date(endAt).getTime() - now);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${hours}시간 ${minutes}분`;
}

function statusLabel(play: SoloPlayDto): string {
  if (play.status === "solved") return "정답 성공";
  if (play.status === "failed") return "도전 종료";
  return "도전 중";
}

export function SoloClient({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [play, setPlay] = useState<SoloPlayDto | null>(null);
  const [stats, setStats] = useState<SoloStatsDto | null>(null);
  const [endsAt, setEndsAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [guessError, setGuessError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "daily") {
        const daily = await apiFetch<DailyDto>("/api/daily");
        setPlay(daily.play);
        setStats(daily.stats);
        setEndsAt(daily.endsAt);
      } else {
        const practice = await apiFetch<PracticeDto>("/api/practice", { method: "POST" });
        setPlay(practice.play);
      }
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문제를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function submitGuess(guess: string) {
    if (!play || play.status !== "active") return;
    setSubmitting(true);
    setGuessError("");
    try {
      const result = await apiFetch<SoloGuessResultDto>(`/api/solo/plays/${play.id}/guesses`, {
        method: "POST",
        body: JSON.stringify({ guess }),
      });
      setPlay(result.play);
      if (result.stats) setStats(result.stats);
    } catch (caught) {
      setGuessError(caught instanceof Error ? caught.message : "추측을 제출하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function nextWord() {
    setSwitching(true);
    setGuessError("");
    try {
      const result = await apiFetch<PracticeDto>("/api/practice/next", { method: "POST" });
      setPlay(result.play);
      setNotice(result.skippedAnswer ? `건너뛴 단어의 정답은 “${result.skippedAnswer}”였어요.` : "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "새 단어를 받지 못했습니다.");
    } finally {
      setSwitching(false);
    }
  }

  async function shareResult() {
    if (!play || play.status === "active") return;
    const grid = play.attempts.map((attempt) => feedbackToEmoji(attempt.feedback)).join("\n");
    const headline = mode === "daily"
      ? `하루말 오늘의 단어 ${play.playDate}`
      : "하루말 연습 모드";
    const score = play.status === "solved" ? `${play.attempts.length}/5` : "X/5";
    const url = `${window.location.origin}${mode === "daily" ? "/daily" : "/practice"}`;
    const text = `${headline}\n${score}\n${grid}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: headline, text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setNotice("결과를 복사했습니다.");
      }
    } catch {
      // 공유는 사용자가 취소할 수 있습니다.
    }
  }

  if (loading) {
    return <main className="loadingPage"><div className="loadingMark">ㅎ</div><p>단어를 준비하는 중…</p></main>;
  }

  if (!play) {
    return (
      <main className="statePage">
        <section>
          <span>!</span>
          <h1>문제를 열 수 없어요.</h1>
          <p>{error}</p>
          <button className="primaryButton" onClick={() => router.push("/")}>처음으로</button>
        </section>
      </main>
    );
  }

  const finished = play.status !== "active";
  const winRate = stats && stats.playedCount ? Math.round((stats.solvedCount / stats.playedCount) * 100) : 0;
  const bestDistribution = stats ? Math.max(1, ...stats.distribution) : 1;

  return (
    <main className="soloPage">
      <section className="puzzlePanel">
        <header>
          <button onClick={() => router.push("/")} aria-label="처음 화면으로">← <span>홈으로</span></button>
          <div>
            <small>{mode === "daily" ? "오늘의 단어" : "연습 모드"}</small>
            <b>{play.attempts.length} / 5</b>
          </div>
          <span>{statusLabel(play)}</span>
        </header>

        <div className="puzzleBody">
          {notice && <button className="soloNotice" onClick={() => setNotice("")}>{notice}<span>×</span></button>}

          <div className="puzzleHeading">
            <span>{mode === "daily" ? `${play.playDate} 한 문제` : "몇 번이든 다시"}</span>
            <h2>자모 {play.jamoLength}칸</h2>
            <p>힌트 없이 색 단서만으로 · 기회는 다섯 번</p>
          </div>

          <PuzzlePad
            attempts={play.attempts}
            length={play.jamoLength}
            active={!finished}
            submitting={submitting}
            error={guessError}
            onSubmit={(guess) => void submitGuess(guess)}
          />

          {!finished ? (
            <>
              {mode === "practice" && (
                <button className="soloSkipButton" onClick={() => void nextWord()} disabled={switching}>
                  {switching ? "새 단어를 가져오는 중…" : "이 단어 건너뛰기"}
                </button>
              )}
            </>
          ) : (
            <>
              <div className={`puzzleResult ${play.status}`}>
                <span>{play.status === "solved" ? "♛" : "!"}</span>
                <div>
                  <small>정답</small>
                  <h3>{play.answer}</h3>
                  <p>
                    {play.status === "solved"
                      ? `${play.attempts.length}번째 시도 · ${durationText(play.durationMs)}`
                      : "다섯 번의 도전 끝에 공개됐어요."}
                  </p>
                </div>
                <button className="kakaoShareButton" onClick={() => void shareResult()}>결과 공유</button>
              </div>

              {mode === "practice" ? (
                <button className="primaryButton wide soloNextButton" onClick={() => void nextWord()} disabled={switching}>
                  <span>{switching ? "잠시만요…" : "새 단어 받기"}</span><b>→</b>
                </button>
              ) : (
                <p className="soloTomorrow">다음 단어까지 {remainingText(endsAt, now)} 남았어요.</p>
              )}
            </>
          )}

          {mode === "daily" && stats && (
            <section className="soloStats">
              <div className="soloStatsGrid">
                <div><b>{stats.currentStreak}</b><span>현재 연속</span></div>
                <div><b>{stats.bestStreak}</b><span>최고 연속</span></div>
                <div><b>{stats.playedCount}</b><span>푼 날</span></div>
                <div><b>{winRate}%</b><span>정답률</span></div>
              </div>
              <div className="soloDistribution">
                <p>시도 횟수별 정답</p>
                {stats.distribution.map((count, index) => (
                  <div key={index}>
                    <small>{index + 1}</small>
                    <i style={{ width: `${Math.max(6, (count / bestDistribution) * 100)}%` }}>{count}</i>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="soloSwitch">
            {mode === "daily"
              ? <Link href="/practice">연습 모드로 계속 풀기 →</Link>
              : <Link href="/daily">오늘의 단어 풀러 가기 →</Link>}
            <Link href="/">친구들과 방에서 하기 →</Link>
          </div>
        </div>

        <footer className="puzzleLegend">
          <span><i className="correct" />자모와 위치가 정확</span>
          <span><i className="present" />자모는 있고 위치가 다름</span>
          <span><i className="absent" />정답에 없는 자모</span>
        </footer>
      </section>
    </main>
  );
}
