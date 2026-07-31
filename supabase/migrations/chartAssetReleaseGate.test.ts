import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("./20260731010000_add_chart_asset_release_gate.sql", import.meta.url),
  "utf8",
);

describe("chart asset release gate migration", () => {
  it("reader-first 최초 상태는 revision_writes_enabled=false", () => {
    expect(migration).toContain(
      "values (true, false)",
    );
  });

  it("writer fence trigger는 INSERT와 UPDATE 모두에서 revision 게시를 검사", () => {
    expect(migration).toContain(
      "before insert or update on public.charts",
    );
    expect(migration).toContain(
      "new.asset_revision is not null and writes_enabled is not true",
    );
  });

  it("readiness RPC는 trigger 활성 상태와 연결된 함수 이름을 함께 검증", () => {
    expect(migration).toContain("trigger.tgenabled <> 'D'");
    expect(migration).toContain(
      "procedure.proname = 'enforce_chart_asset_release_gate'",
    );
  });

  it("익명 client는 release state table을 직접 변경하지 못하고 readiness RPC만 실행", () => {
    expect(migration).toContain(
      "revoke all on table public.chart_asset_release_state from anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.chart_asset_revision_readiness() to anon, authenticated",
    );
  });
});
