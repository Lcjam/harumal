# 하루말

친구들이랑 하루에 하나씩 단어 문제를 내고 맞히는 게임입니다.

방을 만들고 초대 코드를 공유하면 바로 시작할 수 있습니다. 회원가입은 없고, 한 방에는 최대 6명까지 들어갈 수 있습니다.

![하루말 미리보기](./public/og.png)

## 게임 방식

1. 방을 만들고 친구들을 초대합니다.
2. 각자 한글 단어를 하나씩 적습니다.
3. 친구들이 낸 문제를 자모 단위로 맞힙니다.
4. 모든 문제를 풀면 정답 수, 시도 횟수, 풀이 시간으로 순위가 정해집니다.

힌트는 없습니다. 알려주는 것은 자모가 몇 칸인지뿐이고, 나머지는 색 단서로 추리합니다.

- 초록: 글자와 위치가 모두 맞음
- 노랑: 글자는 있지만 위치가 다름
- 검정: 정답에 없는 글자

칸은 화면 키보드로 직접 채웁니다. 따로 입력창을 두면 휴대폰에서 키보드가 올라오며 판을 가려 버리기 때문입니다.

사전은 두 겹입니다.

- **정답 후보** — [`server/words.ts`](./server/words.ts)의 847단어. 오늘의 단어와 연습 모드가 여기서 정답을 고릅니다. 매일 하나씩 나가는 자리라 누구나 아는 일상 낱말로 손수 골랐습니다.
- **추측·출제 허용** — [`server/allowed-words.ts`](./server/allowed-words.ts)의 4,072단어. 맞는 낱말을 넣었는데 "사전에 없다"고 막히는 게 가장 답답하기 때문에 훨씬 넓게 잡았습니다.

힌트가 없는데 아무 단어나 낼 수 있으면 아무도 못 맞히는 문제가 나오므로, 출제도 허용 목록 안에서만 됩니다. 두 목록 모두 서버에만 있어서 오늘의 단어 후보가 브라우저로 새지 않습니다.

## 자모 나누는 법

단어는 한글 기본 자모 24자로 쪼갭니다. 겹모음과 겹받침, 쌍자음은 모두 기본 자모로 풀어서 한 칸씩 차지합니다.

| 단어 | 자모 |
| --- | --- |
| 사진 | `ㅅ ㅏ ㅈ ㅣ ㄴ` |
| 베개 | `ㅂ ㅓ ㅣ ㄱ ㅏ ㅣ` |
| 과일 | `ㄱ ㅗ ㅏ ㅇ ㅣ ㄹ` |
| 닭 | `ㄷ ㅏ ㄹ ㄱ` |
| 꽃 | `ㄱ ㄱ ㅗ ㅊ` |

그래서 화면의 키보드에도 기본 자모 24자만 있습니다.

문제마다 기회는 5번이고, 방은 만든 날 자정까지 유지됩니다.

## 다시 들어오기

참가할 때 닉네임과 함께 숫자 4자리 재입장 비밀번호를 정합니다. 같은 브라우저로 돌아오면 비밀번호 없이 그대로 이어지고, 창을 닫았거나 다른 브라우저·시크릿 창에서 들어올 때는 **같은 닉네임과 비밀번호로 원래 자리를 이어받습니다**. 사람 수가 다시 세어지지 않고, 자리를 넘겨준 예전 창은 참가 화면으로 돌아갑니다.

카카오톡 인앱 브라우저에서 링크를 열었다가 나중에 사파리나 크롬에서 다시 여는 경우가 여기에 해당합니다. 쿠키 저장소가 달라 원래는 다른 사람으로 취급되기 때문입니다.

비밀번호를 5번 틀리면 그 자리는 10분간 잠깁니다. 비밀번호는 scrypt에 `APP_SECRET`을 섞어 저장하므로 데이터베이스만으로는 되돌릴 수 없습니다.

## 혼자 하기

친구를 모으지 않아도 바로 풀 수 있는 두 가지 모드가 있습니다.

- **오늘의 단어** (`/daily`) — 하루에 한 판이고, 같은 날에는 누구에게나 같은 단어가 나옵니다. 연속 기록과 시도 횟수별 정답 통계가 남습니다.
- **연습 모드** (`/practice`) — 사전에서 무작위로 뽑은 단어를 몇 번이든 풀 수 있습니다. 막히면 건너뛰고 새 단어를 받을 수 있고, 오늘의 단어 기록에는 반영되지 않습니다.

