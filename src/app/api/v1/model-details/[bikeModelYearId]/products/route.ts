import { NextResponse } from "next/server";
import { z } from "zod";
import { getModelDetailProducts, ModelDetailNotFoundError } from "@/services/model-detail.service";
const schema = z.object({ bikeModelYearId: z.coerce.number().int().positive() });
export async function GET(_: Request, { params }: { params: Promise<{ bikeModelYearId: string }> }) {
  const parsed = schema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ success: false, error: { code: "INVALID_ID", message: "올바른 모델 연식 ID가 필요합니다." } }, { status: 400 });
  try { return NextResponse.json({ success: true, data: await getModelDetailProducts(parsed.data.bikeModelYearId) }); }
  catch (error) {
    if (error instanceof ModelDetailNotFoundError) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: error.message } }, { status: 404 });
    console.error("Failed to load model detail products", error);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "연결 상품 정보를 불러오지 못했습니다." } }, { status: 500 });
  }
}
