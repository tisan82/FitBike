import assert from "node:assert/strict";
import test from "node:test";

import { integrateBodyImages, productionImagePath } from "./publish-content.mjs";

test("maps every approved image role to a unique production path", () => {
  const contentKey = "example-guide";
  const assets = [
    { id: "thumbnail", type: "thumbnail" },
    { id: "hero", type: "hero" },
    { id: "body-01", type: "body" },
    { id: "body-02", type: "body" }
  ];
  assert.deepEqual(assets.map((asset) => productionImagePath(contentKey, asset)), [
    "contents/example-guide/thumbnail.webp",
    "contents/example-guide/hero.webp",
    "contents/example-guide/body-01.webp",
    "contents/example-guide/body-02.webp"
  ]);
});

test("inserts a dynamic number of body images near their semantic sections", () => {
  const content = {
    contentKey: "example-guide",
    bodyBlocks: [
      { type: "heading", level: 2, text: "확인할 위치" },
      { type: "paragraph", text: "접지면과 트레드 중앙 및 좌우 여러 위치를 확인합니다." },
      { type: "heading", level: 2, text: "후속 조치" },
      { type: "paragraph", text: "확인 결과에 따라 후속 조치를 결정합니다." }
    ]
  };
  const imagePlan = {
    bodyImages: [
      { required: true, description: "접지면 트레드 중앙 좌우 여러 위치" },
      { required: true, targetSection: "후속 조치", description: "후속 조치" }
    ]
  };
  const assets = [
    { id: "body-01", type: "body", approval: { alt: "트레드의 여러 확인 위치" } },
    { id: "body-02", type: "body", approval: { alt: "점검 후 후속 조치" } }
  ];
  const integrated = integrateBodyImages(content, imagePlan, assets);
  const images = integrated.bodyBlocks.filter((block) => block.type === "image");
  assert.equal(images.length, 2);
  assert.deepEqual(images.map((block) => block.storagePath), [
    "contents/example-guide/body-01.webp",
    "contents/example-guide/body-02.webp"
  ]);
  assert.equal(integrated.bodyBlocks[2].type, "image");
  assert.equal(integrated.bodyBlocks.at(-1).type, "image");
});
