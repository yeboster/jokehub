"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Wand2, PlusCircle, ArrowLeft, ShieldAlert } from 'lucide-react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import type { User } from 'firebase/auth';

import { useAuth } from '@/contexts/AuthContext';
import { useJokes } from '@/contexts/JokeContext';
import Header from '@/components/header';
import AddJokeForm, { type JokeFormPrefill, type JokeFormValues } from '@/components/add-joke-form';
import PageLoading from '@/components/PageLoading';
import GenerationControls, { type StudioCount } from '@/components/joke-studio/GenerationControls';
import GeneratedBatch, { modelLabel } from '@/components/joke-studio/GeneratedBatch';
import SamplesPanel from '@/components/joke-studio/SamplesPanel';
import TastePanel from '@/components/joke-studio/TastePanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { useGenerationFeedback } from '@/hooks/useGenerationFeedback';
import { useJokeGeneration } from '@/hooks/useJokeGeneration';
import { useJokeSamples } from '@/hooks/useJokeSamples';
import { useRememberedModel } from '@/hooks/useRememberedModel';
import { useStudioBatches } from '@/hooks/useStudioBatches';
import { normalizeJokeKey, type JokeMode } from '@/lib/jokeGenerationContract';
import { GENERATION_STAGE_LABELS } from '@/lib/generationProgress';
import { clearAllStoredBatches, recentGeneratedHistory, sessionStorageOrNull, studioId, type StudioBatch, type StudioJoke } from '@/lib/studioBatches';
import type { FeedbackUpsertInput, FeedbackVote } from '@/lib/tasteProfile';

const AI_SOURCE = 'AI Assistant';

/** Context a feedback record carries about the batch a joke came from. */
function batchContext(batch: Pick<StudioBatch, 'mode' | 'model' | 'topicHint' | 'requestId'>) {
  return {
    mode: batch.mode,
    model: batch.model,
    ...(batch.topicHint ? { topicHint: batch.topicHint } : {}),
    ...(batch.requestId ? { requestId: batch.requestId } : {}),
  };
}

export default function AddJokePage() {
  const { user, loading } = useAuth();
  // Signing out on this page drops the batches kept in this tab.
  const signedIn = useRef(false);
  useEffect(() => {
    if (user) signedIn.current = true;
    else if (!loading && signedIn.current) {
      clearAllStoredBatches(sessionStorageOrNull());
      signedIn.current = false;
    }
  }, [user, loading]);
  if (loading) return <PageLoading label="Checking your sign-in…" />;
  // UID-keyed lifecycle keeps request authority and memory local to one session.
  return <AddJokeSession key={user ? `uid:${user.uid}` : 'signed-out'} />;
}

function AddJokeSession() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth?redirect=/add-joke');
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return <PageLoading label="Checking your sign-in…" />;
  }

  if (!user) {
     return (
        <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12">
            <Header title="Add New Joke" />
            <Card className="max-w-md mx-auto">
                <CardHeader>
                    <CardTitle as="h2" className="text-error">Access Denied</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 p-3 rounded-md bg-error/10 border border-error/30 text-error flex items-center">
                        <ShieldAlert className="mr-2 h-5 w-5 flex-shrink-0" />
                        <p>You must be logged in to add a new joke.</p>
                    </div>
                    <Button onClick={() => router.push('/auth?redirect=/add-joke')}>
                        Log In or Sign Up
                    </Button>
                </CardContent>
            </Card>
        </div>
     );
  }

  return <JokeStudio user={user} />;
}

type EditLink = { jokeId: string; batch: Pick<StudioBatch, 'mode' | 'model' | 'topicHint' | 'requestId'> };

