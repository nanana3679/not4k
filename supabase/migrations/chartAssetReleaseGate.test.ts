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
      "elsif new.asset_revision is not null",
    );
  });

  it("writer fence가 열리면 null INSERT와 revision 미변경 legacy UPDATE를 모두 거부", () => {
    expect(migration).toContain("if writes_enabled is true then");
    expect(migration).toContain("if new.asset_revision is null");
    expect(migration).toContain(
      "new.asset_revision is not distinct from old.asset_revision",
    );
    expect(migration).toContain("revision-aware chart writer required");
  });

  it("nonnull revision을 null로 내리는 downgrade는 writer fence 상태와 무관하게 거부", () => {
    expect(migration).toContain("old.asset_revision is not null");
    expect(migration).toContain("new.asset_revision is null");
    expect(migration).toContain("chart asset revision downgrade is forbidden");
  });

  it("trigger가 release state singleton을 FOR SHARE로 잠가 fence close와 publish를 직렬화", () => {
    expect(migration).toContain("for share");
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

  it("이전 preview migration의 legacy trigger 함수가 남아도 후속 migration에서 제거", () => {
    expect(migration).toContain(
      "drop function if exists public.reject_legacy_chart_writer_after_revision()",
    );
  });
});
