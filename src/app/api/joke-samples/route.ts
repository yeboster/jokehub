import { NextRequest } from 'next/server';
import { SampleCreateSchema, SampleUpdateSchema, TasteDocIdSchema } from '@/lib/tasteProfile';
import { errorResponse, internalError, invalidInput, jsonResponse, readJson, requireUser } from '@/lib/userRouteGuard';
import { SampleLimitError, createSample, deleteSample, listSamples, updateSample } from '@/services/server/tasteStore';

const SCOPE = 'joke-samples';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request, SCOPE);
    if ('response' in user) return user.response;
    return jsonResponse({ samples: await listSamples(user.uid) });
  } catch (error) {
    return internalError(SCOPE, 'GET', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, SCOPE);
    if ('response' in user) return user.response;
    const parsed = SampleCreateSchema.safeParse(await readJson(request));
    if (!parsed.success) return invalidInput();
    const { sample, created } = await createSample(user.uid, parsed.data);
    return jsonResponse({ sample, created }, created ? 201 : 200);
  } catch (error) {
    if (error instanceof SampleLimitError) return errorResponse(409, error.message, error.code);
    return internalError(SCOPE, 'POST', error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser(request, SCOPE);
    if ('response' in user) return user.response;
    const parsed = SampleUpdateSchema.safeParse(await readJson(request));
    if (!parsed.success) return invalidInput();
    const sample = await updateSample(user.uid, parsed.data);
    return sample ? jsonResponse({ sample }) : errorResponse(404, 'Sample not found', 'NOT_FOUND');
  } catch (error) {
    return internalError(SCOPE, 'PATCH', error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser(request, SCOPE);
    if ('response' in user) return user.response;
    const id = TasteDocIdSchema.safeParse(request.nextUrl.searchParams.get('id'));
    if (!id.success) return invalidInput();
    return jsonResponse({ deleted: await deleteSample(user.uid, id.data) });
  } catch (error) {
    return internalError(SCOPE, 'DELETE', error);
  }
}
