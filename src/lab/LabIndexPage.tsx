import { Link } from "react-router-dom";
import { labPreviewCatalog } from "./labPreviewCatalog";
import "./LabIndexPage.css";

/**
 * THESIS: Lab은 날짜별 파일 목록이 아니라 다시 실행할 수 있는 시연 색인이다.
 * OWN-WORLD: 메탈릭 다크 바탕, 얇은 구조선, 현재 상태에만 쓰는 청색광을 따른다.
 * STORY: 개발자는 대표 시연을 먼저 보고 분류별 목록에서 원하는 실험을 즉시 연다.
 * FIRST VIEWPORT: 왼쪽에 목적과 수량, 오른쪽에 대표 비행 미리보기와 전체 목록을 둔다.
 * FORM: 기존 개발 도구 세계를 확장한 Operate형 인덱스이며 같은 크기의 카드 격자를 쓰지 않는다.
 */
export default function LabIndexPage() {
  const featured = labPreviewCatalog.find((preview) => preview.featured);
  const categories = [...new Set(labPreviewCatalog.map((preview) => preview.category))];

  return (
    <main className="lab-index" data-lab-page="preview-catalog">
      <header className="lab-index-intro">
        <div>
          <span className="lab-index-mark">not4k / LAB</span>
          <h1>Preview Archive</h1>
          <p>렌더링과 플레이 실험을 이름과 역할로 보관합니다. 최신 비교 화면과 이전 시연을 여기서 다시 찾을 수 있습니다.</p>
        </div>
        <dl aria-label="Lab catalog summary">
          <div><dt>PREVIEWS</dt><dd>{String(labPreviewCatalog.length).padStart(2, "0")}</dd></div>
          <div><dt>GROUPS</dt><dd>{String(categories.length).padStart(2, "0")}</dd></div>
        </dl>
      </header>

      {featured && (
        <section className="lab-index-featured" aria-labelledby="featured-preview-title">
          <div>
            <span>{featured.category} / CURRENT</span>
            <h2 id="featured-preview-title">{featured.title}</h2>
            <p>{featured.description}</p>
          </div>
          <Link to={featured.path}>Open preview <span aria-hidden="true">↗</span></Link>
        </section>
      )}

      <section className="lab-index-directory" aria-labelledby="preview-directory-title">
        <header>
          <h2 id="preview-directory-title">All previews</h2>
          <p>개발 서버에서만 제공되며 프로덕션 빌드에는 포함되지 않습니다.</p>
        </header>
        {categories.map((category) => (
          <section className="lab-index-group" aria-labelledby={`lab-category-${category}`} key={category}>
            <h3 id={`lab-category-${category}`}>{category}</h3>
            <ol>
              {labPreviewCatalog.filter((preview) => preview.category === category).map((preview) => (
                <li key={preview.id}>
                  <Link to={preview.path}>
                    <span className="lab-index-entry-title">{preview.title}</span>
                    <span className="lab-index-entry-description">{preview.description}</span>
                    <span className="lab-index-entry-action" aria-hidden="true">OPEN</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </section>
    </main>
  );
}

