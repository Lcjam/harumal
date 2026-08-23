import Link from "next/link";

export default function HomePage() {
  return (
    <main className="gameHubPage">
      <header className="hubHeader">
        <Link className="hubBrand" href="/" aria-label="한판 게임 모음 처음 화면">
          <span className="hubBrandMark">ㅎ</span>
          <span>한판</span>
        </Link>
        <div className="hubHeaderMeta">
          <span>MINI GAME CLUB</span>
          <b>플레이 1</b>
        </div>
      </header>

      <section className="gameShelf" aria-labelledby="game-list-title">
        <h1 id="game-list-title" className="srOnly">게임 목록</h1>

        <div className="gameCardGrid">
          <article className="gameCard gameCardFeatured">
            <div className="gameCardTopline">
              <span>01 · WORD</span>
              <b>PLAY NOW</b>
            </div>
            <div className="gameCardVisual wordVisual" aria-hidden="true">
              <div><span className="correct">ㄷ</span><span className="present">ㅏ</span><span className="absent">ㄴ</span><span>ㅇ</span><span>ㅓ</span></div>
              <div><span>ㅎ</span><span className="correct">ㅏ</span><span className="present">ㄹ</span><span>ㅜ</span><span className="correct">ㅁ</span></div>
              <strong>다섯 번의 단서</strong>
            </div>
            <div className="gameCardBody">
              <h3>하루말</h3>
              <Link className="gamePlayButton" href="/word">
                <span>게임 시작</span><b>→</b>
              </Link>
            </div>
          </article>

          <article className="gameCard gameCardComing">
            <div className="gameCardTopline"><span>02 · NUMBER</span><b>COMING SOON</b></div>
            <div className="gameCardVisual numberVisual" aria-hidden="true">
              <span>7</span><span>2</span><span>?</span>
            </div>
            <div className="gameCardBody">
              <h3>숫자 잠금</h3>
              <span className="comingLabel">준비 중이에요</span>
            </div>
          </article>

          <article className="gameCard gameCardComing gameCardWarm">
            <div className="gameCardTopline"><span>03 · MEMORY</span><b>COMING SOON</b></div>
            <div className="gameCardVisual memoryVisual" aria-hidden="true">
              <span>●</span><span>▲</span><span>■</span><span>?</span>
            </div>
            <div className="gameCardBody">
              <h3>짝꿍 찾기</h3>
              <span className="comingLabel">준비 중이에요</span>
            </div>
          </article>
        </div>
      </section>

      <footer className="hubFooter">
        <b>한판</b>
        <p>새로운 게임을 하나씩 채워갈게요.</p>
        <span>ONE MORE ROUND?</span>
      </footer>
    </main>
  );
}
