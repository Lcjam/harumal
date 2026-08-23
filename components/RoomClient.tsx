"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import type { ChallengeDto, PublicRoomDto, RoomSnapshotDto } from "@/lib/contracts";
import { decomposeHangul, feedbackToEmoji } from "@/lib/game";
import { apiFetch, ClientApiError } from "@/lib/client-api";
import { Brand } from "./Brand";
import { PuzzlePad } from "./PuzzlePad";

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "";

function remainingText(endAt: string, now: number): string {
  const remaining = Math.max(0, new Date(endAt).getTime() - now);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function durationText(durationMs: number | null): string {
  if (durationMs === null) return "—";
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

function challengeStatus(challenge: ChallengeDto): { label: string; tone: string } {
  if (challenge.isOwn) return { label: challenge.locked ? "친구들이 푸는 중" : "수정 가능", tone: "own" };
  if (!challenge.play) return { label: "도전 가능", tone: "available" };
  if (challenge.play.status === "active") return { label: `${challenge.play.attempts.length}/5 진행 중`, tone: "playing" };
  if (challenge.play.status === "solved") return { label: `${challenge.play.attempts.length}번 만에 성공`, tone: "solved" };
  if (challenge.play.status === "failed") return { label: "아쉽게 실패", tone: "failed" };
  return { label: "시간 종료", tone: "failed" };
}

export function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  const [publicRoom, setPublicRoom] = useState<PublicRoomDto | null>(null);
  const [room, setRoom] = useState<RoomSnapshotDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [nickname, setNickname] = useState("");
  const [pin, setPin] = useState("");
  const [answer, setAnswer] = useState("");
  const [savingChallenge, setSavingChallenge] = useState(false);
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const [guessError, setGuessError] = useState("");
  const [submittingGuess, setSubmittingGuess] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const loadRoom = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const publicData = await apiFetch<PublicRoomDto>(`/api/rooms/${code}/public`);
      setPublicRoom(publicData);
      if (publicData.isMember) {
        const snapshot = await apiFetch<RoomSnapshotDto>(`/api/rooms/${code}`);
        setRoom(snapshot);
      } else {
        setRoom(null);
      }
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "방 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [code]);

  useEffect(() => {
    setNickname(window.localStorage.getItem("harumal_nickname") ?? "");
    void loadRoom();
  }, [loadRoom]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!room) return;
    const socket: Socket = io({ path: "/socket.io", withCredentials: true });
    let refreshTimer: number | undefined;
    socket.on("connect", () => socket.emit("room:subscribe", { code }));
    socket.on("room:updated", () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void loadRoom(true), 180);
    });
    return () => {
      window.clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [code, room?.id, loadRoom]);

  const ownChallenge = room?.challenges.find((challenge) => challenge.isOwn) ?? null;
  useEffect(() => {
    if (!ownChallenge) return;
    setAnswer(ownChallenge.ownAnswer ?? "");
  }, [ownChallenge?.id, ownChallenge?.ownAnswer]);

  const activeChallenge = room?.challenges.find((challenge) => challenge.id === activeChallengeId) ?? null;

  async function join(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const cleanNickname = nickname.trim();
      if (!cleanNickname) throw new Error("닉네임을 입력해 주세요.");
      if (!/^\d{4}$/.test(pin)) throw new Error("재입장 비밀번호를 숫자 4자리로 입력해 주세요.");
      const joined = await apiFetch<{ resumed?: boolean }>(`/api/rooms/${code}/join`, {
        method: "POST",
        body: JSON.stringify({ nickname: cleanNickname, pin }),
      });
      window.localStorage.setItem("harumal_nickname", cleanNickname);
      setPin("");
      if (joined.resumed) setNotice("이전에 쓰던 자리를 이어받았어요. 예전 창에서는 로그아웃됩니다.");
      await loadRoom();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "방에 참가하지 못했습니다.");
    }
  }

  async function saveChallenge(event: FormEvent) {
    event.preventDefault();
    setSavingChallenge(true);
    setError("");
    try {
      await apiFetch(`/api/rooms/${code}/challenge`, {
        method: "PUT",
        body: JSON.stringify({ answer }),
      });
      setNotice(ownChallenge ? "문제를 수정했습니다." : "내 문제가 친구들에게 공개됐습니다!");
      await loadRoom(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문제를 저장하지 못했습니다.");
    } finally {
      setSavingChallenge(false);
    }
  }

  async function openChallenge(challenge: ChallengeDto) {
    setError("");
    setGuessError("");
    if (!challenge.play) {
      try {
        await apiFetch(`/api/challenges/${challenge.id}/start`, { method: "POST" });
        await loadRoom(true);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "문제를 시작하지 못했습니다.");
        return;
      }
    }
    setActiveChallengeId(challenge.id);
  }

  async function submitCurrentGuess(guess: string) {
    if (!activeChallenge?.play || activeChallenge.play.status !== "active") return;
    setSubmittingGuess(true);
    setGuessError("");
    try {
      const result = await apiFetch<{ status: string }>(`/api/plays/${activeChallenge.play.id}/guesses`, {
        method: "POST",
        body: JSON.stringify({ guess }),
      });
      if (result.status === "solved") setNotice("정답입니다! 결과를 카카오톡으로 공유해 보세요.");
      else if (result.status === "failed") setNotice("다섯 번의 도전이 끝났습니다. 다음 문제에 도전해 보세요.");
      await loadRoom(true);
    } catch (caught) {
      setGuessError(caught instanceof Error ? caught.message : "추측을 제출하지 못했습니다.");
    } finally {
      setSubmittingGuess(false);
    }
  }

  async function copyInvite() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "하루말 초대", text: `하루말 방 ${code}에서 같이 단어를 풀어요!`, url });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice("초대 링크를 복사했습니다.");
      }
    } catch {
      // Sharing can be cancelled by the user.
    }
  }

  async function shareResult(challenge: ChallengeDto) {
    if (!challenge.play || challenge.play.status !== "solved" || !room) return;
    const grid = challenge.play.attempts.map((attempt) => feedbackToEmoji(attempt.feedback)).join("\n");
    const shareUrl = window.location.href;
    const title = `${room.currentMember.nickname}님이 ${challenge.play.attempts.length}번 만에 맞혔어요!`;
    const description = `${grid}\n오늘 ${room.currentMember.solvedCount}문제 완료`;

    try {
      if (KAKAO_KEY && window.Kakao) {
        if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_KEY);
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title,
            description,
            imageUrl: `${window.location.origin}/og.png`,
            link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
          },
          buttons: [{ title: "같이 풀기", link: { mobileWebUrl: shareUrl, webUrl: shareUrl } }],
        });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title, text: `${title}\n${description}`, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(`${title}\n${description}\n${shareUrl}`);
        setNotice("결과와 초대 링크를 복사했습니다.");
      }
    } catch {
      setNotice("공유를 취소했거나 공유 기능을 열지 못했습니다.");
    }
  }

  if (loading) {
    return <main className="loadingPage"><Brand /><div className="loadingMark">ㅎ</div><p>오늘의 방을 불러오는 중…</p></main>;
  }

  if (error && !publicRoom) {
    return (
      <main className="statePage"><Brand /><section><span>!</span><h1>방을 열 수 없어요.</h1><p>{error}</p><button className="primaryButton" onClick={() => router.push("/word")}>처음으로</button></section></main>
    );
  }

  if (publicRoom && !room) {
    return (
      <main className="joinPage">
        <header className="siteHeader"><Brand /><span className="dateChip">{publicRoom.playDate}</span></header>
        <section className="joinCard">
          <p className="eyebrow"><span>INVITED</span> 친구가 기다리고 있어요</p>
          <h1><em>{code}</em> 방에<br />참가할까요?</h1>
          <div className="joinStats"><span><b>{publicRoom.memberCount}</b> / {publicRoom.maxMembers}명 참가</span><span><b>{remainingText(publicRoom.endAt, now)}</b> 남음</span></div>
          {publicRoom.canJoin ? (
            <form onSubmit={join}>
              <label htmlFor="join-nickname">내 닉네임</label>
              <input id="join-nickname" value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, 12))} placeholder="예: 단어왕민지" autoFocus />
              <label htmlFor="join-pin">재입장 비밀번호 <em>숫자 4자리</em></label>
              <input
                id="join-pin"
                className="pinInput"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
              />
              <p className="fieldHelp">이미 이 방에 참가한 적이 있다면, 그때 쓴 닉네임과 비밀번호를 넣으면 그 자리로 돌아옵니다.</p>
              {error && <p className="formError" role="alert">{error}</p>}
              <button className="primaryButton wide" type="submit"><span>이 방에 참가하기</span><b>→</b></button>
            </form>
          ) : (
            <div className="closedNotice"><b>참가가 마감됐어요.</b><p>방이 가득 찼거나 오늘의 참가 시간이 지났습니다.</p></div>
          )}
        </section>
      </main>
    );
  }

  if (!room) return null;

  const otherChallenges = room.challenges.filter((challenge) => !challenge.isOwn);
  const pendingMembers = room.members.filter((member) => !member.challengeSubmitted);
  const joinClosed = now >= new Date(room.joinCutoffAt).getTime();
  const ended = room.status === "ended" || now >= new Date(room.endAt).getTime();
  const answerUnits = decomposeHangul(answer);

  return (
    <main className="roomPage">
      <header className="roomHeader">
        <Brand />
        <div className="roomHeaderCenter"><span>오늘의 방</span><b>{code}</b><button onClick={() => void navigator.clipboard.writeText(code).then(() => setNotice("초대코드를 복사했습니다.")).catch(() => setNotice("초대코드를 복사하지 못했습니다."))} aria-label="초대코드 복사">복사</button></div>
        <div className="roomClock"><span>{ended ? "오늘의 게임 종료" : "23:59까지"}</span><b>{remainingText(room.endAt, now)}</b></div>
      </header>

      {notice && <button className="toast" onClick={() => setNotice("")} aria-label="알림 닫기">{notice}<span>×</span></button>}

      <section className="roomIntro">
        <div>
          <p className="eyebrow"><span>{ended ? "FINISHED" : "PLAYING TODAY"}</span> {room.playDate}</p>
          <h1>{room.currentMember.nickname}님,<br /><em>{ended ? "오늘의 결과가 나왔어요." : "친구들의 단어가 왔어요."}</em></h1>
        </div>
        <button className="kakaoInviteButton" onClick={copyInvite}><span>💬</span><div><b>친구 초대하기</b><small>링크 또는 공유 메뉴로 보내기</small></div><strong>→</strong></button>
      </section>

      <div className="roomLayout">
        <section className="roomMain">
          <article className={`ownChallengePanel ${ownChallenge ? "published" : ""}`}>
            <div className="panelTopline"><span>MY QUESTION</span><b>{ownChallenge ? ownChallenge.locked ? "🔒 풀이 시작됨" : "수정 가능" : "아직 출제 전"}</b></div>
            <div className="ownChallengeGrid">
              <div className="ownChallengeCopy">
                <h2>{ownChallenge ? "내 문제도 게임에 참여 중!" : "친구들에게 낼 문제를 적어주세요."}</h2>
                <p>{ownChallenge ? `${ownChallenge.startedCount}명이 시작했고 ${ownChallenge.solvedCount}명이 맞혔어요.` : "본인 문제를 제출해야 오늘의 순위에 포함됩니다."}</p>
                {ownChallenge?.locked && <div className="lockedAnswer"><span>내 정답</span><b>{ownChallenge.ownAnswer}</b><small>첫 풀이가 시작되어 수정할 수 없어요.</small></div>}
              </div>

              {(!ownChallenge || !ownChallenge.locked) && !ended && !joinClosed && (
                <form className="challengeForm" onSubmit={saveChallenge}>
                  <label htmlFor="answer">정답</label>
                  <div className="answerInputLine"><input id="answer" value={answer} onChange={(event) => setAnswer(event.target.value.replace(/\s/g, "").slice(0, 12))} placeholder="예: 사진" maxLength={12} /><div>{answerUnits.map((unit, index) => <b key={`${unit}-${index}`}>{unit}</b>)}</div></div>
                  <p className="fieldHelp">힌트가 없으니 사전에 있는 단어만 낼 수 있어요. 친구들은 자모 개수와 색 단서만으로 추리합니다.</p>
                  {error && <p className="formError" role="alert">{error}</p>}
                  <button className="secondaryButton" type="submit" disabled={savingChallenge}>{savingChallenge ? "저장 중…" : ownChallenge ? "문제 수정하기" : "문제 공개하기 →"}</button>
                </form>
              )}
            </div>
          </article>

          <div className="challengeSectionHeader">
            <div><span>FRIENDS&apos; QUESTIONS</span><h2>내가 풀 문제</h2></div>
            <p><b>{otherChallenges.filter((challenge) => challenge.play?.status === "solved").length}</b> / {Math.max(0, room.memberCount - 1)} 완료</p>
          </div>

          {otherChallenges.length ? (
            <div className="challengeGrid">
              {otherChallenges.map((challenge, index) => {
                const status = challengeStatus(challenge);
                return (
                  <article className={`challengeCard ${status.tone}`} key={challenge.id}>
                    <div className="challengeNumber">{String(index + 1).padStart(2, "0")}</div>
                    <div className="challengeOwner"><span>{challenge.authorNickname.slice(0, 1)}</span><div><b>{challenge.authorNickname}의 문제</b><small>{challenge.jamoLength}개 자모</small></div></div>
                    <p className="challengeShape" aria-label={`자모 ${challenge.jamoLength}칸`}>
                      {Array.from({ length: challenge.jamoLength }, (_, slot) => <i key={slot} />)}
                    </p>
                    <div className="challengeMeta"><span>{status.label}</span><small>{challenge.solvedCount}/{Math.max(1, room.memberCount - 1)}명 정답</small></div>
                    <button onClick={() => void openChallenge(challenge)} disabled={ended || challenge.play?.status === "expired"}>
                      {challenge.play?.status === "solved" || challenge.play?.status === "failed" ? "결과 보기" : challenge.play ? "계속 풀기" : "도전하기"} <b>→</b>
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="emptyChallenges"><span>✎</span><h3>친구들의 문제를 기다리는 중</h3><p>문제가 등록되면 새로고침 없이 바로 나타납니다.</p></div>
          )}
        </section>

        <aside className="roomSidebar">
          <section className="leaderboardPanel">
            <div className="sidebarTitle"><span>LIVE RANKING</span><b>{refreshing ? "갱신 중" : "실시간"}</b></div>
            <ol>
              {room.leaderboard.map((entry) => (
                <li className={entry.memberId === room.currentMember.id ? "me" : ""} key={entry.memberId}>
                  <span>{entry.rank ?? "–"}</span>
                  <div className="memberAvatar">{entry.nickname.slice(0, 1)}</div>
                  <div><b>{entry.nickname}{entry.memberId === room.currentMember.id ? " · 나" : ""}</b><small>{entry.submittedChallenge ? `${entry.solvedCount}문제 · ${entry.attemptCount}회 시도` : "출제 대기 중"}</small></div>
                  <strong>{entry.submittedChallenge ? durationText(entry.totalDurationMs) : "미등록"}</strong>
                </li>
              ))}
            </ol>
            <p className="rankingRule">정답 수 → 적은 시도 → 짧은 시간 순서</p>
          </section>

          <section className="membersPanel">
            <div className="sidebarTitle"><span>MEMBERS</span><b>{room.memberCount} / {room.maxMembers}</b></div>
            <div className="memberChips">
              {room.members.map((member) => <span className={member.challengeSubmitted ? "ready" : ""} key={member.id}><i>{member.nickname.slice(0, 1)}</i>{member.nickname}<b>{member.challengeSubmitted ? "✓" : "…"}</b></span>)}
            </div>
            {pendingMembers.length > 0 && !joinClosed && <p>{pendingMembers.map((member) => member.nickname).join(", ")}님의 문제를 기다리고 있어요.</p>}
            <div className="deadlineNote"><b>{joinClosed ? "출제 마감" : "23:59 출제 마감"}</b><span>입장·출제·풀이는 자정 직전에 함께 종료됩니다.</span></div>
          </section>
        </aside>
      </div>

      {activeChallenge && activeChallenge.play && (
        <div className="puzzleBackdrop" role="presentation">
          <section className="puzzlePanel" role="dialog" aria-modal="true" aria-labelledby="puzzle-title">
            <header>
              <button onClick={() => { setActiveChallengeId(null); }} aria-label="문제 닫기">← <span>방으로</span></button>
              <div><small>{activeChallenge.authorNickname}의 문제</small><b>{activeChallenge.play.attempts.length} / 5</b></div>
              <span>{activeChallenge.play.status === "active" ? "도전 중" : activeChallenge.play.status === "solved" ? "정답 성공" : "도전 종료"}</span>
            </header>

            <div className="puzzleBody">
              <div className="puzzleHeading"><span>{activeChallenge.authorNickname}의 문제</span><h2 id="puzzle-title">자모 {activeChallenge.jamoLength}칸</h2><p>힌트 없이 색 단서만으로 · 기회는 다섯 번</p></div>
              <PuzzlePad
                attempts={activeChallenge.play.attempts}
                length={activeChallenge.jamoLength}
                active={activeChallenge.play.status === "active"}
                submitting={submittingGuess}
                error={guessError}
                onSubmit={(guess) => void submitCurrentGuess(guess)}
              />

              {activeChallenge.play.status !== "active" && (
                <div className={`puzzleResult ${activeChallenge.play.status}`}>
                  <span>{activeChallenge.play.status === "solved" ? "♛" : "!"}</span>
                  <div><small>정답</small><h3>{activeChallenge.play.answer}</h3><p>{activeChallenge.play.status === "solved" ? `${activeChallenge.play.attempts.length}번째 시도 · ${durationText(activeChallenge.play.durationMs)}` : "다섯 번의 도전 끝에 공개됐어요."}</p></div>
                  {activeChallenge.play.status === "solved" && <button className="kakaoShareButton" onClick={() => void shareResult(activeChallenge)}>💬 카카오톡으로 결과 공유</button>}
                </div>
              )}
            </div>

            <footer className="puzzleLegend"><span><i className="correct" />자모와 위치가 정확</span><span><i className="present" />자모는 있고 위치가 다름</span><span><i className="absent" />정답에 없는 자모</span></footer>
          </section>
        </div>
      )}
    </main>
  );
}
