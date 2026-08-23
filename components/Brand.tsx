import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/word" aria-label="하루말 처음 화면">
      <span className="brandMark">ㅎ</span>
      <span>하루말</span>
    </Link>
  );
}
