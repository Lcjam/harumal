import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "enjoylcjworld — 하루말 · CrewDeal" },
  description: "매일 한 판 즐기는 단어 게임 하루말과 한정 수량 공동구매 백엔드 CrewDeal",
};

const CREWDEAL_URL = "https://crewdeal.enjoylcjworld.com/";

export default function LandingPage() {
  return (
    <main className="landingPage">
      <header className="hubHeader">
        <Link className="hubBrand" href="/" aria-label="enjoylcjworld 처음 화면">
          <span className="hubBrandMark">L</span>
          <span>enjoylcjworld</span>
        </Link>
        <div className="hubHeaderMeta">
          <span>PROJECTS</span>
          <b>2</b>
        </div>
      </header>

      <section className="landingShelf" aria-labelledby="landing-title">
        <h1 id="landing-title" className="srOnly">프로젝트 목록</h1>

        <div className="landingGrid">
          <article className="gameCard gameCardFeatured">
            <div className="gameCardTopline">
              <span>01 · GAME</span>
              <b>PLAY NOW</b>
            </div>
            <div className="gameCardVisual wordVisual" aria-hidden="true">
              <div><span className="correct">ㅎ</span><span className="present">ㅏ</span><span>ㄹ</span><span className="correct">ㅜ</span></div>
              <div><span>ㅁ</span><span className="correct">ㅏ</span><span className="present">ㄹ</span></div>
              <strong>매일 한 판</strong>
            </div>
            <div className="gameCardBody">
              <h2>하루말</h2>
              <p className="landingLead">자음과 모음 단서로 친구가 낸 단어를 맞히는 게임과 한판 미니게임 모음.</p>
              <Link className="gamePlayButton" href="/games">
                <span>게임하러 가기</span><b>→</b>
              </Link>
            </div>
          </article>

          <article className="gameCard landingCardBackend">
            <div className="gameCardTopline">
              <span>02 · BACKEND</span>
              <b>LIVE DEMO</b>
            </div>
            <div className="gameCardVisual landingDealVisual" aria-hidden="true">
              <span>재고 100</span>
              <span>결제 멱등</span>
              <span>원장 균형</span>
            </div>
            <div className="gameCardBody">
              <h2>CrewDeal</h2>
              <p className="landingLead">한정 수량 공동구매 백엔드. 재고 동시성, 결제·웹훅 멱등, 원장과 정산을 시연 콘솔로 확인할 수 있어요.</p>
              <a className="gamePlayButton" href={CREWDEAL_URL}>
                <span>시연 콘솔 열기</span><b>→</b>
              </a>
            </div>
          </article>
        </div>
      </section>

      <footer className="hubFooter">
        <b>enjoylcjworld</b>
        <p>만들고 있는 것들을 여기에 모아둡니다.</p>
        <span>MORE SOON</span>
      </footer>
    </main>
  );
}
