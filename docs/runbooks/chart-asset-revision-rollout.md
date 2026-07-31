# 차트 `asset_revision` 배포 runbook

PR #157은 DB migration, revision-aware reader 배포, revision writer 활성화를 서로 다른 단계로 취급한다.
아래 순서를 release gate로 사용한다.

## 최초 배포

1. Supabase에 아래 migration을 순서대로 먼저 적용한다.

   - `20260731000000_add_chart_asset_revision.sql`
   - `20260731010000_add_chart_asset_release_gate.sql`

   두 번째 migration의 `revision_writes_enabled` 기본값은 `false`다. migration 직후의
   구버전 앱은 기존 stable 경로를 계속 사용하고, revision 게시만 DB에서 차단된다.
2. SQL Editor에서 readiness와 writer fence를 확인한다.

   ```sql
   select public.chart_asset_revision_readiness();
   ```

   결과는 `schema_ready=true`, `revision_writes_enabled=false`여야 한다.
3. Vercel에 revision-aware reader를 배포한다. `pnpm build`의 release gate가 readiness RPC에서
   column·활성 trigger·release state를 함께 검증하며, 하나라도 없으면 build를 실패시킨다.
   writer fence가 닫혀 있으므로 이 배포가 검증될 때까지 새 앱의 차트 저장은 fail-closed한다.
4. 배포 후 기존 차트(`asset_revision=null`)가 stable 경로에서 정상 로드되는지 확인한다.
5. admin에게 모든 구버전 차트 편집기 탭을 닫고 새 버전으로 다시 열도록 공지한다.
6. reader 배포와 탭 drain을 확인한 뒤에만 writer fence를 연다.

   ```sql
   update public.chart_asset_release_state
      set revision_writes_enabled = true,
          updated_at = now()
    where singleton = true;
   ```

7. readiness RPC가 `revision_writes_enabled=true`를 반환하는지 확인하고 새 저장(revision 생성)을
   smoke test한다. revision writer는 immutable revision 경로만 쓰며 stable 경로는 갱신하지 않는다.
8. revision이 게시된 차트를 구버전 탭에서 저장하면 stable 업로드 뒤 DB가
   `revision-aware chart writer required`로 거부할 수 있다. 이 stable 파일은 더 이상 canonical이
   아니며 해당 탭은 즉시 닫는다.

## 롤백

1. 앱 롤백보다 먼저 writer fence를 닫는다. 이 DB fence는 이미 immutable 파일을 올리고
   DB 게시 전 대기 중인 요청도 거부한다.

   ```sql
   update public.chart_asset_release_state
      set revision_writes_enabled = false,
          updated_at = now()
    where singleton = true;
   ```

2. admin 편집을 중단하고 진행 중 요청이 종료됐는지 확인한다.
3. rollback 하한선은 **revision-aware reader가 포함된 이 배포**다. DB pointer와 migration은
   되돌리지 않는다. writer fence가 닫힌 동안 reader는 기존 revision을 계속 읽고 저장만 거부한다.
4. 수정 배포를 검증한 뒤 최초 배포 5~7단계로 writer를 다시 연다.

pre-revision 앱으로의 롤백은 지원하지 않는다. 이를 지원하려면 trusted server가 모든 활성 immutable
revision에서 stable 쌍을 재생성·checksum 검증하고, 쓰기를 동결한 채 pointer를 null로 바꾸는 별도
운영 도구가 필요하다. 브라우저 writer로 이 절차를 대신해서는 안 된다.

## 금지 순서

- migration 검증 전 Vercel 배포
- revision-aware reader 검증 전 `revision_writes_enabled=true`
- 구버전 편집기 탭이 열린 상태에서 revision writer 활성화
- writer fence를 닫기 전 rollback
- revision이 한 번이라도 게시된 뒤 pre-revision 앱으로 rollback
