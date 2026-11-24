import Link from "next/link";

export default function NotFound() {
  return (
    <main className="center-message">
      <p className="mono">404</p>
      <h1>页面不存在</h1>
      <Link href="/" className="text-btn">返回目录</Link>
    </main>
  );
}
