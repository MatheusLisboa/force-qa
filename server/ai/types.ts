export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generateReport(systemPrompt: string, userPrompt: string): Promise<string>;
}

export interface AIProviderInfo {
  name: string;
  model: string;
}
