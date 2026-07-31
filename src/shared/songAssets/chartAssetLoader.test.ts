import { describe, expect, it } from "vitest";
import {
  fetchPublishedMainChartText,
  resolvePublishedChartAssetPaths,
} from "./chartAssetLoader";

describe("resolvePublishedChartAssetPaths", () => {
  it("manifest가 404이면 기존 stable 메인·보조 경로로 폴백", async () => {
    const result = await resolvePublishedChartAssetPaths(
      { songId: "song-one", difficulty: "HARD" },
      (path) => `https://cdn.example/${path}`,
      async () => new Response("", { status: 404 }),
    );

    expect(result).toEqual({
      chartPath: "songs/song-one/hard.json",
      extraPath: "songs/song-one/hard.extra.json",
      revision: null,
    });
  });

  it("manifest revision=rev-123이면 같은 세대의 메인·보조 경로 반환", async () => {
    const result = await resolvePublishedChartAssetPaths(
      { songId: "song-one", difficulty: "HARD" },
      (path) => `https://cdn.example/${path}`,
      async () => new Response(
        JSON.stringify({ version: 1, revision: "rev-123" }),
        { status: 200 },
      ),
    );

    expect(result).toEqual({
      chartPath: "songs/song-one/hard.rev-123.json",
      extraPath: "songs/song-one/hard.rev-123.extra.json",
      revision: "rev-123",
    });
  });

  it("manifest 응답이 500이면 레거시 경로로 폴백하지 않고 에러", async () => {
    await expect(resolvePublishedChartAssetPaths(
      { songId: "song-one", difficulty: "HARD" },
      (path) => `https://cdn.example/${path}`,
      async () => new Response("", { status: 500 }),
    )).rejects.toThrow("차트 manifest 가져오기 실패: HTTP 500");
  });

  it("manifest JSON이 손상됐으면 임의 세대로 로드하지 않고 에러", async () => {
    await expect(resolvePublishedChartAssetPaths(
      { songId: "song-one", difficulty: "HARD" },
      (path) => `https://cdn.example/${path}`,
      async () => new Response("not json", { status: 200 }),
    )).rejects.toThrow("차트 manifest 파싱 실패");
  });
});

describe("fetchPublishedMainChartText", () => {
  it("manifest revision=rev-123이면 같은 revision의 메인 차트 본문을 로드", async () => {
    const requested: string[] = [];
    const text = await fetchPublishedMainChartText(
      { songId: "song-one", difficulty: "HARD" },
      (path) => `https://cdn.example/${path}`,
      async (input) => {
        const url = String(input);
        requested.push(url);
        if (url.endsWith("hard.manifest.json")) {
          return new Response(JSON.stringify({ version: 1, revision: "rev-123" }));
        }
        return new Response('{"meta":{"title":"Published"}}');
      },
    );

    expect(requested).toEqual([
      "https://cdn.example/songs/song-one/hard.manifest.json",
      "https://cdn.example/songs/song-one/hard.rev-123.json",
    ]);
    expect(text).toBe('{"meta":{"title":"Published"}}');
  });

  it("게시된 메인 차트가 503이면 본문을 파싱하지 않고 에러", async () => {
    await expect(fetchPublishedMainChartText(
      { songId: "song-one", difficulty: "HARD" },
      (path) => `https://cdn.example/${path}`,
      async (input) => (
        String(input).endsWith("manifest.json")
          ? new Response("", { status: 404 })
          : new Response("", { status: 503 })
      ),
    )).rejects.toThrow("차트 가져오기 실패: HTTP 503");
  });
});
