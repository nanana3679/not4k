# 차트 `asset_revision` 배포 runbook

PR #157은 DB migration과 프런트 배포를 한 단계로 취급하지 않는다. 아래 순서를 release gate로 사용한다.

## 최초 배포

1. admin에게 차트 편집기 탭을 닫고 배포 완료 전 저장하지 않도록 공지한다.
2. Supabase에 `20260731000000_add_chart_asset_revision.sql`을 먼저 적용한다.
3. SQL Editor에서 아래 두 검증을 통과시킨다.

   ```sql
   select asset_revision from charts limit 1;

   select tgname
   from pg_trigger
   where tgname = 'charts_require_revision_advance'
     and not tgisinternal;
   ```

4. Vercel 배포를 시작한다. `pnpm build`의 release gate가 REST API에서
   `charts.asset_revision`을 조회하지 못하면 build를 실패시킨다.
5. 배포 후 기존 차트(`asset_revision=null`) 로드와 새 저장(revision 생성)을 각각 확인한다.
6. revision이 게시된 차트를 구버전 탭에서 저장하면 DB가
   `revision-aware chart writer required`로 거부해야 한다. 해당 탭은 새로고침한다.

새 writer는 revision 파일과 stable 호환 shadow를 함께 갱신한다. 구버전 reader와 롤백 앱은
stable 경로를 읽고, 새 reader는 DB가 가리키는 immutable revision을 읽는다.

## 롤백

1. admin 편집을 중단한다.
2. revision writer가 마지막 성공 저장에서 stable shadow까지 갱신했는지 확인한다.
3. 구버전 앱을 배포하기 **전에** pointer를 legacy 모드로 되돌린다.

   ```sql
   update charts
   set asset_revision = null
   where asset_revision is not null;
   ```

4. 구버전 앱을 배포한다. migration 자체는 되돌리지 않는다.
5. 다시 롤포워드할 때는 최초 배포의 3~6단계를 반복한다. `asset_revision=null` 차트는
   stable 파일을 읽다가 다음 새 writer 저장에서 새 revision으로 전환된다.

## 금지 순서

- migration 검증 전 Vercel 배포
- `asset_revision`을 유지한 채 revision 비지원 앱으로 롤백
- 구버전 편집기 탭이 열린 상태에서 revision writer 활성화