function JokeStudio({ user }: { user: User }) {
  const { addJoke } = useJokes();
  const router = useRouter();
  const { toast } = useToast();

  const [model, chooseModel] = useRememberedModel();
  const [temperature, setTemperature] = useState(0.8);
  const [topicHint, setTopicHint] = useState('');
  const [mode, setMode] = useState<JokeMode>('original');
  const [count, setCount] = useState<StudioCount>(3);
  const [useTasteProfile, setUseTasteProfile] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [prefill, setPrefill] = useState<JokeFormPrefill | null>(null);
  const [editing, setEditing] = useState<EditLink | null>(null);

  const { batches, addBatch, updateJoke, updateJokes, findJoke } = useStudioBatches(user.uid);
  const feedback = useGenerationFeedback(user);
  const samples = useJokeSamples(user);
  const generation = useJokeGeneration(user, ({ result, request, requestId }) => {
    const batch: StudioBatch = {
      id: studioId('batch'),
      createdAt: new Date().toISOString(),
      topicHint: request.topicHint,
      mode: request.mode,
      model: result.model,
      requestId,
      requestedCount: result.requestedCount,
      jokes: result.jokes.map(joke => ({ id: studioId('joke'), jokeText: joke.jokeText, category: joke.category, status: 'idle', vote: null })),
    };
    addBatch(batch);
    // The new batch opens; older ones fold away.
    setExpanded({ [batch.id]: true });
  });

  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const editLink = useRef<EditLink | null>(null);
  const saving = useRef(new Set<string>());
  const feedbackOps = useRef(new Map<string, number>());

  const announceSaved = useCallback((id: string) => {
    toast({
      title: 'Joke saved',
      description: 'It is in your collection now.',
      action: <ToastAction altText="View the saved joke" asChild><Link href={`/joke/${id}`}>View</Link></ToastAction>,
    });
  }, [toast]);

  const feedbackFailed = useCallback(() => {
    toast({ title: "Couldn't save feedback", description: 'Your vote was not recorded. Please try again.', variant: 'destructive' });
  }, [toast]);

  const recordSave = useCallback(async (input: FeedbackUpsertInput) => {
    try {
      await feedback.record(input);
    } catch (error) {
      console.error('Error recording saved-joke feedback:', error);
      if (mounted.current) feedbackFailed();
    }
  }, [feedback, feedbackFailed]);

  const handleGenerate = () => {
    void generation.generate({
      topicHint: topicHint.trim(), model, temperature, count, mode, useTasteProfile,
      recentGeneratedJokes: recentGeneratedHistory(batches),
    });
  };

  const handleSave = async (target: StudioJoke) => {
    const found = findJoke(target.id);
    if (!found || found.joke.status !== 'idle' || saving.current.has(target.id)) return;
    const { batch, joke } = found;
    saving.current.add(joke.id);
    updateJoke(joke.id, entry => ({ ...entry, status: 'saving' }));
    // A direct save ends any edit of the same card; the form keeps its text.
    if (editLink.current?.jokeId === joke.id) { editLink.current = null; setEditing(null); }
    try {
      const id = await addJoke({ text: joke.jokeText, category: joke.category, source: AI_SOURCE });
      if (!id) throw new Error('The joke was not saved.');
      if (!mounted.current) return;
      updateJoke(joke.id, entry => ({ ...entry, status: 'saved', savedJokeId: id }));
      announceSaved(id);
      void recordSave({ jokeText: joke.jokeText, category: joke.category, saved: true, ...batchContext(batch) });
    } catch (error) {
      // The context has already announced the failure.
      console.error('Error saving generated joke:', error);
      if (mounted.current) updateJoke(joke.id, entry => ({ ...entry, status: 'idle' }));
    } finally {
      saving.current.delete(joke.id);
    }
  };

  /** Optimistic feedback change; rolled back only if no later change replaced it. */
  const changeFeedback = async (
    joke: StudioJoke, batch: StudioBatch,
    next: Pick<StudioJoke, 'vote' | 'reason'>,
    input: Omit<FeedbackUpsertInput, 'jokeText'>,
  ) => {
    const previous = { vote: joke.vote, reason: joke.reason };
    const op = (feedbackOps.current.get(joke.id) ?? 0) + 1;
    feedbackOps.current.set(joke.id, op);
    updateJoke(joke.id, entry => ({ ...entry, ...next }));
    try {
      await feedback.record({ jokeText: joke.jokeText, category: joke.category, ...input, ...batchContext(batch) });
    } catch (error) {
      console.error('Error recording generation feedback:', error);
      if (!mounted.current) return;
      if (feedbackOps.current.get(joke.id) === op) updateJoke(joke.id, entry => ({ ...entry, ...previous }));
      feedbackFailed();
    }
  };

  // Votes on jokes that are never saved are the only record of what the user rejects.
  const handleVote = (target: StudioJoke, kind: FeedbackVote) => {
    const found = findJoke(target.id);
    if (!found) return;
    const vote = found.joke.vote === kind ? null : kind;
    // A reason explains one vote; changing the vote drops it.
    void changeFeedback(found.joke, found.batch, { vote, reason: undefined }, { vote, reason: null });
  };

  const handleReason = (target: StudioJoke, text: string) => {
    const found = findJoke(target.id);
    if (!found || !found.joke.vote) return;
    const reason = text.trim();
    if (reason === (found.joke.reason ?? '')) return;
    void changeFeedback(found.joke, found.batch, { vote: found.joke.vote, reason: reason || undefined }, { vote: found.joke.vote, reason: reason || null });
  };

  const handleEdit = (batch: StudioBatch, joke: StudioJoke) => {
    const link = { jokeId: joke.id, batch: { mode: batch.mode, model: batch.model, topicHint: batch.topicHint, requestId: batch.requestId } };
    editLink.current = link;
    setEditing(link);
    setPrefill({ key: studioId('edit'), text: joke.jokeText, category: joke.category, source: AI_SOURCE });
  };

  const stopEditing = () => { editLink.current = null; setEditing(null); };

  const handleFormSave = async (data: JokeFormValues) => {
    const link = editLink.current;
    // Deliberately no try/catch: `AddJokeForm` resets only when this
    // resolves, so a failed write must reject and keep the user's text. The
    // context announces the failure.
    const id = await addJoke(data);
    if (!id) throw new Error('The joke was not saved.');
    if (!mounted.current) return;
    announceSaved(id);
    if (!link) return;
    if (editLink.current === link) { editLink.current = null; setEditing(null); }
    updateJoke(link.jokeId, entry => ({ ...entry, status: 'saved', savedJokeId: id }));
    // The record is about the joke the user kept: the edited text.
    void recordSave({ jokeText: data.text, category: data.category, saved: true, ...batchContext(link.batch) });
  };

  const handleFeedbackRemoved = (item: { jokeText: string }) => {
    const key = normalizeJokeKey(item.jokeText);
    updateJokes(joke => normalizeJokeKey(joke.jokeText) === key, joke => ({ ...joke, vote: null, reason: undefined }));
  };

  const handleFeedbackReset = () => {
    updateJokes(joke => joke.vote !== null || !!joke.reason, joke => ({ ...joke, vote: null, reason: undefined }));
  };

  const { isGenerating, progressStage, progressModel, requestId, error: generationError, elapsedSeconds } = generation;
  const statusText = isGenerating
    ? progressStage
      ? `${GENERATION_STAGE_LABELS[progressStage]}…${progressModel ? ` (${modelLabel(progressModel)})` : ''}`
      : 'Connecting securely…'
    : '';

  return (
    /*
      Round 4's reduced-motion policy is a CSS media query and cannot reach
      animations framer-motion drives in JS. `reducedMotion="user"` reads the
      same OS setting and drops transform/layout animation while keeping
      opacity, which is the one channel the policy allows.
    */
    <MotionConfig reducedMotion="user">
      <div className="container mx-auto px-4 py-8 sm:px-6 md:py-12">
        <Header title="Craft a New Joke" />
        <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">

          {/* Left column: form, then samples and what the AI learns */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle as="h2" className="flex items-center">
                  <PlusCircle className="mr-2 h-5 w-5 text-primary"/> Your New Joke
                </CardTitle>
                <CardDescription className="text-sm">
                  {editing ? 'Editing a generated joke. Saving marks it saved in its batch.' : 'Fill in the form to add a new joke manually, or press Edit on a generated joke.'}
                </CardDescription>
                {editing && (
                  <Button variant="link" size="sm" className="h-auto justify-start p-0" onClick={stopEditing}>Stop linking to the generated joke</Button>
                )}
              </CardHeader>
              <CardContent>
                <AddJokeForm onAddJoke={handleFormSave} prefill={prefill} />
              </CardContent>
            </Card>

            <Button variant="outline" onClick={() => router.push('/jokes')} className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Jokes List
            </Button>

            <SamplesPanel samples={samples} />
            <TastePanel feedback={feedback} onRemoved={handleFeedbackRemoved} onReset={handleFeedbackReset} />
          </div>

          {/* Right column: AI assistant and batches */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle as="h2" className="flex items-center">
                  <Wand2 className="mr-2 h-5 w-5 text-primary"/> AI Assistant
                </CardTitle>
                <CardDescription className="text-sm">
                  Generate batches, keep every joke you like, and vote so later batches fit your taste.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <GenerationControls
                  model={model} onModelChange={chooseModel}
                  temperature={temperature} onTemperatureChange={setTemperature}
                  topicHint={topicHint} onTopicHintChange={setTopicHint}
                  mode={mode} onModeChange={setMode}
                  count={count} onCountChange={setCount}
                  useTasteProfile={useTasteProfile} onUseTasteProfileChange={setUseTasteProfile}
                  isGenerating={isGenerating} onGenerate={handleGenerate}
                />

                {/* Always in the DOM so it is a live region *before* the text
                    changes — a role="status" that mounts with its message
                    already inside it does not announce. */}
                <div role="status" aria-live="polite" className="text-sm text-center text-muted-foreground">{statusText}</div>
                {(isGenerating || generationError || batches.length > 0) && (
                  <div className="space-y-1 text-center text-xs text-muted-foreground">
                    <p>Elapsed: {elapsedSeconds}s</p>
                    {requestId && <p className="break-all">Request ID: <code className="select-all">{requestId}</code></p>}
                  </div>
                )}
                {generationError && (
                  <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                    <p className="font-medium">Couldn&apos;t generate jokes</p>
                    <p className="text-sm">{generationError}</p>
                    {requestId && <p className="text-xs break-all">Request ID: <code className="select-all">{requestId}</code></p>}
                    <Button variant="outline" onClick={handleGenerate} disabled={isGenerating}>Try again</Button>
                  </div>
                )}

                <AnimatePresence>
                  {isGenerating && (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center min-h-[160px] bg-card rounded-lg border border-dashed p-4 text-center"
                    >
                      <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                      <p className="text-lg font-medium text-muted-foreground">Generating witty humor…</p>
                      <p className="text-sm text-muted-foreground">{elapsedSeconds >= 30 ? 'Still working. Model responses can take time; progress updates appear above.' : 'Live stages appear above as each step starts.'}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {batches.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold">Your batches</h3>
                      <p className="text-sm text-muted-foreground">Save every joke you like. The last {batches.length === 1 ? 'batch stays' : `${batches.length} batches stay`} here while you work.</p>
                      {batches.map((batch, index) => (
                        <GeneratedBatch
                          key={batch.id}
                          batch={batch}
                          expanded={expanded[batch.id] ?? index === 0}
                          onToggle={() => setExpanded(previous => ({ ...previous, [batch.id]: !(previous[batch.id] ?? index === 0) }))}
                          onSave={joke => { void handleSave(joke); }}
                          onEdit={handleEdit}
                          onVote={handleVote}
                          onReason={handleReason}
                          onAddSample={joke => { void samples.add(joke.jokeText); }}
                          inSamples={samples.hasSample}
                          addingSample={samples.isAdding}
                        />
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}
