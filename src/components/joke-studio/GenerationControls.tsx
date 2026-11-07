"use client";

import { Wand2 } from 'lucide-react';
import { GEMINI_MODEL_CATALOG, getModelInfo, type GeminiModel } from '@/ai/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { JokeMode } from '@/lib/jokeGenerationContract';

export const STUDIO_COUNTS = [3, 5] as const;
export type StudioCount = (typeof STUDIO_COUNTS)[number];

type Props = {
  model: GeminiModel; onModelChange: (value: string) => void;
  temperature: number; onTemperatureChange: (value: number) => void;
  topicHint: string; onTopicHintChange: (value: string) => void;
  mode: JokeMode; onModeChange: (value: JokeMode) => void;
  count: StudioCount; onCountChange: (value: StudioCount) => void;
  useTasteProfile: boolean; onUseTasteProfileChange: (value: boolean) => void;
  isGenerating: boolean; onGenerate: () => void;
};

export default function GenerationControls(props: Props) {
  const { isGenerating: disabled } = props;
  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="ai-model-select" className="text-sm font-medium">AI Model</Label>
        <Select value={props.model} onValueChange={props.onModelChange} disabled={disabled}>
          <SelectTrigger id="ai-model-select" className="mt-1" aria-describedby="ai-model-description">
            {/* Children override the copied item text, so the trigger shows only the name. */}
            <SelectValue placeholder="Select a model">{getModelInfo(props.model).label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {GEMINI_MODEL_CATALOG.map(model => (
              <SelectItem key={model.id} value={model.id}>
                <span className="flex flex-col">
                  <span>{model.label}</span>
                  <span className="text-xs text-muted-foreground">{model.description}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id="ai-model-description" className="mt-1 text-xs text-muted-foreground">{getModelInfo(props.model).description}</p>
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          {/* No `htmlFor`: Radix puts the id on the slider's wrapper span,
              which is not a labelable element. The name rides on the thumb
              via `thumbLabel`. */}
          <span className="text-sm font-medium">Creativity (Temperature)</span>
          <span className="text-sm tabular-nums text-muted-foreground">{props.temperature.toFixed(1)}</span>
        </div>
        <Slider
          id="temperature-slider"
          thumbLabel="Creativity (temperature)"
          min={0}
          max={2}
          step={0.1}
          value={[props.temperature]}
          onValueChange={([value]) => props.onTemperatureChange(value)}
          disabled={disabled}
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
          value={props.topicHint}
          onChange={event => props.onTopicHintChange(event.target.value)}
          disabled={disabled}
          className="mt-1"
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label id="ai-joke-mode-label" className="text-sm font-medium">Joke Style</Label>
          <RadioGroup
            aria-labelledby="ai-joke-mode-label"
            value={props.mode}
            onValueChange={(value: JokeMode) => props.onModeChange(value)}
            disabled={disabled}
            className="mt-2 space-y-1"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="original" id="ai-joke-mode-original" />
              <Label htmlFor="ai-joke-mode-original" className="font-normal">New jokes</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="classic" id="ai-joke-mode-classic" />
              <Label htmlFor="ai-joke-mode-classic" className="font-normal">Proven classics not in your library</Label>
            </div>
          </RadioGroup>
        </div>
        <div>
          <Label id="ai-joke-count-label" className="text-sm font-medium">Jokes per batch</Label>
          <RadioGroup
            aria-labelledby="ai-joke-count-label"
            value={String(props.count)}
            onValueChange={value => props.onCountChange(value === '5' ? 5 : 3)}
            disabled={disabled}
            className="mt-2 flex gap-4"
          >
            {STUDIO_COUNTS.map(count => (
              <div key={count} className="flex items-center space-x-2">
                <RadioGroupItem value={String(count)} id={`ai-joke-count-${count}`} />
                <Label htmlFor={`ai-joke-count-${count}`} className="font-normal">{count}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="use-taste-profile" className="text-sm font-medium">Use my samples &amp; feedback</Label>
          <p id="use-taste-profile-description" className="text-xs text-muted-foreground">Your active samples, likes and dislikes steer the next batch.</p>
        </div>
        <Switch
          id="use-taste-profile"
          checked={props.useTasteProfile}
          onCheckedChange={props.onUseTasteProfileChange}
          disabled={disabled}
          aria-describedby="use-taste-profile-description"
        />
      </div>

      <Button onClick={props.onGenerate} disabled={disabled} className="w-full">
        <Wand2 className="mr-2 h-4 w-4" />
        {disabled ? 'Generating…' : `Generate ${props.count} jokes`}
      </Button>
    </div>
  );
}
