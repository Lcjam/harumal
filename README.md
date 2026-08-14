# 하루말

친구들이랑 하루에 하나씩 단어 문제를 내고 맞히는 게임입니다.

방을 만들고 초대 코드를 공유하면 바로 시작할 수 있습니다. 회원가입은 없고, 한 방에는 최대 6명까지 들어갈 수 있습니다.

![하루말 미리보기](./public/og.png)

## 게임 방식

1. 방을 만들고 친구들을 초대합니다.
2. 각자 한글 단어와 힌트를 하나씩 적습니다.
3. 친구들이 낸 문제를 자모 단위로 맞힙니다.
4. 모든 문제를 풀면 정답 수, 시도 횟수, 풀이 시간으로 순위가 정해집니다.

예를 들어 `사진`은 `ㅅ ㅏ ㅈ ㅣ ㄴ`으로 나뉩니다.

- 초록: 글자와 위치가 모두 맞음
- 노랑: 글자는 있지만 위치가 다름
- 검정: 정답에 없는 글자

문제마다 기회는 5번이고, 방은 만든 날 자정까지 유지됩니다.

## 사용한 기술

- Next.js, React
- Express, Socket.IO
- PostgreSQL
- Docker Compose

정답은 서버에서 암호화해서 저장하고, 출제자나 풀이가 끝난 사람에게만 보여줍니다.

## 로컬에서 실행하기

Node.js 22 이상과 Docker가 필요합니다.

```bash
cp .env.example .env
docker compose up -d db
npm ci
npm run db:migrate
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열면 됩니다. 여러 명으로 테스트할 때는 시크릿 창이나 다른 브라우저 프로필을 사용하면 편합니다.

환경 변수 설명과 개발용 기본값은 [`.env.example`](./.env.example)에 있습니다. `DATABASE_URL`의 비밀번호와 `POSTGRES_PASSWORD`는 같은 값으로 맞춰야 합니다.

## 테스트

```bash
npm test
npm run typecheck
npm run build
```

PostgreSQL을 실행한 상태에서는 통합 테스트도 돌릴 수 있습니다.

```bash
npm run test:integration
```

실행 중인 앱의 쿠키와 Socket.IO 연결까지 확인하려면:

```bash
npm run test:e2e
```

## 배포

아직 운영 서버에는 올리지 않았습니다. Oracle Cloud 프리티어 인스턴스를 구하면 Docker Compose로 배포할 예정입니다.

```bash
docker compose up -d --build
```

운영 환경에서는 `.env`의 예시 값을 그대로 쓰지 말고 새로 생성해야 합니다.

```bash
openssl rand -hex 32  # APP_SECRET
openssl rand -hex 24  # POSTGRES_PASSWORD
```

`.env`와 `backups/`는 Git에서 제외되어 있습니다. 카카오 JavaScript 키가 있으면 카카오톡 공유를 사용하고, 키가 없으면 기본 공유 기능이나 클립보드 복사로 동작합니다.

GitHub에 코드를 올리는 것만으로 배포가 시작되지는 않습니다. 배포 워크플로는 Actions 화면에서 직접 실행해야 동작합니다.

백업과 복구 명령은 다음과 같습니다.

```bash
npm run db:backup
npm run db:restore -- backups/harumal-YYYYMMDD-HHMMSS.sql.gz
```
