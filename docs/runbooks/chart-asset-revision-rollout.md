# 차트 `asset_revision` 배포 runbook

PR #157은 DB migration과 revision-aware reader 배포까지만 수행한다. revision writer 활성화는
모든 pre-revision reader를 서버에서 차단할 수 있게 된 뒤 별도 후속 release로 수행한다.

## 최초 배포

1. Supabase에 아래 migration을 순서대로 먼저 적용한다.

   - `20260731000000_add_chart_asset_revision.sql`
   - `20260731010000_add_chart_asset_release_gate.sql`

   두 번째 migration의 `revision_writes_enabled` 기본값은 `false`다. migration 직후의
   구버전 앱은 기존 stable 경로를 계속 사용하고, revision 게시만 DB에서 차단된다.
2. SQL Editor에서 readiness와 writer fence를 확인한다. 먼저 실제 trigger를 transaction 안에서
   잠시 비활성화해 RPC가 `schema_ready=false`로 바뀌는지 behavioral check한다. 반드시 한 번에
   실행하고 `rollback`까지 완료한다.

   ```sql
   begin;
   alter table public.charts disable trigger charts_require_revision_advance;
   select public.chart_asset_revision_readiness();
   rollback;

   select public.chart_asset_revision_readiness();
   ```

   transaction 안의 첫 결과는 `schema_ready=false`, rollback 뒤 최종 결과는
   `schema_ready=true`, `revision_writes_enabled=false`여야 한다.
3. Vercel에 revision-aware reader를 배포한다. `pnpm build`의 release gate가 readiness RPC에서
   column·활성 trigger·release state를 함께 검증하며, 하나라도 없으면 build를 실패시킨다.
   PR #157 gate는 `revision_writes_enabled=false`도 강제한다. writer fence가 닫혀 있는 동안
   새 앱도 기존 stable 경로에 저장한다.
4. 배포 후 기존 차트(`asset_revision=null`)가 stable 경로에서 정상 로드되는지 확인한다.
5. stable 메인·빈 보조 파일 저장과 Save As 신규/overwrite를 smoke test한다. 최종 readiness는
   `schema_ready=true`, `revision_writes_enabled=false`여야 하며 **PR #157에서는 여기서 멈춘다.**

## revision writer 활성화 — 후속 release

현재는 `revision_writes_enabled=true` 전환을 금지한다. 단순 editor 탭 공지만으로는 배포 전에 열린
일반 게임 탭을 식별하거나 강제 새로고침할 수 없고, 그런 탭은 stable 경로에서 stale 차트를 읽는다.

후속 release는 아래 둘 중 하나를 먼저 구현해야 한다.

- server-enforced minimum reader version/maintenance gate로 모든 pre-revision reader를 차단
- DB winner의 immutable 쌍을 stable 경로에 안전하게 투영·검증하는 trusted projector

그 후에만 별도 이슈/PR의 runbook에서 writer fence를 열고 immutable revision 저장을 활성화한다.

## 롤백

PR #157 상태에서는 writer fence가 계속 닫혀 있고 revision이 게시되지 않으므로 pre-revision 앱으로
롤백할 수 있다. migration은 남겨도 legacy `asset_revision=null` 쓰기를 허용한다.

향후 writer 활성화 후에는 앱 롤백보다 먼저 writer fence를 닫는다. trigger는 release-state 행을 `FOR SHARE`로
   잠그므로 fence UPDATE는 이미 DB 게시에 진입한 요청이 끝날 때까지 기다린다. UPDATE가
   반환된 뒤 새로 게시를 시도하는 요청은 모두 거부된다.

   ```sql
   update public.chart_asset_release_state
      set revision_writes_enabled = false,
          updated_at = now()
    where singleton = true;
   ```

2. admin 편집을 중단하고 진행 중 요청이 종료됐는지 확인한다.
3. rollback 하한선은 **revision-aware reader가 포함된 이 배포**다. DB pointer와 migration은
   되돌리지 않는다. nonnull → null downgrade는 trigger가 항상 거부한다.

향후 writer 활성화 뒤에는 pre-revision 앱으로의 롤백을 지원하지 않는다. 이를 지원하려면 trusted server가 모든 활성 immutable
revision에서 stable 쌍을 재생성·checksum 검증하고, 쓰기를 동결한 채 pointer를 null로 바꾸는 별도
운영 도구가 필요하다. 브라우저 writer로 이 절차를 대신해서는 안 된다.

## 금지 순서

- migration 검증 전 Vercel 배포
- 후속 minimum-reader gate 또는 trusted projector 없이 `revision_writes_enabled=true`
- writer fence를 닫기 전 rollback
- revision이 한 번이라도 게시된 뒤 pre-revision 앱으로 rollback