오늘의 단어 순서는 사전을 한 번 섞어 고정한 것이라, 사전을 한 바퀴 돌기 전에는 같은 단어가 다시 나오지 않습니다. 기록은 회원가입 없이 기기 쿠키에 묶여 있습니다.

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

[enjoylcjworld.com](https://enjoylcjworld.com)은 Oracle Cloud의 ARM64 인스턴스에서 Docker Compose로 운영합니다. GitHub Actions로 자동 배포하지 않고, 로컬에서 확인한 코드를 SSH로 서버에 복사한 뒤 서버에서 이미지를 다시 빌드합니다.

서버에는 프로젝트가 `/opt/harumal`에 있고 운영용 `.env`는 서버에만 둡니다. 처음 준비할 때는 예시 값을 그대로 쓰지 말고 비밀값을 새로 만든 뒤 권한을 잠급니다.

```bash
openssl rand -hex 32  # APP_SECRET
openssl rand -hex 24  # POSTGRES_PASSWORD
chmod 600 .env
```

재배포 전에는 로컬에서 테스트와 빌드를 먼저 확인합니다.

```bash
npm test
npm run typecheck
npm run build
npm run test:integration
```

아래 예시의 접속 주소와 키 경로는 각자 사용하는 서버에 맞게 바꿉니다.

```bash
DEPLOY_HOST=ubuntu@server.example.com
DEPLOY_KEY=/path/to/private.key
```

먼저 운영 데이터베이스를 백업합니다.

```bash
ssh -i "$DEPLOY_KEY" "$DEPLOY_HOST" \
  'cd /opt/harumal && sudo sh scripts/backup.sh'
```

그다음 운영 설정과 데이터는 건드리지 않고 소스만 전송합니다.

```bash
rsync -az --delete \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '.claude/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude 'coverage/' \
  --exclude 'backups/' \
  --exclude '*.tsbuildinfo' \
  -e "ssh -i $DEPLOY_KEY" \
  ./ "$DEPLOY_HOST:/opt/harumal/"
```

전송이 끝나면 서버에서 배포 스크립트를 실행합니다.

```bash
ssh -i "$DEPLOY_KEY" "$DEPLOY_HOST" \
  'cd /opt/harumal && sh scripts/deploy.sh --no-pull'
```

`deploy.sh`는 앱, PostgreSQL, HTTPS 게이트웨이 이미지를 다시 빌드하고 컨테이너를 교체합니다. 앱이 시작될 때 아직 적용하지 않은 SQL 마이그레이션을 먼저 실행하며, `/api/health`가 정상 응답해야 배포가 끝납니다. 단일 서버라 컨테이너가 바뀌는 동안에는 짧게 접속이 끊길 수 있습니다.

PostgreSQL 데이터와 HTTPS 인증서는 Docker 볼륨에 저장됩니다. `.env`와 `backups/`도 전송 대상에서 제외하므로 재배포해도 유지됩니다.

배포 뒤에는 컨테이너 상태와 외부 응답을 확인합니다.

```bash
ssh -i "$DEPLOY_KEY" "$DEPLOY_HOST" \
  'cd /opt/harumal && docker compose ps && docker compose logs --tail=80 app gateway'

curl https://enjoylcjworld.com/api/health
curl -I https://enjoylcjworld.com/
```

백업을 복구해야 할 때는 서버에서 `sh scripts/restore.sh backups/파일명.sql.gz`를 실행합니다. 현재 데이터베이스를 교체하는 명령이라 확인 문구로 `RESTORE`를 직접 입력해야 진행됩니다.

카카오 JavaScript 키가 있으면 카카오톡 공유를 사용하고, 키가 없으면 기본 공유 기능이나 클립보드 복사로 동작합니다.

## 사용한 자료

`server/allowed-words.ts`의 낱말 목록은 아래 자료에서 만들었습니다.

- [mecab-ko-dic](https://github.com/lindera/mecab-ko-dic) — 일반명사 목록과 단어 비용. Apache License 2.0.
- [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) — OpenSubtitles 기반 한국어 낱말 빈도. MIT License.

두 자료에 함께 나오면서 실제로 흔한 2~4음절 명사만 남기고, 조사가 붙은 어절과 욕설·혐오 표현을 걸러낸 결과입니다.
