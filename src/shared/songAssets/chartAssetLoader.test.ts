import { describe, expect, it } from "vitest";
import {
  fetchPublishedMainChartText,
  resolvePublishedChartAssetPaths,
} from "./chartAssetLoader";

describe("resolvePublishedChartAssetPaths", () => {
  it("DB asset_revision=null이면 기존 stable 메인·보조 경로로 폴백", async () => {
    await expect(resolvePublishedChartAssetPaths(
      { songId: "song-one", difficulty: "HARD" },
      async () => null,
    )).resolves.toEqual({
      chartPath: "songs/song-one/hard.json",
      extraPath: "songs/song-one/hard.extra.json",
      revision: null,
    });
  });

  it("DB asset_revision=rev-123이면 같은 세대의 메인·보조 경로 반환", async () => {
    await expect(resolvePublishedChartAssetPaths(
      { songId: "song-one", difficulty: "HARD" },
      async () => "rev-123",
    )).resolves.toEqual({
      chartPath: "songs/song-one/hard.rev-123.json",
      extraPath: "songs/song-one/hard.rev-123.extra.json",
      revision: "rev-123",
    });
  });

  it("DB revision 조회가 실패하면 legacy 경로로 폴백하지 않고 에러", async () => {
    await expect(resolvePublishedChartAssetPaths(
      { songId: "song-one", difficulty: "HARD" },
      async () => {
        throw new Error("db unavailable");
      },
    )).rejects.toThrow("차트 asset revision 가져오기 실패");
  });

  it('DB asset_revision="../escape"이면 경로 탈출을 허용하지 않고 에러', async () => {
    await expect(resolvePublishedChartAssetPaths(
      { songId: "song-one", difficulty: "HARD" },
      async () => "../escape",
    )).rejects.toThrow("차트 asset revision이 유효하지 않습니다");
  });
});

describe("fetchPublishedMainChartText", () => {
  it("DB revision=rev-123이면 같은 revision의 메인 차트 본문을 로드", async () => {
    const requested: string[] = [];
    const text = await fetchPublishedMainChartText(
      { songId: "song-one", difficulty: "HARD" },
      async () => "rev-123",
      (path) => `https://cdn.example/${path}`,
      async (input) => {
        requested.push(String(input));
        return new Response('{"meta":{"title":"Published"}}');
      },
    );

    expect(requested).toEqual([
      "https://cdn.example/songs/song-one/hard.rev-123.json",
    ]);
    expect(text).toBe('{"meta":{"title":"Published"}}');
  });

  it("게시된 메인 차트가 503이면 본문을 파싱하지 않고 에러", async () => {
    await expect(fetchPublishedMainChartText(
      { songId: "song-one", difficulty: "HARD" },
      async () => null,
      (path) => `https://cdn.example/${path}`,
      async () => new Response("", { status: 503 }),
    )).rejects.toThrow("차트 가져오기 실패: HTTP 503");
  });
});
