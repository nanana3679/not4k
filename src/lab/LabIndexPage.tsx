import './LabIndexPage.css';

const pages = [
  { href: '/lab/note-assets?design=classic', name: '노트 에셋 시연실', description: 'Classic · Simple 노트, 롱노트, 터미널과 키봄을 재생합니다.' },
  { href: '/lab/judgment-playtest', name: '판정 실플레이', description: '판정 사례를 직접 플레이합니다.' },
  { href: '/lab/tutorial-pattern-diagram', name: '튜토리얼 도식', description: '튜토리얼의 노트 연결 도식을 확인합니다.' },
  { href: '/lab/gear-light', name: '기어 조명', description: '기어 에셋과 조명 효과를 확인합니다.' },
  { href: '/lab/gear-measure-pulse', name: '기어 박동', description: '마디에 맞춰 움직이는 기어 효과를 확인합니다.' },
  { href: '/lab/geometric-background', name: '기하 배경', description: '플레이 배경을 조절합니다.' },
  { href: '/lab/perspective-surface-grid', name: '원근 격자', description: '배경의 원근 격자와 오브젝트를 조절합니다.' },
];

export default function LabIndexPage() {
  return (
    <main className="lab-index" data-lab-page="index">
      <div className="lab-index-content">
        <header>
          <p>not4k</p>
          <h1>Lab</h1>
          <p>시연과 테스트 페이지를 선택하세요.</p>
        </header>
        <nav aria-label="Lab 페이지">
          <ul>
            {pages.map(page => (
              <li key={page.href}>
                <a href={page.href}>
                  <strong>{page.name}</strong>
                  <span>{page.description}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
