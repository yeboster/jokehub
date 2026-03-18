
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Wand2, PlusCircle, ArrowLeft, ShieldAlert, Sparkles, CheckCircle, Star } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useJokes } from '@/contexts/JokeContext';
import type { GenerateJokeOutput, JokeVariation } from '@/ai/flows/generate-joke-flow';
import Header from '@/components/header';
import AddJokeForm, { type JokeFormValues } from '@/components/add-joke-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AnimatePresence, motion } from 'framer-motion';
import { Slider } from '@/components/ui/slider';
import * as jokeService from '@/services/jokeService';
import { Separator } from '@/components/ui/separator';

export default function AddJokePage() {
  const { user, loading: authLoading } = useAuth();
  const { addJoke, loadingInitialJokes: loadingContext } = useJokes();
  const router = useRouter();
  const { toast } = useToast();

  const [isGeneratingJoke, setIsGeneratingJoke] = useState(false);
  const [aiTopicHint, setAiTopicHint] = useState<string>('');
  const [aiGeneratedJokes, setAiGeneratedJokes] = useState<JokeVariation[]>([]);
  const [selectedJoke, setSelectedJoke] = useState<JokeVariation | null>(null);
  const [selectedModel, setSelectedModel] = useState('googleai/gemini-3-flash');
  const [temperature, setTemperature] = useState([0.8]);
  const [inspirationalJokes, setInspirationalJokes] = useState<string[]>([]);
  const [isLoadingInspirationalJokes, setIsLoadingInspirationalJokes] = useState(false);
  
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth?redirect=/add-joke');
    }
  }, [user, authLoading, router]);

  const handleLoadInspirationalJokes = async () => {
    if (!user) {
      toast({ title: 'Login Required', description: 'Please log in to load your 5-star jokes.', variant: 'destructive' });
      return;
    }
    setIsLoadingInspirationalJokes(true);
    try {
      const jokes = await jokeService.fetchUserFiveStarJokes(user.uid);
      if (jokes.length > 0) {
        setInspirationalJokes(jokes);
        toast({ title: 'Inspiration Loaded!', description: `${jokes.length} of your 5-star jokes will be used for inspiration.` });
      } else {
        setInspirationalJokes([]);
        toast({ title: 'No 5-Star Jokes Found', description: 'You haven\'t rated any jokes with 5 stars yet.', variant: 'default' });
      }
    } catch (error: any) {
      console.error("Error loading 5-star jokes:", error);
      toast({ title: 'Error', description: error.message || 'Failed to load inspirational jokes.', variant: 'destructive' });
    } finally {
      setIsLoadingInspirationalJokes(false);
    }
  };


  const handleGenerateJoke = async () => {
    if (!user) {
      toast({ title: 'Login Required', description: 'Please log in to generate jokes.', variant: 'destructive' });
      return;
    }
    setIsGeneratingJoke(true);
    setSelectedJoke(null);
    setAiGeneratedJokes([]); // Clear previous jokes before generating new ones
    try {
      const trimmedTopicHint = aiTopicHint.trim();
      // Only include already generated jokes if we are NOT clearing them on re-generation.
      // Since we are, prefilledJokes will primarily be from the inspirational set.
      const prefilledJokes = [...inspirationalJokes];

      const response = await fetch('/api/generate-joke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicHint: trimmedTopicHint,
          prefilledJokes,
          model: selectedModel,
          temperature: temperature[0],
        }),
      });

      if (!response.ok) {
        let errorData;
        try { errorData = await response.json(); } catch (e) { /* ignore */ }
        throw new Error(errorData?.error || `API request failed with status ${response.status}`);
      }
      const result: GenerateJokeOutput = await response.json();
      setAiGeneratedJokes(result.jokes);
      setInspirationalJokes([]); // Clear inspiration after use to avoid re-using them unintentionally
      toast({ title: 'Jokes Generated!', description: 'Choose your favorite from the new variations below.' });
    } catch (error: any) {
      console.error("Error generating joke via API:", error);
      toast({ title: 'AI Error', description: error.message || 'Failed to generate jokes.', variant: 'destructive' });
    } finally {
      setIsGeneratingJoke(false);
    }
  };

  const handleSelectJoke = (joke: JokeVariation) => {
    setSelectedJoke(joke);
  };

  const handleAddJokeAndRedirect = async (data: JokeFormValues) => {
    if (!user) {
      toast({ title: 'Login Required', description: 'Please log in to add jokes.', variant: 'destructive' });
      return;
    }
    try {
      await addJoke(data);
      toast({ title: 'Success!', description: 'Your joke has been added.', variant: 'default' });
      router.push('/jokes');
    } catch (error) {
      console.error("Error submitting joke from page:", error);
    }
  };
  
  if (authLoading) {
    return (
      <div className="container mx-auto p-4 md:p-8 flex flex-col justify-center items-center min-h-[calc(100vh-8rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-2 text-muted-foreground">Verifying authentication...</p>
      </div>
    );
  }

  if (!user) {
     return (
        <div className="container mx-auto p-4 md:p-8">
            <Header title="Add New Joke" />
            <Card className="max-w-md mx-auto">
                <CardHeader>
                    <CardTitle className="text-destructive">Access Denied</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive flex items-center">
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

  if (loadingContext) {
    return (
      <div className="container mx-auto p-4 md:p-8 flex flex-col justify-center items-center min-h-[calc(100vh-8rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-2 text-muted-foreground">Loading page data...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8">
      <Header title="Craft a New Joke" />
      <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
        
        {/* Left Column: Form */}
        <div className="lg:col-span-1 flex flex-col gap-6">
           <Card className="sticky top-24">
                <CardHeader>
                <CardTitle className="text-lg flex items-center">
                    <PlusCircle className="mr-2 h-5 w-5 text-primary"/> Your New Joke
                </CardTitle>
                <CardDescription className="text-sm">
                    {selectedJoke ? "Review the selected joke from the right, or enter your own." : "Fill in the form to add a new joke manually."}
                </CardDescription>
                </CardHeader>
                <CardContent>
                <AddJokeForm
                    onAddJoke={handleAddJokeAndRedirect}
                    aiGeneratedText={selectedJoke?.jokeText}
                    aiGeneratedCategory={selectedJoke?.category}
                    aiGeneratedSource={selectedJoke ? "AI Assistant" : null}
                    onAiJokeSubmitted={() => { setSelectedJoke(null); setAiGeneratedJokes([]); }}
                />
                </CardContent>
            </Card>

           <Button variant="outline" onClick={() => router.push('/jokes')} className="w-full mt-auto">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Jokes List
          </Button>
        </div>

        {/* Right Column: AI Assistant */}
        <div className="lg:col-span-2">
            <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                      <Wand2 className="mr-2 h-5 w-5 text-primary"/> AI Assistant
                  </CardTitle>
                  <CardDescription className="text-sm">
                      Use the controls to generate joke variations.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* --- AI Controls --- */}
                    <div className="space-y-6">
                        <div>
                            <Label htmlFor="ai-model-select" className="text-sm font-medium">AI Model</Label>
                            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isGeneratingJoke}>
                            <SelectTrigger id="ai-model-select" className="mt-1">
                                <SelectValue placeholder="Select a model" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="googleai/gemini-3-flash">Gemini 3 Flash</SelectItem>
                                <SelectItem value="googleai/gemini-3.1-pro">Gemini 3.1 Pro</SelectItem>
                                <SelectItem value="googleai/gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite (Preview)</SelectItem>
                                <SelectItem value="googleai/gemini-3.1-pro-preview">Gemini 3.1 Pro (Preview)</SelectItem>
                                <SelectItem value="googleai/gemini-3-flash-preview">Gemini 3 Flash (Preview)</SelectItem>
                            </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <Label htmlFor="temperature-slider" className="text-sm font-medium">Creativity (Temperature)</Label>
                                <span className="text-sm font-mono text-muted-foreground">{temperature[0].toFixed(1)}</span>
                            </div>
                            <Slider
                                id="temperature-slider"
                                min={0}
                                max={2}
                                step={0.1}
                                value={temperature}
                                onValueChange={setTemperature}
                                disabled={isGeneratingJoke}
                            />
                            <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                <span>Predictable</span>
                                <span>Creative</span>
                                <span>Wild</span>
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="ai-topic-hint-page" className="text-sm font-medium">Topic Hint (Optional)</Label>
                            <Input
                            id="ai-topic-hint-page"
                            type="text"
                            placeholder="e.g., animals, space"
                            value={aiTopicHint}
                            onChange={(e) => setAiTopicHint(e.target.value)}
                            disabled={isGeneratingJoke}
                            className="mt-1"
                            />
                        </div>

                        <div className="space-y-2">
                            <Button
                                onClick={handleLoadInspirationalJokes}
                                disabled={isLoadingInspirationalJokes || isGeneratingJoke || !user}
                                variant="outline"
                                className="w-full"
                            >
                                {isLoadingInspirationalJokes ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Star className="mr-2 h-4 w-4 text-yellow-400" />}
                                {isLoadingInspirationalJokes ? 'Loading Jokes...' : 'Load My 5-Star Jokes for Inspiration'}
                            </Button>
                            {inspirationalJokes.length > 0 && (
                                <p className="text-xs text-center text-muted-foreground">
                                    {inspirationalJokes.length} joke{inspirationalJokes.length === 1 ? '' : 's'} will be used for inspiration.
                                </p>
                            )}
                        </div>

                        <Button
                            onClick={handleGenerateJoke}
                            disabled={isGeneratingJoke || !user}
                            className="w-full"
                        >
                            <Wand2 className="mr-2 h-4 w-4" />
                            {aiGeneratedJokes.length > 0 ? 'Generate Again' : 'Generate 3 Jokes'}
                        </Button>
                    </div>
                    
                    <AnimatePresence>
                      {isGeneratingJoke && (
                          <motion.div
                              key="loading"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="flex flex-col items-center justify-center min-h-[200px] bg-card rounded-lg border border-dashed"
                          >
                              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                              <p className="text-lg font-medium text-muted-foreground">Generating witty humor...</p>
                              <p className="text-sm text-muted-foreground">This may take a moment.</p>
                          </motion.div>
                      )}
                    </AnimatePresence>
                    
                    {aiGeneratedJokes.length > 0 && !isGeneratingJoke && (
                      <>
                        <Separator />
                        <motion.div key="joke-variations" className="space-y-4">
                            <h3 className="text-lg font-semibold text-center">Choose Your Favorite</h3>
                            <AnimatePresence>
                            {aiGeneratedJokes.map((joke, index) => (
                            <motion.div
                                key={`${joke.jokeText}-${index}`} // Key change to force re-animation
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3, delay: index * 0.1 }}
                            >
                                <Card className={`overflow-hidden transition-all duration-300 ${selectedJoke === joke ? 'border-primary shadow-primary/20 shadow-lg' : 'border-border'}`}>
                                    <CardContent className="p-5">
                                        <p className="text-base text-foreground leading-relaxed">{joke.jokeText}</p>
                                    </CardContent>
                                    <CardFooter className="bg-muted/40 p-3 flex justify-between items-center">
                                        <Badge variant="secondary">{joke.category}</Badge>
                                        <Button
                                        variant={selectedJoke === joke ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => handleSelectJoke(joke)}
                                        >
                                        {selectedJoke === joke && <CheckCircle className="mr-2 h-4 w-4" />}
                                        {selectedJoke === joke ? 'Selected' : 'Use this Joke'}
                                        </Button>
                                    </CardFooter>
                                </Card>
                            </motion.div>
                            ))}
                            </AnimatePresence>
                            {selectedJoke && (
                                <p className="text-sm text-muted-foreground text-center pt-2">The selected joke has been filled into the form on the left.</p>
                            )}
                        </motion.div>
                      </>
                    )}
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}

    